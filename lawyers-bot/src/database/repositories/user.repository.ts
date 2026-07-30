import { pool } from '../db';
import { User } from '../../types';

export class UserRepository {
  async findByTelegramId(telegramId: number): Promise<User | null> {
    const { rows } = await pool.query<User>('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
    return rows[0] ?? null;
  }

  async findOrCreate(telegramId: number, username: string | null): Promise<User> {
    const existing = await this.findByTelegramId(telegramId);
    if (existing) return existing;

    const { rows } = await pool.query<User>(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2)
       ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username
       RETURNING *`,
      [telegramId, username],
    );
    return rows[0];
  }

  async updateContact(userId: number, fullName: string, phone: string): Promise<void> {
    await pool.query('UPDATE users SET full_name = $1, phone = $2 WHERE id = $3', [fullName, phone, userId]);
  }

  async isAdmin(telegramId: number): Promise<boolean> {
    const { rows } = await pool.query<{ is_admin: boolean }>(
      'SELECT is_admin FROM users WHERE telegram_id = $1',
      [telegramId],
    );
    return rows[0]?.is_admin ?? false;
  }
}

export const userRepository = new UserRepository();
