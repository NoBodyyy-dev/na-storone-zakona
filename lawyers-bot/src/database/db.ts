import { Pool, PoolClient, types } from 'pg';
import { env } from '../config/env';
import { logger } from '../logger/logger';

// Возвращаем DATE и TIME как строки (YYYY-MM-DD / HH:MM:SS) без конвертации
// в JS Date, чтобы избежать сдвигов часового пояса при сравнении слотов.
types.setTypeParser(types.builtins.DATE, (value: string) => value);
types.setTypeParser(types.builtins.TIME, (value: string) => value);

export const pool = new Pool({ connectionString: env.databaseUrl });

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
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

export async function checkDbConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}
