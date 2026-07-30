/**
 * Telegram-бот на grammY.
 *
 * Своей логики здесь нет — только перевод «экранов» из core/flow.js
 * в вызовы Telegram Bot API.
 */

import { Bot, InlineKeyboard } from 'grammy';
import { existsSync } from 'node:fs';
import { InputFile } from 'grammy';
import * as flow from '../core/flow.js';
import { EMBLEM_PATH } from '../core/assets.js';

const PLATFORM = 'telegram';

/** [[{label,data}]] -> InlineKeyboard */
function toKeyboard(rows) {
  const kb = new InlineKeyboard();
  rows.forEach((row, i) => {
    if (i > 0) kb.row();
    row.forEach((b) => kb.text(b.label, b.data));
  });
  return kb;
}

const userOf = (ctx) => ({
  id: ctx.from?.id,
  name: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || ctx.from?.username || 'без имени',
});

export function createTelegramBot(token) {
  const bot = new Bot(token);

  /** Отправляет экран новым сообщением (с эмблемой, если экран её просит). */
  async function send(ctx, screen) {
    const reply_markup = toKeyboard(screen.buttons);
    if (screen.image === 'emblem' && existsSync(EMBLEM_PATH)) {
      await ctx.replyWithPhoto(new InputFile(EMBLEM_PATH), {
        caption: screen.text,
        parse_mode: 'HTML',
        reply_markup,
      });
      return;
    }
    await ctx.reply(screen.text, { parse_mode: 'HTML', reply_markup });
  }

  /**
   * Перерисовывает текущее сообщение. Если оно с фотографией (приветствие),
   * отредактировать текст нельзя — отправляем новое.
   */
  async function render(ctx, screen) {
    const reply_markup = toKeyboard(screen.buttons);
    if (ctx.callbackQuery?.message?.photo) {
      await ctx.reply(screen.text, { parse_mode: 'HTML', reply_markup });
      return;
    }
    try {
      await ctx.editMessageText(screen.text, { parse_mode: 'HTML', reply_markup });
    } catch (err) {
      // «message is not modified» и просроченные сообщения — не повод падать
      if (!String(err.message).includes('message is not modified')) {
        await ctx.reply(screen.text, { parse_mode: 'HTML', reply_markup });
      }
    }
  }

  bot.command('start', (ctx) => send(ctx, flow.greeting()));
  bot.command('menu', (ctx) => send(ctx, flow.menu()));
  bot.command('zapis', (ctx) => send(ctx, flow.chooseAdvocate()));
  bot.command('my', async (ctx) => send(ctx, await flow.myBookings(PLATFORM, userOf(ctx))));
  bot.command('contacts', (ctx) => send(ctx, flow.info()));

  bot.on('callback_query:data', async (ctx) => {
    // Telegram ждёт ответа на callback ~10 секунд — снимаем «часики»
    // до похода в БД, иначе на медленном запросе кнопка подвиснет.
    await ctx.answerCallbackQuery();
    const screen = await flow.route(ctx.callbackQuery.data, userOf(ctx), PLATFORM);
    await render(ctx, screen);
  });

  // На любое текстовое сообщение — приветствие с клавиатурой.
  bot.on('message:text', (ctx) => send(ctx, flow.greeting()));

  bot.catch((err) => {
    console.error('[telegram] ошибка:', err.error?.message || err.message);
  });

  return {
    async start() {
      await bot.api.setMyCommands([
        { command: 'start', description: 'Начало работы' },
        { command: 'zapis', description: 'Записаться к адвокату' },
        { command: 'my', description: 'Мои записи' },
        { command: 'contacts', description: 'Контакты коллегии' },
      ]);
      const me = await bot.api.getMe();
      console.log(`[telegram] запущен как @${me.username}`);
      bot.start();
    },
    stop: () => bot.stop(),
  };
}
