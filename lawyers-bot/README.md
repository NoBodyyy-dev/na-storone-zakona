# Telegram-бот записи на консультацию — КА «На стороне Закона»

Бот на Express + Grammy + PostgreSQL для записи клиентов на консультацию к адвокатам.

## Возможности

- **Запись — в Telegram Mini App** (`webapp/`, открывается по адресу `/app/`). Одна форма вместо пошагового диалога: вид дела → адвокат (только те, кто ведёт такие дела) → консультация → дата и время → ФИО, телефон и согласие на обработку персональных данных. Вкладка «Мои записи» — свои записи и их отмена.
- **Панель адвоката** — вкладка «Заявки» в той же Mini App: адвокат из `LAWYER_TELEGRAM_IDS` видит предстоящие и прошедшие консультации своих клиентов с телефоном, администратор из `ADMIN_IDS` — всех адвокатов.
- Пользователя API узнаёт только по подписанной Telegram `initData` (`src/webapp/initData.ts`), её проверка — в каждом запросе к `/api/*`.
- **Бот — справочный**: `/start` с эмблемой, «О коллегии», «Контакты», «Официальный сайт» и кнопки, открывающие форму. Кнопку «Записаться» в меню чата бот ставит сам при запуске (только при HTTPS-адресе `WEBAPP_URL`).
- Ссылки с сайта: `?start=lawyer1` / `?start=lawyer2` открывают форму с уже выбранным адвокатом (`/app/?lawyer=1`), `?start=booking` — обычную форму.
- Виды дел — те же четыре раздела, что и в официальном прайс-листе: гражданские и административные дела (КАС РФ), дела об административных правонарушениях, арбитражные, уголовные. По каждому — два варианта консультации (устная по правовым вопросам / устная с изучением документов) со своей ценой; на кнопке видно и название, и цену.
- Расписание: приём по будням, слоты по часу с 09:00 до 18:00 (последний — 17:00). Дата выбирается в окне **10 дней** вперёд (`BOOKING_WINDOW_DAYS`); занятые слоты, выходные, нерабочие дни из `schedule_exceptions` и слоты, до которых осталось меньше 2 часов, скрываются (`schedule.service`).
- Двойная запись на один слот исключена на уровне БД (частичный уникальный индекс). Если слот заняли, пока клиент заполнял форму, она показывает ошибку и обновлённый список времени.
- Уведомление о каждой новой заявке — администраторам и адвокату, к которому записался клиент; клиенту — подтверждение в чат.
- Панель администратора в Telegram: `/admin` — консультации на сегодня, заявки за сегодня и за 7 дней, статистика по адвокатам.

## Прайс консультаций

| Вид дела | Устная консультация | С изучением документов |
| --- | --- | --- |
| Гражданские и административные дела (КАС РФ) | от 10 000 ₽ | от 15 000 ₽ |
| Дела об административных правонарушениях | от 5 000 ₽ | от 10 000 ₽ |
| Арбитражные дела | от 10 000 ₽ | от 25 000 ₽ |
| Уголовные дела | от 10 000 ₽ | от 15 000 ₽ |

Цены соответствуют официальному прайс-листу коллегии и странице «Цены» на сайте. Живут в миграции `005_official_consultations.sql` (таблица `services`, поиск по `slug`) — чтобы изменить прайс, добавьте новую миграцию с `UPDATE services SET price_label = ... WHERE slug = ...`.

## Стек

Express · Grammy · PostgreSQL (`pg`, без ORM) · TypeScript (strict) · Repository Pattern · Service Layer · Pino · Jest.

## Структура проекта

```
src/
  app.ts                 — точка входа
  server.ts              — Express (health-check, webhook, /api и /app)
  webapp/                — API Mini App и проверка initData
  bot/                   — Grammy: bot.ts, commands, handlers, keyboards, utils
  database/              — db.ts, migrations, repositories, seeds
  services/              — lawyer, booking, schedule, notification
  types/                 — общие типы
  config/                — env.ts
  logger/                — logger.ts
  __tests__/             — unit-тесты
```

## Локальный запуск

1. Скопируйте `.env.example` в `.env` и заполните `BOT_TOKEN` (получить у [@BotFather](https://t.me/BotFather)) и `ADMIN_IDS` (Telegram ID администраторов, через запятую).
2. Поднимите Postgres для разработки (порт только на localhost, пароль должен совпадать с `DATABASE_URL` в `.env`):

```bash
docker run -d --name nsz-pg -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=lawyers_bot -e POSTGRES_PASSWORD=lawyers_bot -e POSTGRES_DB=lawyers_bot postgres:16-alpine
```

3. Установите зависимости и накатите миграции с сид-данными:

```bash
npm install
npm run build
npm run migrate
npm run seed
```

4. Запустите бота в режиме разработки:

```bash
npm run dev
```

Без `WEBHOOK_URL` в `.env` бот работает в режиме long polling — этого достаточно для локальной разработки и небольшой нагрузки.

## Продакшен-деплой (Docker)

Боевой `docker-compose.yml` лежит в корне репозитория (nginx + бот + Postgres), подробности — в `DEPLOY.md`.

1. На сервере создайте `lawyers-bot/.env` (см. `.env.example`), укажите боевой `BOT_TOKEN` и `ADMIN_IDS`, а в корневом `.env` — `POSTGRES_PASSWORD`.
2. Если бот будет работать через webhook, укажите `WEBHOOK_URL=https://ваш-домен/webhook` и обязательно `WEBHOOK_SECRET` (`openssl rand -hex 32`): без секрета любой сможет слать боту поддельные апдейты от имени администраторов. nginx из `deploy/nginx.conf` пропускает на `/webhook` только POST с адресов Telegram.
3. Соберите и запустите из корня репозитория:

```bash
docker compose up -d --build
```

4. Примените миграции и сиды внутри контейнера бота:

```bash
docker compose exec bot node dist/database/migrate.js
docker compose exec bot node dist/database/seeds/seed.js
```

5. Проверьте здоровье сервиса: `curl http://localhost:3000/health`.

### Обновление версии

```bash
git pull
docker compose up -d --build bot
docker compose exec bot node dist/database/migrate.js
```

Миграции идемпотентны (таблица `schema_migrations` фиксирует применённые версии), сиды не дублируют данные при повторном запуске.

## Тесты и линтинг

```bash
npm test        # jest: валидаторы, подбор адвоката, слоты расписания
npm run lint
npm run format
```

## Переменные окружения

См. `.env.example`. Ключевые:

- `BOT_TOKEN` — токен бота от BotFather.
- `DATABASE_URL` — строка подключения к PostgreSQL.
- `ADMIN_IDS` — Telegram ID администраторов (через запятую) для доступа к `/admin` и уведомлений о новых заявках.
- `WEBHOOK_URL` — если задан, бот работает через webhook вместо long polling.
