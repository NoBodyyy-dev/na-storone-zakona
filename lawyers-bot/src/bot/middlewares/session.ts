import { session } from 'grammy';
import { SessionData } from '../../types';
import { BotContext } from '../context';
import { FileSessionStorage } from './fileSessionStorage';

function initialSession(): SessionData {
  return { step: 'idle', draft: {}, frames: [] };
}

export function sessionMiddleware() {
  return session<SessionData, BotContext>({
    initial: initialSession,
    storage: new FileSessionStorage(),
  });
}
