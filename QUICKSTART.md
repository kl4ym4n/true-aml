# Быстрый старт

## Используйте `docker compose` (без дефиса)

В новых версиях Docker команда `docker-compose` заменена на `docker compose`.

## Запуск

```bash
# Перейдите в папку проекта
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack

# Создайте .env файл
cp .env.example .env
# Отредактируйте .env и добавьте ваши ключи

# Production
docker compose up -d

# Или Development (с hot reload)
docker compose -f docker-compose.dev.yml up -d
```

## Основные команды

```bash
# Просмотр логов
docker compose logs -f

# Остановка
docker compose down

# Пересборка
docker compose build --no-cache
docker compose up -d
```

## Доступ

- Frontend: http://localhost:3001
- Backend: http://localhost:3000
- Health: http://localhost:3000/health

