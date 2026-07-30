/**
 * Доступ к справочнику адвокатов и услуг.
 *
 * Справочник меняется редко, а читается на каждое нажатие кнопки,
 * поэтому он загружается в память при старте (см. core/catalog.js).
 * Здесь — только запросы к БД.
 */

import { query } from './pool.js';

export async function fetchAdvocates() {
  const { rows: advocates } = await query(
    `SELECT id, name, short_name, role, spec, since_year, registry,
            phone, email, telegram_id, max_id
       FROM advocates
      ORDER BY sort_order, id`,
  );

  const { rows: services } = await query(
    `SELECT advocate_id, id, title, price, note
       FROM services
      ORDER BY advocate_id, sort_order, id`,
  );

  return advocates.map((a) => ({
    id: a.id,
    name: a.name,
    short: a.short_name,
    role: a.role,
    spec: a.spec,
    since: a.since_year,
    registry: a.registry,
    phone: a.phone,
    email: a.email,
    telegramId: a.telegram_id,
    maxId: a.max_id,
    services: services
      .filter((s) => s.advocate_id === a.id)
      .map((s) => ({ id: s.id, title: s.title, price: s.price, note: s.note })),
  }));
}

/** Почта и контакты адвоката — для уведомления о новой записи. */
export async function fetchAdvocateContacts(advocateId) {
  const { rows } = await query(
    `SELECT id, name, email, phone, telegram_id, max_id
       FROM advocates WHERE id = $1`,
    [advocateId],
  );
  return rows[0] || null;
}
