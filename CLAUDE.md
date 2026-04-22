# CLAUDE.md — true-aml-fullstack

AML SaaS product (BitOk competitor). Probabilistic graph risk engine for TRON addresses.
AGENTS.md = domain law. Read it first, always.

---

## Stack

- Backend: Node.js 20 + TypeScript + Express + Prisma + PostgreSQL 16
- Frontend: Next.js 14 App Router + React 18 + TypeScript
- Infra: Docker Compose, Railway/Render

---

## Architecture

```
check.routes → check.controller → address-check.service
                                        ↓
                          risk-calculator + transaction-analyzer
                                        ↓
                          blacklist DB + TronScan API + graph edges
```

Ingestion pipeline: `ingestion.service → expansion.service → graph-crawler.service`

---

## Critical Domain Rules (from AGENTS.md — never violate)

1. Derived addresses get SUSPICIOUS, never root category
2. Category priority: SANCTION > STOLEN_FUNDS > RANSOM > DARK_MARKET > SCAM > PHISHING > MIXER > SUSPICIOUS > EXCHANGE
3. Confidence combining: `finalConfidence = 1 - Π(1 - sourceConfidence)`
4. Taint is weighted: `taint += volumeShare * confidence * depthPenalty`
5. SoF comes from TRC20 transfers only, never from generic transactions
6. Empty stablecoin sample ≠ suspicious — show empty state, never fake breakdown
7. When unsure: prefer UNDER-classifying over OVER-classifying

---

## Code Rules

### Backend

- **Transactions**: wrap multi-step DB writes in `prisma.$transaction()`. Partial commits corrupt AML state.
- **Concurrency**: use `mapWithConcurrency` or `p-limit`. Never raw `Promise.all` over large sets.
- **Visited sets**: graph crawl must track visited nodes per batch to prevent cycles.
- **Batch loads**: preload blacklist/candidates/queue into Maps before loops. No N+1.
- **Cron locks**: use in-process flags minimum. TODO: Postgres advisory lock for multi-replica.
- **Error handling**: cron jobs must not silently swallow errors — log with context.
- **No unbounded buffers**: set `maxBodyLength` limits on Axios; don't use `Infinity`.

### API Security

- API key auth: if `API_KEY` env is empty, **refuse all requests** (no bypass).
- CORS: never `*` in production — restrict to known frontend origins via `ALLOWED_ORIGINS` env.
- Add `helmet()` middleware for security headers.
- Rate limit by API key, not just IP.
- Never expose `error.message` from internal errors to clients — use generic messages.
- `debugSof` param requires explicit admin authorization check before enabling.

### Frontend

- API key lives in `localStorage` only for MVP. Flag this as tech debt — move to httpOnly cookie.
- Always handle API errors: auth errors → clear key, rate limit → show retry-after, server → generic message.
- Never use `dangerouslySetInnerHTML`.
- CSS module key lookups must use validated enum values, not raw `.toLowerCase()` on API strings.

### Database

- `txHash` on `TransactionCheck` should be UNIQUE — prevents duplicate records.
- Never overwrite higher confidence or stronger category — use conditional upsert logic.
- Store provenance: `source`, `confidence`, `derivedFrom`, `isDerived` on every blacklist record.

---

## Testing

- Tests live in `backend/src/modules/address-check/__tests__/`
- Run: `npm run test` (from `/backend`)
- Cover: taint formulas, confidence combining, category priority, whitelist suppression
- When fixing risk logic bugs: write a regression test first

---

## Common Mistakes to Avoid

- Using `pathShare * totalVolume` for hop 2 risky volume — wrong formula
- Passing `flags: []` to `isAmlRiskyCounterparty` at hop 2
- Forgetting to update `riskyIncomingVolume` at hop 3+
- Not implementing `1 - Π(1 - confidence)` when merging sources
- Treating `stablecoinIncomingVolume === 0` as suspicious
- Using generic `/api/transaction` for SoF — must use TRC20 transfers endpoint
- Enqueueing graph neighbors without checking visited set

---

## Environment

Required env vars (see `.env.example`):
- `DATABASE_URL` — PostgreSQL connection string
- `API_KEY` — required; empty = all requests rejected
- `TRONGRID_API_KEY` — for TronScan API calls
- `ALLOWED_ORIGINS` — comma-separated CORS origins (e.g. `https://app.yourdomain.com`)

---

## Adding New Data Sources

1. Add loader in `ingestion/` with idempotent upsert (wrap in `prisma.$transaction`)
2. Set `isDerived: false`, correct category, confidence per source quality
3. Add cron entry in `ingestion/cron.ts` with overlap guard
4. Update `sourceProvenance` tracking
5. Add test for confidence merging with existing records

---

## Production Checklist (before shipping)

- [ ] `API_KEY` set and non-empty in prod env
- [ ] `ALLOWED_ORIGINS` set to actual frontend domain
- [ ] `helmet()` middleware added to `app.ts`
- [ ] Structured JSON logging replacing `console.log`
- [ ] `txHash` unique constraint migration applied
- [ ] `debugSof` endpoint protected or removed
- [ ] Postgres advisory lock for cron (multi-replica safety)
- [ ] Visited-set logic in graph crawler
- [ ] Transaction wrapping around expansion `Promise.all`
