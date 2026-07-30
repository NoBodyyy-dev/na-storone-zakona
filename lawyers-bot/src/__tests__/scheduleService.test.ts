jest.mock('../database/repositories/booking.repository', () => ({
  bookingRepository: {
    findBusyInRange: jest.fn(),
    findBusyTimes: jest.fn(),
  },
}));

jest.mock('../database/repositories/schedule.repository', () => ({
  scheduleRepository: {
    findExceptionDates: jest.fn(),
  },
}));

import { bookingRepository } from '../database/repositories/booking.repository';
import { scheduleRepository } from '../database/repositories/schedule.repository';
import { scheduleService } from '../services/schedule.service';
import { allSlots } from '../bot/utils/dates';

const friday = new Date(2026, 6, 24, 9, 0);

describe('ScheduleService.availableDates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (bookingRepository.findBusyInRange as jest.Mock).mockResolvedValue([]);
    (scheduleRepository.findExceptionDates as jest.Mock).mockResolvedValue([]);
  });

  it('returns six working days starting from today', async () => {
    const dates = await scheduleService.availableDates(1, friday);
    expect(dates).toEqual([
      '2026-07-24',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
    ]);
  });

  it('skips fully booked days', async () => {
    (bookingRepository.findBusyInRange as jest.Mock).mockResolvedValue(
      allSlots().map((time) => ({ date: '2026-07-27', time })),
    );
    const dates = await scheduleService.availableDates(1, friday);
    expect(dates).not.toContain('2026-07-27');
  });

  it('skips days the lawyer is off', async () => {
    (scheduleRepository.findExceptionDates as jest.Mock).mockResolvedValue(['2026-07-28']);
    const dates = await scheduleService.availableDates(1, friday);
    expect(dates).not.toContain('2026-07-28');
  });
});

describe('ScheduleService.availableTimes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (scheduleRepository.findExceptionDates as jest.Mock).mockResolvedValue([]);
  });

  it('returns slots not taken by other clients', async () => {
    (bookingRepository.findBusyTimes as jest.Mock).mockResolvedValue(['09:00', '10:00', '11:00']);
    const times = await scheduleService.availableTimes(1, '2026-07-27', friday);
    expect(times).toEqual(['12:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
  });

  it('returns nothing on a day off without querying bookings', async () => {
    (scheduleRepository.findExceptionDates as jest.Mock).mockResolvedValue(['2026-07-27']);
    const times = await scheduleService.availableTimes(1, '2026-07-27', friday);
    expect(times).toEqual([]);
    expect(bookingRepository.findBusyTimes).not.toHaveBeenCalled();
  });
});
