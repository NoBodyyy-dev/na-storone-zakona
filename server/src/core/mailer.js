/**
 * Уведомление адвоката о новой записи.
 *
 * Письмо уходит на адрес из таблицы advocates — то есть Богданову С. В.
 * или Богдановой И. Н. в зависимости от того, к кому записались.
 *
 * Отправка не должна ронять запись: если SMTP недоступен, клиент уже
 * записан, и мы лишь пишем ошибку в лог. Факт успешной отправки
 * фиксируется в bookings.notified_at.
 */

import nodemailer from 'nodemailer';
import { COLLEGIUM } from '../data/collegium.js';
import { formatSlot } from './schedule.js';
import { markNotified } from '../db/bookings.js';

let transport = null;

export function initMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) {
    console.warn('[mail] SMTP_HOST не задан — письма адвокатам отправляться не будут');
    return null;
  }
  transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return transport;
}

/** Позволяет подставить транспорт в тестах. */
export const setTransport = (t) => { transport = t; };

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildLetter({ advocate, service, slotAt, client, platform }) {
  const when = formatSlot(new Date(slotAt));
  const source = platform === 'telegram' ? 'Telegram' : 'MAX';

  const subject = `Новая запись: ${when} — ${service.title}`;

  const text = [
    `${advocate.name}, здравствуйте.`,
    '',
    'Через бота коллегии поступила новая запись на приём.',
    '',
    `Дата и время: ${when}`,
    `Услуга: ${service.title}`,
    `Стоимость: ${service.price}`,
    '',
    `Клиент: ${client.name}`,
    `Источник: ${source}${client.id ? ` (id ${client.id})` : ''}`,
    '',
    `Адрес приёма: ${COLLEGIUM.address}`,
    '',
    '—',
    COLLEGIUM.name,
    'Письмо сформировано автоматически ботом записи.',
  ].join('\n');

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1a1a1a">
  <p>${esc(advocate.name)}, здравствуйте.</p>
  <p>Через бота коллегии поступила новая запись на приём.</p>
  <table cellpadding="6" style="border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="color:#666">Дата и время</td><td><b>${esc(when)}</b></td></tr>
    <tr><td style="color:#666">Услуга</td><td><b>${esc(service.title)}</b></td></tr>
    <tr><td style="color:#666">Стоимость</td><td>${esc(service.price)}</td></tr>
    <tr><td style="color:#666">Клиент</td><td>${esc(client.name)}</td></tr>
    <tr><td style="color:#666">Источник</td><td>${esc(source)}${client.id ? ` (id ${esc(client.id)})` : ''}</td></tr>
  </table>
  <p style="font-size:14px">Адрес приёма: ${esc(COLLEGIUM.address)}</p>
  <hr style="border:0;border-top:1px solid #ddd;margin:20px 0" />
  <p style="font-size:12px;color:#888">
    ${esc(COLLEGIUM.name)}<br />Письмо сформировано автоматически ботом записи.
  </p>
</div>`.trim();

  return { subject, text, html };
}

/**
 * Отправляет письмо адвокату. Ошибки не пробрасываются —
 * неудачная отправка не должна отменять уже созданную запись.
 */
export async function notifyAdvocate({ bookingId, advocate, service, slotAt, client, platform }) {
  if (!transport) return { sent: false, reason: 'нет транспорта' };
  if (!advocate?.email) return { sent: false, reason: 'у адвоката не указана почта' };

  const letter = buildLetter({ advocate, service, slotAt, client, platform });

  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || `"Бот коллегии" <${process.env.SMTP_USER}>`,
      to: advocate.email,
      replyTo: process.env.MAIL_REPLY_TO || undefined,
      ...letter,
    });
    if (bookingId) await markNotified(bookingId);
    console.log(`[mail] уведомление отправлено: ${advocate.email} (запись ${bookingId})`);
    return { sent: true };
  } catch (err) {
    console.error(`[mail] не удалось отправить письмо ${advocate.email}:`, err.message);
    return { sent: false, reason: err.message };
  }
}
