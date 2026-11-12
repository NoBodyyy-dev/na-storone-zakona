import { env } from './config/env';
import { logger } from './logger/logger';
import { createBot } from './bot/bot';
import { createServer } from './server';
import { checkDbConnection } from './database/db';

async function main(): Promise<void> {
  await checkDbConnection();
  logger.info('Database connection established');

  const bot = createBot();
  const useWebhook = Boolean(env.webhookUrl);

  const app = createServer(bot, useWebhook);
  app.listen(env.port, () => {
    logger.info(`HTTP server listening on port ${env.port}`);
  });

  if (useWebhook) {
    await bot.api.setWebhook(env.webhookUrl!, {
      secret_token: env.webhookSecret!,
      allowed_updates: ['message', 'callback_query'],
    });
    logger.info(`Webhook set to ${env.webhookUrl}`);
  } else {
    await bot.api.deleteWebhook().catch(() => undefined);
    void bot.start({
      allowed_updates: ['message', 'callback_query'],
      onStart: () => logger.info('Bot started in long-polling mode'),
    });
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    await bot.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error on startup');
  process.exit(1);
});
