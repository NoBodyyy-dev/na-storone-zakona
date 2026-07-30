import { Bot } from 'grammy';
import { env } from '../config/env';
import { logger } from '../logger/logger';
import { BotContext } from './context';
import { sessionMiddleware } from './middlewares/session';
import { registerCommands } from './commands';
import { handleSiteButton } from './handlers/start.handler';
import { handleMyBookings } from './handlers/myBookings.handler';
import { handleBookingCallback } from './handlers/booking.callbacks';
import { handleAdminCallback } from './handlers/admin.handler';
import { startBooking, handleBookingText, isBookingTextStep, resetSession } from './conversations/booking.conversation';
import { mainMenuKeyboard } from './keyboards/keyboards';

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.botToken);

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
      if (await handleBookingCallback(ctx)) return;
      await ctx.answerCallbackQuery();
    } catch (err) {
      // Что бы ни случилось внутри обработчика — кнопка не должна вечно "крутиться".
      logger.error({ err }, 'Callback handling failed');
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
    logger.error({ err: err.error, ctxUpdate: err.ctx.update }, 'Unhandled bot error');
  });

  return bot;
}
