import { InlineKeyboard, Keyboard } from 'grammy';
import { env } from '../../config/env';

export const MENU = {
  book: '📝 Записаться на консультацию',
  mine: '📋 Мои записи',
  about: 'ℹ️ О коллегии',
  contacts: '📍 Контакты',
  site: '🌐 Официальный сайт',
  panel: '🗂 Заявки клиентов',
} as const;

/**
 * Главное меню — справочное. Сама запись идёт в Mini App: кнопки reply-клавиатуры
 * открывают приложение без initData, поэтому форма открывается inline-кнопкой.
 */
export function mainMenuKeyboard(withPanel = false): Keyboard {
  const kb = new Keyboard().text(MENU.book).row().text(MENU.mine).text(MENU.about).row().text(MENU.contacts).text(MENU.site);
  if (withPanel) kb.row().text(MENU.panel);
  return kb.resized();
}

/**
 * Ссылка на экран Mini App: `?tab=mine`, `?tab=panel` или `?lawyer=1`.
 * Якорь (#) не используем — в нём Telegram передаёт приложению initData.
 */
export function webAppUrl(suffix = ''): string {
  return `${env.webappUrl}${suffix}`;
}

export function openAppKeyboard(text: string, suffix = ''): InlineKeyboard {
  return new InlineKeyboard().webApp(text, webAppUrl(suffix));
}
