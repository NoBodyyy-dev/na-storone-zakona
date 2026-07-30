/**
 * Точка входа. Поднимает обоих ботов в одном процессе.
 *
 * Порядок важен: сначала БД и справочник, потом боты — иначе первое же
 * нажатие кнопки придёт в пустой каталог.
 */

import 'dotenv/config';
import { createTelegramBot } from './adapters/telegram.js';
import { createMaxBot } from './adapters/max.js';
import { loadCatalog } from './core/catalog.js';
import { initMailer } from './core/mailer.js';
import { pool, closePool } from './db/pool.js';

const running = [];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не задан. Скопируйте .env.example в .env и заполните его.');
    process.exit(1);
  }

  // Проверяем связь с БД до запуска ботов: лучше упасть сразу с внятной
  // ошибкой, чем принимать записи и терять их.
  await pool.query('SELECT 1');
  console.log('[db] соединение установлено');

  await loadCatalog();
  initMailer();

  if (process.env.TELEGRAM_BOT_TOKEN) {
    const tg = createTelegramBot(process.env.TELEGRAM_BOT_TOKEN);
    running.push(tg);
    tg.start().catch((err) => console.error('[telegram] не удалось запустить:', err.message));
  } else {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN не задан — бот пропущен');
  }

  if (process.env.MAX_BOT_TOKEN) {
    const max = createMaxBot(process.env.MAX_BOT_TOKEN);
    running.push(max);
    max.start().catch((err) => console.error('[max] не удалось запустить:', err.message));
  } else {
    console.warn('[max] MAX_BOT_TOKEN не задан — бот пропущен');
  }

  if (running.length === 0) {
    console.error('Не задан ни один токен бота. Заполните .env');
    await closePool();
    process.exit(1);
  }
}

const shutdown = async () => {
  console.log('\nОстанавливаю ботов…');
  running.forEach((b) => {
    try { b.stop(); } catch { /* уже остановлен */ }
  });
  await closePool().catch(() => {});
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

main().catch(async (err) => {
  console.error('Не удалось запустить сервис:', err.message);
  await closePool().catch(() => {});
  process.exit(1);
});
