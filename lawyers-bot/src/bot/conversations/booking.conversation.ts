import { InlineKeyboard } from 'grammy';
import { BotContext } from '../context';
import {
  BookableCategory,
  BookingDraft,
  BookingStep,
  BOOKING_STEPS,
  CATEGORY_LABELS,
  isBookableCategory,
  Lawyer,
  StepFrame,
  stepNumber,
  stepsTotal,
} from '../../types';
import { userRepository } from '../../database/repositories/user.repository';
import { serviceRepository } from '../../database/repositories/service.repository';
import { lawyerRepository } from '../../database/repositories/lawyer.repository';
import { SlotTakenError } from '../../database/repositories/booking.repository';
import { bookingService } from '../../services/booking.service';
import { scheduleService } from '../../services/schedule.service';
import { notificationService } from '../../services/notification.service';
import { validateFullName, normalizeFullName, validatePhone, normalizePhone } from '../utils/validators';
import { formatDateHuman, formatSlotHuman, BOOKING_WINDOW_DAYS } from '../utils/dates';
import {
  categoryKeyboard,
  confirmKeyboard,
  dateKeyboard,
  lawyerKeyboard,
  serviceKeyboard,
  timeKeyboard,
  backOnlyKeyboard,
  mainMenuKeyboard,
} from '../keyboards/keyboards';

interface RenderedStep {
  text: string;
  keyboard?: InlineKeyboard;
}

/* ────────────────────────── экраны ────────────────────────── */

function heading(ctx: BotContext, step: BookingStep, title: string): string {
  const fixed = ctx.session.lawyerFixed === true;
  return `<b>Шаг ${stepNumber(step, fixed)} из ${stepsTotal(fixed)}</b> · ${title}`;
}

function renderAskName(ctx: BotContext): RenderedStep {
  return {
    text:
      `${heading(ctx, 'ask_name', 'Ваше имя')}\n\n` +
      'Как к вам обращаться? Напишите полное ФИО.\n' +
      '<i>Например: Иванов Иван Иванович</i>',
  };
}

function renderAskPhone(ctx: BotContext): RenderedStep {
  return {
    text:
      `${heading(ctx, 'ask_phone', 'Телефон')}\n\n` +
      'Оставьте номер телефона для связи.\n' +
      '<i>Например: +7 900 123-45-67</i>',
    keyboard: backOnlyKeyboard(),
  };
}

/** Вид дела — только в обычной записи; по ссылке с сайта он берётся из услуги. */
function renderAskCategory(ctx: BotContext): RenderedStep {
  return {
    text:
      `${heading(ctx, 'ask_category', 'Вид дела')}\n\n` +
      'К какому виду относится ваш вопрос? Подробности рассказывать не нужно — ' +
      'достаточно выбрать раздел, чтобы показать адвокатов, которые ведут такие дела.',
    keyboard: categoryKeyboard(),
  };
}

/** Адвокаты, ведущие выбранный вид дела. */
async function renderAskLawyer(ctx: BotContext, category: BookableCategory): Promise<RenderedStep> {
  const lawyers = await lawyersForCategory(category);
  if (lawyers.length === 0) {
    return {
      text: 'Не удалось загрузить список адвокатов. Позвоните нам, пожалуйста.',
      keyboard: backOnlyKeyboard(),
    };
  }
  return {
    text:
      `${heading(ctx, 'ask_lawyer', 'Адвокат')}\n\n` +
      `<i>${CATEGORY_LABELS[category]}</i>\n\n` +
      lawyers.map((l) => `<b>${l.full_name}</b>\n${l.role}\n<i>${l.specialization}</i>`).join('\n\n') +
      '\n\nК кому вы хотите записаться?',
    keyboard: lawyerKeyboard(lawyers),
  };
}

/**
 * Услуга — два варианта консультации. Вид дела выбран клиентом (обычная запись)
 * либо ещё не известен (запись по ссылке с сайта) — тогда показываем
 * консультации по всем делам, которые ведёт этот адвокат.
 */
async function renderAskService(ctx: BotContext): Promise<RenderedStep> {
  const draft = ctx.session.draft;
  const byCategory = draft.category !== undefined;
  const services = byCategory
    ? await serviceRepository.findConsultationsByCategory(draft.category!)
    : await consultationsForLawyer(draft.lawyerId!);

  if (services.length === 0) {
    return {
      text: 'Не удалось загрузить каталог консультаций. Попробуйте, пожалуйста, позже.',
      keyboard: backOnlyKeyboard(),
    };
  }
  return {
    text:
      `${heading(ctx, 'ask_service', 'Услуга')}\n\n` +
      (byCategory ? `<i>${CATEGORY_LABELS[draft.category!]}</i>\n\n` : '') +
      'Выберите вариант консультации:\n\n' +
      '· <b>устная</b> — консультация по правовым вопросам\n' +
      '· <b>с документами</b> — консультация с изучением документов',
    keyboard: serviceKeyboard(services, !byCategory),
  };
}

async function renderAskDate(ctx: BotContext, lawyerId: number): Promise<RenderedStep> {
  const dates = await scheduleService.availableDates(lawyerId);
  if (dates.length === 0) {
    return {
      text:
        `${heading(ctx, 'ask_date', 'Дата')}\n\n` +
        `Свободных дат на ближайшие ${BOOKING_WINDOW_DAYS} дней нет.\n` +
        'Позвоните нам, пожалуйста, и мы подберём удобное время.',
      keyboard: backOnlyKeyboard(),
    };
  }
  return {
    text:
      `${heading(ctx, 'ask_date', 'Дата')}\n\n` +
      `Выберите день консультации.\n` +
      `<i>Приём по будням, запись на ${BOOKING_WINDOW_DAYS} дней вперёд.</i>`,
    keyboard: dateKeyboard(dates),
  };
}

async function renderAskTime(ctx: BotContext, lawyerId: number, date: string): Promise<RenderedStep> {
  const times = await scheduleService.availableTimes(lawyerId, date);
  if (times.length === 0) {
    return {
      text:
        `${heading(ctx, 'ask_time', 'Время')}\n\n` +
        `На ${formatDateHuman(date)} свободного времени уже нет.\n` +
        'Вернитесь назад и выберите, пожалуйста, другую дату.',
      keyboard: backOnlyKeyboard(),
    };
  }
  return {
    text:
      `${heading(ctx, 'ask_time', 'Время')}\n\n` +
      `<i>${formatDateHuman(date)}</i>\n\n` +
      'Выберите свободное время приёма.',
    keyboard: timeKeyboard(times),
  };
}

/** Итоговая заявка перед подтверждением — последний шаг. */
async function renderConfirm(ctx: BotContext): Promise<RenderedStep> {
  const draft = ctx.session.draft;
  const [lawyer, service] = await Promise.all([
    draft.lawyerId ? lawyerRepository.findById(draft.lawyerId) : Promise.resolve(null),
    draft.serviceId ? serviceRepository.findById(draft.serviceId) : Promise.resolve(null),
  ]);

  return {
    text:
      `${heading(ctx, 'confirm', 'Проверьте заявку')}\n\n` +
      `👤 <b>ФИО:</b> ${draft.fullName ?? '—'}\n` +
      `📞 <b>Телефон:</b> ${draft.phone ?? '—'}\n` +
      `⚖️ <b>Вид дела:</b> ${draft.category ? CATEGORY_LABELS[draft.category] : '—'}\n` +
      `📋 <b>Услуга:</b> ${service?.title ?? '—'}\n` +
      `💰 <b>Стоимость:</b> ${service?.price_label ?? '—'}\n` +
      `📅 <b>Дата и время:</b> ${draft.date && draft.time ? formatSlotHuman(draft.date, draft.time) : '—'}\n` +
      `👨‍⚖️ <b>Адвокат:</b> ${lawyer?.full_name ?? '—'}\n` +
      `📍 <b>Адрес:</b> ${lawyer?.office_address ?? '—'}\n\n` +
      'Всё верно? Нажмите «Записаться».',
    keyboard: confirmKeyboard(),
  };
}

/** Шаг, с которого начинается выбор: он же экран восстановления после сбоя. */
function firstChoiceStep(ctx: BotContext): BookingStep {
  return ctx.session.lawyerFixed ? 'ask_service' : 'ask_category';
}

async function renderStep(ctx: BotContext, step: BookingStep): Promise<RenderedStep> {
  const draft = ctx.session.draft;
  switch (step) {
    case 'ask_phone':
      return renderAskPhone(ctx);
    case 'ask_category':
      return renderAskCategory(ctx);
    case 'ask_lawyer':
      return draft.category ? renderAskLawyer(ctx, draft.category) : renderAskCategory(ctx);
    case 'ask_service':
      return draft.lawyerId ? renderAskService(ctx) : renderAskCategory(ctx);
    case 'ask_date':
      return draft.lawyerId ? renderAskDate(ctx, draft.lawyerId) : renderAskCategory(ctx);
    case 'ask_time':
      return draft.lawyerId && draft.date
        ? renderAskTime(ctx, draft.lawyerId, draft.date)
        : renderAskCategory(ctx);
    case 'confirm':
      return renderConfirm(ctx);
    case 'ask_name':
    default:
      return renderAskName(ctx);
  }
}

/* ─────────────────────── подбор списков ─────────────────────── */

/** Адвокаты, ведущие такие дела; если таких нет — все активные. */
async function lawyersForCategory(category: BookableCategory): Promise<Lawyer[]> {
  const matching = await lawyerRepository.findByCategory(category);
  return matching.length > 0 ? matching : lawyerRepository.findAllActive();
}

/** Консультации по всем видам дел, которые ведёт адвокат. */
async function consultationsForLawyer(lawyerId: number) {
  const lawyer = await lawyerRepository.findById(lawyerId);
  const categories = (lawyer?.categories ?? []).filter(isBookableCategory);
  if (categories.length === 0) {
    return serviceRepository.findAllConsultations();
  }
  return serviceRepository.findConsultationsByCategories(categories);
}

/* ──────────────────── стек экранов и чистка чата ──────────────────── */

function topFrame(ctx: BotContext): StepFrame | undefined {
  return ctx.session.frames[ctx.session.frames.length - 1];
}

/** Сообщение могло быть удалено вручную или устареть (>48 ч) — это не ошибка. */
async function safeDelete(ctx: BotContext, messageId?: number): Promise<void> {
  if (!messageId || !ctx.chat) return;
  try {
    await ctx.api.deleteMessage(ctx.chat.id, messageId);
  } catch {
    /* сообщение уже недоступно для удаления */
  }
}

/** Убирает из чата все сообщения одного экрана: вопрос, ответ и подсказки. */
async function purgeFrame(ctx: BotContext, frame: StepFrame): Promise<void> {
  for (const id of frame.strayMsgIds ?? []) {
    await safeDelete(ctx, id);
  }
  await safeDelete(ctx, frame.answerMsgId);
  await safeDelete(ctx, frame.questionMsgId);
}

/** Задаёт вопрос шага новым сообщением и запоминает его в стеке. */
async function askStep(ctx: BotContext, step: BookingStep): Promise<void> {
  ctx.session.step = step;
  const rendered = await renderStep(ctx, step);
  const msg = await ctx.reply(rendered.text, {
    parse_mode: 'HTML',
    reply_markup: rendered.keyboard,
  });
  ctx.session.frames.push({ step, questionMsgId: msg.message_id });
}

/**
 * Сбрасывает данные, собранные на указанном шаге и на всех последующих:
 * вернувшись к выбору вида дела, нельзя оставить адвоката и услугу
 * из прежнего раздела.
 */
function clearDraftFrom(draft: BookingDraft, step: BookingStep, lawyerFixed: boolean): void {
  const from = (BOOKING_STEPS as readonly string[]).indexOf(step);
  const affects = (candidate: BookingStep): boolean =>
    from !== -1 && (BOOKING_STEPS as readonly string[]).indexOf(candidate) >= from;

  if (affects('ask_name')) draft.fullName = undefined;
  if (affects('ask_phone')) draft.phone = undefined;
  if (affects('ask_category')) draft.category = undefined;
  if (affects('ask_lawyer') && !lawyerFixed) {
    // Адвокат, выбранный по ссылке с сайта, остаётся закреплённым.
    draft.lawyerId = undefined;
  }
  if (affects('ask_service')) {
    draft.serviceId = undefined;
    // По ссылке с сайта вид дела берётся из услуги — уходит вместе с ней.
    if (lawyerFixed) draft.category = undefined;
  }
  if (affects('ask_date')) draft.date = undefined;
  if (affects('ask_time')) draft.time = undefined;
}

/* ──────────────────────────── старт ──────────────────────────── */

/** «6 коротких шагов», «2 коротких шага» — счётная форма для русского текста. */
function stepsWord(count: number): string {
  const tail = count % 100;
  const last = count % 10;
  const plural = tail >= 11 && tail <= 14 ? 'шагов' : last === 1 ? 'шаг' : last >= 2 && last <= 4 ? 'шага' : 'шагов';
  return `${count} ${plural === 'шаг' ? 'короткий' : 'коротких'} ${plural}`;
}

export async function startBooking(ctx: BotContext): Promise<void> {
  resetSession(ctx);
  await ctx.reply(`Запись на консультацию — ${stepsWord(stepsTotal(false))}.`, {
    reply_markup: { remove_keyboard: true },
  });
  await askStep(ctx, 'ask_name');
}

/** Переход по ссылке вида /start?lawyer=1 — адвокат уже выбран. */
export async function startBookingWithLawyer(ctx: BotContext, lawyerId: number): Promise<void> {
  resetSession(ctx);
  ctx.session.draft.lawyerId = lawyerId;
  ctx.session.lawyerFixed = true;

  const lawyer = await lawyerRepository.findById(lawyerId);
  await ctx.reply(
    `Запись на консультацию к адвокату <b>${lawyer?.full_name ?? '—'}</b> — ` +
      `${stepsWord(stepsTotal(true))}.`,
    { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } },
  );
  await askStep(ctx, 'ask_name');
}

/* ─────────────────────── текстовые шаги ─────────────────────── */

/** Неверный ввод: подсказка и сама попытка тоже уйдут при «Назад». */
async function rejectInput(ctx: BotContext, messageId: number, error: string): Promise<void> {
  const hint = await ctx.reply(`⚠️ ${error}`);
  const frame = topFrame(ctx);
  if (frame) {
    frame.strayMsgIds = [...(frame.strayMsgIds ?? []), messageId, hint.message_id];
  }
}

export async function handleBookingText(ctx: BotContext): Promise<boolean> {
  const step = ctx.session.step;
  const text = ctx.message?.text?.trim();
  const messageId = ctx.message?.message_id;
  if (!text || !messageId) return false;

  switch (step) {
    case 'ask_name': {
      const check = validateFullName(text);
      if (!check.valid) {
        await rejectInput(ctx, messageId, check.error!);
        return true;
      }
      ctx.session.draft.fullName = normalizeFullName(text);
      const frame = topFrame(ctx);
      if (frame) frame.answerMsgId = messageId;
      await askStep(ctx, 'ask_phone');
      return true;
    }
    case 'ask_phone': {
      const check = validatePhone(text);
      if (!check.valid) {
        await rejectInput(ctx, messageId, check.error!);
        return true;
      }
      ctx.session.draft.phone = normalizePhone(text);
      const frame = topFrame(ctx);
      if (frame) frame.answerMsgId = messageId;
      // По ссылке с сайта адвокат уже известен — вид дела не спрашиваем.
      await askStep(ctx, firstChoiceStep(ctx));
      return true;
    }
    default:
      return false;
  }
}

/* ─────────────────────── шаги с кнопками ─────────────────────── */

/** Выбран вид дела — показываем адвокатов, которые ведут такие дела. */
export async function askLawyerStep(ctx: BotContext, category: BookableCategory): Promise<void> {
  ctx.session.draft.category = category;
  await askStep(ctx, 'ask_lawyer');
}

/** Выбран адвокат — показываем варианты консультации. */
export async function askServiceStep(ctx: BotContext, lawyerId: number): Promise<void> {
  ctx.session.draft.lawyerId = lawyerId;
  await askStep(ctx, 'ask_service');
}

/** Выбрана консультация — показываем свободные даты адвоката. */
export async function askDateStep(ctx: BotContext, serviceId: number): Promise<void> {
  const draft = ctx.session.draft;
  draft.serviceId = serviceId;
  if (!draft.lawyerId) {
    await expireSession(ctx);
    return;
  }
  if (!draft.category) {
    // Запись по ссылке с сайта: вид дела берём из выбранной услуги.
    const service = await serviceRepository.findById(serviceId);
    if (service && isBookableCategory(service.category)) {
      draft.category = service.category;
    }
  }
  await askStep(ctx, 'ask_date');
}

/** Выбрана дата — показываем свободное время этого дня. */
export async function askTimeStep(ctx: BotContext, date: string): Promise<void> {
  ctx.session.draft.date = date;
  if (!ctx.session.draft.lawyerId) {
    await expireSession(ctx);
    return;
  }
  await askStep(ctx, 'ask_time');
}

/** Выбрано время — показываем итоговую заявку с кнопкой «Записаться». */
export async function askConfirmStep(ctx: BotContext, time: string): Promise<void> {
  ctx.session.draft.time = time;
  await askStep(ctx, 'confirm');
}

/* ──────────────────────────── «Назад» ──────────────────────────── */

/**
 * Удаляет из чата текущий вопрос, ответ пользователя на предыдущий вопрос
 * и сам предыдущий вопрос, после чего задаёт предыдущий вопрос заново.
 */
export async function goBack(ctx: BotContext): Promise<void> {
  const frames = ctx.session.frames;
  if (frames.length < 2) return;

  const current = frames.pop()!;
  await purgeFrame(ctx, current);

  const previous = frames.pop()!;
  await purgeFrame(ctx, previous);
  clearDraftFrom(ctx.session.draft, previous.step, ctx.session.lawyerFixed === true);

  await askStep(ctx, previous.step);
}

/* ──────────────────────── подтверждение ──────────────────────── */

/** Сессия потеряна (перезапуск бота, старое сообщение) — просим начать заново. */
async function expireSession(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery({ text: 'Сессия устарела, начните запись заново', show_alert: true });
  resetSession(ctx);
  await ctx.reply('Пожалуйста, начните запись заново.', { reply_markup: mainMenuKeyboard() });
}

export async function finalizeBooking(ctx: BotContext): Promise<void> {
  const draft = ctx.session.draft;
  if (
    !draft.fullName ||
    !draft.phone ||
    !draft.category ||
    !draft.lawyerId ||
    !draft.serviceId ||
    !draft.date ||
    !draft.time
  ) {
    await expireSession(ctx);
    return;
  }

  const telegramId = ctx.from!.id;
  const user = await userRepository.findOrCreate(telegramId, ctx.from?.username ?? null);
  await userRepository.updateContact(user.id, draft.fullName, draft.phone);

  let booking;
  try {
    booking = await bookingService.confirmBooking(user.id, draft);
  } catch (err) {
    if (err instanceof SlotTakenError) {
      // Слот заняли, пока клиент проверял заявку — возвращаем к выбору времени.
      await ctx.answerCallbackQuery({
        text: 'Это время только что заняли. Выберите, пожалуйста, другое.',
        show_alert: true,
      });
      const confirmFrame = ctx.session.frames.pop();
      if (confirmFrame) await purgeFrame(ctx, confirmFrame);
      draft.time = undefined;
      const timeFrame = ctx.session.frames.pop();
      if (timeFrame) await purgeFrame(ctx, timeFrame);
      await askStep(ctx, 'ask_time');
      return;
    }
    throw err;
  }

  const [lawyer, service] = await Promise.all([
    lawyerRepository.findById(booking.lawyer_id),
    serviceRepository.findById(booking.service_id),
  ]);

  await ctx.answerCallbackQuery();

  // Кнопки итоговой заявки больше не нужны — саму заявку оставляем как запись в чате.
  const confirmFrame = topFrame(ctx);
  if (confirmFrame?.questionMsgId && ctx.chat) {
    try {
      await ctx.api.editMessageReplyMarkup(ctx.chat.id, confirmFrame.questionMsgId, {
        reply_markup: undefined,
      });
    } catch {
      /* сообщение недоступно для редактирования */
    }
  }

  await ctx.reply(
    `✅ <b>Запись создана</b>\n\n` +
      `📅 ${formatSlotHuman(draft.date, draft.time)}\n` +
      `📋 ${service?.title ?? '—'} — ${service?.price_label ?? '—'}\n` +
      `👨‍⚖️ ${lawyer?.full_name ?? '—'}\n` +
      `📍 ${lawyer?.office_address ?? '—'}\n\n` +
      `Мы позвоним на ${draft.phone} для подтверждения. ` +
      'Если планы изменятся — сообщите заранее, пожалуйста.',
    { parse_mode: 'HTML' },
  );
  await ctx.reply('Главное меню:', { reply_markup: mainMenuKeyboard() });

  if (lawyer && service) {
    await notificationService.notifyAdminsOfNewBooking(ctx.api, booking, lawyer, service);
  }

  resetSession(ctx);
}

export function resetSession(ctx: BotContext): void {
  ctx.session.step = 'idle';
  ctx.session.draft = {};
  ctx.session.frames = [];
  ctx.session.lawyerFixed = false;
}

export function isBookingTextStep(step: BookingStep): boolean {
  return step === 'ask_name' || step === 'ask_phone';
}
