import { InlineKeyboard } from 'grammy';
import { BotContext } from '../context';
import { env } from '../../config/env';
import { bookingRepository } from '../../database/repositories/booking.repository';
import { lawyerRepository } from '../../database/repositories/lawyer.repository';
import { serviceRepository } from '../../database/repositories/service.repository';
import { formatBookingSlot, formatDateHuman, formatDateTimeHuman, toDateStr } from '../utils/dates';
import { Booking, CATEGORY_LABELS, isBookableCategory } from '../../types';

function isAdmin(telegramId: number | undefined): boolean {
  return !!telegramId && env.adminIds.includes(telegramId);
}

function adminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📅 Консультации сегодня', 'admin:schedule')
    .row()
    .text('📥 Заявки сегодня', 'admin:today')
    .text('📥 За 7 дней', 'admin:week')
    .row()
    .text('👨 Сергей', 'admin:lawyer:1')
    .text('👩 Ирина', 'admin:lawyer:2')
    .row()
    .text('📈 Статистика', 'admin:stats');
}

export async function handleAdminCommand(ctx: BotContext): Promise<void> {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.reply('⛔ У вас нет доступа к панели администратора.');
    return;
  }
  await ctx.reply('🛠 Панель администратора', { reply_markup: adminMenuKeyboard() });
}

async function bookingLine(booking: Booking): Promise<string> {
  const lawyer = await lawyerRepository.findById(booking.lawyer_id);
  const service = await serviceRepository.findById(booking.service_id);
  const categoryLabel = isBookableCategory(booking.category)
    ? CATEGORY_LABELS[booking.category]
    : booking.category;
  return (
    `📅 ${formatBookingSlot(booking)} — ${booking.client_full_name} (${booking.client_phone})\n` +
    `⚖️ ${categoryLabel}\n` +
    `📋 ${service?.title ?? '—'} — ${service?.price_label ?? '—'}\n` +
    `👨‍⚖️ ${lawyer?.full_name ?? '—'}\n` +
    `🕐 Заявка от ${formatDateTimeHuman(booking.created_at)}`
  );
}

async function bookingsListText(bookings: Booking[], header: string): Promise<string> {
  if (bookings.length === 0) return `${header}: заявок нет.`;
  const lines = await Promise.all(bookings.map(bookingLine));
  return `${header} (${bookings.length}):\n\n${lines.join('\n\n')}`;
}

export async function handleAdminCallback(ctx: BotContext): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith('admin:')) return false;
  if (!isAdmin(ctx.from?.id)) {
    await ctx.answerCallbackQuery({ text: 'Нет доступа', show_alert: true });
    return true;
  }
  await ctx.answerCallbackQuery();

  if (data === 'admin:schedule') {
    const today = toDateStr(new Date());
    const bookings = await bookingRepository.findByBookingDate(today);
    await ctx.reply(
      await bookingsListText(bookings, `📅 Консультации на ${formatDateHuman(today)}`),
    );
    return true;
  }

  if (data === 'admin:today') {
    const today = toDateStr(new Date());
    const bookings = await bookingRepository.findByCreatedDate(today);
    await ctx.reply(await bookingsListText(bookings, `📥 Заявки за ${formatDateHuman(today)}`));
    return true;
  }

  if (data === 'admin:week') {
    const since = new Date();
    since.setDate(since.getDate() - 6);
    const bookings = await bookingRepository.findCreatedSince(toDateStr(since));
    await ctx.reply(await bookingsListText(bookings, '📥 Заявки за последние 7 дней'));
    return true;
  }

  if (data.startsWith('admin:lawyer:')) {
    const lawyerId = Number(data.split(':')[2]);
    const lawyer = await lawyerRepository.findById(lawyerId);
    if (!lawyer) {
      await ctx.reply('Адвокат не найден.');
      return true;
    }
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const count = await bookingRepository.countByLawyerSince(lawyerId, toDateStr(since));
    await ctx.reply(
      `👨‍⚖️ <b>${lawyer.full_name}</b>\n${lawyer.role}\n${lawyer.specialization}\n\n` +
        `Заявок за последние 30 дней: ${count}`,
      { parse_mode: 'HTML' },
    );
    return true;
  }

  if (data === 'admin:stats') {
    const total = await bookingRepository.countTotal();
    const lawyers = await lawyerRepository.findAllActive();
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = toDateStr(since);
    const perLawyer = await Promise.all(
      lawyers.map(
        async (l) => `${l.full_name}: ${await bookingRepository.countByLawyerSince(l.id, sinceStr)} за 30 дней`,
      ),
    );
    await ctx.reply(`📈 Всего заявок: ${total}\n\n${perLawyer.join('\n')}`);
    return true;
  }

  return false;
}
