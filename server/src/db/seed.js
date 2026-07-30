/**
 * Наполнение справочника: npm run db:seed
 *
 * Идемпотентно (UPSERT), поэтому безопасно гонять повторно после правки
 * прайса. Записи на приём не трогает.
 *
 * Почта и id адвокатов в мессенджерах берутся из переменных окружения —
 * чтобы не держать контакты в репозитории. Если переменная не задана,
 * используется значение по умолчанию из массива ниже.
 */

import 'dotenv/config';
import { withTransaction, closePool } from './pool.js';

const ADVOCATES = [
  {
    id: 'sv',
    name: 'Богданов Сергей Владимирович',
    short: 'Богданов С. В.',
    role: 'Председатель коллегии',
    spec: 'Уголовные и арбитражные дела · Почётный адвокат Кубани',
    since: 2007,
    registry: '23/3097',
    phone: '+7 918 460-07-69',
    email: process.env.ADVOCATE_SV_EMAIL || 'sv-bogdan@mail.ru',
    telegramId: process.env.ADVOCATE_SV_TELEGRAM_ID || null,
    maxId: process.env.ADVOCATE_SV_MAX_ID || null,
    services: [
      { id: 'k1', title: 'Первичная консультация', price: 'бесплатно', note: 'Оценка перспектив дела' },
      { id: 'k2', title: 'Устная консультация', price: 'от 2 000 ₽', note: 'Разбор ситуации с правовой позицией' },
      { id: 'k3', title: 'Письменная консультация', price: 'от 5 000 ₽', note: 'Правовое заключение со ссылками на закон' },
      { id: 'u1', title: 'Защита на стадии следствия', price: 'от 50 000 ₽', note: 'Участие при следственных действиях' },
      { id: 'u2', title: 'Защита в суде первой инстанции', price: 'от 70 000 ₽', note: 'Полное ведение уголовного дела' },
      { id: 'u3', title: 'Обжалование приговора', price: 'от 40 000 ₽', note: 'Апелляция, кассация' },
      { id: 'a1', title: 'Арбитраж — упрощённое производство', price: 'от 20 000 ₽', note: 'Упрощённое судопроизводство' },
      { id: 'a2', title: 'Арбитраж — стандартные дела', price: 'от 60 000 ₽', note: 'Дела несложной категории' },
      { id: 'b1', title: 'Абонентское обслуживание', price: 'от 30 000 ₽ / мес', note: 'Юридическое сопровождение бизнеса' },
    ],
  },
  {
    id: 'in',
    name: 'Богданова Ирина Николаевна',
    short: 'Богданова И. Н.',
    role: 'Адвокат',
    spec: 'Семейные · гражданские · административные · арбитражные дела',
    since: 2012,
    registry: '23/5291',
    phone: '+7 918 001-04-04',
    email: process.env.ADVOCATE_IN_EMAIL || 'in-bogdan@mail.ru',
    telegramId: process.env.ADVOCATE_IN_TELEGRAM_ID || null,
    maxId: process.env.ADVOCATE_IN_MAX_ID || null,
    services: [
      { id: 'k1', title: 'Первичная консультация', price: 'бесплатно', note: 'Оценка перспектив дела' },
      { id: 'k2', title: 'Устная консультация', price: 'от 2 000 ₽', note: 'Разбор ситуации с правовой позицией' },
      { id: 'k3', title: 'Письменная консультация', price: 'от 5 000 ₽', note: 'Правовое заключение со ссылками на закон' },
      { id: 'k4', title: 'Составление документов', price: 'от 5 000 ₽', note: 'Иск, претензия, жалоба, договор' },
      { id: 'g1', title: 'Суд общей юрисдикции — 1-я инстанция', price: 'от 50 000 ₽', note: 'Полное сопровождение дела' },
      { id: 'g2', title: 'Последующие инстанции', price: '50% от цены договора', note: 'Апелляция, кассация' },
      { id: 'a2', title: 'Арбитражные споры', price: 'от 60 000 ₽', note: 'Представительство в арбитражном суде' },
      { id: 'n1', title: 'Налоговые споры', price: 'от 60 000 ₽', note: 'Сопровождение проверок, обжалование ФНС' },
      { id: 'd1', title: 'Разработка и экспертиза договора', price: 'от 15 000 ₽', note: 'За документ' },
    ],
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не задан — заполните .env');
    process.exit(1);
  }

  await withTransaction(async (client) => {
    for (const [i, a] of ADVOCATES.entries()) {
      await client.query(
        `INSERT INTO advocates
           (id, name, short_name, role, spec, since_year, registry, phone, email, telegram_id, max_id, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, short_name = EXCLUDED.short_name, role = EXCLUDED.role,
           spec = EXCLUDED.spec, since_year = EXCLUDED.since_year, registry = EXCLUDED.registry,
           phone = EXCLUDED.phone, email = EXCLUDED.email,
           telegram_id = EXCLUDED.telegram_id, max_id = EXCLUDED.max_id,
           sort_order = EXCLUDED.sort_order`,
        [a.id, a.name, a.short, a.role, a.spec, a.since, a.registry, a.phone, a.email,
         a.telegramId, a.maxId, i],
      );

      for (const [j, s] of a.services.entries()) {
        await client.query(
          `INSERT INTO services (advocate_id, id, title, price, note, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (advocate_id, id) DO UPDATE SET
             title = EXCLUDED.title, price = EXCLUDED.price,
             note = EXCLUDED.note, sort_order = EXCLUDED.sort_order`,
          [a.id, s.id, s.title, s.price, s.note, j],
        );
      }
    }
  });

  const total = ADVOCATES.reduce((n, a) => n + a.services.length, 0);
  console.log(`[db] справочник загружен: адвокатов ${ADVOCATES.length}, услуг ${total}`);
  await closePool();
}

main().catch((err) => {
  console.error('[db] не удалось загрузить справочник:', err.message);
  process.exit(1);
});
