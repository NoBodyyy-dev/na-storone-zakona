import { bookingRepository } from '../database/repositories/booking.repository';
import { scheduleRepository } from '../database/repositories/schedule.repository';
import { BOOKING_WINDOW_DAYS, freeSlots, workingDaysAhead } from '../bot/utils/dates';

/**
 * Клиент выбирает дату внутри окна записи (10 дней), поэтому показываем все
 * рабочие дни этого окна, в которых остался хотя бы один свободный слот.
 */
const SEARCH_WINDOW_DAYS = BOOKING_WINDOW_DAYS;
const DATES_SHOWN = BOOKING_WINDOW_DAYS;

export class ScheduleService {
  /**
   * Ближайшие даты, в которые у адвоката есть хотя бы один свободный слот.
   * Выходные, нерабочие дни адвоката и уже занятое время исключаются.
   */
  async availableDates(lawyerId: number, now: Date = new Date()): Promise<string[]> {
    const candidates = workingDaysAhead(SEARCH_WINDOW_DAYS, now);
    if (candidates.length === 0) return [];

    const from = candidates[0];
    const to = candidates[candidates.length - 1];

    const [busy, exceptions] = await Promise.all([
      bookingRepository.findBusyInRange(lawyerId, from, to),
      scheduleRepository.findExceptionDates(lawyerId, from, to),
    ]);

    const busyByDate = new Map<string, string[]>();
    for (const row of busy) {
      const list = busyByDate.get(row.date) ?? [];
      list.push(row.time);
      busyByDate.set(row.date, list);
    }
    const closed = new Set(exceptions);

    const result: string[] = [];
    for (const date of candidates) {
      if (closed.has(date)) continue;
      if (freeSlots(date, busyByDate.get(date) ?? [], now).length === 0) continue;
      result.push(date);
      if (result.length === DATES_SHOWN) break;
    }
    return result;
  }

  /** Свободное время адвоката на выбранную дату. */
  async availableTimes(lawyerId: number, date: string, now: Date = new Date()): Promise<string[]> {
    const closed = await scheduleRepository.findExceptionDates(lawyerId, date, date);
    if (closed.length > 0) return [];
    const busy = await bookingRepository.findBusyTimes(lawyerId, date);
    return freeSlots(date, busy, now);
  }
}

export const scheduleService = new ScheduleService();
