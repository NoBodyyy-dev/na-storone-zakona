export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const NAME_PART_RE = /^[А-ЯЁA-Z][а-яёa-z]+(-[А-ЯЁA-Z][а-яёa-z]+)?$/;

export function validateFullName(input: string): ValidationResult {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  const parts = trimmed.split(' ');

  if (parts.length < 2 || parts.length > 3) {
    return { valid: false, error: 'Укажите, пожалуйста, полное ФИО (фамилия и имя, отчество по желанию).' };
  }

  for (const part of parts) {
    if (!NAME_PART_RE.test(part)) {
      return {
        valid: false,
        error: 'ФИО должно содержать только буквы, каждое слово — с заглавной буквы. Пример: Иванов Иван Иванович',
      };
    }
  }

  return { valid: true };
}

export function normalizeFullName(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

const PHONE_DIGITS_RE = /^[78]?\d{10}$/;

export function validatePhone(input: string): ValidationResult {
  const digits = input.replace(/[^\d]/g, '');
  const normalized = digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))
    ? `7${digits.slice(1)}`
    : digits.length === 10
      ? `7${digits}`
      : digits;

  if (!PHONE_DIGITS_RE.test(normalized) || normalized.length !== 11) {
    return {
      valid: false,
      error: 'Введите корректный номер телефона в формате +7 900 000-00-00',
    };
  }
  return { valid: true };
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d]/g, '');
  const elevenDigits = digits.length === 10 ? `7${digits}` : digits;
  const withSeven = elevenDigits.startsWith('8') ? `7${elevenDigits.slice(1)}` : elevenDigits;
  return `+${withSeven.slice(0, 1)} ${withSeven.slice(1, 4)} ${withSeven.slice(4, 7)}-${withSeven.slice(7, 9)}-${withSeven.slice(9, 11)}`;
}
