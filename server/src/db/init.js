/**
 * Применение схемы: npm run db:init
 * Идемпотентно — все CREATE ... IF NOT EXISTS.
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, closePool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не задан — заполните .env');
    process.exit(1);
  }
  const sql = readFileSync(resolve(__dirname, 'schema.sql'), 'utf8');
  await query(sql);
  console.log('[db] схема применена');
  await closePool();
}

main().catch((err) => {
  console.error('[db] не удалось применить схему:', err.message);
  process.exit(1);
});
