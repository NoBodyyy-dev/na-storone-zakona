import path from 'path';
import express, { Express } from 'express';
import { webhookCallback, Bot } from 'grammy';
import { BotContext } from './bot/context';
import { checkDbConnection } from './database/db';
import { env } from './config/env';
import { logger } from './logger/logger';
import { createWebAppApi } from './webapp/api';

/**
 * Mini App открывается внутри Telegram: на телефоне — во встроенном браузере,
 * в веб-версии — во фрейме web.telegram.org. Поэтому фрейм разрешён только
 * Telegram, а скрипт — только свой и telegram-web-app.js.
 */
const WEBAPP_CSP = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  'frame-ancestors https://web.telegram.org https://*.telegram.org',
].join('; ');

export function createServer(bot: Bot<BotContext>, useWebhook: boolean): Express {
  const app = express();
  app.disable('x-powered-by');
  // Апдейт Telegram и заявка из формы — это несколько килобайт; всё, что крупнее, нам не нужно.
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

  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', createWebAppApi(bot.api));

  app.use(
    '/app',
    (_req, res, next) => {
      res.set({
        'Content-Security-Policy': WEBAPP_CSP,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      });
      next();
    },
    // max-age=0 + ETag: браузер каждый раз сверяется с сервером (обычно 304),
    // чтобы после обновления формы клиенты сразу получали новую версию.
    express.static(path.resolve(process.cwd(), 'webapp'), { maxAge: 0 }),
  );

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
