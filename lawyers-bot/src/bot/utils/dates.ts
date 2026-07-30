const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const WEEKDAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** Приём ведётся по будням с 09:00 до 18:00; последняя консультация начинается в 17:00. */
export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 18;
export const SLOT_MINUTES = 60;

/** Записаться можно на 10 дней вперёд — дальше расписание не планируется. */
export const BOOKING_WINDOW_DAYS = 10;

/** Записаться «прямо сейчас» нельзя — до консультации должно остаться минимум 2 часа. */
const LEAD_TIME_MINUTES = 120;

export function toDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateStr(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateHuman(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${day} ${MONTHS_RU[month - 1]} (${WEEKDAYS_RU[date.getUTCDay()]})`;
}

/** «26 июля, 14:30» — для отображения времени создания заявки. */
export function formatDateTimeHuman(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const time = `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
  return `${date.getDate()} ${MONTHS_RU[date.getMonth()]}, ${time}`;
}

/** «26 июля (пн), 14:00» — дата и время самой консультации. */
export function formatSlotHuman(dateStr: string, time: string): string {
  return `${formatDateHuman(dateStr)}, ${normalizeTime(time)}`;
}

/**
 * Дата и время записи для вывода в списках. У заявок, созданных до появления
 * выбора даты, слота нет — там дата согласовывалась по телефону.
 */
export function formatBookingSlot(booking: {
  booking_date: string | null;
  booking_time: string | null;
}): string {
  if (!booking.booking_date || !booking.booking_time) return 'по согласованию';
  return formatSlotHuman(booking.booking_date, booking.booking_time);
}

export function isWorkingDay(dateStr: string): boolean {
  const day = parseDateStr(dateStr).getDay();
  return day !== 0 && day !== 6;
}

/** Все слоты рабочего дня в формате HH:MM. */
export function allSlots(): string[] {
  const slots: string[] = [];
  for (let minutes = WORK_START_HOUR * 60; minutes < WORK_END_HOUR * 60; minutes += SLOT_MINUTES) {
    const hh = Math.floor(minutes / 60).toString().padStart(2, '0');
    const mm = (minutes % 60).toString().padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

function slotStart(dateStr: string, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const date = parseDateStr(dateStr);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** Время из Postgres приходит как «10:00:00» — приводим к HH:MM. */
export function normalizeTime(value: string): string {
  return value.slice(0, 5);
}

export function isValidSlotTime(value: string): boolean {
  return allSlots().includes(value);
}

/**
 * Свободные слоты дня: без уже занятых адвокатом и без тех, что начинаются
 * менее чем через 2 часа от текущего момента.
 */
export function freeSlots(dateStr: string, busy: string[], now: Date = new Date()): string[] {
  if (!isWorkingDay(dateStr)) return [];
  const busySet = new Set(busy.map(normalizeTime));
  const earliest = new Date(now.getTime() + LEAD_TIME_MINUTES * 60_000);
  return allSlots().filter(
    (time) => !busySet.has(time) && slotStart(dateStr, time).getTime() >= earliest.getTime(),
  );
}

/** Рабочие дни начиная с сегодняшнего — окно, внутри которого ищем свободные даты. */
export function workingDaysAhead(days: number, now: Date = new Date()): string[] {
  const result: string[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < days; i += 1) {
    const dateStr = toDateStr(cursor);
    if (isWorkingDay(dateStr)) result.push(dateStr);
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}
