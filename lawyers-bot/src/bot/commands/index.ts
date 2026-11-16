import { Bot } from 'grammy';
import { BotContext } from '../context';
import { handleBook, handlePanel, handleStart } from '../handlers/start.handler';
import { handleAdminCommand } from '../handlers/admin.handler';

export function registerCommands(bot: Bot<BotContext>): void {
  bot.command('start', handleStart);
  bot.command('book', handleBook);
  bot.command('panel', handlePanel);
  bot.command('admin', handleAdminCommand);
}
