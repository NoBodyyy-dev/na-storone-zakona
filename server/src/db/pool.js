/**
 * Пул соединений с PostgreSQL.
 *
 * Строка подключения — DATABASE_URL. Всё остальное (таймзона, размер пула)
 * настраивается здесь, чтобы не расползаться по коду.
 */

import pg from 'pg';

const { Pool } = pg;

// Слоты приёма — это моменты времени в часовом поясе коллегии (Краснодар).
// Отдаём и принимаем timestamptz, а форматируем всегда в TZ ниже.
export const CLINIC_TZ = process.env.CLINIC_TZ || 'Europe/Moscow';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] ошибка простаивающего соединения:', err.message);
});

export const query = (text, params) => pool.query(text, params);

/** Выполняет колбэк в транзакции, откатывая её при любой ошибке. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export const closePool = () => pool.end();
