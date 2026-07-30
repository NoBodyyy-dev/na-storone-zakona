/**
 * Проверка сценария на настоящей PostgreSQL.
 * Требует DATABASE_URL — см. README, раздел «Тесты».
 */

import 'dotenv/config';
import * as flow from '../src/core/flow.js';
import { loadCatalog, listAdvocates } from '../src/core/catalog.js';
import { setTransport } from '../src/core/mailer.js';
import { query, closePool } from '../src/db/pool.js';

let fail = 0;
const check = (cond, msg) => { if (!cond) { console.log('  ✗ ' + msg); fail++; } };

// Подменяем SMTP на перехватчик: письма собираем в массив, наружу не шлём.
const sent = [];
setTransport({ sendMail: async (m) => { sent.push(m); return { messageId: 'test' }; } });

const user = { id: 777, name: 'Тестовый Пользователь' };
const other = { id: 888, name: 'Другой Клиент' };
const P = 'telegram';

function validate(name, s) {
  check(s && typeof s.text === 'string' && s.text.length > 0, `${name}: пустой текст`);
  check(Array.isArray(s.buttons) && s.buttons.length > 0, `${name}: нет кнопок`);
  for (const row of s.buttons || []) {
    check(Array.isArray(row) && row.length > 0, `${name}: пустой ряд кнопок`);
    for (const b of row) {
      check(typeof b.label === 'string' && b.label.length > 0, `${name}: кнопка без подписи`);
      check(typeof b.data === 'string' && b.data.length > 0, `${name}: кнопка без payload`);
      check(Buffer.byteLength(b.data) <= 64, `${name}: payload "${b.data}" длиннее 64 байт`);
    }
  }
  return s;
}

async function main() {
  await query("DELETE FROM bookings WHERE user_id IN ('777','888')");
  await loadCatalog();

  console.log('1. Приветствие');
  const g = validate('greeting', flow.greeting());
  check(g.image === 'emblem', 'в приветствии нет эмблемы');
  check(/На стороне Закона/.test(g.text), 'нет названия коллегии');
  check(/записаться/i.test(g.text), 'не описан функционал');

  console.log('2. Справочник приехал из БД');
  check(listAdvocates().length === 2, 'адвокатов не 2');
  check(listAdvocates().every((a) => a.email), 'у адвоката нет почты из БД');

  console.log('3. Полный путь записи по кнопкам');
  let s = validate('book', await flow.route('book', user, P));
  const advBtn = s.buttons[0][0];

  s = validate('adv', await flow.route(advBtn.data, user, P));
  check(/Богданов Сергей/.test(s.text), 'не показан выбранный адвокат');

  const svcBtn = s.buttons[3][0];
  check(/—/.test(svcBtn.label), 'в кнопке услуги нет цены');
  s = validate('svc', await flow.route(svcBtn.data, user, P));

  const dayBtn = s.buttons[0][0];
  s = validate('day', await flow.route(dayBtn.data, user, P));

  const timeBtn = s.buttons[0][0];
  s = validate('time', await flow.route(timeBtn.data, user, P));
  check(/Проверьте запись/.test(s.text), 'нет экрана подтверждения');

  const okBtn = s.buttons[0][0];
  s = validate('ok', await flow.route(okBtn.data, user, P));
  check(/Вы записаны/.test(s.text), 'запись не подтвердилась: ' + s.text.slice(0, 80));

  console.log('4. Запись действительно легла в PostgreSQL');
  const { rows } = await query("SELECT * FROM bookings WHERE user_id = '777'");
  check(rows.length === 1, `в БД ${rows.length} записей вместо 1`);
  check(rows[0].advocate_id === 'sv', 'не тот адвокат');
  check(rows[0].platform === 'telegram', 'не та платформа');

  console.log('5. Адвокату ушло письмо');
  await new Promise((r) => setTimeout(r, 150)); // отправка не блокирует ответ клиенту
  check(sent.length === 1, `писем ${sent.length} вместо 1`);
  check(sent[0]?.to === 'sv-bogdan@mail.ru', `письмо ушло на ${sent[0]?.to}, а не Богданову С. В.`);
  check(/Новая запись/.test(sent[0]?.subject || ''), 'нет темы письма');
  check(/Тестовый Пользователь/.test(sent[0]?.text || ''), 'в письме нет имени клиента');
  const { rows: notified } = await query("SELECT notified_at FROM bookings WHERE user_id='777'");
  check(notified[0].notified_at !== null, 'notified_at не проставлен');

  console.log('6. Двойная запись отклоняется уникальным индексом');
  const dup = await flow.route(okBtn.data, other, P);
  check(/только что заняли/.test(dup.text), 'двойное бронирование не отклонено');
  const { rows: after } = await query(
    'SELECT count(*)::int AS n FROM bookings WHERE advocate_id=$1 AND slot_at=$2',
    ['sv', rows[0].slot_at],
  );
  check(after[0].n === 1, `на слот ${after[0].n} записей — индекс не сработал`);

  console.log('7. Занятое время исчезло из списка');
  const times = await flow.route(dayBtn.data, user, P);
  check(!times.buttons.flat().some((b) => b.data === timeBtn.data), 'занятый слот всё ещё предлагается');

  console.log('8. Письмо второму адвокату уходит на её адрес');
  sent.length = 0;
  const advIn = (await flow.route('book', user, P)).buttons[1][0];
  let t = await flow.route(advIn.data, user, P);
  t = await flow.route(t.buttons[0][0].data, user, P);   // услуга
  t = await flow.route(t.buttons[0][0].data, user, P);   // день
  t = await flow.route(t.buttons[0][0].data, user, P);   // время
  t = await flow.route(t.buttons[0][0].data, user, P);   // подтверждение
  check(/Вы записаны/.test(t.text), 'запись ко второму адвокату не прошла');
  await new Promise((r) => setTimeout(r, 150));
  check(sent[0]?.to === 'in-bogdan@mail.ru', `письмо ушло на ${sent[0]?.to}, а не Богдановой И. Н.`);

  console.log('9. Мои записи и отмена');
  s = validate('my', await flow.route('my', user, P));
  check((s.text.match(/<b>\d+\./g) || []).length === 2, 'в списке не 2 записи');
  check(s.buttons.filter((r) => r[0].data.startsWith('cancel|')).length === 2, 'не 2 кнопки отмены');
  const cancelBtn = s.buttons[0][0];
  check(cancelBtn.data.startsWith('cancel|'), 'нет кнопки отмены');
  s = validate('cancel', await flow.route(cancelBtn.data, user, P));
  check(/отменена/.test(s.text), 'запись не отменилась');

  console.log('10. Чужую запись отменить нельзя');
  const mine = await flow.route('my', user, P);
  const id = mine.buttons[0][0].data.split('|')[1];
  const foreign = await flow.route(`cancel|${id}`, other, P);
  check(/не найдена/.test(foreign.text), 'удалось отменить чужую запись');
  const { rows: still } = await query('SELECT count(*)::int AS n FROM bookings WHERE id=$1', [id]);
  check(still[0].n === 1, 'чужая запись всё-таки удалена');

  console.log('11. Слот вернулся после отмены');
  const back = await flow.route(dayBtn.data, user, P);
  check(back.buttons.flat().some((b) => b.data === timeBtn.data), 'слот не освободился');

  console.log('12. Прочие экраны');
  validate('menu', await flow.route('menu', user, P));
  const infoScreen = validate('info', await flow.route('info', user, P));
  check(/sv-bogdan@mail.ru/.test(infoScreen.text), 'в контактах нет почты из БД');
  validate('мусор', await flow.route('несуществующее|действие', user, P));

  console.log('13. Оба адвоката проходят путь целиком');
  for (const a of listAdvocates()) {
    const sv = await flow.route(`adv|${a.id}`, user, P);
    check(sv.buttons.length === a.services.length + 1, `${a.short}: не все услуги`);
    for (const svc of a.services) {
      const d = await flow.route(`svc|${a.id}|${svc.id}`, user, P);
      check(d.buttons.length > 1, `${a.short}/${svc.title}: нет дней`);
    }
  }

  await query("DELETE FROM bookings WHERE user_id IN ('777','888')");
  await closePool();
  console.log(fail === 0 ? '\n✓ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `\n✗ ПРОВАЛЕНО: ${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\n✗ Тест упал:', err.message);
  await closePool().catch(() => {});
  process.exit(1);
});
