# Деплой на сервер

Один docker-compose поднимает всё: **nginx** (сайт из `client/` + прокси к боту), **бот** (`lawyers-bot/`), **PostgreSQL**.

## 1. Подготовка сервера (Ubuntu, один раз)

```bash
sudo apt update && sudo apt install -y git docker.io docker-compose-v2
sudo usermod -aG docker $USER   # перезайти в сессию после этого
```

## 2. Клонирование и настройка

```bash
git clone git@github.com:NoBodyyy-dev/na-storone-zakona.git
cd na-storone-zakona
```

Создать `.env` в корне (пароль базы, файл не хранится в git):

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env
```

Создать `lawyers-bot/.env` (файл не хранится в git):

```bash
cp lawyers-bot/.env.example lawyers-bot/.env   # если примера нет — создать вручную
nano lawyers-bot/.env
```

Минимум переменных:

```
BOT_TOKEN=<токен от @BotFather>
ADMIN_IDS=<telegram id администраторов через запятую>
PORT=3000
TZ_NAME=Europe/Moscow
MAX_ACTIVE_BOOKINGS=2
# Адвокаты: id из таблицы lawyers : Telegram ID (1 — Богданов, 2 — Богданова)
LAWYER_TELEGRAM_IDS=1:<telegram id>,2:<telegram id>
# DATABASE_URL задаётся в docker-compose, в .env можно не указывать
# WEBHOOK_URL — оставить пустым (long polling) или https://ДОМЕН/webhook
# WEBHOOK_SECRET — обязателен вместе с WEBHOOK_URL: openssl rand -hex 32
# TELEGRAM_PROXY_URL — если api.telegram.org недоступен с сервера (см. ниже)
```

Свой Telegram ID адвокат может узнать у @userinfobot.

**Запись идёт через Telegram Mini App** — форма по адресу `https://ДОМЕН/app/`,
её отдаёт бот, nginx проксирует `/app/` и `/api/`. Telegram открывает Mini App
только по HTTPS, поэтому кнопки записи заработают после шага 4 (домен и сертификат).
В @BotFather ничего настраивать не нужно: кнопку «Записаться» в меню бот ставит сам
при запуске. Адвокаты из `LAWYER_TELEGRAM_IDS` видят во вкладке «Заявки» своих
клиентов, администраторы из `ADMIN_IDS` — всех.

**Если Telegram недоступен с сервера**, бот ходит к нему через прокси:
скопировать `deploy/xray/config.example.json` в `deploy/xray/config.json`,
вписать данные VLESS-подключения, в корневой `.env` добавить
`COMPOSE_PROFILES=proxy`, а в `lawyers-bot/.env` — `TELEGRAM_PROXY_URL=socks5://xray:1080`.

**Если база уже была поднята со старым паролем `lawyers_bot`** (volume `db_data`
существует), новый пароль из `.env` сам по себе не применится — Postgres берёт
`POSTGRES_PASSWORD` только при первом создании базы. Смените пароль вручную:

```bash
docker compose exec db psql -U lawyers_bot -c "ALTER USER lawyers_bot PASSWORD '<значение POSTGRES_PASSWORD из .env>';"
docker compose up -d --force-recreate bot
```

Файрвол: наружу должны смотреть только 22, 80 и 443.

```bash
sudo ufw default deny incoming && sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
sudo ss -tlnp   # убедиться, что 5432 и 3000 не слушают на 0.0.0.0
```

## 3. Запуск

```bash
docker compose up -d --build
```

Первый раз — наполнить справочник адвокатов и услуг:

```bash
docker compose exec bot node dist/database/seeds/seed.js
```

Проверка:

```bash
docker compose ps                      # все контейнеры Up
curl http://localhost/health           # {"status":"ok"}
curl -I http://localhost/              # 200, сайт
```

## 4. Домен и HTTPS

1. У регистратора направить A-запись домена на IP сервера.
2. Выпустить сертификат (nginx уже отдаёт `/.well-known/acme-challenge/`):

```bash
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d ДОМЕН -d www.ДОМЕН --email ns-zakona@mail.ru --agree-tos --no-eff-email
```

3. В `deploy/nginx.conf` раскомментировать HTTPS-блок, вписать домен,
   в HTTP-блоке оставить только acme-challenge и `return 301 https://...`.
4. Перезапустить nginx: `docker compose restart nginx`.
5. Продление (сертификат живёт 90 дней) — добавить в crontab:

```
0 4 * * 1 cd /home/USER/na-storone-zakona && docker compose run --rm certbot renew --webroot -w /var/www/certbot && docker compose restart nginx
```

## 5. Обновление сайта/бота

```bash
git pull && docker compose up -d --build
```

Статика (`client/`) примонтирована в nginx напрямую — после `git pull`
изменения сайта видны сразу, пересборка нужна только для бота.
