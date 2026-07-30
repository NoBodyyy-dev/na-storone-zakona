import { InlineKeyboard } from 'grammy';
import { Keyboard } from '@maxhub/max-bot-api';
import * as flow from '../src/core/flow.js';
import { loadCatalog, listAdvocates } from '../src/core/catalog.js';
import { closePool } from '../src/db/pool.js';
import 'dotenv/config';
import { createTelegramBot } from '../src/adapters/telegram.js';
import { createMaxBot } from '../src/adapters/max.js';


let fail = 0;
const check = (c, m) => { if (!c) { console.log('  ✗ ' + m); fail++; } };
const user = { id: 1, name: 'Т' };

await loadCatalog();

console.log('1. Адаптеры конструируются на реальных библиотеках');
check(!!createTelegramBot('123:FAKE'), 'telegram-адаптер не создался');
check(!!createMaxBot('FAKE'), 'max-адаптер не создался');

console.log('2. Каждый экран переводится в клавиатуру обеих платформ');
const screens = await Promise.all([
  ['greeting', flow.greeting()],
  ['menu', await flow.route('menu', user, 'telegram')],
  ['book', await flow.route('book', user, 'telegram')],
  ['info', await flow.route('info', user, 'telegram')],
  ...listAdvocates().flatMap((a) => [
    flow.route(`adv|${a.id}`, user, 'telegram').then((s) => [`adv:${a.id}`, s]),
    flow.route(`svc|${a.id}|${a.services[0].id}`, user, 'telegram').then((s) => [`svc:${a.id}`, s]),
  ]),
]);

for (const [name, s] of screens) {
  // Telegram
  const kb = new InlineKeyboard();
  s.buttons.forEach((row, i) => { if (i > 0) kb.row(); row.forEach((b) => kb.text(b.label, b.data)); });
  check(kb.inline_keyboard.length === s.buttons.length, `${name}: TG рядов ${kb.inline_keyboard.length} вместо ${s.buttons.length}`);

  // MAX
  const mk = Keyboard.inlineKeyboard(s.buttons.map((r) => r.map((b) => Keyboard.button.callback(b.label, b.data))));
  check(mk.type === 'inline_keyboard', `${name}: MAX неверный тип attachment`);
  check(mk.payload.buttons.length === s.buttons.length, `${name}: MAX рядов не совпадает`);

  // Лимиты MAX: 30 рядов, 7 кнопок в ряду, 210 всего
  check(s.buttons.length <= 30, `${name}: рядов ${s.buttons.length} > 30 (лимит MAX)`);
  s.buttons.forEach((r, i) => check(r.length <= 7, `${name}: ряд ${i} содержит ${r.length} кнопок > 7`));
  check(s.buttons.flat().length <= 210, `${name}: кнопок больше 210`);
}

console.log('3. Экран выбора дня и времени — в пределах лимитов');
const day = await flow.route(`svc|sv|k1`, user, 'telegram');
check(day.buttons.length <= 30, `дней: рядов ${day.buttons.length} > 30`);
const timeScreen = await flow.route(day.buttons[0][0].data, user, 'telegram');
timeScreen.buttons.forEach((r, i) => check(r.length <= 7, `время: ряд ${i} = ${r.length} кнопок`));

console.log('4. HTML в текстах закрыт корректно');
for (const [name, s] of screens) {
  const open = (s.text.match(/<b>/g) || []).length;
  const close = (s.text.match(/<\/b>/g) || []).length;
  check(open === close, `${name}: несбалансированные <b> (${open}/${close})`);
}

console.log(fail === 0 ? '\n✓ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `\n✗ ПРОВАЛЕНО: ${fail}`);
await closePool();
process.exit(fail ? 1 : 0);
