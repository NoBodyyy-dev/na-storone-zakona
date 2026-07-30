import { Context, SessionFlavor } from 'grammy';
import { SessionData } from '../types';

export type BotContext = Context & SessionFlavor<SessionData>;
