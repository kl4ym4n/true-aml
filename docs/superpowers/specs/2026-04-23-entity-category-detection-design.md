# Entity Category Detection Design

## Goal

Add detection of gambling, high-risk exchanges, terrorist financing, and child exploitation addresses to the AML risk engine. Source: Entity Platform Database (manually curated) + behavioral heuristics via existing graph expansion.

## Background

Current system has three buckets (trusted/suspicious/dangerous) with sub-labels. `BlacklistCategory` enum lacks GAMBLING, HIGH_RISK_EXCHANGE, TERRORIST_FINANCING, CHILD_EXPLOITATION. Without these categories, risk reports can't distinguish gambling exposure from generic "dangerous" — which is a gap vs. BitOk.

Frontend `SourceBreakdown` component already renders dangerous sub-labels dynamically — no UI changes needed.

---

## 1. Schema Changes

### New BlacklistCategory values

```prisma
enum BlacklistCategory {
  // existing
  SCAM
  SANCTION
  STOLEN_FUNDS
  RANSOM
  DARK_MARKET
  MIXER
  EXCHANGE
  PHISHING
  SUSPICIOUS
  // new
  GAMBLING
  HIGH_RISK_EXCHANGE
  TERRORIST_FINANCING
  CHILD_EXPLOITATION
}
```

### New table: KnownPlatform

```prisma
model KnownPlatform {
  id                 String            @id @default(cuid())
  name               String            // "WINk", "Garantex", "JustBet"
  category           BlacklistCategory
  chain              String            @default("TRON")
  contractAddresses  String[]          // smart contract addresses
  hotWalletAddresses String[]          // deposit/withdrawal wallets
  confidence         Float             @default(0.9)
  source             String            // "manual", "chainabuse", etc.
  notes              String?
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt

  @@index([category])
  @@index([chain])
}
```

**Role:** master data, manually curated. Not derived. Feeds into `BlacklistedAddress` via ingestion.

---

## 2. Ingestion Pipeline

### New loader: `known-platforms.loader.ts`

Location: `backend/src/modules/ingestion/known-platforms.loader.ts`

Reads all `KnownPlatform` rows, upserts each address into `BlacklistedAddress`:
- `contractAddresses + hotWalletAddresses` → individual rows
- `isDerived = false` (direct source)
- `category` = platform category
- `confidence` = platform confidence
- `source` = platform name
- `entityType` = mapped from category:
  - GAMBLING → `"gambling"`
  - HIGH_RISK_EXCHANGE → `"exchange"`
  - TERRORIST_FINANCING → `"sanctions"`
  - CHILD_EXPLOITATION → `"scam"`

Runs inside existing `cronIngestion` — no new cron needed.

### Category priority

New categories fit existing priority chain:

```
SANCTION > STOLEN_FUNDS > RANSOM > DARK_MARKET > SCAM > TERRORIST_FINANCING
> CHILD_EXPLOITATION > PHISHING > GAMBLING > HIGH_RISK_EXCHANGE > MIXER
> SUSPICIOUS > EXCHANGE
```

`mergeCategoryForExpansion()` must be updated to respect this order.

---

## 3. Expansion / Crawler Integration

### KnownPlatform hot-lookup cache

At service startup, load all `KnownPlatform` contract + wallet addresses into an in-memory `Map<address, BlacklistCategory>`. TTL = ingestion cron interval (refresh after each ingestion run).

### Updated expansion logic (`expansion.service.ts`)

Before assigning `SUSPICIOUS` to a derived address, check in order:

```
1. Direct KnownPlatform match (address in hot-lookup cache)
   → assign platform category, isDerived=true, confidence reduced by depth penalty
2. Gambling heuristic (see below)
   → assign GAMBLING, isDerived=true, confidence = 0.4
3. Fallback → SUSPICIOUS (unchanged)
```

### Gambling heuristic

```typescript
function inferGamblingSignal(
  address: string,
  stats: {
    topCounterparties: string[];
    fanIn: boolean;
    uniqueCounterpartyCount: number;
    avgIncomingAmount: number;   // USD
    avgOutgoingAmount: number;   // USD
  },
  gamblingContractSet: Set<string>
): boolean {
  // Signal 1: direct interaction with known gambling contract
  if (stats.topCounterparties.some(a => gamblingContractSet.has(a))) return true;

  // Signal 2: behavioral pattern (many small ins, rare large outs)
  return (
    stats.fanIn &&
    stats.uniqueCounterpartyCount > 50 &&
    stats.avgOutgoingAmount > stats.avgIncomingAmount * 5
  );
}
```

High-risk exchange detection: direct KnownPlatform match only — no behavioral heuristic (CEX behavior overlaps with legitimate exchanges).

---

## 4. Seed Script

Location: `backend/src/scripts/seed-known-platforms.ts`

Standalone script (`npm run seed:platforms`) that inserts placeholder records. Operators fill real addresses from blockchain explorers / platform docs before running in prod.

Initial platforms (placeholders — addresses must be verified before prod use):

| Name | Category | Notes |
|------|----------|-------|
| WINk | GAMBLING | TRON gambling dApp, WIN token |
| JustBet | GAMBLING | TRON betting platform |
| SunPump Gambling | GAMBLING | TRON meme/gambling pools |
| Garantex | HIGH_RISK_EXCHANGE | OFAC sanctioned, RU exchange |
| Bitzlato | HIGH_RISK_EXCHANGE | OFAC sanctioned |
| SUEX | HIGH_RISK_EXCHANGE | OFAC sanctioned, TRON deposits known |

Script is idempotent (upsert by name + chain).

---

## 5. EntityType Mapping

`ENTITY_RISK_WEIGHT` in `advanced-risk.constants.ts` already has `gambling: 0.58`. No change needed — taint calculation already weights gambling correctly.

`source-bucket-classifier.ts` already has "Gambling" as a dangerous sub-label. No change needed — new `GAMBLING` category will automatically map to this label.

---

## 6. What's NOT in scope

- Frontend UI changes (existing SourceBreakdown handles new sub-labels dynamically)
- Admin UI for managing KnownPlatform (manual DB edits / seed script is sufficient for now)
- Automated scraping of gambling platform addresses
- CHILD_EXPLOITATION heuristics (direct match only — no behavioral inference)

---

## 7. Files Changed

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Add 4 enum values + KnownPlatform model |
| `backend/prisma/migrations/` | Auto-generated migration |
| `backend/src/modules/ingestion/known-platforms.loader.ts` | New file |
| `backend/src/modules/ingestion/ingestion.service.ts` | Call known-platforms loader in cron |
| `backend/src/modules/ingestion/expansion.service.ts` | KnownPlatform lookup + gambling heuristic |
| `backend/src/modules/address-check/address-check.utils/trusted-source-semantics.ts` | Add new categories to DANGEROUS_BLACKLIST_CATEGORIES |
| `backend/src/modules/ingestion/ingestion.utils.ts` | Update mergeCategoryForExpansion priority |
| `backend/src/scripts/seed-known-platforms.ts` | New seed script |
| `backend/package.json` | Add `seed:platforms` script |
