/**
 * Cloudflare Worker: пересылает запросы бота к api.telegram.org.
 * Нужен, потому что из российского дата-центра Telegram напрямую недоступен.
 *
 * Пропускает только запросы нашего бота: путь /bot<ID бота>:…/ или /file/bot<ID бота>:…/.
 * ID бота (число до двоеточия в токене) задаётся переменной BOT_ID в wrangler.toml —
 * без неё воркер был бы открытым прокси для любых ботов.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = new RegExp(`^/(file/)?bot${env.BOT_ID}:[A-Za-z0-9_-]+/`);
    if (!env.BOT_ID || !allowed.test(url.pathname)) {
      return new Response('Not found', { status: 404 });
    }

    const upstream = new URL(url.pathname + url.search, 'https://api.telegram.org');
    return fetch(upstream, {
      method: request.method,
      headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' },
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    });
  },
};
