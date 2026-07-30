/**
 * Записи на приём.
 *
 * Защита от двойной записи — уникальный индекс bookings_slot_unique
 * (advocate_id, slot_at). Приложение не проверяет занятость перед вставкой:
 * такая проверка всегда оставляет окно гонки. Вместо этого мы пытаемся
 * вставить и ловим нарушение уникальности — это атомарно и надёжно.
 */

import { query } from './pool.js';

/** Код ошибки PostgreSQL «нарушение уникального ограничения». */
const UNIQUE_VIOLATION = '23505';

/** Занятые моменты приёма адвоката начиная с текущего времени. */
export async function takenSlots(advocateId) {
  const { rows } = await query(
    `SELECT slot_at FROM bookings
      WHERE advocate_id = $1 AND slot_at >= now()
      ORDER BY slot_at`,
    [advocateId],
  );
  return rows.map((r) => r.slot_at);
}

/**
 * Занимает слот. Возвращает запись либо null, если время уже занято.
 * @returns {Promise<object|null>}
 */
export async function createBooking({ platform, userId, userName, advocateId, serviceId, slotAt }) {
  try {
    const { rows } = await query(
      `INSERT INTO bookings (platform, user_id, user_name, advocate_id, service_id, slot_at)
            VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, platform, user_id, user_name, advocate_id, service_id, slot_at, created_at`,
      [platform, String(userId), userName, advocateId, serviceId, slotAt],
    );
    return rows[0];
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) return null; // слот заняли между показом и подтверждением
    throw err;
  }
}

/** Будущие записи пользователя. */
export async function listUserBookings(platform, userId) {
  const { rows } = await query(
    `SELECT b.id, b.advocate_id, b.service_id, b.slot_at,
            s.title AS service_title, s.price AS service_price,
            a.name  AS advocate_name
       FROM bookings b
       JOIN advocates a ON a.id = b.advocate_id
       JOIN services  s ON s.advocate_id = b.advocate_id AND s.id = b.service_id
      WHERE b.platform = $1 AND b.user_id = $2 AND b.slot_at >= now()
      ORDER BY b.slot_at`,
    [platform, String(userId)],
  );
  return rows;
}

/** Отменяет запись. Удалить чужую нельзя: platform и user_id в условии. */
export async function cancelBooking(id, platform, userId) {
  const { rows } = await query(
    `DELETE FROM bookings
      WHERE id = $1 AND platform = $2 AND user_id = $3
      RETURNING id, advocate_id, service_id, slot_at`,
    [id, platform, String(userId)],
  );
  return rows[0] || null;
}

/** Отмечает, что письмо адвокату отправлено. */
export async function markNotified(id) {
  await query('UPDATE bookings SET notified_at = now() WHERE id = $1', [id]);
}
