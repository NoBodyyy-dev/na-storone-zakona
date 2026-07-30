import { BotContext } from '../context';
import { userRepository } from '../../database/repositories/user.repository';
import { bookingService } from '../../services/booking.service';
import { lawyerRepository } from '../../database/repositories/lawyer.repository';
import { serviceRepository } from '../../database/repositories/service.repository';
import { formatBookingSlot, formatDateTimeHuman } from '../utils/dates';
import { CATEGORY_LABELS, isBookableCategory } from '../../types';

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

  const lines: string[] = [];
  for (const booking of bookings) {
    const lawyer = await lawyerRepository.findById(booking.lawyer_id);
    const service = await serviceRepository.findById(booking.service_id);
    const categoryLabel = isBookableCategory(booking.category)
      ? CATEGORY_LABELS[booking.category]
      : booking.category;
    lines.push(
      `📅 ${formatBookingSlot(booking)}\n` +
        `⚖️ ${categoryLabel}\n` +
        `📋 ${service?.title ?? '—'} — ${service?.price_label ?? '—'}\n` +
        `👨‍⚖️ ${lawyer?.full_name ?? '—'}\n` +
        `🕐 Заявка от ${formatDateTimeHuman(booking.created_at)}`,
    );
  }

  await ctx.reply(`📋 Ваши записи на консультацию:\n\n${lines.join('\n\n')}`);
}
