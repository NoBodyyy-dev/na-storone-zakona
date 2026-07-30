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
  /**
   * В обычной записи клиент выбирает вид дела сам, а при переходе по ссылке
   * с сайта вид дела берётся из категории выбранной услуги.
   */
  category?: BookableCategory;
  lawyerId?: number;
  serviceId?: number;
  /** YYYY-MM-DD */
  date?: string;
  /** HH:MM */
  time?: string;
}

/**
 * Экраны записи по порядку:
 * ФИО → телефон → вид дела → адвокат → услуга → дата → время → заявка.
 *
 * Проблему клиент не описывает и адвокат автоматически не подбирается:
 * либо адвокат приходит из ссылки с сайта (`?start=lawyer1`) — тогда шаги
 * «вид дела» и «адвокат» пропускаются, а вид дела берётся из услуги, —
 * либо клиент выбирает вид дела и затем адвоката, ведущего такие дела.
 */
export const BOOKING_STEPS = [
  'ask_name',
  'ask_phone',
  'ask_category',
  'ask_lawyer',
  'ask_service',
  'ask_date',
  'ask_time',
  'confirm',
] as const;

export type BookingStep = 'idle' | (typeof BOOKING_STEPS)[number];

/** Шаги, которые пропускаются, когда адвокат пришёл из ссылки с сайта. */
const LAWYER_FIXED_SKIPPED: readonly BookingStep[] = ['ask_category', 'ask_lawyer'];

/**
 * Шаги, которые реально увидит клиент: при переходе по ссылке с конкретным
 * адвокатом выбор вида дела и адвоката пропускается — шагов шесть, а не восемь.
 */
export function visibleSteps(lawyerFixed: boolean): readonly BookingStep[] {
  return lawyerFixed ? BOOKING_STEPS.filter((s) => !LAWYER_FIXED_SKIPPED.includes(s)) : BOOKING_STEPS;
}

/** Номер шага для индикатора «Шаг N из M». */
export function stepNumber(step: BookingStep, lawyerFixed: boolean): number {
  const index = visibleSteps(lawyerFixed).indexOf(step);
  return index === -1 ? 0 : index + 1;
}

export function stepsTotal(lawyerFixed: boolean): number {
  return visibleSteps(lawyerFixed).length;
}

/**
 * Один экран записи и все сообщения, которые он оставил в чате.
 * Кнопка «Назад» удаляет их, поэтому идентификаторы нужно помнить.
 */
export interface StepFrame {
  step: BookingStep;
  /** Сообщение бота с вопросом. */
  questionMsgId?: number;
  /** Ответ пользователя (для шагов, где он пишет текстом). */
  answerMsgId?: number;
  /** Подсказки об ошибках ввода и неудачные попытки ответа. */
  strayMsgIds?: number[];
}

export interface SessionData {
  step: BookingStep;
  draft: BookingDraft;
  /** Стек пройденных экранов — основа навигации «Назад». */
  frames: StepFrame[];
  lawyerFixed?: boolean;
  adminView?: string;
}

/** Короткая подпись вида дела — для подписей на кнопках и в строках каталога. */
export const CATEGORY_SHORT: Record<BookableCategory, string> = {
  civil: 'Гражданские / КАС РФ',
  admin_offence: 'КоАП РФ',
  arbitration: 'Арбитраж',
  criminal: 'Уголовные',
};
