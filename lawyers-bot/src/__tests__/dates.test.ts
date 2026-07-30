import {
  allSlots,
  formatBookingSlot,
  formatSlotHuman,
  freeSlots,
  isValidSlotTime,
  isWorkingDay,
  workingDaysAhead,
} from '../bot/utils/dates';

describe('allSlots', () => {
  it('covers the working day hourly from 09:00 to 17:00', () => {
    expect(allSlots()).toEqual([
      '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
    ]);
  });
});

describe('isWorkingDay', () => {
  it('accepts a weekday', () => {
    expect(isWorkingDay('2026-07-27')).toBe(true); // понедельник
  });

  it('rejects Saturday and Sunday', () => {
    expect(isWorkingDay('2026-07-25')).toBe(false);
    expect(isWorkingDay('2026-07-26')).toBe(false);
  });
});

describe('freeSlots', () => {
  const monday = '2026-07-27';

  it('excludes busy times', () => {
    const now = new Date(2026, 6, 24, 9, 0);
    expect(freeSlots(monday, ['11:00:00', '15:00'], now)).not.toContain('11:00');
    expect(freeSlots(monday, ['11:00:00', '15:00'], now)).not.toContain('15:00');
  });

  it('excludes slots starting in less than 2 hours', () => {
    const now = new Date(2026, 6, 27, 12, 30);
    const slots = freeSlots(monday, [], now);
    expect(slots).not.toContain('13:00');
    expect(slots).not.toContain('14:00');
    expect(slots[0]).toBe('15:00');
  });

  it('returns nothing for a weekend', () => {
    expect(freeSlots('2026-07-25', [], new Date(2026, 6, 20, 9, 0))).toEqual([]);
  });
});

describe('workingDaysAhead', () => {
  it('skips weekends and starts from today', () => {
    const days = workingDaysAhead(5, new Date(2026, 6, 24, 9, 0)); // пятница
    expect(days).toEqual(['2026-07-24', '2026-07-27', '2026-07-28']);
  });
});

describe('slot formatting', () => {
  it('formats a date and time pair', () => {
    expect(formatSlotHuman('2026-07-27', '14:00')).toBe('27 июля (пн), 14:00');
  });

  it('trims seconds coming from Postgres', () => {
    expect(formatSlotHuman('2026-07-27', '14:00:00')).toBe('27 июля (пн), 14:00');
  });

  it('falls back for bookings without a slot', () => {
    expect(formatBookingSlot({ booking_date: null, booking_time: null })).toBe('по согласованию');
  });
});

describe('isValidSlotTime', () => {
  it('accepts a slot from the grid and rejects anything else', () => {
    expect(isValidSlotTime('10:00')).toBe(true);
    expect(isValidSlotTime('10:30')).toBe(false);
    expect(isValidSlotTime('23:00')).toBe(false);
  });
});
