import crypto from 'crypto';

export interface WebAppUser {
  id: number;
  username: string | null;
  firstName: string;
}

/** initData старше суток не принимаем: ссылку на открытое приложение могли переслать. */
const MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Проверяет подпись initData, которую Telegram передаёт в Mini App.
 * Ключ — HMAC-SHA256 токена бота с ключом "WebAppData"; подделать данные
 * без токена нельзя, поэтому только по ним мы и узнаём пользователя.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(
  raw: string,
  botToken: string,
  now: Date = new Date(),
): WebAppUser | null {
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || now.getTime() / 1000 - authDate > MAX_AGE_SECONDS) return null;

  try {
    const user = JSON.parse(params.get('user') ?? '');
    if (typeof user?.id !== 'number') return null;
    return { id: user.id, username: user.username ?? null, firstName: user.first_name ?? '' };
  } catch {
    return null;
  }
}
