import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return value;
}

export const env = {
  botToken: required('BOT_TOKEN'),
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 3000),
  adminIds: (process.env.ADMIN_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map(Number),
  siteUrl: process.env.SITE_URL ?? 'https://ns-zakona.ru',
  emblemPath: process.env.EMBLEM_PATH ?? 'assets/emblem.png',
  timezone: process.env.TZ_NAME ?? 'Europe/Moscow',
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
