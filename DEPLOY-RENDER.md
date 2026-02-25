# Деплой True AML на Render (Hobby)

## 1. Репозиторий

Убедись, что проект в Git и запушен на GitHub/GitLab. Render подключается к репозиторию по ссылке.

## 2. Создание сервисов из Blueprint

1. Зайди на [dashboard.render.com](https://dashboard.render.com).
2. **New** → **Blueprint**.
3. Подключи репозиторий (GitHub/GitLab), выбери ветку (например `main`).
4. Render подхватит `render.yaml` из корня и предложит создать:
   - базу **PostgreSQL** (`true-aml-db`);
   - **Web Service** бэкенда (`true-aml-backend`);
   - **Web Service** фронта (`true-aml-frontend`).

5. Нажми **Apply**.

## 3. Секреты (sync: false)

Для переменных с `sync: false` Render попросит ввести значение вручную при первом применении Blueprint (или потом в настройках сервиса):

- **true-aml-backend**
  - `TRONGRID_API_KEY` — ключ TronGrid.
  - `TRONSCAN_API_KEY` — ключ TronScan.
  - `API_KEY` — твой API-ключ для доступа к API (тот же, что в `.env` локально).

Их нужно задать в **Dashboard** → сервис **true-aml-backend** → **Environment** → **Add Environment Variable**.

## 4. Планы (Hobby)

В `render.yaml` указано:

- `databases.plan: basic-256mb` — актуальный план БД (можно поставить `free` на 30 дней для теста).
- `services[].plan: starter` — оба веб-сервиса.

На Hobby можно оставить **Starter** для backend и frontend. План базы можно поменять в **Dashboard** → **true-aml-db** → **Settings**.

## 5. После первого деплоя

- **Backend:**  
  `https://true-aml-backend.onrender.com`  
  (или свой домен, если настроишь в Render.)

- **Frontend:**  
  `https://true-aml-frontend.onrender.com`  
  В нём уже прописан `NEXT_PUBLIC_API_BASE_URL=https://true-aml-backend.onrender.com` из `render.yaml`.

Если переименуешь бэкенд-сервис, обнови `NEXT_PUBLIC_API_BASE_URL` у фронта и сделай **Manual Deploy** (пересборка), чтобы переменная попала в билд.

## 6. Полезное

- **Логи:** Dashboard → сервис → **Logs**.
- **Переменные:** Dashboard → сервис → **Environment**.
- **Ручной деплой:** **Manual Deploy** → **Deploy latest commit**.
- На бесплатном плане сервисы могут засыпать после неактивности; на Starter они остаются включёнными.

## 7. Локальная проверка перед деплоем

```bash
# Сборка бэкенда
cd backend && npm ci && npx prisma generate && npm run build

# Сборка фронта (с URL бэкенда)
cd frontend && npm ci && NEXT_PUBLIC_API_BASE_URL=https://true-aml-backend.onrender.com npm run build
```

Если оба билда проходят, деплой на Render по этому Blueprint должен проходить без ошибок.
