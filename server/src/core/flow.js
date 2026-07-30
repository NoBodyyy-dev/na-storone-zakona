/**
 * Сценарий бота — платформо-независимый.
 *
 * Здесь нет ни grammy, ни max-bot-api: каждая функция возвращает «экран»
 *   { text, image?, buttons: [[{ label, data }]] }
 * а адаптер платформы уже рисует его своими средствами. Так функционал
 * Telegram- и MAX-ботов совпадает по построению, а не по дисциплине.
 *
 * Справочник адвокатов берётся из памяти (core/catalog.js, загружен из БД),
 * записи — всегда из PostgreSQL.
 *
 * Формат payload кнопки: части через '|', чтобы уложиться в лимит
 * Telegram в 64 байта. Например: ok|sv|k1|0724|1400
 */

import { listAdvocates, getAdvocate, getService } from './catalog.js';
import { COLLEGIUM } from '../data/collegium.js';
import * as repo from '../db/bookings.js';
import { notifyAdvocate } from './mailer.js';
import {
  dateKey, dateFromKey, formatDate, formatDateShort, formatTime, formatSlot,
  freeSlots, daysWithFreeSlots, takenIndex, slotAt,
} from './schedule.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------------- экраны ---------------- */

export function greeting() {
  return {
    image: 'emblem',
    text: [
      `<b>${esc(COLLEGIUM.name)}</b>`,
      '',
      'Здравствуйте. Вас приветствует официальный бот коллегии адвокатов «На стороне Закона».',
      '',
      'Мы ведём уголовные, арбитражные, семейные, гражданские и административные дела — честно, открыто и строго в рамках закона, от первой консультации до исполнения решения суда.',
      '',
      '<b>Через бот вы можете:</b>',
      '• записаться на приём к адвокату — выбрав специалиста, услугу, дату и время;',
      '• посмотреть стоимость услуг перед записью;',
      '• проверить и отменить свои записи;',
      '• получить контакты и адрес коллегии.',
      '',
      'Первичная консультация — оценка перспектив вашего дела — проводится бесплатно.',
      '',
      'Выберите действие на клавиатуре ниже.',
    ].join('\n'),
    buttons: [
      [{ label: '📅 Записаться к адвокату', data: 'book' }],
      [{ label: '📋 Мои записи', data: 'my' }],
      [{ label: '📞 Контакты коллегии', data: 'info' }],
    ],
  };
}

export function menu() {
  return {
    text: '<b>Главное меню</b>\n\nВыберите действие.',
    buttons: [
      [{ label: '📅 Записаться к адвокату', data: 'book' }],
      [{ label: '📋 Мои записи', data: 'my' }],
      [{ label: '📞 Контакты коллегии', data: 'info' }],
    ],
  };
}

export function chooseAdvocate() {
  const advocates = listAdvocates();
  return {
    text: [
      '<b>Шаг 1 из 4 — выбор адвоката</b>',
      '',
      ...advocates.map((a) =>
        `<b>${esc(a.name)}</b>\n${esc(a.role)} · в адвокатуре с ${a.since} г.\n${esc(a.spec)}\n`,
      ),
      'К кому вы хотите записаться?',
    ].join('\n'),
    buttons: [
      ...advocates.map((a) => [{ label: a.short, data: `adv|${a.id}` }]),
      [{ label: '‹ В меню', data: 'menu' }],
    ],
  };
}

export function chooseService(advocateId) {
  const adv = getAdvocate(advocateId);
  if (!adv) return notFound();

  return {
    text: [
      '<b>Шаг 2 из 4 — выбор услуги</b>',
      '',
      `Адвокат: <b>${esc(adv.name)}</b>`,
      '',
      'Стоимость указана ориентировочно: точную цену адвокат назовёт после консультации, она фиксируется договором.',
      '',
      'Выберите услугу:',
    ].join('\n'),
    buttons: [
      ...adv.services.map((s) => [{ label: `${s.title} — ${s.price}`, data: `svc|${adv.id}|${s.id}` }]),
      [{ label: '‹ Назад', data: 'book' }],
    ],
  };
}

export async function chooseDay(advocateId, serviceId) {
  const adv = getAdvocate(advocateId);
  const svc = getService(advocateId, serviceId);
  if (!adv || !svc) return notFound();

  const taken = takenIndex(await repo.takenSlots(advocateId));
  const days = daysWithFreeSlots(taken);

  if (days.length === 0) {
    return {
      text: [
        `<b>${esc(adv.name)}</b>`,
        '',
        'На ближайшие две недели свободных окон нет.',
        `Позвоните нам — подберём время вручную: ${esc(adv.phone)}`,
      ].join('\n'),
      buttons: [[{ label: '‹ Назад', data: `adv|${advocateId}` }], [{ label: 'В меню', data: 'menu' }]],
    };
  }

  const rows = [];
  for (let i = 0; i < days.length; i += 2) {
    rows.push(
      days.slice(i, i + 2).map((d) => ({
        label: formatDateShort(d),
        data: `day|${advocateId}|${serviceId}|${dateKey(d)}`,
      })),
    );
  }

  return {
    text: [
      '<b>Шаг 3 из 4 — выбор дня</b>',
      '',
      `Адвокат: <b>${esc(adv.name)}</b>`,
      `Услуга: <b>${esc(svc.title)}</b> — ${esc(svc.price)}`,
      '',
      'Приём: пн–пт 10:00–18:00, сб 10:00–14:00. Выберите день:',
    ].join('\n'),
    buttons: [...rows, [{ label: '‹ Назад', data: `adv|${advocateId}` }]],
  };
}

export async function chooseTime(advocateId, serviceId, dKey) {
  const adv = getAdvocate(advocateId);
  const svc = getService(advocateId, serviceId);
  const date = dateFromKey(dKey);
  if (!adv || !svc || !date) return notFound();

  const taken = takenIndex(await repo.takenSlots(advocateId));
  const slots = freeSlots(date, taken);

  if (slots.length === 0) {
    return {
      text: `На ${esc(formatDate(date))} свободного времени уже не осталось. Выберите другой день.`,
      buttons: [[{ label: '‹ К выбору дня', data: `svc|${advocateId}|${serviceId}` }]],
    };
  }

  const rows = [];
  for (let i = 0; i < slots.length; i += 3) {
    rows.push(
      slots.slice(i, i + 3).map((s) => ({
        label: formatTime(s.key),
        data: `time|${advocateId}|${serviceId}|${dKey}|${s.key}`,
      })),
    );
  }

  return {
    text: [
      '<b>Шаг 4 из 4 — выбор времени</b>',
      '',
      `Адвокат: <b>${esc(adv.name)}</b>`,
      `Услуга: <b>${esc(svc.title)}</b> — ${esc(svc.price)}`,
      `День: <b>${esc(formatDate(date))}</b>`,
      '',
      'Свободное время:',
    ].join('\n'),
    buttons: [...rows, [{ label: '‹ К выбору дня', data: `svc|${advocateId}|${serviceId}` }]],
  };
}

export function confirm(advocateId, serviceId, dKey, tKey) {
  const adv = getAdvocate(advocateId);
  const svc = getService(advocateId, serviceId);
  const at = slotAt(dKey, tKey);
  if (!adv || !svc || !at) return notFound();

  return {
    text: [
      '<b>Проверьте запись</b>',
      '',
      `Адвокат: <b>${esc(adv.name)}</b>`,
      `Услуга: <b>${esc(svc.title)}</b>`,
      `Стоимость: <b>${esc(svc.price)}</b>`,
      `Дата и время: <b>${esc(formatSlot(at))}</b>`,
      `Адрес: ${esc(COLLEGIUM.address)}`,
      '',
      'Всё верно?',
    ].join('\n'),
    buttons: [
      [{ label: '✓ Подтвердить запись', data: `ok|${advocateId}|${serviceId}|${dKey}|${tKey}` }],
      [{ label: '‹ Выбрать другое время', data: `day|${advocateId}|${serviceId}|${dKey}` }],
      [{ label: 'Отменить', data: 'menu' }],
    ],
  };
}

export async function commit(platform, user, advocateId, serviceId, dKey, tKey) {
  const adv = getAdvocate(advocateId);
  const svc = getService(advocateId, serviceId);
  const at = slotAt(dKey, tKey);
  if (!adv || !svc || !at) return notFound();

  const record = await repo.createBooking({
    platform,
    userId: user.id,
    userName: user.name,
    advocateId,
    serviceId,
    slotAt: at,
  });

  // null означает срабатывание уникального индекса: слот заняли
  // между показом клавиатуры и нажатием «Подтвердить».
  if (!record) {
    return {
      text: [
        '<b>Это время только что заняли</b>',
        '',
        'Пока вы подтверждали, слот забрали. Выберите, пожалуйста, другое время.',
      ].join('\n'),
      buttons: [
        [{ label: 'Выбрать другое время', data: `svc|${advocateId}|${serviceId}` }],
        [{ label: 'В меню', data: 'menu' }],
      ],
    };
  }

  // Письмо адвокату — не блокируем ответ клиенту и не роняем запись,
  // если почта недоступна.
  notifyAdvocate({
    bookingId: record.id,
    advocate: adv,
    service: svc,
    slotAt: at,
    client: user,
    platform,
  }).catch((err) => console.error('[mail] непредвиденная ошибка:', err.message));

  return {
    text: [
      '<b>Вы записаны</b>',
      '',
      `Адвокат: <b>${esc(adv.name)}</b>`,
      `Услуга: <b>${esc(svc.title)}</b> — ${esc(svc.price)}`,
      `Когда: <b>${esc(formatSlot(at))}</b>`,
      `Адрес: ${esc(COLLEGIUM.address)}`,
      '',
      `Телефон адвоката: ${esc(adv.phone)}`,
      '',
      'Адвокат уведомлён о вашей записи. Возьмите с собой документы по делу. Если планы изменятся — отмените запись в разделе «Мои записи» или предупредите нас по телефону.',
    ].join('\n'),
    buttons: [[{ label: '📋 Мои записи', data: 'my' }], [{ label: 'В меню', data: 'menu' }]],
  };
}

export async function myBookings(platform, user) {
  const list = await repo.listUserBookings(platform, user.id);

  if (list.length === 0) {
    return {
      text: '<b>Мои записи</b>\n\nУ вас пока нет активных записей.',
      buttons: [[{ label: '📅 Записаться к адвокату', data: 'book' }], [{ label: '‹ В меню', data: 'menu' }]],
    };
  }

  const lines = list.map((b, i) => [
    `<b>${i + 1}. ${esc(b.service_title)}</b>`,
    esc(b.advocate_name),
    esc(formatSlot(new Date(b.slot_at))),
  ].join('\n'));

  return {
    text: ['<b>Мои записи</b>', '', lines.join('\n\n')].join('\n'),
    buttons: [
      ...list.map((b, i) => [{ label: `✕ Отменить запись №${i + 1}`, data: `cancel|${b.id}` }]),
      [{ label: '‹ В меню', data: 'menu' }],
    ],
  };
}

export async function cancelBooking(platform, user, id) {
  const removed = await repo.cancelBooking(Number(id), platform, user.id);
  return {
    text: removed
      ? '<b>Запись отменена</b>\n\nЕсли передумаете — записывайтесь снова, время освободилось.'
      : '<b>Запись не найдена</b>\n\nВозможно, она уже отменена.',
    buttons: [[{ label: '📅 Записаться к адвокату', data: 'book' }], [{ label: '‹ В меню', data: 'menu' }]],
  };
}

export function info() {
  return {
    text: [
      `<b>${esc(COLLEGIUM.name)}</b>`,
      '',
      `Адрес: ${esc(COLLEGIUM.address)}`,
      `Телефон: ${esc(COLLEGIUM.phone)}`,
      `Сайт: ${esc(COLLEGIUM.site)}`,
      `ОГРН: ${esc(COLLEGIUM.ogrn)}`,
      '',
      '<b>Адвокаты коллегии</b>',
      ...listAdvocates().map((a) =>
        `\n<b>${esc(a.name)}</b>\n${esc(a.role)} · реестр АП КК ${esc(a.registry)}\n${esc(a.phone)} · ${esc(a.email)}`,
      ),
      '',
      'Приём: пн–пт 10:00–18:00, сб 10:00–14:00.',
    ].join('\n'),
    buttons: [[{ label: '📅 Записаться к адвокату', data: 'book' }], [{ label: '‹ В меню', data: 'menu' }]],
  };
}

function notFound() {
  return {
    text: 'Не удалось восстановить выбор — вероятно, бот перезапускался. Начнём заново.',
    buttons: [[{ label: '📅 Записаться к адвокату', data: 'book' }], [{ label: 'В меню', data: 'menu' }]],
  };
}

/* ---------------- маршрутизатор ---------------- */

/**
 * Единая точка входа для нажатия любой кнопки.
 * @param {string} payload
 * @param {{id: string|number, name: string}} user
 * @param {'telegram'|'max'} platform
 * @returns {Promise<{text: string, image?: string, buttons: Array}>}
 */
export async function route(payload, user, platform) {
  const [action, ...args] = String(payload).split('|');

  switch (action) {
    case 'menu':   return menu();
    case 'book':   return chooseAdvocate();
    case 'adv':    return chooseService(args[0]);
    case 'svc':    return chooseDay(args[0], args[1]);
    case 'day':    return chooseTime(args[0], args[1], args[2]);
    case 'time':   return confirm(args[0], args[1], args[2], args[3]);
    case 'ok':     return commit(platform, user, args[0], args[1], args[2], args[3]);
    case 'my':     return myBookings(platform, user);
    case 'cancel': return cancelBooking(platform, user, args[0]);
    case 'info':   return info();
    default:       return menu();
  }
}
