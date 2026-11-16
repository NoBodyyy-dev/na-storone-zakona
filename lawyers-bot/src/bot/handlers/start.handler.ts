import { InputFile } from 'grammy';
import fs from 'fs';
import path from 'path';
import { BotContext } from '../context';
import { userRepository } from '../../database/repositories/user.repository';
import { lawyerRepository } from '../../database/repositories/lawyer.repository';
import { mainMenuKeyboard, openAppKeyboard } from '../keyboards/keyboards';
import { env } from '../../config/env';
import { logger } from '../../logger/logger';

const WELCOME_TEXT =
  '⚖️ <b>Коллегия адвокатов «На стороне Закона»</b>\n\n' +
  'Здравствуйте! Мы ведём гражданские, административные, арбитражные и уголовные дела ' +
  'в Краснодаре.\n\n' +
  'Записаться на консультацию можно в форме — выберите вид дела, адвоката и удобное время. ' +
  'Ниже — контакты и информация о коллегии.';

const ABOUT_TEXT =
  'ℹ️ <b>Краснодарская краевая коллегия адвокатов «На стороне Закона»</b>\n\n' +
  'Защищаем права доверителей честно, открыто и строго в рамках закона.\n\n' +
  '<b>Направления:</b>\n' +
  '• гражданские дела и административное судопроизводство (КАС РФ)\n' +
  '• дела об административных правонарушениях (КоАП РФ)\n' +
  '• арбитражные споры\n' +
  '• уголовные дела\n\n' +
  'ОГРН 1262300025668 · ИНН 2308305136';

const CONTACTS_TEXT =
  '📍 <b>Контакты</b>\n\n' +
  'г. Краснодар, ул. Бабушкина, 248, оф. А218\n2 этаж, БЦ «Книга»\n\n' +
  '🕘 Пн–Пт: 09:00–18:00 · Сб–Вс: по договорённости\n\n' +
  '📞 +7 918 460-07-69\n📞 +7 918 001-04-04\n✉️ ns-zakona@mail.ru';

/** Адвокатам и администраторам — кнопка панели заявок в меню. */
export function hasPanel(telegramId: number | undefined): boolean {
  return !!telegramId && (env.adminIds.includes(telegramId) || env.lawyerByTelegramId.has(telegramId));
}

export async function handleStart(ctx: BotContext): Promise<void> {
  if (!ctx.from) return;

  await userRepository.findOrCreate(ctx.from.id, ctx.from.username ?? null);
  const menu = mainMenuKeyboard(hasPanel(ctx.from.id));

  // Ссылки с сайта ведут сразу к записи: ?start=lawyer1 (адвокат уже выбран)
  // или ?start=booking. Форма открывается с этим адвокатом.
  const payload = ctx.match?.toString().trim() ?? '';
  const lawyerMatch = payload.match(/^lawyer[=_-]?(\d+)$/i);
  if (lawyerMatch) {
    const lawyer = await lawyerRepository.findById(Number(lawyerMatch[1]));
    if (lawyer?.is_active) {
      await ctx.reply(`Запись на консультацию к адвокату <b>${lawyer.full_name}</b>:`, {
        parse_mode: 'HTML',
        reply_markup: openAppKeyboard('📝 Открыть форму записи', `?lawyer=${lawyer.id}`),
      });
      await ctx.reply('Меню — внизу экрана 👇', { reply_markup: menu });
      return;
    }
  }
  if (/^(booking|zapis|record)$/i.test(payload)) {
    await handleBook(ctx);
    await ctx.reply('Меню — внизу экрана 👇', { reply_markup: menu });
    return;
  }

  const emblemPath = path.resolve(process.cwd(), env.emblemPath);
  try {
    if (fs.existsSync(emblemPath)) {
      await ctx.replyWithPhoto(new InputFile(emblemPath), {
        caption: WELCOME_TEXT,
        parse_mode: 'HTML',
        reply_markup: openAppKeyboard('📝 Записаться на консультацию'),
      });
      await ctx.reply('Меню — внизу экрана 👇', { reply_markup: menu });
      return;
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to send emblem photo, falling back to text-only welcome');
  }

  await ctx.reply(WELCOME_TEXT, { parse_mode: 'HTML', reply_markup: openAppKeyboard('📝 Записаться на консультацию') });
  await ctx.reply('Меню — внизу экрана 👇', { reply_markup: menu });
}

export async function handleBook(ctx: BotContext): Promise<void> {
  await ctx.reply('Форма записи откроется прямо в Telegram:', {
    reply_markup: openAppKeyboard('📝 Открыть форму записи'),
  });
}

export async function handleMine(ctx: BotContext): Promise<void> {
  await ctx.reply('Ваши записи и их отмена — в приложении:', {
    reply_markup: openAppKeyboard('📋 Открыть мои записи', '?tab=mine'),
  });
}

export async function handlePanel(ctx: BotContext): Promise<void> {
  if (!hasPanel(ctx.from?.id)) {
    await ctx.reply('⛔ Панель заявок доступна только адвокатам коллегии.');
    return;
  }
  await ctx.reply('Заявки клиентов:', { reply_markup: openAppKeyboard('🗂 Открыть панель', '?tab=panel') });
}

export async function handleAbout(ctx: BotContext): Promise<void> {
  const lawyers = await lawyerRepository.findAllActive();
  const team = lawyers.map((l) => `👨‍⚖️ <b>${l.full_name}</b>\n${l.role}, ${l.specialization}`).join('\n\n');
  await ctx.reply(`${ABOUT_TEXT}\n\n${team}`, {
    parse_mode: 'HTML',
    reply_markup: openAppKeyboard('📝 Записаться на консультацию'),
  });
}

export async function handleContacts(ctx: BotContext): Promise<void> {
  await ctx.reply(CONTACTS_TEXT, { parse_mode: 'HTML' });
}

export async function handleSiteButton(ctx: BotContext): Promise<void> {
  await ctx.reply(`🌐 Официальный сайт коллегии:\n${env.siteUrl}`);
}
