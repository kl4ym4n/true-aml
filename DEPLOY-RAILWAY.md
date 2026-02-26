# Деплой True AML на Railway

В одном проекте Railway будет **три сервиса**: база Postgres, бэкенд (API), фронт (Next.js). Бэкенд и фронт — два отдельных сервиса из одного и того же репозитория, с разными папками (Root Directory).

---

## Шаг 0. Что нужно заранее

- Репозиторий на GitHub (или GitLab), код запушен.
- Аккаунт на [railway.app](https://railway.app).

---

## Шаг 1. Создать проект и базу

1. Зайди на [railway.app](https://railway.app) → **Login** → **New Project**.
2. Выбери **Deploy from GitHub repo** и подключи репозиторий `true-aml-fullstack` (и ветку, например `main`).  
   Либо **Empty Project**, если репо подключишь позже вручную.
3. В проекте нажми **+ New** → **Database** → **PostgreSQL**.  
   Railway создаст базу и покажет переменные. Имя сервиса будет что-то вроде **Postgres** — запомни его.

Пока что в проекте один сервис — база. Бэкенд и фронт добавим отдельно.

---

## Шаг 2. Добавить бэкенд (второй сервис)

1. В том же проекте снова **+ New** → **GitHub Repo** (или **Empty Service**, если репо уже привязан к проекту).
2. Выбери **тот же репозиторий** `true-aml-fullstack`.
3. Откроется карточка нового сервиса. Зайди в **Settings**:
   - **Root Directory** — поставь **`backend`** (именно папка `backend` в корне репо).  
     Тогда Railway будет собирать только содержимое `backend/` и использовать `backend/Dockerfile` и `backend/railway.json`.
   - Убедись, что **Build** → **Builder** = **Dockerfile** (не Nixpacks и не Railpack, если хочешь собирать через Docker).
4. **Variables** (переменные окружения):
   - **DATABASE_URL**: нажми **Add variable** → **Add reference** → выбери сервис **Postgres** → переменная **DATABASE_URL**.  
     Либо скопируй значение `DATABASE_URL` из карточки Postgres и вставь вручную.
   - Добавь остальное вручную:
     - `TRONGRID_API_KEY` — твой ключ TronGrid
     - `TRONSCAN_API_KEY` — ключ TronScan
     - `BLOCKCHAIN_PROVIDER` = `tronscan`
     - `API_KEY` — любой секретный ключ (например из `.env` локально)
     - при желании `NODE_ENV` = `production`
5. **Settings** → **Networking** → **Generate Domain**.  
   Скопируй URL бэкенда, например: `https://xxx.up.railway.app` — он понадобится для фронта.

После пуша в репо или по кнопке **Deploy** Railway соберёт образ из `backend/Dockerfile` и запустит контейнер. В логах должны пройти миграции (`npx prisma migrate deploy`) и старт `node dist/index.js`. Healthcheck: `https://твой-бэкенд-url/health`.

---

## Шаг 3. Добавить фронт (третий сервис)

1. Снова **+ New** → **GitHub Repo** → тот же репозиторий `true-aml-fullstack`.
2. В настройках **нового** сервиса (**Settings**):
   - **Root Directory** — поставь **`frontend`**.  
     Тогда Railway будет собирать только `frontend/` и использовать `frontend/Dockerfile` и `frontend/railway.json`.
   - **Build** → **Builder** = **Dockerfile**.
3. **Variables**:
   - **NEXT_PUBLIC_API_BASE_URL** = URL бэкенда **без слэша в конце**, например:  
     `https://xxx.up.railway.app`
   - при желании `NODE_ENV` = `production`
4. **Settings** → **Networking** → **Generate Domain** — получишь URL фронта.

Сборка пойдёт по `frontend/Dockerfile` (Next.js standalone), старт — `node server.js`. Важно: если потом поменяешь URL бэкенда, обнови `NEXT_PUBLIC_API_BASE_URL` и сделай **Redeploy** фронта, иначе запросы уйдут на старый адрес.

---

## Итог: что где лежит

| Сервис   | Root Directory | Сборка              | Старт / что делает        |
|----------|----------------|---------------------|---------------------------|
| Postgres | —              | образ от Railway    | база данных               |
| Backend  | `backend`      | `backend/Dockerfile`| миграции + `node dist/index.js` |
| Frontend | `frontend`     | `frontend/Dockerfile`| `node server.js` (Next.js) |

Общего Dockerfile в корне репо нет — и не нужен: у каждого сервиса свой контекст (`backend/` или `frontend/`).

---

## Полезные ссылки и действия

- **Логи:** карточка сервиса → **Deployments** → выбери деплой → **View Logs**.
- **Переменные:** карточка сервиса → **Variables**.
- **Ручной редеплой:** **Deployments** → **Redeploy**.

Если бэкенд не стартует — проверь `DATABASE_URL` и логи (миграции). Если фронт не видит API — проверь `NEXT_PUBLIC_API_BASE_URL` и сделай Redeploy фронта после изменения переменной.

---

## Альтернатива: Railpack вместо Dockerfile

В `backend/` и `frontend/` есть также `railpack.json`. Если в **Settings** → **Build** → **Builder** выбрать **Railpack**, Railway будет собирать по этим конфигам (без Dockerfile). Root Directory по-прежнему `backend` или `frontend`. Для фронта при Railpack можно задать переменные `PORT=3001` и `HOSTNAME=0.0.0.0`.
