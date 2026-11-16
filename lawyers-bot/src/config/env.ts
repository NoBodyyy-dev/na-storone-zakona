import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return value;
}

const webhookUrl = process.env.WEBHOOK_URL?.trim() || null;

// Вебхук без секрета принимал бы «апдейты» от кого угодно — в том числе
// от имени администраторов. Поэтому секрет обязателен, как только задан URL.
if (webhookUrl && !process.env.WEBHOOK_SECRET) {
  throw new Error('WEBHOOK_SECRET is required when WEBHOOK_URL is set');
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
  /** Ссылка на политику обработки персональных данных — показывается перед вводом ФИО. */
  privacyUrl: process.env.PRIVACY_URL ?? `${process.env.SITE_URL ?? 'https://ns-zakona.ru'}/politika-konfidencialnosti`,
  emblemPath: process.env.EMBLEM_PATH ?? 'assets/emblem.png',
  timezone: process.env.TZ_NAME ?? 'Europe/Moscow',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  webhookUrl,
  webhookSecret: process.env.WEBHOOK_SECRET ?? null,
  /** Прокси для запросов к api.telegram.org: socks5://host:port или http://host:port. */
  telegramProxyUrl: process.env.TELEGRAM_PROXY_URL?.trim() || null,
  /** Сколько будущих записей может держать один клиент одновременно. */
  maxActiveBookings: Math.max(1, Number(process.env.MAX_ACTIVE_BOOKINGS ?? 2) || 2),
};
