import { Bot } from 'grammy';
import { BotContext } from '../context';
import { handleStart } from '../handlers/start.handler';
import { handleAdminCommand } from '../handlers/admin.handler';

export function registerCommands(bot: Bot<BotContext>): void {
  bot.command('start', handleStart);
  bot.command('admin', handleAdminCommand);
}
