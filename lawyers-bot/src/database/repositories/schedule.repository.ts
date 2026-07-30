import { pool } from '../db';

export class ScheduleRepository {
  /**
   * Даты, в которые адвокат не принимает. Строки с lawyer_id IS NULL —
   * общие нерабочие дни коллегии (праздники), они действуют для всех.
   */
  async findExceptionDates(lawyerId: number, fromDate: string, toDate: string): Promise<string[]> {
    const { rows } = await pool.query<{ date: string }>(
      `SELECT to_char(exception_date, 'YYYY-MM-DD') AS date FROM schedule_exceptions
       WHERE (lawyer_id = $1 OR lawyer_id IS NULL) AND exception_date BETWEEN $2 AND $3`,
      [lawyerId, fromDate, toDate],
    );
    return rows.map((row) => row.date);
  }
}

export const scheduleRepository = new ScheduleRepository();
