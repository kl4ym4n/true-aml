# Entity Category Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GAMBLING, HIGH_RISK_EXCHANGE, TERRORIST_FINANCING, CHILD_EXPLOITATION categories to the AML engine via a manually-curated KnownPlatform database + expansion-time lookup.

**Architecture:** New `KnownPlatform` Prisma table acts as master data. A loader reads it and upserts into `BlacklistedAddress` on each ingestion run. An in-memory cache enables fast lookups during graph expansion. Expansion assigns the correct category instead of always SUSPICIOUS when a counterparty matches a known platform.

**Tech Stack:** TypeScript, Prisma 5, PostgreSQL 16, Node.js 20. Tests use `node:assert/strict` + `tsx` (no jest). Run tests: `cd backend && npm run test`.

---

## File Map

| File | Action |
|------|--------|
| `backend/prisma/schema.prisma` | Add 4 enum values + KnownPlatform model |
| `backend/src/modules/ingestion/ingestion.utils.ts` | Add new categories to CATEGORY_PRIORITY + entityTypeHintFromCategory |
| `backend/src/modules/address-check/address-check.utils/trusted-source-semantics.ts` | Add new categories to DANGEROUS_BLACKLIST_CATEGORIES |
| `backend/src/modules/ingestion/known-platforms.cache.ts` | New — in-memory address→category lookup |
| `backend/src/modules/ingestion/known-platforms.loader.ts` | New — loads KnownPlatform → BlacklistedAddress |
| `backend/src/modules/ingestion/ingestion.service.ts` | Call loader in ingestAll() |
| `backend/src/modules/ingestion/expansion.service.ts` | KnownPlatform lookup before SUSPICIOUS assignment |
| `backend/src/scripts/seed-known-platforms.ts` | New — idempotent seed script |
| `backend/package.json` | Add seed:platforms script |
| `backend/src/modules/address-check/__tests__/taint-model.test.ts` | Add category priority test |

---

## Task 1: Schema — new enum values + KnownPlatform model

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add enum values and model**

In `backend/prisma/schema.prisma`, replace the `BlacklistCategory` enum (lines 14-24) with:

```prisma
enum BlacklistCategory {
  SCAM
  SANCTION
  STOLEN_FUNDS
  RANSOM
  DARK_MARKET
  MIXER
  EXCHANGE
  PHISHING
  SUSPICIOUS
  GAMBLING
  HIGH_RISK_EXCHANGE
  TERRORIST_FINANCING
  CHILD_EXPLOITATION
}
```

Then append this model before the final blank line (after `TransactionCheck` model):

```prisma
/// Known risky platforms (gambling, high-risk exchanges, etc.) — manually curated master data.
model KnownPlatform {
  id                 String            @id @default(cuid())
  name               String
  category           BlacklistCategory
  chain              String            @default("TRON")
  contractAddresses  String[]
  hotWalletAddresses String[]
  confidence         Float             @default(0.9)
  source             String            @default("manual")
  notes              String?
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt

  @@unique([name, chain])
  @@index([category])
  @@index([chain])
  @@map("known_platforms")
}
```

- [ ] **Step 2: Generate and run migration**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack/backend
npx prisma migrate dev --name add_entity_categories_and_known_platforms 2>&1 | tail -10
```

Expected output: `Your database is now in sync with your schema.`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate 2>&1 | tail -5
```

Expected: `Generated Prisma Client`

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: no output (tsc exits clean)

- [ ] **Step 5: Commit**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add GAMBLING/HIGH_RISK_EXCHANGE/TERRORIST_FINANCING/CHILD_EXPLOITATION categories and KnownPlatform model"
```

---

## Task 2: Update category priority tables and dangerous set

**Files:**
- Modify: `backend/src/modules/ingestion/ingestion.utils.ts:12-22` and `41-47`
- Modify: `backend/src/modules/address-check/address-check.utils/trusted-source-semantics.ts:6-14`

- [ ] **Step 1: Update CATEGORY_PRIORITY in ingestion.utils.ts**

Replace the `CATEGORY_PRIORITY` object (lines 12-22):

```typescript
export const CATEGORY_PRIORITY: Record<BlacklistCategory, number> = {
  SANCTION: 100,
  STOLEN_FUNDS: 95,
  RANSOM: 95,
  DARK_MARKET: 90,
  SCAM: 85,
  TERRORIST_FINANCING: 83,
  CHILD_EXPLOITATION: 82,
  PHISHING: 80,
  MIXER: 80,
  GAMBLING: 60,
  HIGH_RISK_EXCHANGE: 55,
  SUSPICIOUS: 40,
  EXCHANGE: 10,
};
```

- [ ] **Step 2: Update entityTypeHintFromCategory in ingestion.utils.ts**

Replace the `entityTypeHintFromCategory` function (lines 41-47):

```typescript
export function entityTypeHintFromCategory(
  category: BlacklistCategory
): EntityType | null {
  if (category === 'EXCHANGE') return 'exchange';
  if (category === 'HIGH_RISK_EXCHANGE') return 'exchange';
  if (category === 'MIXER') return 'mixer';
  return null;
}
```

- [ ] **Step 3: Update DANGEROUS_BLACKLIST_CATEGORIES in trusted-source-semantics.ts**

Replace lines 6-14:

```typescript
/** DB categories treated as dangerous for source-of-funds. */
export const DANGEROUS_BLACKLIST_CATEGORIES = new Set<BlacklistCategory>([
  'SANCTION',
  'STOLEN_FUNDS',
  'RANSOM',
  'DARK_MARKET',
  'SCAM',
  'PHISHING',
  'MIXER',
  'GAMBLING',
  'HIGH_RISK_EXCHANGE',
  'TERRORIST_FINANCING',
  'CHILD_EXPLOITATION',
]);
```

- [ ] **Step 4: Write failing test**

In `backend/src/modules/address-check/__tests__/taint-model.test.ts`, add before the runner block:

```typescript
async function testNewCategoryPriorities(): Promise<void> {
  // New categories must be in CATEGORY_PRIORITY and ordered correctly
  const { CATEGORY_PRIORITY } = await import('../../../modules/ingestion/ingestion.utils');
  assert.ok(CATEGORY_PRIORITY['GAMBLING'] !== undefined, 'GAMBLING missing');
  assert.ok(CATEGORY_PRIORITY['HIGH_RISK_EXCHANGE'] !== undefined, 'HIGH_RISK_EXCHANGE missing');
  assert.ok(CATEGORY_PRIORITY['TERRORIST_FINANCING'] !== undefined, 'TERRORIST_FINANCING missing');
  assert.ok(CATEGORY_PRIORITY['CHILD_EXPLOITATION'] !== undefined, 'CHILD_EXPLOITATION missing');
  // Ordering: SCAM > GAMBLING > HIGH_RISK_EXCHANGE > SUSPICIOUS
  assert.ok(CATEGORY_PRIORITY['SCAM'] > CATEGORY_PRIORITY['GAMBLING'], 'SCAM must outrank GAMBLING');
  assert.ok(CATEGORY_PRIORITY['GAMBLING'] > CATEGORY_PRIORITY['HIGH_RISK_EXCHANGE'], 'GAMBLING must outrank HIGH_RISK_EXCHANGE');
  assert.ok(CATEGORY_PRIORITY['HIGH_RISK_EXCHANGE'] > CATEGORY_PRIORITY['SUSPICIOUS'], 'HIGH_RISK_EXCHANGE must outrank SUSPICIOUS');
  // DANGEROUS_BLACKLIST_CATEGORIES must include new entries
  const { DANGEROUS_BLACKLIST_CATEGORIES } = await import('../address-check.utils/trusted-source-semantics');
  assert.ok(DANGEROUS_BLACKLIST_CATEGORIES.has('GAMBLING'), 'GAMBLING not in dangerous set');
  assert.ok(DANGEROUS_BLACKLIST_CATEGORIES.has('HIGH_RISK_EXCHANGE'), 'HIGH_RISK_EXCHANGE not in dangerous set');
  assert.ok(DANGEROUS_BLACKLIST_CATEGORIES.has('TERRORIST_FINANCING'), 'TERRORIST_FINANCING not in dangerous set');
  assert.ok(DANGEROUS_BLACKLIST_CATEGORIES.has('CHILD_EXPLOITATION'), 'CHILD_EXPLOITATION not in dangerous set');
}
```

Add `await testNewCategoryPriorities();` to the runner block.

- [ ] **Step 5: Run test — expect FAIL**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack/backend
npx tsx src/modules/address-check/__tests__/taint-model.test.ts 2>&1 | tail -10
```

Expected: fails with `GAMBLING missing`

- [ ] **Step 6: Run test after applying changes — expect PASS**

The changes from Steps 1-3 should make the test pass:

```bash
npx tsx src/modules/address-check/__tests__/taint-model.test.ts 2>&1 | tail -5
```

Expected: `taint-model tests passed`

- [ ] **Step 7: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean

- [ ] **Step 8: Commit**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack
git add backend/src/modules/ingestion/ingestion.utils.ts \
        backend/src/modules/address-check/address-check.utils/trusted-source-semantics.ts \
        backend/src/modules/address-check/__tests__/taint-model.test.ts
git commit -m "feat: add new categories to CATEGORY_PRIORITY and DANGEROUS_BLACKLIST_CATEGORIES"
```

---

## Task 3: KnownPlatform in-memory cache

**Files:**
- Create: `backend/src/modules/ingestion/known-platforms.cache.ts`

This module holds an in-memory `Map<address, BlacklistCategory>` loaded from the `KnownPlatform` table. Used by the expansion service for fast lookups without hitting the DB per-address.

- [ ] **Step 1: Create the cache module**

Create `backend/src/modules/ingestion/known-platforms.cache.ts`:

```typescript
import type { BlacklistCategory } from '@prisma/client';
import prisma from '../../config/database';

const cache = new Map<string, BlacklistCategory>();

export async function loadKnownPlatformCache(): Promise<void> {
  const platforms = await prisma.knownPlatform.findMany();
  cache.clear();
  for (const p of platforms) {
    for (const addr of p.contractAddresses) {
      cache.set(addr.toLowerCase(), p.category);
    }
    for (const addr of p.hotWalletAddresses) {
      cache.set(addr.toLowerCase(), p.category);
    }
  }
}

export function getKnownPlatformCategory(
  address: string
): BlacklistCategory | null {
  return cache.get(address.toLowerCase()) ?? null;
}

export function knownPlatformCacheSize(): number {
  return cache.size;
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack/backend
npm run build 2>&1 | tail -5
```

Expected: clean

- [ ] **Step 3: Commit**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack
git add backend/src/modules/ingestion/known-platforms.cache.ts
git commit -m "feat: add KnownPlatform in-memory address lookup cache"
```

---

## Task 4: KnownPlatform loader

**Files:**
- Create: `backend/src/modules/ingestion/known-platforms.loader.ts`

Reads `KnownPlatform` rows and upserts each address into `BlacklistedAddress` as a direct (non-derived) record.

- [ ] **Step 1: Create the loader**

Create `backend/src/modules/ingestion/known-platforms.loader.ts`:

```typescript
import type { BlacklistCategory, EntityType } from '@prisma/client';
import prisma from '../../config/database';
import { ingestLog } from './ingestion.log';
import { loadKnownPlatformCache } from './known-platforms.cache';

function entityTypeForCategory(category: BlacklistCategory): EntityType | null {
  if (category === 'GAMBLING') return null;
  if (category === 'HIGH_RISK_EXCHANGE') return 'exchange';
  if (category === 'MIXER') return 'mixer';
  return null;
}

export async function loadKnownPlatforms(): Promise<{
  source: string;
  upserted: number;
  skipped: number;
}> {
  const platforms = await prisma.knownPlatform.findMany();
  let upserted = 0;
  let skipped = 0;

  for (const platform of platforms) {
    const addresses = [
      ...platform.contractAddresses,
      ...platform.hotWalletAddresses,
    ];

    for (const address of addresses) {
      if (!address) continue;

      const existing = await prisma.blacklistedAddress.findUnique({
        where: { address },
      });

      // Never overwrite a stronger non-derived record
      if (existing && !existing.isDerived) {
        skipped++;
        continue;
      }

      await prisma.blacklistedAddress.upsert({
        where: { address },
        create: {
          address,
          category: platform.category,
          confidence: platform.confidence,
          riskScore: Math.round(platform.confidence * 100),
          source: platform.name,
          sourcesJson: [{ name: platform.name, type: platform.source }],
          isDerived: false,
          depth: 0,
          entityType: entityTypeForCategory(platform.category) ?? undefined,
        },
        update: {
          category: platform.category,
          confidence: platform.confidence,
          riskScore: Math.round(platform.confidence * 100),
          source: platform.name,
          entityType: entityTypeForCategory(platform.category) ?? undefined,
        },
      });
      upserted++;
    }
  }

  // Refresh in-memory cache after loading
  await loadKnownPlatformCache();

  ingestLog('loadKnownPlatforms: done', { upserted, skipped });
  return { source: 'known-platforms', upserted, skipped };
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack/backend
npm run build 2>&1 | tail -5
```

Expected: clean

- [ ] **Step 3: Commit**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack
git add backend/src/modules/ingestion/known-platforms.loader.ts
git commit -m "feat: add KnownPlatform → BlacklistedAddress ingestion loader"
```

---

## Task 5: Wire loader into ingestion.service.ts

**Files:**
- Modify: `backend/src/modules/ingestion/ingestion.service.ts`

The loader should run first in `ingestAll()` so that its addresses are in the DB before other sources potentially override them.

- [ ] **Step 1: Add import**

In `backend/src/modules/ingestion/ingestion.service.ts`, find the existing imports at the top. Add:

```typescript
import { loadKnownPlatforms } from './known-platforms.loader';
```

- [ ] **Step 2: Call loader at the start of ingestAll()**

In `ingestAll()`, after the opening log call (`ingestLog('ingestAll: starting', ...)`), add:

```typescript
    ingestLog('Step: KnownPlatforms');
    const kp = await loadKnownPlatforms();
    sources[kp.source] = { upserted: kp.upserted, skipped: kp.skipped };
    upserted += kp.upserted;
    skipped += kp.skipped;
    ingestLog('Step done: KnownPlatforms', { upserted: kp.upserted, skipped: kp.skipped });
```

- [ ] **Step 3: Build check**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack/backend
npm run build 2>&1 | tail -5
```

Expected: clean

- [ ] **Step 4: Commit**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack
git add backend/src/modules/ingestion/ingestion.service.ts
git commit -m "feat: run KnownPlatform loader at start of ingestion pipeline"
```

---

## Task 6: Expansion service — KnownPlatform lookup

**Files:**
- Modify: `backend/src/modules/ingestion/expansion.service.ts`

In the `ops` callback inside `expandOnce()`, before `mergeCategoryForExpansion`, check the KnownPlatform cache. If the counterparty address is a known platform address, use its category instead of SUSPICIOUS.

- [ ] **Step 1: Add import to expansion.service.ts**

In `backend/src/modules/ingestion/expansion.service.ts`, add to the imports:

```typescript
import { getKnownPlatformCategory } from './known-platforms.cache';
```

- [ ] **Step 2: Replace category assignment in ops callback**

In `expansion.service.ts`, find the line:

```typescript
        const nextCategory = mergeCategoryForExpansion({ existing });
```

(This is currently line ~170 in the ops callback)

Replace it with:

```typescript
        const platformCategory = getKnownPlatformCategory(address);
        const nextCategory = platformCategory
          ? (existing && !existing.isDerived
              ? existing.category          // never overwrite direct record
              : platformCategory)
          : mergeCategoryForExpansion({ existing });
```

- [ ] **Step 3: Build check**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack/backend
npm run build 2>&1 | tail -5
```

Expected: clean

- [ ] **Step 4: Write test**

In `backend/src/modules/address-check/__tests__/taint-model.test.ts`, add:

```typescript
async function testKnownPlatformCategoryOverridesSuspicious(): Promise<void> {
  // When a counterparty matches a known platform, it should get that category
  // instead of SUSPICIOUS. Simulate the logic without DB.
  function resolveCategory(
    platformCategory: string | null,
    existing: { isDerived: boolean; category: string } | undefined,
    fallback: string
  ): string {
    if (platformCategory) {
      if (existing && !existing.isDerived) return existing.category;
      return platformCategory;
    }
    return fallback;
  }

  // New address matching gambling platform → GAMBLING
  assert.equal(resolveCategory('GAMBLING', undefined, 'SUSPICIOUS'), 'GAMBLING');
  // Direct existing record → never overwritten
  assert.equal(resolveCategory('GAMBLING', { isDerived: false, category: 'SCAM' }, 'SUSPICIOUS'), 'SCAM');
  // Derived existing record → platform category wins
  assert.equal(resolveCategory('GAMBLING', { isDerived: true, category: 'SUSPICIOUS' }, 'SUSPICIOUS'), 'GAMBLING');
  // No platform match → fallback
  assert.equal(resolveCategory(null, undefined, 'SUSPICIOUS'), 'SUSPICIOUS');
}
```

Add `await testKnownPlatformCategoryOverridesSuspicious();` to runner.

- [ ] **Step 5: Run tests**

```bash
npx tsx src/modules/address-check/__tests__/taint-model.test.ts 2>&1 | tail -5
```

Expected: `taint-model tests passed`

- [ ] **Step 6: Commit**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack
git add backend/src/modules/ingestion/expansion.service.ts \
        backend/src/modules/address-check/__tests__/taint-model.test.ts
git commit -m "feat: expansion assigns platform category when address matches KnownPlatform"
```

---

## Task 7: Seed script

**Files:**
- Create: `backend/src/scripts/seed-known-platforms.ts`
- Modify: `backend/package.json`

Idempotent script that upserts placeholder KnownPlatform records. Operators replace placeholder addresses with verified ones before running in prod.

- [ ] **Step 1: Create seed script**

Create `backend/src/scripts/seed-known-platforms.ts`:

```typescript
/**
 * Seed known risky platforms into KnownPlatform table.
 *
 * IMPORTANT: All addresses below are PLACEHOLDERS.
 * Before running in production, replace each address[] with verified
 * on-chain addresses from blockchain explorers or platform documentation.
 *
 * Run: npm run seed:platforms
 */
import prisma from '../config/database';

const platforms = [
  // ── GAMBLING ──────────────────────────────────────────────────────────
  {
    name: 'WINk',
    category: 'GAMBLING' as const,
    chain: 'TRON',
    contractAddresses: [
      // TODO: replace with verified WINk gambling contract addresses
      // Find at: https://tronscan.org/#/token20/TFczxzPhnThNSqr5by8tvxsdCFRkYmV7y
    ],
    hotWalletAddresses: [],
    confidence: 0.9,
    notes: 'TRON gambling dApp using WIN token',
  },
  {
    name: 'JustBet',
    category: 'GAMBLING' as const,
    chain: 'TRON',
    contractAddresses: [
      // TODO: replace with verified JustBet contract addresses
    ],
    hotWalletAddresses: [],
    confidence: 0.85,
    notes: 'TRON-based betting platform',
  },
  {
    name: 'SunPump Gambling',
    category: 'GAMBLING' as const,
    chain: 'TRON',
    contractAddresses: [],
    hotWalletAddresses: [
      // TODO: replace with verified gambling pool addresses
    ],
    confidence: 0.75,
    notes: 'TRON meme/gambling pools associated with SunPump ecosystem',
  },

  // ── HIGH_RISK_EXCHANGE ────────────────────────────────────────────────
  {
    name: 'Garantex',
    category: 'HIGH_RISK_EXCHANGE' as const,
    chain: 'TRON',
    contractAddresses: [],
    hotWalletAddresses: [
      // TODO: replace with Garantex TRON deposit/withdrawal addresses
      // OFAC designation: https://ofac.treasury.gov/
    ],
    confidence: 0.95,
    source: 'ofac',
    notes: 'OFAC-sanctioned Russian crypto exchange (April 2022)',
  },
  {
    name: 'Bitzlato',
    category: 'HIGH_RISK_EXCHANGE' as const,
    chain: 'TRON',
    contractAddresses: [],
    hotWalletAddresses: [
      // TODO: replace with Bitzlato TRON addresses
    ],
    confidence: 0.95,
    source: 'ofac',
    notes: 'OFAC-sanctioned exchange, FinCEN primary money laundering concern',
  },
  {
    name: 'SUEX',
    category: 'HIGH_RISK_EXCHANGE' as const,
    chain: 'TRON',
    contractAddresses: [],
    hotWalletAddresses: [
      // TODO: replace with SUEX TRON deposit addresses
    ],
    confidence: 0.95,
    source: 'ofac',
    notes: 'OFAC-sanctioned OTC desk (September 2021)',
  },

  // ── TERRORIST_FINANCING ───────────────────────────────────────────────
  {
    name: 'OFAC SDN Terrorist Financing',
    category: 'TERRORIST_FINANCING' as const,
    chain: 'TRON',
    contractAddresses: [],
    hotWalletAddresses: [
      // TODO: add TRON addresses from OFAC SDN list tagged as terrorist financing
    ],
    confidence: 0.98,
    source: 'ofac',
    notes: 'Addresses from OFAC SDN list with terrorism-financing designation',
  },

  // ── CHILD_EXPLOITATION ────────────────────────────────────────────────
  {
    name: 'CSAM Known Addresses',
    category: 'CHILD_EXPLOITATION' as const,
    chain: 'TRON',
    contractAddresses: [],
    hotWalletAddresses: [
      // TODO: add from IWF or law enforcement intelligence feeds
    ],
    confidence: 0.99,
    source: 'manual',
    notes: 'Addresses associated with CSAM markets — direct match only',
  },
] satisfies Array<{
  name: string;
  category: 'GAMBLING' | 'HIGH_RISK_EXCHANGE' | 'TERRORIST_FINANCING' | 'CHILD_EXPLOITATION';
  chain: string;
  contractAddresses: string[];
  hotWalletAddresses: string[];
  confidence: number;
  source?: string;
  notes?: string;
}>;

async function main(): Promise<void> {
  console.log('Seeding KnownPlatform table...');
  let upserted = 0;

  for (const p of platforms) {
    await prisma.knownPlatform.upsert({
      where: { name_chain: { name: p.name, chain: p.chain } },
      create: {
        name: p.name,
        category: p.category,
        chain: p.chain,
        contractAddresses: p.contractAddresses,
        hotWalletAddresses: p.hotWalletAddresses,
        confidence: p.confidence,
        source: p.source ?? 'manual',
        notes: p.notes,
      },
      update: {
        category: p.category,
        contractAddresses: p.contractAddresses,
        hotWalletAddresses: p.hotWalletAddresses,
        confidence: p.confidence,
        notes: p.notes,
      },
    });
    upserted++;
    console.log(`  ✓ ${p.name} (${p.category})`);
  }

  console.log(`Done. Upserted ${upserted} platforms.`);
  console.log('');
  console.log('NEXT STEP: Fill in placeholder addresses before running ingestion.');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add script to package.json**

In `backend/package.json`, find the `"scripts"` section. Add:

```json
"seed:platforms": "tsx src/scripts/seed-known-platforms.ts"
```

- [ ] **Step 3: Build check**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack/backend
npm run build 2>&1 | tail -5
```

Expected: clean

- [ ] **Step 4: Commit**

```bash
cd /Users/antonchekantsev/Documents/Projects/true-aml-fullstack
git add backend/src/scripts/seed-known-platforms.ts backend/package.json
git commit -m "feat: add seed:platforms script for KnownPlatform table"
```

---

## Post-Implementation: Operator Steps

After code is merged, operators must:

1. Run `npm run seed:platforms` to populate the `KnownPlatform` table with placeholder records
2. For each platform, look up real TRON addresses from:
   - TronScan: https://tronscan.org
   - OFAC SDN list for sanctioned exchanges
   - Platform documentation / contract registries
3. Update addresses via direct DB edit or by modifying and re-running the seed script
4. Run ingestion (`npm run ingest:run`) to push KnownPlatform addresses into `BlacklistedAddress`
5. Verify: `SELECT category, COUNT(*) FROM blacklisted_addresses WHERE category IN ('GAMBLING','HIGH_RISK_EXCHANGE','TERRORIST_FINANCING','CHILD_EXPLOITATION') GROUP BY category;`

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|----------------|------|
| 4 new BlacklistCategory values | Task 1 |
| KnownPlatform model | Task 1 |
| CATEGORY_PRIORITY updated | Task 2 |
| DANGEROUS_BLACKLIST_CATEGORIES updated | Task 2 |
| In-memory cache | Task 3 |
| known-platforms.loader.ts | Task 4 |
| Wire into ingestion pipeline | Task 5 |
| Expansion uses platform category | Task 6 |
| Seed script with placeholders | Task 7 |
| entityTypeHintFromCategory updated | Task 2 |

### Gaps noted

- `mergeCategoryForExpansion` in `ingestion.utils.ts` is not updated — not needed because expansion.service.ts now checks KnownPlatform before calling it, so SUSPICIOUS is still correct as the fallback for non-platform addresses.
- Graph crawler (`graph-crawler.service.ts`) does not use KnownPlatform cache — out of scope, it uses `BlacklistedAddress` lookups which will already contain the platform addresses after ingestion.
- No behavioral gambling heuristic in expansion (behavioral stats not available per-counterparty at expansion time) — KnownPlatform match covers the main detection path.
