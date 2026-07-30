/**
 * MAX-бот на официальной библиотеке @maxhub/max-bot-api.
 *
 * Своей логики здесь нет — только перевод «экранов» из core/flow.js
 * в вызовы MAX Bot API. Набор экранов и кнопок тот же, что в Telegram.
 */

import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { existsSync } from 'node:fs';
import * as flow from '../core/flow.js';
import { EMBLEM_PATH } from '../core/assets.js';

const PLATFORM = 'max';

/** [[{label,data}]] -> attachment с inline-клавиатурой */
const toKeyboard = (rows) =>
  Keyboard.inlineKeyboard(rows.map((row) => row.map((b) => Keyboard.button.callback(b.label, b.data))));

const userOf = (ctx) => ({
  id: ctx.user?.user_id,
  name: ctx.user?.name || ctx.user?.username || 'без имени',
});

export function createMaxBot(token) {
  const bot = new Bot(token);

  // Эмблема загружается один раз при первом обращении и переиспользуется:
  // повторно грузить один и тот же файл на каждое /start незачем.
  let emblem = null;
  async function getEmblem(api) {
    if (emblem) return emblem;
    if (!existsSync(EMBLEM_PATH)) return null;
    try {
      const uploaded = await api.uploadImage({ source: EMBLEM_PATH });
      emblem = uploaded.toJson();
      return emblem;
    } catch (err) {
      console.error('[max] не удалось загрузить эмблему:', err.message);
      return null;
    }
  }

  /** Отправляет экран новым сообщением. */
  async function send(ctx, screen) {
    const attachments = [toKeyboard(screen.buttons)];
    if (screen.image === 'emblem') {
      const img = await getEmblem(ctx.api);
      if (img) attachments.unshift(img);
    }
    await ctx.reply(screen.text, { format: 'html', attachments });
  }

  /** Перерисовывает сообщение, из которого нажали кнопку. */
  async function render(ctx, screen) {
    await ctx.answerOnCallback({
      message: { text: screen.text, format: 'html', attachments: [toKeyboard(screen.buttons)] },
    });
  }

  bot.on('bot_started', (ctx) => send(ctx, flow.greeting()));

  bot.command('start', (ctx) => send(ctx, flow.greeting()));
  bot.command('menu', (ctx) => send(ctx, flow.menu()));
  bot.command('zapis', (ctx) => send(ctx, flow.chooseAdvocate()));
  bot.command('my', async (ctx) => send(ctx, await flow.myBookings(PLATFORM, userOf(ctx))));
  bot.command('contacts', (ctx) => send(ctx, flow.info()));

  bot.on('message_callback', async (ctx) => {
    const screen = await flow.route(ctx.callback.payload, userOf(ctx), PLATFORM);
    await render(ctx, screen);
  });

  // На обычное текстовое сообщение — приветствие с клавиатурой.
  bot.on('message_created', async (ctx) => {
    const text = ctx.message?.body?.text || '';
    if (text.startsWith('/')) return; // команды уже обработаны выше
    await send(ctx, flow.greeting());
  });

  bot.catch((err) => {
    console.error('[max] ошибка:', err?.message || err);
  });

  return {
    async start() {
      const me = await bot.api.getMyInfo();
      await bot.api.setMyCommands([
        { name: 'start', description: 'Начало работы' },
        { name: 'zapis', description: 'Записаться к адвокату' },
        { name: 'my', description: 'Мои записи' },
        { name: 'contacts', description: 'Контакты коллегии' },
      ]);
      console.log(`[max] запущен как ${me.name} (@${me.username})`);
      await bot.start();
    },
    stop: () => bot.stop(),
  };
}
