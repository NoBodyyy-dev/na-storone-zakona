/**
 * Расписание приёма. Платформо-независимо.
 *
 * График коллегии: пн–пт 10:00–18:00, сб 10:00–14:00, вс — выходной.
 * Слоты часовые, последний начинается за час до закрытия.
 *
 * Время трактуется в часовом поясе процесса — запускайте сервер с
 * TZ=Europe/Moscow (см. .env.example), тогда слот, записанный в БД как
 * timestamptz, совпадёт с местным временем коллегии.
 */

const WEEKDAY_HOURS = [10, 11, 12, 13, 14, 15, 16, 17];
const SATURDAY_HOURS = [10, 11, 12, 13];

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** Сколько дней вперёд открыта запись. */
export const HORIZON_DAYS = 14;

/** Запись не раньше чем через столько часов от текущего момента. */
const MIN_LEAD_HOURS = 2;

const hoursFor = (date) => {
  const d = date.getDay();
  if (d === 0) return [];
  if (d === 6) return SATURDAY_HOURS;
  return WEEKDAY_HOURS;
};

/** '0724' — компактный ключ даты для payload кнопки. */
export const dateKey = (date) =>
  String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');

/** '1400' — компактный ключ времени. */
export const timeKey = (hour) => String(hour).padStart(2, '0') + '00';

export const formatTime = (key) => `${key.slice(0, 2)}:${key.slice(2)}`;

/** Восстанавливает Date из ключа '0724' в пределах горизонта записи. */
export const dateFromKey = (key) => upcomingDays().find((d) => dateKey(d) === key) || null;

/** Момент приёма как Date — то, что уходит в БД в slot_at. */
export function slotAt(dKey, tKey) {
  const date = dateFromKey(dKey);
  if (!date) return null;
  const hour = Number(tKey.slice(0, 2));
  const minute = Number(tKey.slice(2));
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}

export const formatDate = (date) =>
  `${date.getDate()} ${MONTHS[date.getMonth()]}, ${WEEKDAYS[date.getDay()]}`;

export const formatDateShort = (date) =>
  `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')} ${WEEKDAYS[date.getDay()]}`;

/** Полное «24 июля, чт, 14:00» — для писем и подтверждений. */
export const formatSlot = (date) =>
  `${formatDate(date)}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Рабочие дни на горизонте записи, начиная с сегодня. */
export function upcomingDays() {
  const days = [];
  const now = new Date();
  for (let i = 0; i < HORIZON_DAYS; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (hoursFor(d).length > 0) days.push(d);
  }
  return days;
}

/** Приводит занятые слоты (Date из БД) к множеству ключей 'ММДД-ЧЧММ'. */
export const takenIndex = (slots) =>
  new Set(slots.map((s) => {
    const d = new Date(s);
    return `${dateKey(d)}-${timeKey(d.getHours())}`;
  }));

/**
 * Свободные слоты на дату.
 * @param {Date} date
 * @param {Set<string>} taken — результат takenIndex()
 */
export function freeSlots(date, taken = new Set()) {
  const cutoff = new Date(Date.now() + MIN_LEAD_HOURS * 3600_000);
  return hoursFor(date)
    .map((h) => ({ hour: h, key: timeKey(h) }))
    .filter(({ hour, key }) => {
      const slot = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour);
      if (slot < cutoff) return false;
      return !taken.has(`${dateKey(date)}-${key}`);
    });
}

/** Дни, где остался хотя бы один свободный слот. */
export const daysWithFreeSlots = (taken = new Set()) =>
  upcomingDays().filter((d) => freeSlots(d, taken).length > 0);
