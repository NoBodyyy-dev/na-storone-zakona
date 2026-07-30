-- Migration 004: клиент снова выбирает дату и время консультации.
--
-- Колонки booking_date / booking_time остаются NULLABLE: у заявок, созданных
-- в период, когда бот их не спрашивал, значения нет. Один и тот же слот
-- нельзя занять дважды у одного адвоката — но отменённая запись освобождает
-- слот, поэтому индекс частичный.

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot
  ON bookings (lawyer_id, booking_date, booking_time)
  WHERE booking_date IS NOT NULL AND status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_bookings_lawyer_date
  ON bookings (lawyer_id, booking_date);
