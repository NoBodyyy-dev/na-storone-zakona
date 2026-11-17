import pino from 'pino';
import { env } from '../config/env';

/**
 * Ошибки сети grammy содержат полный адрес запроса — api.telegram.org/bot<токен>/…
 * Токен даёт полный доступ к боту, поэтому вырезаем его из каждой строки лога.
 */
function redactBotToken(line: string): string {
  return line.split(env.botToken).join('<BOT_TOKEN>');
}

export const logger = pino({
  level: env.logLevel,
  hooks: { streamWrite: redactBotToken },
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
});
