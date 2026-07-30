import { InlineKeyboard, Keyboard } from 'grammy';
import {
  BOOKABLE_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_SHORT,
  isBookableCategory,
  Lawyer,
  Service,
} from '../../types';
import { formatDateHuman } from '../utils/dates';

export const BACK_BUTTON_DATA = 'nav:back';
export const CANCEL_BUTTON_DATA = 'nav:cancel';
export const CONFIRM_BUTTON_DATA = 'nav:confirm';

export function mainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text('📝 Записаться на консультацию')
    .row()
    .text('📋 Мои записи')
    .text('🌐 Официальный сайт')
    .resized();
}

export function withNavRow(kb: InlineKeyboard, includeBack = true): InlineKeyboard {
  if (includeBack) {
    kb.row().text('⬅️ Назад', BACK_BUTTON_DATA);
  }
  return kb;
}

/** Вид дела — четыре раздела официального прайс-листа коллегии. */
export function categoryKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const category of BOOKABLE_CATEGORIES) {
    kb.text(CATEGORY_LABELS[category], `case:${category}`).row();
  }
  return withNavRow(kb);
}

/** Выбор адвоката — показывается, только если его нет в ссылке с сайта. */
export function lawyerKeyboard(lawyers: Lawyer[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const lawyer of lawyers) {
    kb.text(lawyer.full_name, `lawyer:${lawyer.id}`).row();
  }
  return withNavRow(kb);
}

/**
 * Плоский каталог консультаций. Полные названия услуг в кнопку не помещаются,
 * поэтому на кнопке — вид дела, тип консультации и цена, а расшифровка
 * остаётся в тексте сообщения.
 */
export function serviceLabel(service: Service, withArea = true): string {
  const area = isBookableCategory(service.category) ? CATEGORY_SHORT[service.category] : service.category;
  const kind = /изучением документов/i.test(service.title) ? 'с документами' : 'устная';
  return withArea ? `${area} · ${kind} — ${service.price_label}` : `${kind} — ${service.price_label}`;
}

/**
 * Вид дела в подписи кнопки нужен только тогда, когда клиент его не выбирал:
 * при записи по ссылке с сайта каталог собран из всех дел этого адвоката.
 */
export function serviceKeyboard(services: Service[], withArea = true): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const service of services) {
    kb.text(serviceLabel(service, withArea), `service:${service.id}`).row();
  }
  return withNavRow(kb);
}

/** Итоговая заявка: подтвердить запись или вернуться к выбору времени. */
export function confirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Записаться', CONFIRM_BUTTON_DATA)
    .row()
    .text('⬅️ Назад', BACK_BUTTON_DATA);
}

/** Даты — по две в ряд, чтобы список из шести дней помещался на экран. */
export function dateKeyboard(dates: string[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  dates.forEach((date, index) => {
    kb.text(formatDateHuman(date), `date:${date}`);
    if (index % 2 === 1) kb.row();
  });
  if (dates.length % 2 === 1) kb.row();
  return withNavRow(kb);
}

/** Свободное время — по три слота в ряд. */
export function timeKeyboard(times: string[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  times.forEach((time, index) => {
    kb.text(time, `time:${time}`);
    if (index % 3 === 2) kb.row();
  });
  if (times.length % 3 !== 0) kb.row();
  return withNavRow(kb);
}

export function backOnlyKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('⬅️ Назад', BACK_BUTTON_DATA);
}

export function lawyerInfoLine(lawyer: Lawyer): string {
  return `👨‍⚖️ Ваш адвокат: <b>${lawyer.full_name}</b>\n${lawyer.role}, ${lawyer.specialization}`;
}
