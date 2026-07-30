import fs from 'fs';
import path from 'path';
import type { StorageAdapter } from 'grammy';
import { SessionData } from '../../types';
import { logger } from '../../logger/logger';

/**
 * Простое персистентное хранилище сессий на диске (JSON-файл).
 * Нужно, чтобы перезапуск бота (деплой, падение процесса) не обнулял
 * незавершённую запись клиента, которая уже отображается в чате Telegram.
 */
export class FileSessionStorage implements StorageAdapter<SessionData> {
  private readonly filePath: string;
  private cache: Record<string, SessionData>;

  constructor(filePath = path.resolve(process.cwd(), 'data', 'sessions.json')) {
    this.filePath = filePath;
    this.cache = this.loadFromDisk();
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

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.cache), 'utf-8');
    } catch (err) {
      logger.error({ err }, 'Failed to persist session storage file');
    }
  }

  read(key: string): SessionData | undefined {
    return this.cache[key];
  }

  write(key: string, value: SessionData): void {
    this.cache[key] = value;
    this.persist();
  }

  delete(key: string): void {
    delete this.cache[key];
    this.persist();
  }
}
