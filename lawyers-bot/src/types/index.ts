export interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  created_at: Date;
}

export type CaseCategory =
  | 'criminal'
  | 'arbitration'
  | 'family'
  | 'civil'
  /** Дела об административных правонарушениях (КоАП РФ). */
  | 'admin_offence'
  | 'other';

/**
 * Виды дел, которые клиент может выбрать при записи на консультацию —
 * те же четыре раздела, что и в официальном прайс-листе коллегии.
 * Административное судопроизводство (КАС РФ) входит в 'civil', а
 * 'admin_offence' — это дела об административных правонарушениях (КоАП РФ).
 */
export const BOOKABLE_CATEGORIES = ['civil', 'admin_offence', 'arbitration', 'criminal'] as const;

export type BookableCategory = (typeof BOOKABLE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<BookableCategory, string> = {
  civil: 'Гражданские и административные дела (КАС РФ)',
  admin_offence: 'Дела об административных правонарушениях',
  arbitration: 'Арбитражные дела',
  criminal: 'Уголовные дела',
};

export function isBookableCategory(value: string): value is BookableCategory {
  return (BOOKABLE_CATEGORIES as readonly string[]).includes(value);
}

export interface Lawyer {
  id: number;
  full_name: string;
  role: string;
  specialization: string;
  categories: CaseCategory[];
  practice_since: number;
  bar_reg_number: string;
  phone: string;
  email: string;
  office_address: string;
  bio: string;
  photo_path: string | null;
  is_active: boolean;
}

export interface Service {
  id: number;
  slug: string | null;
  title: string;
  description: string;
  price_label: string;
  category: CaseCategory;
  sort_order: number;
  is_active: boolean;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'done';

export interface Booking {
  id: number;
  user_id: number;
  lawyer_id: number;
  service_id: number;
  client_full_name: string;
  client_phone: string;
  category: CaseCategory;
  /** Дата консультации, YYYY-MM-DD. NULL — у заявок, созданных до появления выбора даты. */
  booking_date: string | null;
  /** Время консультации, HH:MM. */
  booking_time: string | null;
  status: BookingStatus;
  created_at: Date;
}

export interface BookingDraft {
  fullName?: string;
  phone?: string;
  category?: BookableCategory;
  lawyerId?: number;
  serviceId?: number;
  /** YYYY-MM-DD */
  date?: string;
  /** HH:MM */
  time?: string;
}

/** Короткая подпись вида дела — для подписей на кнопках и в строках каталога. */
export const CATEGORY_SHORT: Record<BookableCategory, string> = {
  civil: 'Гражданские / КАС РФ',
  admin_offence: 'КоАП РФ',
  arbitration: 'Арбитраж',
  criminal: 'Уголовные',
};
