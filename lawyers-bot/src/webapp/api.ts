import express, { NextFunction, Request, Response, Router } from 'express';
import { Api } from 'grammy';
import { env } from '../config/env';
import { logger } from '../logger/logger';
import { bookingRepository, SlotTakenError } from '../database/repositories/booking.repository';
import { lawyerRepository } from '../database/repositories/lawyer.repository';
import { serviceRepository } from '../database/repositories/service.repository';
import { userRepository } from '../database/repositories/user.repository';
import { BookingLimitError, SlotUnavailableError, bookingService } from '../services/booking.service';
import { notificationService } from '../services/notification.service';
import { scheduleService } from '../services/schedule.service';
import { formatDateHuman, isValidSlotTime } from '../bot/utils/dates';
import { normalizeFullName, normalizePhone, validateFullName, validatePhone } from '../bot/utils/validators';
import {
  BOOKABLE_CATEGORIES,
  Booking,
  CATEGORY_LABELS,
  CATEGORY_SHORT,
  isBookableCategory,
  User,
} from '../types';
import { validateInitData, WebAppUser } from './initData';

interface Session {
  tg: WebAppUser;
  user: User;
  isAdmin: boolean;
  /** Адвокат, которому принадлежит этот Telegram-аккаунт. */
  lawyerId: number | null;
}

type Handler = (req: Request, res: Response, session: Session) => Promise<void>;

function sessionOf(res: Response): Session {
  return res.locals.session as Session;
}

/** Обёртка: ошибки обработчика — в лог и 500, без подробностей наружу. */
function route(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, sessionOf(res)).catch(next);
  };
}

function badRequest(res: Response, error: string): void {
  res.status(400).json({ error });
}

function serviceKind(title: string): 'oral' | 'docs' {
  return /изучением документов/i.test(title) ? 'docs' : 'oral';
}

function bookingView(booking: Booking) {
  return {
    id: booking.id,
    date: booking.booking_date,
    time: booking.booking_time,
    dateLabel: booking.booking_date ? formatDateHuman(booking.booking_date) : null,
    category: isBookableCategory(booking.category) ? CATEGORY_LABELS[booking.category] : booking.category,
    createdAt: booking.created_at,
  };
}

/**
 * API для Mini App. Каждый запрос несёт initData в заголовке
 * `Authorization: tma <initData>`; пользователя знаем только по ней.
 */
export function createWebAppApi(api: Api): Router {
  const router = express.Router();

  router.use((req, res, next) => {
    const header = req.get('authorization') ?? '';
    const tg = header.startsWith('tma ') ? validateInitData(header.slice(4), env.botToken) : null;
    if (!tg) {
      res.status(401).json({ error: 'Откройте форму из Telegram-бота коллегии.' });
      return;
    }
    userRepository
      .findOrCreate(tg.id, tg.username)
      .then((user) => {
        const session: Session = {
          tg,
          user,
          isAdmin: env.adminIds.includes(tg.id),
          lawyerId: env.lawyerByTelegramId.get(tg.id) ?? null,
        };
        res.locals.session = session;
        next();
      })
      .catch(next);
  });

  router.get(
    '/me',
    route(async (_req, res, s) => {
      res.json({
        firstName: s.tg.firstName,
        fullName: s.user.full_name,
        phone: s.user.phone,
        isAdmin: s.isAdmin,
        lawyerId: s.lawyerId,
      });
    }),
  );

  router.get(
    '/catalog',
    route(async (_req, res) => {
      const [lawyers, services] = await Promise.all([
        lawyerRepository.findAllActive(),
        serviceRepository.findConsultationsByCategories([...BOOKABLE_CATEGORIES]),
      ]);
      res.json({
        categories: BOOKABLE_CATEGORIES.map((id) => ({ id, label: CATEGORY_LABELS[id], short: CATEGORY_SHORT[id] })),
        lawyers: lawyers.map((l) => ({
          id: l.id,
          fullName: l.full_name,
          role: l.role,
          specialization: l.specialization,
          categories: l.categories.filter(isBookableCategory),
        })),
        services: services.map((svc) => ({
          id: svc.id,
          category: svc.category,
          kind: serviceKind(svc.title),
          title: svc.title,
          priceLabel: svc.price_label,
        })),
        privacyUrl: env.privacyUrl,
        maxActiveBookings: env.maxActiveBookings,
      });
    }),
  );

  router.get(
    '/slots',
    route(async (req, res) => {
      const lawyerId = Number(req.query.lawyerId);
      if (!Number.isInteger(lawyerId) || lawyerId <= 0) return badRequest(res, 'Не выбран адвокат.');
      const dates = await scheduleService.availableDates(lawyerId);
      const days = await Promise.all(
        dates.map(async (date) => ({
          date,
          label: formatDateHuman(date),
          times: await scheduleService.availableTimes(lawyerId, date),
        })),
      );
      res.json({ days: days.filter((d) => d.times.length > 0) });
    }),
  );

  router.post(
    '/bookings',
    route(async (req, res, s) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const fullName = String(body.fullName ?? '');
      const phone = String(body.phone ?? '');
      const category = String(body.category ?? '');
      const lawyerId = Number(body.lawyerId);
      const serviceId = Number(body.serviceId);
      const date = String(body.date ?? '');
      const time = String(body.time ?? '');

      if (body.consent !== true) return badRequest(res, 'Нужно согласие на обработку персональных данных.');
      const nameCheck = validateFullName(fullName);
      if (!nameCheck.valid) return badRequest(res, nameCheck.error!);
      const phoneCheck = validatePhone(phone);
      if (!phoneCheck.valid) return badRequest(res, phoneCheck.error!);
      if (!isBookableCategory(category)) return badRequest(res, 'Выберите вид дела.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidSlotTime(time)) {
        return badRequest(res, 'Выберите дату и время консультации.');
      }

      const [lawyer, service] = await Promise.all([
        Number.isInteger(lawyerId) ? lawyerRepository.findById(lawyerId) : null,
        Number.isInteger(serviceId) ? serviceRepository.findById(serviceId) : null,
      ]);
      if (!lawyer || !lawyer.categories.includes(category)) return badRequest(res, 'Выберите адвоката.');
      if (!service || service.category !== category) return badRequest(res, 'Выберите вид консультации.');

      const draft = {
        fullName: normalizeFullName(fullName),
        phone: normalizePhone(phone),
        category,
        lawyerId,
        serviceId,
        date,
        time,
      };

      let booking: Booking;
      try {
        booking = await bookingService.confirmBooking(s.user.id, draft);
      } catch (err) {
        if (err instanceof SlotTakenError) {
          res.status(409).json({ error: 'Это время только что заняли. Выберите, пожалуйста, другое.' });
          return;
        }
        if (err instanceof SlotUnavailableError) {
          res.status(409).json({ error: 'Это время недоступно для записи. Выберите, пожалуйста, другое.' });
          return;
        }
        if (err instanceof BookingLimitError) {
          res.status(409).json({
            error: `У вас уже ${err.limit} активных записи. Отмените одну во вкладке «Мои записи».`,
          });
          return;
        }
        throw err;
      }

      await userRepository.updateContact(s.user.id, draft.fullName, draft.phone);
      res.status(201).json({
        booking: { ...bookingView(booking), lawyer: lawyer.full_name, address: lawyer.office_address, phone: draft.phone },
      });

      // Уведомления — после ответа: клиент не ждёт отправки сообщений.
      void notificationService.confirmToClient(api, s.tg.id, booking, lawyer, service);
      void notificationService.notifyAboutNewBooking(api, booking, lawyer, service);
    }),
  );

  router.get(
    '/bookings/mine',
    route(async (_req, res, s) => {
      const bookings = await bookingRepository.findForUserWithDetails(s.user.id);
      res.json({
        bookings: bookings.map((b) => ({
          ...bookingView(b),
          lawyer: b.lawyer_name,
          service: b.service_title,
          priceLabel: b.price_label,
        })),
      });
    }),
  );

  router.post(
    '/bookings/:id/cancel',
    route(async (req, res, s) => {
      const id = Number(req.params.id);
      const cancelled = Number.isInteger(id) ? await bookingService.cancelForUser(id, s.user.id) : null;
      if (!cancelled) {
        res.status(404).json({ error: 'Запись не найдена или уже отменена.' });
        return;
      }
      res.json({ ok: true });
    }),
  );

  /** Панель адвоката: свои записи; администратор видит записи всех адвокатов. */
  router.get(
    '/panel/bookings',
    route(async (req, res, s) => {
      if (!s.isAdmin && s.lawyerId === null) {
        res.status(403).json({ error: 'Панель доступна только адвокатам коллегии.' });
        return;
      }
      const upcoming = req.query.scope !== 'past';
      const bookings = await bookingRepository.findForPanel(s.isAdmin ? null : s.lawyerId, upcoming);
      res.json({
        bookings: bookings.map((b) => ({
          ...bookingView(b),
          clientName: b.client_full_name,
          clientPhone: b.client_phone,
          lawyer: b.lawyer_name,
          service: b.service_title,
          priceLabel: b.price_label,
        })),
      });
    }),
  );

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // В лог — без тела запроса: там ФИО и телефон клиента.
    logger.error({ err }, 'Web app API error');
    res.status(500).json({ error: 'Что-то пошло не так. Попробуйте ещё раз.' });
  });

  return router;
}
