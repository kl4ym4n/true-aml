# Деплой True AML на Railway

Railway обычно выходит дешевле Render при сопоставимом стеке (Node + Postgres + два сервиса).

## 1. Проект и репозиторий

1. Зайди на [railway.app](https://railway.app), войди через GitHub.
2. **New Project** → **Deploy from GitHub repo**.
3. Выбери репозиторий и ветку (например `main`).

Пока что создаётся один сервис из корня репозитория — его мы потом заменим на монорепо с тремя сервисами.

## 2. Добавить PostgreSQL

1. В проекте нажми **+ New** → **Database** → **PostgreSQL**.
2. Railway создаст базу и добавит переменную **`DATABASE_URL`** в проект (или в сервис, к которому привязана база).

Если `DATABASE_URL` видна только у базы: в настройках базы открой **Variables** и при необходимости скопируй `DATABASE_URL`, чтобы подставить в бэкенд (см. ниже). Либо добавь бэкенд-сервис и привяжи к нему базу — тогда Railway подставит `DATABASE_URL` в бэкенд сам.

## 3. Настроить сервисы (монорепо)

Нужны три сущности в одном проекте: **PostgreSQL**, **Backend**, **Frontend**.

### Вариант A: из одного репо (рекомендуется)

1. **Backend**
   - **+ New** → **GitHub Repo** → тот же репозиторий.
   - В настройках сервиса: **Settings** → **Root Directory** → укажи **`backend`**.
   - **Settings** → **Build** — Railway подхватит `backend/Dockerfile` (или `backend/railway.json`).
   - **Variables**: добавь переменные (или подключи базу, чтобы подтянулся `DATABASE_URL`):
     - `NODE_ENV` = `production`
     - `DATABASE_URL` — из PostgreSQL (часто подставляется автоматически, если база в том же проекте и привязана к сервису)
     - `TRONGRID_API_KEY`, `TRONSCAN_API_KEY`, `BLOCKCHAIN_PROVIDER` = `tronscan`, `API_KEY` — свои значения.
   - **Settings** → **Networking** → **Generate Domain** — получишь URL бэкенда, например `https://xxx.up.railway.app`.

2. **Frontend**
   - **+ New** → **GitHub Repo** → тот же репозиторий.
   - **Root Directory** → **`frontend`**.
   - **Variables**:
     - `NODE_ENV` = `production`
     - **`NEXT_PUBLIC_API_BASE_URL`** = URL бэкенда из шага 1 (например `https://xxx.up.railway.app`).  
       Важно: без слеша в конце и без пути вроде `/api` — только корень бэкенда.
   - **Networking** → **Generate Domain** — получишь URL фронта.

3. **Связать базу с бэкендом**  
   В проекте открой PostgreSQL → **Variables** → скопируй `DATABASE_URL`. В сервисе Backend → **Variables** добавь/вставь `DATABASE_URL`. Либо в Backend в **Variables** нажми **Add variable** → **Add a reference** и выбери переменную базы (если Railway показывает ссылку на другой ресурс).

## 4. Конфиг в коде

- **backend/railway.json** — сборка по Dockerfile, перед стартом выполняется `npx prisma migrate deploy`, healthcheck `/health`.
- **frontend/railway.json** — сборка по Dockerfile, старт `node server.js` (Next.js standalone).

При наличии Dockerfile в `backend` и `frontend` Railway по умолчанию использует их; `railway.json` уточняет pre-deploy и healthcheck.

## 5. После деплоя

- **Backend:** `https://<твой-бэкенд>.up.railway.app`  
  Проверка: `GET /health`.
- **Frontend:** `https://<твой-фронт>.up.railway.app`  
  В настройках фронта должен быть задан `NEXT_PUBLIC_API_BASE_URL` на URL бэкенда (и пересобран фронт после первого деплоя бэкенда, если URL добавляли позже).

## 6. Если меняешь URL бэкенда

Поменял домен бэкенда или пересоздал сервис → обнови в сервисе Frontend переменную **`NEXT_PUBLIC_API_BASE_URL`** и сделай **Redeploy** фронта (пересборка нужна, т.к. значение зашивается в билд).

## 7. Стоимость

На Railway тарификация по использованию (CPU/RAM/сеть). Один небольшой Postgres + два небольших сервиса обычно укладываются в бесплатный лимит или в пару долларов в месяц. Точные лимиты смотри на [railway.app/pricing](https://railway.app/pricing).
