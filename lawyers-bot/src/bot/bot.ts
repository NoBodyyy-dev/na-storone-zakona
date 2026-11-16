import { Bot } from 'grammy';
import { limit } from '@grammyjs/ratelimiter';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { env } from '../config/env';
import { logger } from '../logger/logger';
import { BotContext } from './context';
import { sessionMiddleware } from './middlewares/session';
import { registerCommands } from './commands';
import { handleSiteButton } from './handlers/start.handler';
import { handleCancelCallback, handleMyBookings } from './handlers/myBookings.handler';
import { handleBookingCallback } from './handlers/booking.callbacks';
import { handleAdminCallback } from './handlers/admin.handler';
import { startBooking, handleBookingText, isBookingTextStep, resetSession } from './conversations/booking.conversation';
import { mainMenuKeyboard } from './keyboards/keyboards';

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

  bot.use(sessionMiddleware());

  registerCommands(bot);

  // Старый вариант надписи оставлен: у части клиентов в чате висит прежняя клавиатура.
  bot.hears(['📝 Записаться на консультацию', '📝 Записаться'], startBooking);
  bot.hears('📋 Мои записи', handleMyBookings);
  bot.hears('🌐 Официальный сайт', handleSiteButton);

  bot.hears('🏠 Главное меню', async (ctx) => {
    resetSession(ctx);
    await ctx.reply('Главное меню:', { reply_markup: mainMenuKeyboard() });
  });

  bot.on('callback_query:data', async (ctx) => {
    try {
      if (await handleAdminCallback(ctx)) return;
      if (await handleCancelCallback(ctx)) return;
      if (await handleBookingCallback(ctx)) return;
      await ctx.answerCallbackQuery();
    } catch (err) {
      // Что бы ни случилось внутри обработчика — кнопка не должна вечно "крутиться".
      logger.error({ err, updateId: ctx.update.update_id }, 'Callback handling failed');
      await ctx.answerCallbackQuery({ text: 'Произошла ошибка, попробуйте ещё раз', show_alert: true }).catch(() => undefined);
    }
  });

  bot.on('message:text', async (ctx) => {
    if (isBookingTextStep(ctx.session.step)) {
      const handled = await handleBookingText(ctx);
      if (handled) return;
    }
    // Внутри записи не подменяем клавиатуру главным меню — это выбило бы
    // клиента из диалога; просто напоминаем, что шаг проходится кнопками.
    if (ctx.session.step !== 'idle') {
      await ctx.reply('На этом шаге выберите, пожалуйста, вариант кнопкой выше.');
      return;
    }
    await ctx.reply('Пожалуйста, воспользуйтесь кнопками меню ниже.', { reply_markup: mainMenuKeyboard() });
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
