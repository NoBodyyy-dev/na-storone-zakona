import { BotContext } from '../context';
import {
  askConfirmStep,
  askDateStep,
  askLawyerStep,
  askServiceStep,
  askTimeStep,
  finalizeBooking,
  goBack,
} from '../conversations/booking.conversation';
import { BACK_BUTTON_DATA, CONFIRM_BUTTON_DATA } from '../keyboards/keyboards';
import { isBookableCategory } from '../../types';
import { isValidSlotTime, isWorkingDay } from '../utils/dates';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function handleBookingCallback(ctx: BotContext): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data) return false;

  if (data === BACK_BUTTON_DATA) {
    await ctx.answerCallbackQuery();
    await goBack(ctx);
    return true;
  }

  // Подтверждение итоговой заявки — последний шаг записи.
  if (data === CONFIRM_BUTTON_DATA) {
    await finalizeBooking(ctx);
    return true;
  }

  if (data.startsWith('case:')) {
    const category = data.slice('case:'.length);
    if (!isBookableCategory(category)) {
      await ctx.answerCallbackQuery({ text: 'Неизвестный вид дела', show_alert: true });
      return true;
    }
    await ctx.answerCallbackQuery();
    await askLawyerStep(ctx, category);
    return true;
  }

  // Выбор адвоката — только в обычной записи, по ссылке с сайта он закреплён.
  if (data.startsWith('lawyer:')) {
    const lawyerId = Number(data.slice('lawyer:'.length));
    if (!Number.isInteger(lawyerId)) {
      await ctx.answerCallbackQuery({ text: 'Неизвестный адвокат', show_alert: true });
      return true;
    }
    await ctx.answerCallbackQuery();
    await askServiceStep(ctx, lawyerId);
    return true;
  }

  if (data.startsWith('service:')) {
    const serviceId = Number(data.slice('service:'.length));
    if (!Number.isInteger(serviceId)) {
      await ctx.answerCallbackQuery({ text: 'Неизвестная услуга', show_alert: true });
      return true;
    }
    await ctx.answerCallbackQuery();
    await askDateStep(ctx, serviceId);
    return true;
  }

  if (data.startsWith('date:')) {
    const date = data.slice('date:'.length);
    if (!DATE_RE.test(date) || !isWorkingDay(date)) {
      await ctx.answerCallbackQuery({ text: 'Некорректная дата', show_alert: true });
      return true;
    }
    await ctx.answerCallbackQuery();
    await askTimeStep(ctx, date);
    return true;
  }

  // Выбор времени ведёт к итоговой заявке, а не сразу к записи.
  if (data.startsWith('time:')) {
    const time = data.slice('time:'.length);
    if (!isValidSlotTime(time)) {
      await ctx.answerCallbackQuery({ text: 'Некорректное время', show_alert: true });
      return true;
    }
    await ctx.answerCallbackQuery();
    await askConfirmStep(ctx, time);
    return true;
  }

  return false;
}
