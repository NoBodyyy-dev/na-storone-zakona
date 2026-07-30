-- Migration 001: initial schema

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  telegram_id   BIGINT UNIQUE NOT NULL,
  username      TEXT,
  full_name     TEXT,
  phone         TEXT,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lawyers (
  id                SERIAL PRIMARY KEY,
  full_name         TEXT NOT NULL,
  role              TEXT NOT NULL,
  specialization    TEXT NOT NULL,
  categories        TEXT[] NOT NULL,
  practice_since    INTEGER NOT NULL,
  bar_reg_number    TEXT NOT NULL,
  phone             TEXT NOT NULL,
  email             TEXT NOT NULL,
  office_address    TEXT NOT NULL,
  bio               TEXT NOT NULL,
  photo_path        TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS services (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  price_label   TEXT NOT NULL,
  category      TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS bookings (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lawyer_id             INTEGER NOT NULL REFERENCES lawyers(id),
  service_id            INTEGER NOT NULL REFERENCES services(id),
  client_full_name      TEXT NOT NULL,
  client_phone          TEXT NOT NULL,
  problem_description   TEXT NOT NULL,
  category              TEXT NOT NULL,
  booking_date          DATE NOT NULL,
  booking_time          TIME NOT NULL,
  status                TEXT NOT NULL DEFAULT 'confirmed',
  reminder_sent         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lawyer_id, booking_date, booking_time)
);

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id              SERIAL PRIMARY KEY,
  exception_date  DATE NOT NULL,
  lawyer_id       INTEGER REFERENCES lawyers(id) ON DELETE CASCADE,
  reason          TEXT,
  UNIQUE (exception_date, lawyer_id)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
