import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return value;
}

const webhookUrl = process.env.WEBHOOK_URL?.trim() || null;
const siteUrl = process.env.SITE_URL ?? 'https://ns-zakona.ru';

/**
 * Какой Telegram-аккаунт принадлежит какому адвокату: "1:123456789,2:987654321"
 * (id адвоката из таблицы lawyers : Telegram ID). По нему Mini App
 * показывает адвокату панель с его заявками.
 */
function parseLawyerTelegramIds(raw: string | undefined): Map<number, number> {
  const byTelegramId = new Map<number, number>();
  for (const pair of (raw ?? '').split(',')) {
    const [lawyerId, telegramId] = pair.split(':').map((part) => Number(part.trim()));
    if (Number.isInteger(lawyerId) && Number.isInteger(telegramId) && lawyerId > 0 && telegramId > 0) {
      byTelegramId.set(telegramId, lawyerId);
    }
  }
  return byTelegramId;
}

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
  siteUrl,
  /** Ссылка на политику обработки персональных данных — показывается в форме записи. */
  privacyUrl: process.env.PRIVACY_URL ?? `${siteUrl}/politika-konfidencialnosti`,
  /** Адрес Mini App с формой записи. Telegram открывает только HTTPS. */
  webappUrl: process.env.WEBAPP_URL?.trim() || `${siteUrl}/app/`,
  lawyerByTelegramId: parseLawyerTelegramIds(process.env.LAWYER_TELEGRAM_IDS),
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
