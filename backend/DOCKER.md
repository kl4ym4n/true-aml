# Docker Setup Guide

## Quick Start

### Production

```bash
# Build and start services
docker compose up -d

# View logs
docker compose logs -f app

# Stop services
docker compose down

# Stop and remove volumes
docker compose down -v
```

### Development (with hot reload)

```bash
# Build and start services with hot reload
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f app

# Stop services
docker compose -f docker-compose.dev.yml down
```

## Environment Variables

Create a `.env` file in the project root with the following variables:

```env
PORT=3000
NODE_ENV=production

POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=true_aml
POSTGRES_PORT=5432

TRONGRID_API_KEY=your_trongrid_api_key_here
API_KEY=your_api_key_here
```

## Services

### Production (`docker-compose.yml`)

- **app**: Production Node.js application
  - Multi-stage build
  - Optimized for size
  - Runs as non-root user
  - Health checks enabled

- **postgres**: PostgreSQL 16 database
  - Persistent volume
  - Health checks enabled

### Development (`docker-compose.dev.yml`)

- **app**: Development Node.js application
  - Hot reload enabled (tsx watch)
  - Source code mounted as volume
  - All dependencies included

- **postgres**: PostgreSQL 16 database
  - Separate volume for dev data

## Database Migrations

Migrations run automatically on container start in production mode.

For development, run manually:

```bash
docker compose -f docker-compose.dev.yml exec app npx prisma migrate dev
```

## Prisma Studio

Access Prisma Studio in development:

```bash
docker compose -f docker-compose.dev.yml exec app npx prisma studio
```

Then access at `http://localhost:5555`

## Troubleshooting

### Reset database

```bash
docker compose down -v
docker compose up -d
```

### View logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f app
docker compose logs -f postgres
```

### Execute commands in container

```bash
docker compose exec app sh
docker compose exec postgres psql -U postgres -d true_aml
```

