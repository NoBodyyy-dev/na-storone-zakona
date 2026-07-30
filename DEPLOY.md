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

Создать `lawyers-bot/.env` (файл не хранится в git):

```bash
cp lawyers-bot/.env.example lawyers-bot/.env   # если примера нет — создать вручную
nano lawyers-bot/.env
```

Минимум переменных:

```
BOT_TOKEN=<токен от @BotFather>
PORT=3000
TZ_NAME=Europe/Moscow
# DATABASE_URL задаётся в docker-compose, в .env можно не указывать
# WEBHOOK_URL — оставить пустым (long polling) или https://ДОМЕН/webhook
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
