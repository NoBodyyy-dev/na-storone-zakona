import { Api } from 'grammy';
import { env } from '../config/env';
import { logger } from '../logger/logger';
import { Booking, CATEGORY_LABELS, Lawyer, Service, isBookableCategory } from '../types';
import { formatBookingSlot, formatDateTimeHuman } from '../bot/utils/dates';

/** ФИО клиента вставляется в HTML-сообщение — экранируем, чтобы не сломать разметку. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class NotificationService {
  /** Новая заявка — администраторам и адвокату, к которому записался клиент. */
  async notifyAboutNewBooking(api: Api, booking: Booking, lawyer: Lawyer, service: Service): Promise<void> {
    const categoryLabel = isBookableCategory(booking.category)
      ? CATEGORY_LABELS[booking.category]
      : booking.category;

    const text =
      `🆕 <b>Новая запись на консультацию</b>\n\n` +
      `👤 ${escapeHtml(booking.client_full_name)}\n` +
      `📞 ${booking.client_phone}\n` +
      `⚖️ Вид дела: ${categoryLabel}\n` +
      `📋 ${service.title} — ${service.price_label}\n` +
      `📅 Дата и время: <b>${formatBookingSlot(booking)}</b>\n` +
      `👨‍⚖️ Адвокат: ${lawyer.full_name}\n` +
      `🕐 Заявка от ${formatDateTimeHuman(booking.created_at)}`;

    const recipients = new Set(env.adminIds);
    for (const [telegramId, lawyerId] of env.lawyerByTelegramId) {
      if (lawyerId === lawyer.id) recipients.add(telegramId);
    }

    for (const chatId of recipients) {
      try {
        await api.sendMessage(chatId, text, { parse_mode: 'HTML' });
      } catch (err) {
        logger.error({ err, chatId }, 'Failed to notify about new booking');
      }
    }
  }

  /** Подтверждение клиенту в чат с ботом — чтобы запись осталась перед глазами. */
  async confirmToClient(
    api: Api,
    telegramId: number,
    booking: Booking,
    lawyer: Lawyer,
    service: Service,
  ): Promise<void> {
    try {
      await api.sendMessage(
        telegramId,
        `✅ <b>Запись создана</b>\n\n` +
          `📅 ${formatBookingSlot(booking)}\n` +
          `📋 ${service.title} — ${service.price_label}\n` +
          `👨‍⚖️ ${lawyer.full_name}\n` +
          `📍 ${lawyer.office_address}\n\n` +
          `Мы позвоним на ${booking.client_phone} для подтверждения. ` +
          'Если планы изменятся — сообщите заранее, пожалуйста.',
        { parse_mode: 'HTML' },
      );
    } catch (err) {
      // Клиент мог не запускать бота или заблокировать его — запись от этого не страдает.
      logger.warn({ err, bookingId: booking.id }, 'Failed to send booking confirmation to client');
    }
  }
}

export const notificationService = new NotificationService();
