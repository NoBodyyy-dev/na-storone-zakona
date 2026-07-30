import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Эмблема коллегии — берётся из собранного клиента, чтобы не держать две копии. */
export const EMBLEM_PATH = resolve(__dirname, '../../../client/emblem.png');
