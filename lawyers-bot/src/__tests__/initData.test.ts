import crypto from 'crypto';
import { validateInitData } from '../webapp/initData';

const TOKEN = '123456:TEST-token';
const NOW = new Date('2026-11-16T12:00:00Z');

/** Подписывает initData так же, как это делает Telegram. */
function sign(fields: Record<string, string>, token = TOKEN): string {
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const user = JSON.stringify({ id: 42, first_name: 'Иван', username: 'ivan' });
const authDate = String(Math.floor(NOW.getTime() / 1000) - 60);

describe('validateInitData', () => {
  it('принимает данные, подписанные токеном бота', () => {
    const raw = sign({ auth_date: authDate, query_id: 'AAH', user });
    expect(validateInitData(raw, TOKEN, NOW)).toEqual({ id: 42, username: 'ivan', firstName: 'Иван' });
  });

  it('отклоняет данные, подписанные другим токеном', () => {
    const raw = sign({ auth_date: authDate, user }, '999:other');
    expect(validateInitData(raw, TOKEN, NOW)).toBeNull();
  });

  it('отклоняет подменённого пользователя', () => {
    const raw = sign({ auth_date: authDate, user }).replace('42', '43');
    expect(validateInitData(raw, TOKEN, NOW)).toBeNull();
  });

  it('отклоняет данные старше суток', () => {
    const old = String(Math.floor(NOW.getTime() / 1000) - 25 * 60 * 60);
    expect(validateInitData(sign({ auth_date: old, user }), TOKEN, NOW)).toBeNull();
  });

  it('отклоняет пустую строку и мусор', () => {
    expect(validateInitData('', TOKEN, NOW)).toBeNull();
    expect(validateInitData('hash=zz&user=1', TOKEN, NOW)).toBeNull();
  });
});
