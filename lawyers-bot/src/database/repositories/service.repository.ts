import { pool } from '../db';
import { BookableCategory, Service } from '../../types';

export class ServiceRepository {
  /**
   * Плоский каталог консультаций — без разбивки по видам дела.
   * Нужен, когда адвокат пришёл из ссылки с сайта и вид дела отдельно
   * не спрашивается: он подписан в самой услуге.
   */
  async findAllConsultations(): Promise<Service[]> {
    const { rows } = await pool.query<Service>(
      `SELECT * FROM services
       WHERE is_active = TRUE AND slug LIKE 'consult-%'
       ORDER BY sort_order`,
    );
    return rows;
  }

  /** Консультации по нескольким видам дел — те, что ведёт конкретный адвокат. */
  async findConsultationsByCategories(categories: BookableCategory[]): Promise<Service[]> {
    if (categories.length === 0) return [];
    const { rows } = await pool.query<Service>(
      `SELECT * FROM services
       WHERE is_active = TRUE AND category = ANY($1) AND slug LIKE 'consult-%'
       ORDER BY sort_order`,
      [categories],
    );
    return rows;
  }

  /** Оба варианта консультации по одному виду дела. */
  async findConsultationsByCategory(category: BookableCategory): Promise<Service[]> {
    const { rows } = await pool.query<Service>(
      `SELECT * FROM services
       WHERE is_active = TRUE AND category = $1 AND slug LIKE 'consult-%'
       ORDER BY sort_order`,
      [category],
    );
    return rows;
  }

  async findById(id: number): Promise<Service | null> {
    const { rows } = await pool.query<Service>('SELECT * FROM services WHERE id = $1', [id]);
    return rows[0] ?? null;
  }
}

export const serviceRepository = new ServiceRepository();
