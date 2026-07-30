-- Схема БД ботов коллегии «На стороне Закона».
-- Применяется идемпотентно: npm run db:init

CREATE TABLE IF NOT EXISTS advocates (
  id           TEXT PRIMARY KEY,              -- 'sv' / 'in' — попадает в payload кнопки
  name         TEXT        NOT NULL,
  short_name   TEXT        NOT NULL,
  role         TEXT        NOT NULL,
  spec         TEXT        NOT NULL,
  since_year   INT         NOT NULL,
  registry     TEXT        NOT NULL,
  phone        TEXT        NOT NULL,
  email        TEXT        NOT NULL,           -- сюда уходит письмо о новой записи
  telegram_id  BIGINT,                         -- id адвоката в Telegram
  max_id       BIGINT,                         -- id адвоката в MAX
  sort_order   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
  advocate_id  TEXT NOT NULL REFERENCES advocates(id) ON DELETE CASCADE,
  id           TEXT NOT NULL,                  -- уникален в пределах адвоката
  title        TEXT NOT NULL,
  price        TEXT NOT NULL,                  -- строкой: «от 50 000 ₽», «бесплатно», «50% от цены договора»
  note         TEXT,
  sort_order   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (advocate_id, id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id           BIGSERIAL PRIMARY KEY,
  platform     TEXT        NOT NULL CHECK (platform IN ('telegram', 'max')),
  user_id      TEXT        NOT NULL,
  user_name    TEXT,
  advocate_id  TEXT        NOT NULL REFERENCES advocates(id),
  service_id   TEXT        NOT NULL,
  slot_at      TIMESTAMPTZ NOT NULL,           -- момент приёма
  notified_at  TIMESTAMPTZ,                    -- когда адвокату ушло письмо
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (advocate_id, service_id) REFERENCES services(advocate_id, id)
);

-- Главная гарантия: один адвокат — один приём в одно время.
-- Двойная запись невозможна на уровне БД, а не только в коде приложения,
-- поэтому её не пробьёт ни гонка двух ботов, ни второй инстанс процесса.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot_unique
  ON bookings (advocate_id, slot_at);

CREATE INDEX IF NOT EXISTS bookings_user_idx
  ON bookings (platform, user_id);

CREATE INDEX IF NOT EXISTS bookings_slot_idx
  ON bookings (advocate_id, slot_at);
