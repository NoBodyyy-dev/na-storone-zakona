import { bookingRepository } from '../database/repositories/booking.repository';
import { Booking, BookingDraft } from '../types';

export class BookingService {
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
    return bookingRepository.create(userId, draft as Required<BookingDraft>);
  }

  async getForUser(userId: number): Promise<Booking[]> {
    return bookingRepository.findByUser(userId);
  }
}

export const bookingService = new BookingService();
