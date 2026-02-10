# True AML Service

A lightweight Anti-Money Laundering (AML) service backend built with Node.js, TypeScript, and Express.

## Tech Stack

- **Node.js 20**
- **TypeScript**
- **Express**
- **PostgreSQL** (via Prisma)
- **Axios**
- **Docker**

## Project Structure

```
true-aml/
├── src/
│   ├── config/          # Configuration files
│   │   ├── env.ts       # Environment variables
│   │   └── database.ts  # Prisma client
│   ├── lib/             # Shared utilities
│   │   └── errors.ts    # Custom error classes
│   ├── middleware/      # Express middleware
│   │   └── errorHandler.ts
│   ├── modules/         # Feature modules
│   │   └── health/
│   │       ├── health.controller.ts
│   │       └── health.routes.ts
│   ├── app.ts           # Express app setup
│   └── index.ts         # Entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL (or use Docker)
- npm or yarn

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:
- `PORT`: Server port (default: 3000)
- `DATABASE_URL`: PostgreSQL connection string
- `TRONGRID_API_KEY`: Your TronGrid API key

3. Set up the database:

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

4. Start the development server:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## Docker Setup

### Using Docker Compose

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

### Using Docker only

```bash
# Build image
docker build -t true-aml .

# Run container
docker run -p 3000:3000 --env-file .env true-aml
```

## API Endpoints

### Health Check

```bash
GET /health
```

Returns server health status and database connection status.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "uptime": 123.456
  }
}
```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio

## Development

The project uses:
- **ESLint** for code linting
- **Prettier** for code formatting
- **TypeScript** for type safety
- **Prisma** for database management

## License

ISC


