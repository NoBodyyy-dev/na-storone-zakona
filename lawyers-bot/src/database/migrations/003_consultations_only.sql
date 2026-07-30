-- Migration 003: бот записывает только на консультацию.
-- Дата/время и описание проблемы больше не спрашиваются, каталог услуг
-- сокращается до вариантов консультации по четырём видам дел.
--
-- Колонки booking_date / booking_time / problem_description не удаляются,
-- чтобы не потерять данные по уже созданным заявкам — они просто становятся
-- необязательными, и код их больше не заполняет и не читает.

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_lawyer_id_booking_date_booking_time_key;
ALTER TABLE bookings ALTER COLUMN booking_date DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN booking_time DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN problem_description DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at);

-- Услуги ищутся по стабильному slug, а не по id.
ALTER TABLE services ADD COLUMN IF NOT EXISTS slug TEXT;

-- Старый прайс-лист убираем целиком; строки, на которые ссылаются
-- уже созданные заявки, удалить нельзя — их просто деактивируем.
DELETE FROM services WHERE id NOT IN (SELECT service_id FROM bookings);
UPDATE services SET is_active = FALSE, slug = NULL;

INSERT INTO services (slug, title, description, price_label, category, sort_order, is_active) VALUES
  ('consult-criminal-oral',       'Устная юридическая консультация по правовым вопросам',   'Уголовные дела',        'от 10 000 руб.', 'criminal',       1, TRUE),
  ('consult-criminal-docs',       'Устная юридическая консультация с изучением документов', 'Уголовные дела',        'от 15 000 руб.', 'criminal',       2, TRUE),
  ('consult-administrative-oral', 'Устная юридическая консультация по правовым вопросам',   'Административные дела', 'от 5 000 руб.',  'administrative', 3, TRUE),
  ('consult-administrative-docs', 'Устная юридическая консультация с изучением документов', 'Административные дела', 'от 10 000 руб.', 'administrative', 4, TRUE),
  ('consult-arbitration-oral',    'Устная юридическая консультация по правовым вопросам',   'Арбитражные дела',      'от 10 000 руб.', 'arbitration',    5, TRUE),
  ('consult-arbitration-docs',    'Устная юридическая консультация с изучением документов', 'Арбитражные дела',      'от 25 000 руб.', 'arbitration',    6, TRUE),
  ('consult-family-oral',         'Устная юридическая консультация по правовым вопросам',   'Семейные дела',         'от 10 000 руб.', 'family',         7, TRUE),
  ('consult-family-docs',         'Устная юридическая консультация с изучением документов', 'Семейные дела',         'от 15 000 руб.', 'family',         8, TRUE);

CREATE UNIQUE INDEX IF NOT EXISTS idx_services_slug ON services(slug) WHERE slug IS NOT NULL;
