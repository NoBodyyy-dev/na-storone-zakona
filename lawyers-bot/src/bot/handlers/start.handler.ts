import { InputFile } from 'grammy';
import fs from 'fs';
import path from 'path';
import { BotContext } from '../context';
import { userRepository } from '../../database/repositories/user.repository';
import { lawyerRepository } from '../../database/repositories/lawyer.repository';
import { mainMenuKeyboard } from '../keyboards/keyboards';
import { env } from '../../config/env';
import { logger } from '../../logger/logger';
import { startBooking, startBookingWithLawyer } from '../conversations/booking.conversation';

const WELCOME_TEXT =
  '⚖️ <b>Коллегия адвокатов «На стороне Закона»</b>\n\n' +
  'Здравствуйте! Здесь можно записаться на консультацию адвоката — по гражданскому, ' +
  'административному, арбитражному или уголовному делу. Вы сами выберете вид дела, ' +
  'адвоката и удобное время.\n\n' +
  'Выберите действие ниже 👇';

export async function handleStart(ctx: BotContext): Promise<void> {
  if (!ctx.from) return;

  await userRepository.findOrCreate(ctx.from.id, ctx.from.username ?? null);

  // Ссылки с сайта ведут сразу к записи: ?start=lawyer1 (адвокат уже выбран)
  // или ?start=booking (адвоката клиент выберет сам после вида дела).
  const payload = ctx.match?.toString().trim() ?? '';
  const lawyerMatch = payload.match(/^lawyer[=_-]?(\d+)$/i);
  if (lawyerMatch) {
    const lawyerId = Number(lawyerMatch[1]);
    const lawyer = await lawyerRepository.findById(lawyerId);
    if (lawyer) {
      await startBookingWithLawyer(ctx, lawyerId);
      return;
    }
  }
  if (/^(booking|zapis|record)$/i.test(payload)) {
    await startBooking(ctx);
    return;
  }

  const emblemPath = path.resolve(process.cwd(), env.emblemPath);
  try {
    if (fs.existsSync(emblemPath)) {
      await ctx.replyWithPhoto(new InputFile(emblemPath), {
        caption: WELCOME_TEXT,
        parse_mode: 'HTML',
      });
      await ctx.reply('Главное меню:', { reply_markup: mainMenuKeyboard() });
      return;
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to send emblem photo, falling back to text-only welcome');
  }

  await ctx.reply(WELCOME_TEXT, { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() });
}

export async function handleSiteButton(ctx: BotContext): Promise<void> {
  await ctx.reply(`🌐 Официальный сайт коллегии:\n${env.siteUrl}`);
}
