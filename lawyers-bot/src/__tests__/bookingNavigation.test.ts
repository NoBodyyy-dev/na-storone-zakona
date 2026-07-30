jest.mock('../database/repositories/booking.repository', () => ({
  bookingRepository: { create: jest.fn(), findBusyTimes: jest.fn(), findBusyInRange: jest.fn() },
  SlotTakenError: class SlotTakenError extends Error {},
}));

jest.mock('../database/repositories/user.repository', () => ({
  userRepository: { findOrCreate: jest.fn(), updateContact: jest.fn() },
}));

jest.mock('../database/repositories/service.repository', () => ({
  serviceRepository: {
    findConsultationsByCategory: jest.fn(),
    findConsultationsByCategories: jest.fn(),
    findAllConsultations: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock('../database/repositories/lawyer.repository', () => ({
  lawyerRepository: { findById: jest.fn(), findByCategory: jest.fn(), findAllActive: jest.fn() },
}));

jest.mock('../services/schedule.service', () => ({
  scheduleService: { availableDates: jest.fn(), availableTimes: jest.fn() },
}));

import { serviceRepository } from '../database/repositories/service.repository';
import { lawyerRepository } from '../database/repositories/lawyer.repository';
import { scheduleService } from '../services/schedule.service';
import { BotContext } from '../bot/context';
import { Lawyer, SessionData, Service } from '../types';
import {
  askConfirmStep,
  askDateStep,
  askLawyerStep,
  askServiceStep,
  askTimeStep,
  goBack,
  handleBookingText,
  startBooking,
  startBookingWithLawyer,
} from '../bot/conversations/booking.conversation';

/**
 * Минимальный поддельный контекст: считает отправленные сообщения,
 * запоминает удалённые и хранит сессию так же, как grammy.
 */
function makeCtx() {
  const sent: { id: number; text: string; markup?: unknown }[] = [];
  const deleted: number[] = [];
  let nextBotMsgId = 100;

  const session: SessionData = { step: 'idle', draft: {}, frames: [] };

  const ctx = {
    chat: { id: 42 },
    from: { id: 7, username: 'client' },
    session,
    message: undefined as { text: string; message_id: number } | undefined,
    reply: jest.fn(async (text: string, other?: { reply_markup?: unknown }) => {
      const id = (nextBotMsgId += 1);
      sent.push({ id, text, markup: other?.reply_markup });
      return { message_id: id };
    }),
    answerCallbackQuery: jest.fn(async () => undefined),
    api: {
      deleteMessage: jest.fn(async (_chatId: number, messageId: number) => {
        deleted.push(messageId);
        return true;
      }),
      editMessageReplyMarkup: jest.fn(async () => undefined),
    },
  };

  /** Имитирует текстовое сообщение пользователя с заданным id. */
  const userSays = async (text: string, messageId: number): Promise<boolean> => {
    ctx.message = { text, message_id: messageId };
    return handleBookingText(ctx as unknown as BotContext);
  };

  return { ctx: ctx as unknown as BotContext, raw: ctx, sent, deleted, userSays };
}

const consultations: Service[] = [
  {
    id: 11,
    slug: 'consult-civil-oral',
    title: 'Устная юридическая консультация по правовым вопросам',
    description: 'Гражданские и административные дела (КАС РФ)',
    price_label: 'от 10 000 ₽',
    category: 'civil',
    sort_order: 1,
    is_active: true,
  },
  {
    id: 12,
    slug: 'consult-civil-docs',
    title: 'Устная юридическая консультация с изучением документов',
    description: 'Гражданские и административные дела (КАС РФ)',
    price_label: 'от 15 000 ₽',
    category: 'civil',
    sort_order: 2,
    is_active: true,
  },
];

const lawyer = {
  id: 1,
  full_name: 'Богданов Сергей Владимирович',
  role: 'Председатель коллегии',
  specialization: 'уголовные и арбитражные дела',
  categories: ['criminal', 'arbitration', 'civil'],
  office_address: 'г. Краснодар, ул. Бабушкина, 248',
} as unknown as Lawyer;

beforeEach(() => {
  jest.clearAllMocks();
  (serviceRepository.findConsultationsByCategory as jest.Mock).mockResolvedValue(consultations);
  (serviceRepository.findConsultationsByCategories as jest.Mock).mockResolvedValue(consultations);
  (serviceRepository.findAllConsultations as jest.Mock).mockResolvedValue(consultations);
  (serviceRepository.findById as jest.Mock).mockResolvedValue(consultations[0]);
  (lawyerRepository.findById as jest.Mock).mockResolvedValue(lawyer);
  (lawyerRepository.findByCategory as jest.Mock).mockResolvedValue([lawyer]);
  (lawyerRepository.findAllActive as jest.Mock).mockResolvedValue([lawyer]);
  (scheduleService.availableDates as jest.Mock).mockResolvedValue(['2026-08-03', '2026-08-04']);
  (scheduleService.availableTimes as jest.Mock).mockResolvedValue(['09:00', '10:00']);
});

describe('обычная запись (клиент пришёл не с сайта)', () => {
  it('ведёт от ФИО через вид дела и адвоката до итоговой заявки', async () => {
    const { ctx, raw, userSays, sent } = makeCtx();

    await startBooking(ctx);
    expect(raw.session.step).toBe('ask_name');

    expect(await userSays('Иванов Иван Иванович', 1)).toBe(true);
    expect(raw.session.step).toBe('ask_phone');

    expect(await userSays('+7 900 123-45-67', 2)).toBe(true);
    expect(raw.session.step).toBe('ask_category');

    await askLawyerStep(ctx, 'civil');
    expect(raw.session.step).toBe('ask_lawyer');
    // Показываются только адвокаты, ведущие дела этого вида.
    expect(lawyerRepository.findByCategory).toHaveBeenCalledWith('civil');

    await askServiceStep(ctx, 1);
    expect(raw.session.step).toBe('ask_service');
    expect(raw.session.draft.lawyerId).toBe(1);
    // Консультации — оба варианта по выбранному виду дела.
    expect(serviceRepository.findConsultationsByCategory).toHaveBeenCalledWith('civil');

    await askDateStep(ctx, 11);
    expect(raw.session.step).toBe('ask_date');

    await askTimeStep(ctx, '2026-08-03');
    expect(raw.session.step).toBe('ask_time');

    await askConfirmStep(ctx, '09:00');
    expect(raw.session.step).toBe('confirm');

    // На последнем экране собрана вся заявка целиком.
    const summary = sent[sent.length - 1].text;
    expect(summary).toContain('Иванов Иван Иванович');
    expect(summary).toContain('+7 900 123-45-67');
    expect(summary).toContain('Гражданские и административные дела (КАС РФ)');
    expect(summary).toContain('от 10 000 ₽');
    expect(summary).toContain('Богданов Сергей Владимирович');
    expect(summary).toContain('Записаться');
    expect(summary).toContain('Шаг 8 из 8');
  });

  it('на первом шаге кнопки «Назад» нет, а на втором есть', async () => {
    const { ctx, sent, userSays } = makeCtx();
    const hasBack = (markup: unknown): boolean =>
      JSON.stringify(markup ?? {}).includes('nav:back');

    await startBooking(ctx);
    const nameScreen = sent[sent.length - 1];
    expect(nameScreen.text).toContain('Шаг 1 из 8');
    expect(hasBack(nameScreen.markup)).toBe(false);

    await userSays('Иванов Иван Иванович', 1);
    const phoneScreen = sent[sent.length - 1];
    expect(phoneScreen.text).toContain('Шаг 2 из 8');
    expect(hasBack(phoneScreen.markup)).toBe(true);
  });

  it('проблему описывать не просит', async () => {
    const { ctx, sent, userSays } = makeCtx();

    await startBooking(ctx);
    await userSays('Иванов Иван Иванович', 1);
    await userSays('+7 900 123-45-67', 2);

    const allText = sent.map((m) => m.text).join('\n');
    expect(allText).not.toMatch(/опишите|расскажите о (вашей )?проблем/i);
    expect(sent[sent.length - 1].text).toContain('Вид дела');
  });
});

describe('запись по ссылке с сайта (адвокат уже выбран)', () => {
  it('не спрашивает вид дела и адвоката, а берёт вид дела из услуги', async () => {
    const { ctx, raw, userSays, sent } = makeCtx();

    await startBookingWithLawyer(ctx, 1);
    expect(raw.session.draft.lawyerId).toBe(1);
    expect(raw.session.lawyerFixed).toBe(true);
    expect(sent[0].text).toContain('Богданов Сергей Владимирович');

    await userSays('Иванов Иван Иванович', 1);
    await userSays('+7 900 123-45-67', 2);

    // Сразу услуга — вида дела и выбора адвоката в сценарии нет.
    expect(raw.session.step).toBe('ask_service');
    expect(sent[sent.length - 1].text).toContain('Шаг 3 из 6');
    expect(serviceRepository.findConsultationsByCategories).toHaveBeenCalledWith([
      'criminal',
      'arbitration',
      'civil',
    ]);

    await askDateStep(ctx, 11);
    expect(raw.session.draft.category).toBe('civil');

    await askTimeStep(ctx, '2026-08-03');
    await askConfirmStep(ctx, '09:00');

    const summary = sent[sent.length - 1].text;
    expect(summary).toContain('Шаг 6 из 6');
    expect(summary).toContain('Гражданские и административные дела (КАС РФ)');
    expect(summary).toContain('Богданов Сергей Владимирович');
  });

  it('«Назад» с услуги не сбрасывает закреплённого адвоката', async () => {
    const { ctx, raw, userSays } = makeCtx();

    await startBookingWithLawyer(ctx, 1);
    await userSays('Иванов Иван Иванович', 1);
    await userSays('+7 900 123-45-67', 2);
    await askDateStep(ctx, 11);

    await goBack(ctx);

    expect(raw.session.step).toBe('ask_service');
    expect(raw.session.draft.serviceId).toBeUndefined();
    expect(raw.session.draft.category).toBeUndefined();
    expect(raw.session.draft.lawyerId).toBe(1);
  });
});

describe('кнопка «Назад»', () => {
  it('удаляет вопрос текущего шага, ответ пользователя и прежний вопрос', async () => {
    const { ctx, raw, userSays, deleted, sent } = makeCtx();

    await startBooking(ctx);
    const nameQuestionId = sent[sent.length - 1].id;

    await userSays('Иванов Иван Иванович', 1);
    const phoneQuestionId = sent[sent.length - 1].id;

    // Пользователь на шаге «Телефон» решает исправить ФИО.
    await goBack(ctx);

    expect(deleted).toEqual(expect.arrayContaining([phoneQuestionId, nameQuestionId, 1]));
    expect(raw.session.step).toBe('ask_name');
    expect(raw.session.draft.fullName).toBeUndefined();
    expect(sent[sent.length - 1].text).toContain('Шаг 1 из 8');
  });

  it('после выбора кнопкой возвращает к предыдущему вопросу и сбрасывает выбор', async () => {
    const { ctx, raw, userSays, deleted, sent } = makeCtx();

    await startBooking(ctx);
    await userSays('Иванов Иван Иванович', 1);
    await userSays('+7 900 123-45-67', 2);
    const categoryQuestionId = sent[sent.length - 1].id;

    // Ошибочно выбран вид дела — бот уже показал адвокатов (шаг 4).
    await askLawyerStep(ctx, 'civil');
    const lawyerQuestionId = sent[sent.length - 1].id;
    expect(raw.session.draft.category).toBe('civil');

    await goBack(ctx);

    // Вопрос шага «Адвокат» и прежний вопрос «Вид дела» ушли из чата,
    // вопрос о виде дела задан заново.
    expect(deleted).toEqual(expect.arrayContaining([lawyerQuestionId, categoryQuestionId]));
    expect(raw.session.step).toBe('ask_category');
    expect(raw.session.draft.category).toBeUndefined();
    expect(sent[sent.length - 1].text).toContain('Шаг 3 из 8');
  });

  it('сбрасывает данные всех последующих шагов, а не только предыдущего', async () => {
    const { ctx, raw, userSays } = makeCtx();

    await startBooking(ctx);
    await userSays('Иванов Иван Иванович', 1);
    await userSays('+7 900 123-45-67', 2);
    await askLawyerStep(ctx, 'civil');
    await askServiceStep(ctx, 1);
    await askDateStep(ctx, 11);
    await askTimeStep(ctx, '2026-08-03');
    await askConfirmStep(ctx, '09:00');

    // С итоговой заявки — назад к выбору времени.
    await goBack(ctx);
    expect(raw.session.step).toBe('ask_time');
    expect(raw.session.draft.time).toBeUndefined();
    expect(raw.session.draft.date).toBe('2026-08-03');

    // Ещё назад — к выбору даты, время и дата очищены.
    await goBack(ctx);
    expect(raw.session.step).toBe('ask_date');
    expect(raw.session.draft.date).toBeUndefined();
    expect(raw.session.draft.serviceId).toBe(11);

    // Ещё назад — к выбору услуги: адвокат остаётся, услуга сбрасывается.
    await goBack(ctx);
    expect(raw.session.step).toBe('ask_service');
    expect(raw.session.draft.serviceId).toBeUndefined();
    expect(raw.session.draft.lawyerId).toBe(1);
    expect(raw.session.draft.category).toBe('civil');

    // И ещё назад — к выбору адвоката: он сбрасывается, вид дела остаётся.
    await goBack(ctx);
    expect(raw.session.step).toBe('ask_lawyer');
    expect(raw.session.draft.lawyerId).toBeUndefined();
    expect(raw.session.draft.category).toBe('civil');
  });

  it('удаляет неудачные попытки ввода вместе с подсказками', async () => {
    const { ctx, userSays, deleted, sent } = makeCtx();

    await startBooking(ctx);
    await userSays('Иванов Иван Иванович', 1);

    // Некорректный телефон: в чате остаются попытка и подсказка.
    expect(await userSays('телефона нет', 2)).toBe(true);
    const hintId = sent[sent.length - 1].id;
    expect(sent[sent.length - 1].text).toContain('⚠️');

    await goBack(ctx);

    expect(deleted).toEqual(expect.arrayContaining([2, hintId]));
  });
});
