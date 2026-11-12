import { bookingRepository } from '../database/repositories/booking.repository';
import { lawyerRepository } from '../database/repositories/lawyer.repository';
import { serviceRepository } from '../database/repositories/service.repository';
import { scheduleService } from './schedule.service';
import { env } from '../config/env';
import { Booking, BookingDraft } from '../types';

/** Клиент достиг лимита одновременных записей. */
export class BookingLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Booking limit of ${limit} reached`);
    this.name = 'BookingLimitError';
  }
}

/** Дата или время вне расписания: подделанная кнопка или устаревший экран. */
export class SlotUnavailableError extends Error {
  constructor() {
    super('Slot is outside the schedule');
    this.name = 'SlotUnavailableError';
  }
}

export class BookingService {
  /**
   * Создаёт запись. Все данные из черновика перепроверяются здесь, а не
   * только в обработчиках кнопок: callback-данные Telegram клиент может
   * подделать, а экран со списком времени — устареть.
   */
  async confirmBooking(userId: number, draft: BookingDraft): Promise<Booking> {
    if (
      !draft.fullName ||
      !draft.phone ||
      !draft.category ||
      !draft.lawyerId ||
      !draft.serviceId ||
      !draft.date ||
      !draft.time
    ) {
      throw new Error('Booking draft is incomplete');
    }

    const [lawyer, service] = await Promise.all([
      lawyerRepository.findById(draft.lawyerId),
      serviceRepository.findById(draft.serviceId),
    ]);
    if (!lawyer || !lawyer.is_active || !service || !service.is_active) {
      throw new SlotUnavailableError();
    }

    const times = await scheduleService.availableTimes(draft.lawyerId, draft.date);
    if (!times.includes(draft.time)) {
      throw new SlotUnavailableError();
    }

    if ((await bookingRepository.countActiveByUser(userId)) >= env.maxActiveBookings) {
      throw new BookingLimitError(env.maxActiveBookings);
    }

    return bookingRepository.create(userId, draft as Required<BookingDraft>);
  }

  async canBookMore(userId: number): Promise<boolean> {
    return (await bookingRepository.countActiveByUser(userId)) < env.maxActiveBookings;
  }

  async getForUser(userId: number): Promise<Booking[]> {
    return bookingRepository.findByUser(userId);
  }

  async cancelForUser(bookingId: number, userId: number): Promise<Booking | null> {
    return bookingRepository.cancelByUser(bookingId, userId);
  }

  async cancelByAdmin(bookingId: number): Promise<Booking | null> {
    return bookingRepository.cancelById(bookingId);
  }
}

export const bookingService = new BookingService();
