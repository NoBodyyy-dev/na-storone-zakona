import { Api } from 'grammy';
import { env } from '../config/env';
import { logger } from '../logger/logger';
import { Booking, CATEGORY_LABELS, Lawyer, Service, isBookableCategory } from '../types';
import { formatBookingSlot, formatDateTimeHuman } from '../bot/utils/dates';

export class NotificationService {
  async notifyAdminsOfNewBooking(
    api: Api,
    booking: Booking,
    lawyer: Lawyer,
    service: Service,
  ): Promise<void> {
    const categoryLabel = isBookableCategory(booking.category)
      ? CATEGORY_LABELS[booking.category]
      : booking.category;

    const text =
      `🆕 <b>Новая запись на консультацию</b>\n\n` +
      `👤 ${booking.client_full_name}\n` +
      `📞 ${booking.client_phone}\n` +
      `⚖️ Вид дела: ${categoryLabel}\n` +
      `📋 ${service.title} — ${service.price_label}\n` +
      `📅 Дата и время: <b>${formatBookingSlot(booking)}</b>\n` +
      `👨‍⚖️ Адвокат: ${lawyer.full_name}\n` +
      `🕐 Заявка от ${formatDateTimeHuman(booking.created_at)}`;

    for (const adminId of env.adminIds) {
      try {
        await api.sendMessage(adminId, text, { parse_mode: 'HTML' });
      } catch (err) {
        logger.error({ err, adminId }, 'Failed to notify admin about new booking');
      }
    }
  }
}

export const notificationService = new NotificationService();
