import { pool } from '../db';
import { CaseCategory, Lawyer } from '../../types';

interface LawyerRow extends Omit<Lawyer, 'categories'> {
  categories: string[];
}

function mapRow(row: LawyerRow): Lawyer {
  return { ...row, categories: row.categories as CaseCategory[] };
}

export class LawyerRepository {
  async findAllActive(): Promise<Lawyer[]> {
    const { rows } = await pool.query<LawyerRow>('SELECT * FROM lawyers WHERE is_active = TRUE ORDER BY id');
    return rows.map(mapRow);
  }

  async findById(id: number): Promise<Lawyer | null> {
    const { rows } = await pool.query<LawyerRow>('SELECT * FROM lawyers WHERE id = $1', [id]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByCategory(category: CaseCategory): Promise<Lawyer[]> {
    const { rows } = await pool.query<LawyerRow>(
      'SELECT * FROM lawyers WHERE is_active = TRUE AND $1 = ANY(categories) ORDER BY id',
      [category],
    );
    return rows.map(mapRow);
  }
}

export const lawyerRepository = new LawyerRepository();
