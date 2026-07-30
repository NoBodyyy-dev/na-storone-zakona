import express, { Express } from 'express';
import { webhookCallback, Bot } from 'grammy';
import { BotContext } from './bot/context';
import { checkDbConnection } from './database/db';
import { logger } from './logger/logger';

export function createServer(bot: Bot<BotContext>, useWebhook: boolean): Express {
  const app = express();
  app.use(express.json());

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
    app.post('/webhook', webhookCallback(bot, 'express'));
  }

  return app;
}
