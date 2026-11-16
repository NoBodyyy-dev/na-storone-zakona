'use strict';

/*
 * Mini App записи к адвокату. Три вкладки: форма записи, «Мои записи»
 * и — для адвокатов и администраторов — «Заявки». Пользователя сервер узнаёт
 * по initData от Telegram, поэтому вне Telegram приложение не работает.
 */

const tg = window.Telegram && window.Telegram.WebApp;
const params = new URLSearchParams(location.search);
const BOT_LINK = 'https://t.me/ns_zakona_bot';

const state = {
  me: null,
  catalog: null,
  tab: 'book',
  /** Адвокат из ссылки с сайта (?lawyer=1) — выбор адвоката тогда не показываем. */
  fixedLawyerId: Number(params.get('lawyer')) || null,
  form: { category: null, lawyerId: null, serviceId: null, date: null, time: null, fullName: '', phone: '', consent: false },
  slots: { lawyerId: null, days: null, error: null },
  submitting: false,
  panelScope: 'upcoming',
};

const view = document.getElementById('view');
const bottomBar = document.getElementById('bottom-bar');
const submitBtn = document.getElementById('submit');
const formError = document.getElementById('form-error');

/* ---------- утилиты ---------- */

/** Создаёт элемент. Текст всегда через textContent — данные клиентов в разметку не попадают. */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function haptic() {
  try { tg && tg.HapticFeedback.selectionChanged(); } catch (_) { /* старый клиент */ }
}

class ApiError extends Error {}

async function api(path, options = {}) {
  const res = await fetch(`../api${path}`, {
    ...options,
    headers: {
      Authorization: `tma ${tg ? tg.initData : ''}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Не удалось связаться с сервером. Попробуйте ещё раз.');
  return data;
}

function confirmDialog(text) {
  return new Promise((resolve) => {
    if (tg && tg.showConfirm && tg.isVersionAtLeast && tg.isVersionAtLeast('6.2')) tg.showConfirm(text, resolve);
    else resolve(window.confirm(text));
  });
}

function openLink(url) {
  if (tg && tg.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

/** «от 10 000 ₽» не должно разрываться посередине числа. */
function nbsp(text) {
  return String(text).replace(/(\d) (?=\d)/g, '$1\u00a0').replace(/^от /, 'от\u00a0').replace(/ ₽/g, '\u00a0₽');
}

function formatCreated(value) {
  return new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function lawyerPhoto(lawyer) {
  const img = h('img', { class: 'avatar', src: `lawyer-${lawyer.id}.jpg`, alt: '', width: 48, height: 48, loading: 'lazy' });
  img.addEventListener('error', () => img.removeAttribute('src'), { once: true });
  return img;
}

const NAME_PART = /^[А-ЯЁA-Z][а-яёa-z]+(-[А-ЯЁA-Z][а-яёa-z]+)?$/;
function nameError(value) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return 'Фамилия и имя, отчество — по желанию';
  if (!parts.every((p) => NAME_PART.test(p))) return 'Только буквы, каждое слово с заглавной';
  return null;
}
function phoneError(value) {
  const digits = value.replace(/\D/g, '');
  const ok = digits.length === 10 || (digits.length === 11 && /^[78]/.test(digits));
  return ok ? null : 'Номер в формате +7 900 000-00-00';
}

/* ---------- вкладки ---------- */

function setTab(tab) {
  state.tab = tab;
  for (const btn of document.querySelectorAll('#tabs button')) {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === tab));
  }
  formError.textContent = '';
  window.scrollTo(0, 0);
  if (tab === 'book') renderBook();
  else if (tab === 'mine') renderMine();
  else renderPanel();
}

/* ---------- форма записи ---------- */

function categoriesForForm() {
  const all = state.catalog.categories;
  const fixed = fixedLawyer();
  return fixed ? all.filter((c) => fixed.categories.includes(c.id)) : all;
}

function fixedLawyer() {
  return state.catalog.lawyers.find((l) => l.id === state.fixedLawyerId) || null;
}

function selectCategory(id) {
  const f = state.form;
  if (f.category === id) return;
  haptic();
  f.category = id;
  f.serviceId = null;
  const lawyers = state.catalog.lawyers.filter((l) => l.categories.includes(id));
  if (!fixedLawyer()) {
    // Если дело ведёт один адвокат — выбираем его сразу.
    const keep = lawyers.some((l) => l.id === f.lawyerId);
    if (!keep) selectLawyer(lawyers.length === 1 ? lawyers[0].id : null, false);
  }
  renderBook();
}

function selectLawyer(id, rerender = true) {
  const f = state.form;
  if (f.lawyerId === id) return;
  if (rerender) haptic();
  f.lawyerId = id;
  f.date = null;
  f.time = null;
  state.slots = { lawyerId: id, days: null, error: null };
  if (id) loadSlots(id);
  if (rerender) renderBook();
}

async function loadSlots(lawyerId) {
  try {
    const { days } = await api(`/slots?lawyerId=${lawyerId}`);
    if (state.slots.lawyerId !== lawyerId) return;
    state.slots.days = days;
    const f = state.form;
    if (!days.some((d) => d.date === f.date)) {
      f.date = days.length ? days[0].date : null;
      f.time = null;
    }
  } catch (err) {
    if (state.slots.lawyerId === lawyerId) state.slots.error = err.message;
  }
  if (state.tab === 'book') renderBook();
}

function section(n, title, ...content) {
  return h('section', { class: 'section' }, h('h2', { class: 'section-title' }, h('span', { class: 'n' }, n), title), ...content);
}

function option({ pressed, onclick, label, sub, price, avatar }) {
  return h(
    'button',
    { class: 'option', type: 'button', 'aria-pressed': String(pressed), onclick },
    avatar || null,
    h('span', { class: 'main' }, h('span', { class: 'label' }, label), sub ? h('span', { class: 'sub' }, sub) : null),
    price ? h('span', { class: 'price' }, price) : null,
    h('span', { class: 'check', 'aria-hidden': 'true' }),
  );
}

function renderBook() {
  const { catalog, form: f } = state;
  const fixed = fixedLawyer();
  if (fixed && !f.lawyerId) selectLawyer(fixed.id, false);

  const parts = [];
  let n = 1;

  if (fixed) {
    parts.push(
      h('div', { class: 'card lawyer-fixed' },
        lawyerPhoto(fixed),
        h('div', null, h('p', { class: 'hint' }, 'Запись к адвокату'), h('p', { class: 'label' }, fixed.fullName), h('p', { class: 'hint' }, fixed.role)),
      ),
    );
  }

  parts.push(
    section(n++, 'Вид дела',
      h('div', { class: 'options' },
        categoriesForForm().map((c) => option({ pressed: f.category === c.id, label: c.label, onclick: () => selectCategory(c.id) })),
      ),
    ),
  );

  if (f.category && !fixed) {
    const lawyers = catalog.lawyers.filter((l) => l.categories.includes(f.category));
    parts.push(
      section(n++, 'Адвокат',
        h('div', { class: 'options' },
          lawyers.map((l) => option({
            pressed: f.lawyerId === l.id, label: l.fullName, sub: l.role, avatar: lawyerPhoto(l), onclick: () => selectLawyer(l.id),
          })),
        ),
      ),
    );
  }

  if (f.category && f.lawyerId) {
    const services = catalog.services.filter((s) => s.category === f.category);
    parts.push(
      section(n++, 'Консультация',
        h('div', { class: 'options' },
          services.map((s) => option({
            pressed: f.serviceId === s.id,
            label: s.kind === 'docs' ? 'С изучением документов' : 'Устная консультация',
            sub: s.kind === 'docs' ? 'Возьмите документы по делу с собой' : 'Разбор ситуации и план действий',
            price: nbsp(s.priceLabel),
            onclick: () => { haptic(); f.serviceId = s.id; renderBook(); },
          })),
        ),
      ),
    );
    parts.push(section(n++, 'Дата и время', renderSlots()));
  }

  if (f.category && f.lawyerId) parts.push(section(n++, 'Ваши контакты', renderContacts()));

  view.replaceChildren(...parts);
  bottomBar.hidden = false;
  submitBtn.textContent = 'Записаться';
  submitBtn.onclick = submitBooking;
  updateSubmit();
}

function renderSlots() {
  const { slots, form: f } = state;
  if (slots.error) return h('p', { class: 'form-error' }, slots.error);
  if (!slots.days) return h('p', { class: 'hint' }, 'Смотрим свободное время…');
  if (slots.days.length === 0) {
    return h('p', { class: 'hint' }, 'В ближайшие дни свободного времени нет. Позвоните нам: +7 918 460-07-69.');
  }
  const day = slots.days.find((d) => d.date === f.date) || slots.days[0];
  return h('div', null,
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Дата' },
      slots.days.map((d) => h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(d.date === f.date),
        onclick: () => { haptic(); f.date = d.date; f.time = null; renderBook(); },
      }, d.label)),
    ),
    h('div', { class: 'times', role: 'group', 'aria-label': 'Время' },
      day.times.map((t) => h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(t === f.time),
        onclick: () => { haptic(); f.date = day.date; f.time = t; renderBook(); },
      }, t)),
    ),
    h('p', { class: 'hint mt-s' }, 'Консультация длится около часа. Приём: Пн–Пт, 09:00–18:00.'),
  );
}

function renderContacts() {
  const f = state.form;
  const field = (label, input, check) => {
    const err = h('p', { class: 'err' });
    const show = () => {
      const message = input.value ? check(input.value) : null;
      err.textContent = message || '';
      input.setAttribute('aria-invalid', String(Boolean(message)));
    };
    input.addEventListener('blur', show);
    input.addEventListener('input', () => { if (input.getAttribute('aria-invalid') === 'true') show(); });
    if (input.value) show();
    return h('label', { class: 'field' }, h('span', null, label), input, err);
  };

  const name = h('input', { type: 'text', autocomplete: 'name', autocapitalize: 'words', placeholder: 'Иванов Иван Иванович', value: f.fullName });
  name.addEventListener('input', () => { f.fullName = name.value; updateSubmit(); });
  const phone = h('input', { type: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: '+7 900 000-00-00', value: f.phone });
  phone.addEventListener('input', () => { f.phone = phone.value; updateSubmit(); });

  const consent = h('input', { type: 'checkbox', checked: f.consent });
  consent.addEventListener('change', () => { f.consent = consent.checked; haptic(); updateSubmit(); });
  const policy = h('a', { href: state.catalog.privacyUrl, onclick: (e) => { e.preventDefault(); openLink(state.catalog.privacyUrl); } }, 'обработку персональных данных');

  return h('div', null,
    field('ФИО', name, nameError),
    field('Телефон', phone, phoneError),
    h('label', { class: 'consent' }, consent, h('span', null, 'Согласен(на) на ', policy, ' для записи на консультацию')),
  );
}

function bookingReady() {
  const f = state.form;
  return Boolean(f.category && f.lawyerId && f.serviceId && f.date && f.time && f.consent && !nameError(f.fullName) && !phoneError(f.phone));
}

function updateSubmit() {
  if (state.tab !== 'book') return;
  submitBtn.disabled = !bookingReady() || state.submitting;
}

async function submitBooking() {
  if (!bookingReady() || state.submitting) return;
  const f = state.form;
  state.submitting = true;
  submitBtn.textContent = 'Отправляем…';
  updateSubmit();
  formError.textContent = '';
  try {
    const { booking } = await api('/bookings', {
      method: 'POST',
      body: JSON.stringify({
        fullName: f.fullName, phone: f.phone, category: f.category, lawyerId: f.lawyerId,
        serviceId: f.serviceId, date: f.date, time: f.time, consent: f.consent,
      }),
    });
    try { tg && tg.HapticFeedback.notificationOccurred('success'); } catch (_) { /* старый клиент */ }
    state.submitting = false;
    renderDone(booking);
    return;
  } catch (err) {
    formError.textContent = err.message;
    try { tg && tg.HapticFeedback.notificationOccurred('error'); } catch (_) { /* старый клиент */ }
    // Время могли занять — обновляем слоты.
    if (f.lawyerId) { f.time = null; state.slots.days = null; loadSlots(f.lawyerId); }
  }
  // Сюда доходим только после ошибки: при успехе кнопка уже стала «Готово».
  state.submitting = false;
  submitBtn.textContent = 'Записаться';
  updateSubmit();
}

function renderDone(booking) {
  const service = state.catalog.services.find((s) => s.id === state.form.serviceId);
  view.replaceChildren(
    h('div', { class: 'done' },
      h('div', { class: 'seal', 'aria-hidden': 'true' }, '✓'),
      h('h2', null, 'Вы записаны'),
      h('p', { class: 'hint' }, `Мы позвоним на ${booking.phone} для подтверждения.`),
      h('div', { class: 'card' },
        h('p', { class: 'when' }, booking.dateLabel, h('small', null, booking.time)),
        h('dl', null,
          h('dt', null, 'Адвокат'), h('dd', null, booking.lawyer),
          service ? [h('dt', null, 'Услуга'), h('dd', null, `${service.title} — ${nbsp(service.priceLabel)}`)] : null,
          h('dt', null, 'Адрес'), h('dd', null, booking.address),
        ),
      ),
    ),
  );
  // Следующая запись начнётся с чистой формы, но с теми же контактами.
  Object.assign(state.form, { category: null, lawyerId: null, serviceId: null, date: null, time: null, phone: booking.phone });
  state.slots = { lawyerId: null, days: null, error: null };
  submitBtn.textContent = 'Готово';
  submitBtn.disabled = false;
  submitBtn.onclick = () => (tg && tg.close ? tg.close() : setTab('mine'));
}

/* ---------- мои записи ---------- */

async function renderMine() {
  bottomBar.hidden = true;
  view.replaceChildren(h('p', { class: 'loading' }, 'Загрузка…'));
  let bookings;
  try {
    ({ bookings } = await api('/bookings/mine'));
  } catch (err) {
    view.replaceChildren(h('p', { class: 'notice' }, err.message));
    return;
  }
  if (state.tab !== 'mine') return;
  if (bookings.length === 0) {
    view.replaceChildren(
      h('div', { class: 'empty' }, h('p', null, 'Записей пока нет.'),
        h('p', { class: 'mt' }, h('button', { class: 'btn-ghost', type: 'button', onclick: () => setTab('book') }, 'Записаться на консультацию'))),
    );
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  view.replaceChildren(...bookings.map((b) => {
    const future = !b.date || b.date >= today;
    return h('article', { class: 'card' },
      h('p', { class: 'when' }, b.dateLabel || 'Дата по согласованию', b.time ? h('small', null, b.time) : null),
      h('dl', null,
        h('dt', null, 'Адвокат'), h('dd', null, b.lawyer),
        h('dt', null, 'Услуга'), h('dd', null, `${b.service} — ${nbsp(b.priceLabel)}`),
        h('dt', null, 'Вид дела'), h('dd', null, b.category),
      ),
      future ? h('div', { class: 'actions' }, h('button', { class: 'btn-danger', type: 'button', onclick: () => cancelBooking(b) }, 'Отменить запись')) : null,
    );
  }));
}

async function cancelBooking(b) {
  const ok = await confirmDialog(`Отменить запись на ${b.dateLabel || 'консультацию'}${b.time ? `, ${b.time}` : ''}?`);
  if (!ok) return;
  try {
    await api(`/bookings/${b.id}/cancel`, { method: 'POST' });
    renderMine();
  } catch (err) {
    view.prepend(h('p', { class: 'form-error' }, err.message));
  }
}

/* ---------- панель адвоката ---------- */

async function renderPanel() {
  bottomBar.hidden = true;
  const scopes = [['upcoming', 'Предстоящие'], ['past', 'Прошедшие']];
  const segmented = h('div', { class: 'segmented' }, scopes.map(([id, label]) => h('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(state.panelScope === id),
    onclick: () => { haptic(); state.panelScope = id; renderPanel(); },
  }, label)));
  view.replaceChildren(segmented, h('p', { class: 'loading' }, 'Загрузка…'));

  let bookings;
  try {
    ({ bookings } = await api(`/panel/bookings?scope=${state.panelScope}`));
  } catch (err) {
    view.replaceChildren(segmented, h('p', { class: 'notice' }, err.message));
    return;
  }
  if (state.tab !== 'panel') return;
  if (bookings.length === 0) {
    view.replaceChildren(segmented, h('p', { class: 'empty' }, state.panelScope === 'upcoming' ? 'Предстоящих консультаций нет.' : 'Прошедших консультаций нет.'));
    return;
  }

  const parts = [segmented];
  let lastDay;
  for (const b of bookings) {
    const day = b.dateLabel || 'Дата по согласованию';
    if (day !== lastDay) { parts.push(h('h3', { class: 'day-head' }, day)); lastDay = day; }
    parts.push(h('article', { class: 'card' },
      h('p', { class: 'when' }, b.time || '—', h('small', null, b.clientName)),
      h('dl', null,
        h('dt', null, 'Телефон'), h('dd', null, h('a', { href: `tel:${b.clientPhone.replace(/[^\d+]/g, '')}` }, b.clientPhone)),
        h('dt', null, 'Вид дела'), h('dd', null, b.category),
        h('dt', null, 'Услуга'), h('dd', null, `${b.service} — ${nbsp(b.priceLabel)}`),
        state.me.isAdmin ? [h('dt', null, 'Адвокат'), h('dd', null, b.lawyer)] : null,
        h('dt', null, 'Заявка'), h('dd', null, formatCreated(b.createdAt)),
      ),
    ));
  }
  view.replaceChildren(...parts);
}

/* ---------- запуск ---------- */

function renderOutsideTelegram() {
  view.replaceChildren(
    h('div', { class: 'notice' },
      h('h2', null, 'Откройте форму в Telegram'),
      h('p', null, 'Запись на консультацию работает через бота коллегии.'),
      h('p', { class: 'mt' }, h('a', { class: 'btn-ghost', href: BOT_LINK }, 'Открыть бота')),
    ),
  );
}

async function init() {
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor('#0b0c0d'); tg.setBackgroundColor('#0b0c0d'); } catch (_) { /* старый клиент */ }
  }
  if (!tg || !tg.initData) { renderOutsideTelegram(); return; }

  try {
    [state.me, state.catalog] = await Promise.all([api('/me'), api('/catalog')]);
  } catch (err) {
    view.replaceChildren(h('p', { class: 'notice' }, err.message));
    return;
  }

  state.form.fullName = state.me.fullName || '';
  state.form.phone = state.me.phone || '';
  if (state.fixedLawyerId && !fixedLawyer()) state.fixedLawyerId = null;
  const fixed = fixedLawyer();
  if (fixed && fixed.categories.length === 1) state.form.category = fixed.categories[0];

  const tabs = document.getElementById('tabs');
  const hasPanel = state.me.isAdmin || state.me.lawyerId !== null;
  tabs.querySelector('[data-tab="panel"]').hidden = !hasPanel;
  tabs.hidden = false;
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (btn && btn.dataset.tab !== state.tab) { haptic(); setTab(btn.dataset.tab); }
  });

  const wanted = params.get('tab');
  setTab(wanted === 'mine' || (wanted === 'panel' && hasPanel) ? wanted : 'book');
}

init();
