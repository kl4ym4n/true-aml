# Light AML Frontend

Production-ready Next.js frontend for the Light AML service.

## Tech Stack

- Next.js 14 (App Router)
- React 18
- TypeScript
- CSS Modules
- Axios
- Zod

## Getting Started

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
NEXT_PUBLIC_API_KEY=your-api-key-here  # Optional
```

### Development

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

### Production Build

```bash
npm run build
npm start
```

### Seeding Database

To seed the AML service database with demo data (blacklisted addresses and example transaction checks):

```bash
npm run seed
```

The script will:
- Seed 10 blacklisted addresses across various categories (SANCTIONS, MIXER, SCAM, DARKNET, RANSOMWARE, THEFT, MONEY_LAUNDERING, TERRORISM)
- Seed 8 example transaction checks with varying risk levels

**Environment Variables for Seeding:**

```env
API_BASE_URL=http://localhost:3000  # Backend API URL
API_KEY=your-api-key-here           # Optional API key for admin endpoints
```

**Note:** The seed script assumes your backend API has the following admin endpoints:
- `POST /api/v1/admin/blacklist` - Add blacklisted address
- `POST /api/v1/admin/transactions` - Add transaction check

If your backend uses different endpoints, modify `scripts/seed.ts` accordingly.

## Project Structure

```
├── app/
│   ├── layout.tsx          # Root layout with header
│   ├── page.tsx             # Main dashboard page
│   └── *.module.css         # Page styles
├── components/
│   ├── Tabs/                # Tab component
│   ├── RiskBadge/           # Risk level badge
│   ├── ResultCard/          # Result display card
│   ├── Loader/              # Loading spinner
│   └── CopyButton/          # Copy to clipboard button
├── lib/
│   ├── api.ts               # API client
│   └── types.ts             # TypeScript types
├── scripts/
│   └── seed.ts              # Database seed script
└── styles/
    └── reset.css            # CSS reset
```

## Features

- ✅ Address risk checking
- ✅ Transaction risk checking
- ✅ Real-time API integration
- ✅ Error handling
- ✅ Loading states
- ✅ Copy-to-clipboard for addresses
- ✅ Responsive design
- ✅ Type-safe API calls

