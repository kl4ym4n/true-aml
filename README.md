# True AML - Full Stack Application

Полнофункциональный AML сервис для TRON блокчейна с веб-интерфейсом.

## Структура проекта

```
true-aml-fullstack/
├── backend/                # Backend (Node.js + Express + Prisma)
├── frontend/               # Frontend (Next.js + React)
├── docker-compose.yml      # Production окружение
├── docker-compose.dev.yml  # Development окружение
└── .env                    # Переменные окружения
```

## Быстрый старт

### 1. Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=true_aml
POSTGRES_PORT=5432

TRONGRID_API_KEY=your_trongrid_api_key_here
API_KEY=your_api_key_here
```

### 2. Запуск в Production

```bash
docker compose up -d
```

### 3. Запуск в Development (с hot reload)

```bash
docker compose -f docker-compose.dev.yml up -d
```

## Доступ к сервисам

После запуска:

- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health
- **PostgreSQL**: localhost:5432

## Компоненты

### Backend (`backend/`)
- Node.js 20 + TypeScript
- Express REST API
- PostgreSQL + Prisma ORM
- TronGrid API интеграция
- AML анализ адресов и транзакций

**API Endpoints:**
- `POST /api/v1/check/address` - Проверка адреса
- `POST /api/v1/check/transaction` - Проверка транзакции
- `GET /health` - Health check

### Frontend (`frontend/`)
- Next.js 14 (App Router)
- React 18 + TypeScript
- CSS Modules
- Интеграция с Backend API

## Полезные команды

### Остановка сервисов

```bash
# Production
docker compose down

# Development
docker compose -f docker-compose.dev.yml down
```

### Пересборка образов

```bash
docker compose build --no-cache
docker compose up -d
```

### Просмотр логов

```bash
# Все сервисы
docker compose logs -f

# Конкретный сервис
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

### Выполнение команд в контейнере

```bash
# Backend shell
docker compose exec backend sh

# Frontend shell
docker compose exec frontend sh

# PostgreSQL
docker compose exec postgres psql -U postgres -d true_aml
```

### Сброс базы данных

```bash
docker compose down -v
docker compose up -d
```

## Разработка

### Локальная разработка (без Docker)

#### Backend:
```bash
cd backend
npm install
cp .env.example .env
# Настройте .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

#### Frontend:
```bash
cd frontend
npm install
cp .env.local.example .env.local
# Установите NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
npm run dev
```

## Документация

- [Backend Docker Setup](./backend/DOCKER.md)
- [Frontend README](./frontend/README.md)

