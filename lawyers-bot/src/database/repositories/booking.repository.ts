import { DatabaseError } from 'pg';
import { pool } from '../db';
import { Booking, BookingDraft } from '../../types';

const BOOKING_COLUMNS =
  `id, user_id, lawyer_id, service_id, client_full_name, client_phone, category, status, created_at,
   to_char(booking_date, 'YYYY-MM-DD') AS booking_date,
   to_char(booking_time, 'HH24:MI') AS booking_time`;

/** Слот заняли между показом клавиатуры и подтверждением записи. */
export class SlotTakenError extends Error {
  constructor() {
    super('Slot is already taken');
    this.name = 'SlotTakenError';
  }
}

const UNIQUE_VIOLATION = '23505';

export class BookingRepository {
  async create(userId: number, draft: Required<BookingDraft>): Promise<Booking> {
    try {
      const { rows } = await pool.query<Booking>(
        `INSERT INTO bookings
          (user_id, lawyer_id, service_id, client_full_name, client_phone, category,
           booking_date, booking_time, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed')
         RETURNING ${BOOKING_COLUMNS}`,
        [
          userId,
          draft.lawyerId,
          draft.serviceId,
          draft.fullName,
          draft.phone,
          draft.category,
          draft.date,
          draft.time,
        ],
      );
      return rows[0];
    } catch (err) {
      if (err instanceof DatabaseError && err.code === UNIQUE_VIOLATION) {
        throw new SlotTakenError();
      }
      throw err;
    }
  }

  /** Занятое адвокатом время на конкретную дату, HH:MM. */
  async findBusyTimes(lawyerId: number, date: string): Promise<string[]> {
    const { rows } = await pool.query<{ time: string }>(
      `SELECT to_char(booking_time, 'HH24:MI') AS time FROM bookings
       WHERE lawyer_id = $1 AND booking_date = $2 AND status != 'cancelled'`,
      [lawyerId, date],
    );
    return rows.map((row) => row.time);
  }

  /** Занятое время адвоката за период — чтобы одним запросом собрать календарь. */
  async findBusyInRange(
    lawyerId: number,
    fromDate: string,
    toDate: string,
  ): Promise<Array<{ date: string; time: string }>> {
    const { rows } = await pool.query<{ date: string; time: string }>(
      `SELECT to_char(booking_date, 'YYYY-MM-DD') AS date, to_char(booking_time, 'HH24:MI') AS time
       FROM bookings
       WHERE lawyer_id = $1 AND booking_date BETWEEN $2 AND $3 AND status != 'cancelled'`,
      [lawyerId, fromDate, toDate],
    );
    return rows;
  }

  async findByUser(userId: number): Promise<Booking[]> {
    const { rows } = await pool.query<Booking>(
      `SELECT ${BOOKING_COLUMNS} FROM bookings
       WHERE user_id = $1 AND status != 'cancelled'
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows;
  }

  /** Заявки, созданные в указанный день (по локальной дате сервера). */
  async findByCreatedDate(date: string): Promise<Booking[]> {
    const { rows } = await pool.query<Booking>(
      `SELECT ${BOOKING_COLUMNS} FROM bookings
       WHERE created_at::date = $1 AND status != 'cancelled'
       ORDER BY created_at`,
      [date],
    );
    return rows;
  }

  /** Заявки, созданные начиная с указанной даты (включительно). */
  async findCreatedSince(date: string): Promise<Booking[]> {
    const { rows } = await pool.query<Booking>(
      `SELECT ${BOOKING_COLUMNS} FROM bookings
       WHERE created_at::date >= $1 AND status != 'cancelled'
       ORDER BY created_at DESC`,
      [date],
    );
    return rows;
  }

  /** Консультации, назначенные на указанный день. */
  async findByBookingDate(date: string): Promise<Booking[]> {
    const { rows } = await pool.query<Booking>(
      `SELECT ${BOOKING_COLUMNS} FROM bookings
       WHERE booking_date = $1 AND status != 'cancelled'
       ORDER BY booking_time`,
      [date],
    );
    return rows;
  }

  async countByLawyerSince(lawyerId: number, sinceDate: string): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM bookings
       WHERE lawyer_id = $1 AND created_at::date >= $2 AND status != 'cancelled'`,
      [lawyerId, sinceDate],
    );
    return Number(rows[0].count);
  }

  async countTotal(): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM bookings WHERE status != 'cancelled'`,
    );
    return Number(rows[0].count);
  }
}

export const bookingRepository = new BookingRepository();
