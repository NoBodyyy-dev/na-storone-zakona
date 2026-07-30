/**
 * Справочник адвокатов и услуг в памяти процесса.
 *
 * Загружается из PostgreSQL при старте и обновляется по требованию.
 * Так каждое нажатие кнопки не идёт в БД за неизменными данными —
 * в базу ходят только записи на приём.
 */

import { fetchAdvocates } from '../db/advocates.js';

let advocates = [];

export async function loadCatalog() {
  advocates = await fetchAdvocates();
  if (advocates.length === 0) {
    throw new Error('В таблице advocates нет ни одного адвоката — выполните npm run db:seed');
  }
  const services = advocates.reduce((n, a) => n + a.services.length, 0);
  console.log(`[catalog] загружено адвокатов: ${advocates.length}, услуг: ${services}`);
  return advocates;
}

export const listAdvocates = () => advocates;

export const getAdvocate = (id) => advocates.find((a) => a.id === id) || null;

export const getService = (advocateId, serviceId) =>
  getAdvocate(advocateId)?.services.find((s) => s.id === serviceId) || null;
