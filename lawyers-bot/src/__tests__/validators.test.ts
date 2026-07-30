import { validateFullName, validatePhone, normalizePhone } from '../bot/utils/validators';

describe('validateFullName', () => {
  it('accepts a valid full name (Фамилия Имя Отчество)', () => {
    expect(validateFullName('Иванов Иван Иванович').valid).toBe(true);
  });

  it('accepts a valid name with two parts (Фамилия Имя)', () => {
    expect(validateFullName('Иванов Иван').valid).toBe(true);
  });

  it('rejects a single word', () => {
    expect(validateFullName('Иванов').valid).toBe(false);
  });

  it('rejects names with digits', () => {
    expect(validateFullName('Иванов1 Иван').valid).toBe(false);
  });

  it('rejects lowercase first letters', () => {
    expect(validateFullName('иванов иван').valid).toBe(false);
  });

  it('accepts hyphenated surnames', () => {
    expect(validateFullName('Петров-Сидоров Алексей').valid).toBe(true);
  });
});

describe('validatePhone', () => {
  it('accepts a phone with +7 and separators', () => {
    expect(validatePhone('+7 918 460-07-69').valid).toBe(true);
  });

  it('accepts a phone starting with 8', () => {
    expect(validatePhone('89184600769').valid).toBe(true);
  });

  it('accepts a 10-digit phone without country code', () => {
    expect(validatePhone('9184600769').valid).toBe(true);
  });

  it('rejects too short numbers', () => {
    expect(validatePhone('12345').valid).toBe(false);
  });

  it('rejects non-numeric input', () => {
    expect(validatePhone('позвоните мне').valid).toBe(false);
  });
});

describe('normalizePhone', () => {
  it('formats a 10-digit number to +7 XXX XXX-XX-XX', () => {
    expect(normalizePhone('9184600769')).toBe('+7 918 460-07-69');
  });

  it('normalizes a number starting with 8 to +7', () => {
    expect(normalizePhone('89184600769')).toBe('+7 918 460-07-69');
  });
});
