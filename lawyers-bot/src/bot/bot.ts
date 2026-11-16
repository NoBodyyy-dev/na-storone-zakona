import { Bot } from 'grammy';
import { limit } from '@grammyjs/ratelimiter';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { env } from '../config/env';
import { logger } from '../logger/logger';
import { BotContext } from './context';
import { registerCommands } from './commands';
import {
  handleAbout,
  handleBook,
  handleContacts,
  handleMine,
  handlePanel,
  handleSiteButton,
  hasPanel,
} from './handlers/start.handler';
import { handleAdminCallback } from './handlers/admin.handler';
import { MENU, mainMenuKeyboard } from './keyboards/keyboards';

// Из российского дата-центра api.telegram.org может быть недоступен напрямую,
// поэтому запросы к Telegram можно пустить через прокси (TELEGRAM_PROXY_URL).
function telegramProxyAgent(): HttpsProxyAgent<string> | SocksProxyAgent | undefined {
  const url = env.telegramProxyUrl;
  if (!url) return undefined;
  return url.startsWith('socks') ? new SocksProxyAgent(url) : new HttpsProxyAgent(url);
}

export function createBot(): Bot<BotContext> {
  const agent = telegramProxyAgent();
  if (agent) logger.info('Telegram API requests go through proxy');
  const bot = new Bot<BotContext>(env.botToken, {
    client: agent ? { baseFetchConfig: { agent, compress: true } } : undefined,
  });

  // Флуд от одного аккаунта: больше 3 апдейтов в 2 секунды молча отбрасываем,
  // не доходя ни до сессии, ни до базы.
  bot.use(
    limit({
      timeFrame: 2000,
      limit: 3,
      onLimitExceeded: async (ctx) => {
        if (ctx.callbackQuery) {
          await ctx.answerCallbackQuery({ text: 'Слишком быстро. Подождите секунду.' }).catch(() => undefined);
        }
      },
    }),
  );

  registerCommands(bot);

  // Старые подписи оставлены: у части клиентов в чате висит прежняя клавиатура.
  bot.hears([MENU.book, '📝 Записаться'], handleBook);
  bot.hears(MENU.mine, handleMine);
  bot.hears(MENU.about, handleAbout);
  bot.hears(MENU.contacts, handleContacts);
  bot.hears(MENU.site, handleSiteButton);
  bot.hears(MENU.panel, handlePanel);
  bot.hears('🏠 Главное меню', async (ctx) => {
    await ctx.reply('Главное меню:', { reply_markup: mainMenuKeyboard(hasPanel(ctx.from?.id)) });
  });

  bot.on('callback_query:data', async (ctx) => {
    try {
      if (await handleAdminCallback(ctx)) return;
      // Кнопки старого пошагового диалога записи больше ничего не делают.
      await ctx.answerCallbackQuery({ text: 'Запись теперь в форме — нажмите «📝 Записаться на консультацию».' });
    } catch (err) {
      // Что бы ни случилось внутри обработчика — кнопка не должна вечно "крутиться".
      logger.error({ err, updateId: ctx.update.update_id }, 'Callback handling failed');
      await ctx.answerCallbackQuery({ text: 'Произошла ошибка, попробуйте ещё раз', show_alert: true }).catch(() => undefined);
    }
  });

  bot.on('message:text', async (ctx) => {
    await ctx.reply('Пожалуйста, воспользуйтесь кнопками меню ниже.', {
      reply_markup: mainMenuKeyboard(hasPanel(ctx.from?.id)),
    });
  });

  bot.catch((err) => {
    // В лог — только идентификаторы, без текста сообщений: там ФИО и телефоны клиентов.
    logger.error(
      { err: err.error, updateId: err.ctx.update.update_id, chatId: err.ctx.chat?.id },
      'Unhandled bot error',
    );
  });

  return bot;
}
