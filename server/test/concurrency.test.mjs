/**
 * Проверка защиты от двойной записи под конкуренцией.
 *
 * Последовательный тест в flow.test.mjs проверяет обычный случай.
 * Здесь — настоящая гонка: 20 параллельных попыток занять один слот,
 * в том числе из обоих ботов сразу. Выжить должна ровно одна.
 */

import 'dotenv/config';
import { loadCatalog } from '../src/core/catalog.js';
import { setTransport } from '../src/core/mailer.js';
import { createBooking } from '../src/db/bookings.js';
import { query, closePool } from '../src/db/pool.js';

let fail = 0;
const check = (cond, msg) => { if (!cond) { console.log('  ✗ ' + msg); fail++; } };

setTransport({ sendMail: async () => ({ messageId: 'test' }) });

async function main() {
  await loadCatalog();
  await query("DELETE FROM bookings WHERE user_id LIKE 'race%'");

  const slotAt = new Date();
  slotAt.setDate(slotAt.getDate() + 3);
  slotAt.setHours(11, 0, 0, 0);

  console.log('1. 20 параллельных попыток занять один слот');
  const attempts = Array.from({ length: 20 }, (_, i) =>
    createBooking({
      platform: i % 2 === 0 ? 'telegram' : 'max',
      userId: `race${i}`,
      userName: `Клиент ${i}`,
      advocateId: 'sv',
      serviceId: 'k1',
      slotAt,
    }),
  );

  const results = await Promise.all(attempts);
  const won = results.filter(Boolean);
  const lost = results.filter((r) => r === null);

  check(won.length === 1, `слот заняли ${won.length} раз вместо 1`);
  check(lost.length === 19, `отказов ${lost.length} вместо 19`);

  const { rows } = await query(
    'SELECT count(*)::int AS n FROM bookings WHERE advocate_id=$1 AND slot_at=$2',
    ['sv', slotAt],
  );
  check(rows[0].n === 1, `в БД ${rows[0].n} записей на слот`);
  console.log(`   победитель: ${won[0]?.platform} / ${won[0]?.user_name}`);

  console.log('2. Тот же слот у другого адвоката свободен');
  const parallel = await createBooking({
    platform: 'telegram',
    userId: 'race-in',
    userName: 'Клиент',
    advocateId: 'in',
    serviceId: 'k1',
    slotAt,
  });
  check(parallel !== null, 'слот у второго адвоката ошибочно занят');

  console.log('3. После отмены слот снова занимается');
  await query('DELETE FROM bookings WHERE advocate_id=$1 AND slot_at=$2', ['sv', slotAt]);
  const retry = await createBooking({
    platform: 'max',
    userId: 'race-retry',
    userName: 'Поздний клиент',
    advocateId: 'sv',
    serviceId: 'k1',
    slotAt,
  });
  check(retry !== null, 'освободившийся слот не занимается');

  await query("DELETE FROM bookings WHERE user_id LIKE 'race%'");
  await closePool();
  console.log(fail === 0 ? '\n✓ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `\n✗ ПРОВАЛЕНО: ${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\n✗ Тест упал:', err.message);
  await closePool().catch(() => {});
  process.exit(1);
});
