import express, { Express } from 'express';
import { webhookCallback, Bot } from 'grammy';
import { BotContext } from './bot/context';
import { checkDbConnection } from './database/db';
import { env } from './config/env';
import { logger } from './logger/logger';

export function createServer(bot: Bot<BotContext>, useWebhook: boolean): Express {
  const app = express();
  app.disable('x-powered-by');
  // Апдейт Telegram — это несколько килобайт; всё, что крупнее, нам не нужно.
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', async (_req, res) => {
    try {
      await checkDbConnection();
      res.json({ status: 'ok' });
    } catch (err) {
      logger.error({ err }, 'Health check failed');
      res.status(500).json({ status: 'error' });
    }
  });

  if (useWebhook) {
    // Telegram присылает секрет в заголовке X-Telegram-Bot-Api-Secret-Token;
    // запрос без него или с чужим значением grammy отклоняет с 401.
    app.post(
      '/webhook',
      webhookCallback(bot, 'express', { secretToken: env.webhookSecret ?? undefined }),
    );
  }

  return app;
}
