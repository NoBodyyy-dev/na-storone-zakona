import { InlineKeyboard } from 'grammy';
import { BotContext } from '../context';
import { userRepository } from '../../database/repositories/user.repository';
import { bookingService } from '../../services/booking.service';
import { lawyerRepository } from '../../database/repositories/lawyer.repository';
import { serviceRepository } from '../../database/repositories/service.repository';
import { formatBookingSlot, formatDateTimeHuman } from '../utils/dates';
import { Booking, CATEGORY_LABELS, isBookableCategory } from '../../types';

export const CANCEL_PREFIX = 'cancel:';

async function bookingLine(booking: Booking, index: number): Promise<string> {
  const lawyer = await lawyerRepository.findById(booking.lawyer_id);
  const service = await serviceRepository.findById(booking.service_id);
  const categoryLabel = isBookableCategory(booking.category)
    ? CATEGORY_LABELS[booking.category]
    : booking.category;
  return (
    `<b>${index + 1}.</b> 📅 ${formatBookingSlot(booking)}\n` +
    `⚖️ ${categoryLabel}\n` +
    `📋 ${service?.title ?? '—'} — ${service?.price_label ?? '—'}\n` +
    `👨‍⚖️ ${lawyer?.full_name ?? '—'}\n` +
    `🕐 Заявка от ${formatDateTimeHuman(booking.created_at)}`
  );
}

export async function handleMyBookings(ctx: BotContext): Promise<void> {
  if (!ctx.from) return;
  const user = await userRepository.findOrCreate(ctx.from.id, ctx.from.username ?? null);
  const bookings = await bookingService.getForUser(user.id);

  if (bookings.length === 0) {
    await ctx.reply(
      'У вас пока нет записей. Нажмите «📝 Записаться на консультацию», чтобы создать первую.',
    );
    return;
  }

  const lines = await Promise.all(bookings.map(bookingLine));
  const kb = new InlineKeyboard();
  bookings.forEach((b, i) => {
    kb.text(`✕ Отменить запись №${i + 1}`, `${CANCEL_PREFIX}${b.id}`).row();
  });

  await ctx.reply(`📋 <b>Ваши записи на консультацию</b>\n\n${lines.join('\n\n')}`, {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
}

/** Кнопка «Отменить запись» — отменяет только запись самого клиента. */
export async function handleCancelCallback(ctx: BotContext): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith(CANCEL_PREFIX) || !ctx.from) return false;

  const id = Number(data.slice(CANCEL_PREFIX.length));
  if (!Number.isInteger(id) || id <= 0) {
    await ctx.answerCallbackQuery({ text: 'Запись не найдена', show_alert: true });
    return true;
  }

  const user = await userRepository.findOrCreate(ctx.from.id, ctx.from.username ?? null);
  const cancelled = await bookingService.cancelForUser(id, user.id);
  if (!cancelled) {
    await ctx.answerCallbackQuery({ text: 'Запись не найдена или уже отменена', show_alert: true });
    return true;
  }

  await ctx.answerCallbackQuery({ text: 'Запись отменена' });
  // Кнопки под старым списком уже неактуальны.
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
  await ctx.reply(
    `❌ Запись на ${formatBookingSlot(cancelled)} отменена. Если передумаете — записывайтесь снова, время освободилось.`,
  );
  return true;
}
