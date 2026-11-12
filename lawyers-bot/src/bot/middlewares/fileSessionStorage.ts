import fs from 'fs';
import path from 'path';
import type { StorageAdapter } from 'grammy';
import { SessionData } from '../../types';
import { logger } from '../../logger/logger';

/** Сессия, к которой не прикасались дольше суток, уже никому не нужна. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Пустая сессия (главное меню) — хранить нечего. */
function isEmpty(value: SessionData): boolean {
  return value.step === 'idle' && value.frames.length === 0 && Object.keys(value.draft).length === 0;
}

/**
 * Простое персистентное хранилище сессий на диске (JSON-файл).
 * Нужно, чтобы перезапуск бота (деплой, падение процесса) не обнулял
 * незавершённую запись клиента, которая уже отображается в чате Telegram.
 *
 * Хранятся только незавершённые записи и только сутки: иначе файл рос бы
 * с каждым новым /start, а запись на диск при каждом апдейте превращалась
 * бы в удобную точку для флуда.
 */
export class FileSessionStorage implements StorageAdapter<SessionData> {
  private readonly filePath: string;
  private cache: Record<string, SessionData>;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(filePath = path.resolve(process.cwd(), 'data', 'sessions.json')) {
    this.filePath = filePath;
    this.cache = this.loadFromDisk();
    this.prune();
  }

  private loadFromDisk(): Record<string, SessionData> {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to load session storage file, starting fresh');
    }
    return {};
  }

  /** Выбрасывает пустые и давно брошенные сессии. */
  private prune(now = Date.now()): void {
    for (const [key, value] of Object.entries(this.cache)) {
      const stale = (value.updatedAt ?? 0) + STALE_AFTER_MS < now;
      if (isEmpty(value) || stale) delete this.cache[key];
    }
  }

  /** Запись на диск отложена: серия апдейтов одного клиента даёт одну запись. */
  private schedulePersist(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.persist();
    }, 500);
    this.flushTimer.unref();
  }

  private persist(): void {
    try {
      this.prune();
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.cache), { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      logger.error({ err }, 'Failed to persist session storage file');
    }
  }

  read(key: string): SessionData | undefined {
    const value = this.cache[key];
    if (!value) return undefined;
    if ((value.updatedAt ?? 0) + STALE_AFTER_MS < Date.now()) {
      delete this.cache[key];
      return undefined;
    }
    return value;
  }

  write(key: string, value: SessionData): void {
    if (isEmpty(value)) {
      this.delete(key);
      return;
    }
    value.updatedAt = Date.now();
    this.cache[key] = value;
    this.schedulePersist();
  }

  delete(key: string): void {
    if (!(key in this.cache)) return;
    delete this.cache[key];
    this.schedulePersist();
  }
}
