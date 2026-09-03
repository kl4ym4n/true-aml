# AML Algorithm: Depth & Accuracy Improvements

**Date:** 2026-07-16
**Status:** Draft

## 1. Problem Statement

The current AML risk algorithm has multiple known accuracy limitations:

- **Shallow hop analysis** — `MAX_HOP_LEVEL = 1` means only direct counterparties (hop 1) get full entity resolution, flags, and classification. Hop 2+ counterparties are visible only for taint accumulation without proper flag propagation.
- **Hop 3 bugs** — `isAmlRiskyCounterparty` receives `flags: []` at hop 3, making its risk assessment blind to counterparty flags. `riskyIncomingVolume` at hop 3+ accumulates `tVol` instead of properly weighted `pathShare * totalVolume`.
- **Suboptimal trust calibration** — hardcoded discrete thresholds (70%/50%) create abrupt score transitions that don't reflect gradual trust gradients.
- **Limited SoF sampling depth** — default 30 pages (~6000 transfers) can truncate analysis for high-volume wallets, producing inaccurate breakdown.
- **Missing entity info at hop 2** — hop-2 counterparty entity type is resolved for taint but doesn't flow into flags/classification usable by higher-level algorithms.

## 2. Scope

**In scope (this iteration):**
- On-chain analysis (address-check.service.ts)
- Taint propagation (multi-hop logic)
- SoF data sampling
- Trust calibration
- Hop 2 entity resolution

**Out of scope (future iterations):**
- Graph crawler (offline expansion)
- AdvancedRiskCalculator weights
- Category priority system
- ML/entity classification model
- New data ingestion sources
- Multi-chain support

## 3. Design

### 3.1 Depth Configuration

Increase constants to support deeper analysis:

| Constant | Current | New | Rationale |
|----------|---------|-----|-----------|
| `MAX_HOP_LEVEL` | 1 | 2 | Enable full analysis up to hop-2 counterparties |
| `TOP_K_ROOT_COUNT` | 15 | 25 | More counterparties at hop-1 for better coverage |
| `TOP_K_DEEP` | 8 | 12 | More hop-2 expansions from each hop-1 seed |
| `TAINT_CONCURRENCY` | 4 | 6 | Faster parallel counterparty analysis |
| `MAX_TAINT_MS` | 45,000 | 90,000 | Accommodate deeper analysis within deadline |

With `MAX_HOP_LEVEL = 2`, hop-2 counterparties (`analyzeAddressWithHops(cp, 2, ...)`) receive full entity resolution including security check, blacklist check, pattern analysis, flags, and result caching. The hop-2 analysis does NOT recurse into its own multi-hop taint analysis — only a flat single-level analysis to classify the counterparty. Cycle protection via `visitedAddresses` set prevents re-analysis.

### 3.2 Hop-3 Bug Fixes

**Fix 1 — `flags: []` at hop 3:**
Replace empty flags with real counterparty data. Before calling `isAmlRiskyCounterparty` at hop 3, fetch address security + blacklist entry + entity resolution for the hop-3 counterparty. Use the resolved entity to populate `flags`:

```typescript
const flagsU = buildHop3Flags(secU, blU, entityU);
isAmlRiskyCounterparty({
  flags: flagsU,             // real flags now, not []
  entityRiskWeight: rwU,
  ...
})
```

Entity resolution at hop 3 uses the `resolveCounterpartyEntityFromTxs` method (already exists and used at hop 1/2), requires fetching transactions and running pattern analysis — lightweight, no recursion.

**Fix 2 — `riskyIncomingVolume` at hop 3+:**
Change from accumulating `tVol` (raw hop-3 volume) to `pathShare * totalVolume` — consistent with how hop 2 calculates its risky contribution:

```
// Before: riskyIncomingVolume += tVol;
// After:  riskyIncomingVolume += pathShare * totalVolume;
```

This ensures volume contributions are properly weighted by their path depth, not double-counted at raw values.

### 3.3 SoF Sampling Depth

| Parameter | Current Default | New Default | Max |
|-----------|----------------|-------------|-----|
| `SOF_STABLECOIN_MAX_PAGES` | 30 | 50 | 100 |

Dynamic depth scaling:
- If `stablecoinIncomingVolume > 1,000,000` AND not truncated: automatically increase depth by 1.5x (capped at max)
- If transfer count in last page ≥ page_size * 0.9 (near-full page): auto-increase (likely more data)
- Truncation warning already exists — extend it to report `pagesFetched / totalAvailable` ratio

### 3.4 Entity Resolution at Hop 2

When `analyzeAddressWithHops(cp, 2, ...)` runs, it performs:
1. Blacklist lookup (via blacklistService)
2. Address security check (via blockchainClient)
3. Pattern analysis (via PatternAnalyzer)
4. Risk flag determination (via RiskCalculator)
5. Result caching (via counterpartyAnalysisCache)

It does NOT run:
- TRC20 transfer fetch (SoF/taint — too expensive)
- Sub-entity resolution for its own counterparties
- Multi-hop recursion (protected by visitedAddresses + MAX_HOP_LEVEL)

The cached result becomes available for any other hop-1 analysis that encounters the same hop-2 address — LRU cache TTL: 10 minutes.

### 3.5 Trust Calibration

Replace discrete thresholds with continuous formulas.

**Current (discrete):**
```
if trusted >= 70% AND dangerous < 1% → factor 0.65
if trusted >= 50% AND dangerous < 2% → factor 0.80
if dangerous > 2% → +12 uplift
if dangerous > 0.5% → +7 uplift
if dangerous > 0.1% → +3 uplift
```

**New (continuous):**
```typescript
trustLayerFactor = 0.5 + 0.5 * (1 - trustedShare01) ^ 2
// Range: 1.0 (trusted=0%) → 0.5 (trusted=100%)
// Smooth curve, no sudden jump at 50%/70%

dangerousUplift = Math.round(6 * dangerousShare01 * 100 * 100) / 100
// 2% dangerous → +12 points (was +12, unchanged)
// 0.5% dangerous → +3 points (was +7, more proportional)
// 0.1% dangerous → +0.6 points (was +3, more proportional)
```

Also add a configurable `TRUST_CALIBRATION_A` and `TRUST_CALIBRATION_B` constants for future tuning without code changes.

### 3.6 Entity Type Exposure at Hop 2

When `classifySourceBucket` and `isAmlRiskyCounterparty` run against a hop-2 counterparty flag list, ensure that entity type resolved at hop 2 is available for classification. Currently hop-2 entity type is stored only as `entityU` in the loop variable — not as a `RiskFlag`.

Add new flag format:
```typescript
// When hop-2 entity type is resolved and is a known entity:
flags.push(`entity:${entityType}` as RiskFlag);
```

This flags value is consumed by `isAmlRiskyCounterparty` and `classifySourceBucket` to determine risk contribution even at hop-2+.

## 4. Error Handling & Edge Cases

- **Time deadline still honored** — if 90s budget exhausted, fall back to what's been computed so far (unchanged logic)
- **Visited set grows** — more addresses analyzed means larger visited set; this is bounded by `TOP_K_ROOT_COUNT * TOP_K_DEEP`
- **Cache pressure** — more counterparty analysis means more cached entries; LRU 2000 entries should suffice but monitor hit rate
- **API rate limits** — more transactions fetched for hop-2 entity resolution; hop-1 already fetches them per counterparty so hop-2 is additive but within bounded concurrency
- **Dust filtering unchanged** — both `MIN_TAINT_COUNTERPARTY_VOLUME = 0.01` and `MIN_TAINT_VOLUME_SHARE_PERCENT = 0.1` remain; larger TOP_K_ROOT_COUNT means more small counterparties enter analysis but they still get filtered
- If **totalVolume <= 0** or **volumeByCounterparty.size == 0** at SoF stage → hop 2/3 analysis is skipped entirely (current behavior preserved)

## 5. Data Flow Changes

**Before:**
```
analyzeAddress(address)
  → hop 0: full analysis + SoF
      → hop 1: full analysis for TOP 15 (entity, flags, taint)
          → hop 2: lightweight taint only (entity, no flags)
              → hop 3: lightweight taint (empty flags, wrong volume)
```

**After:**
```
analyzeAddress(address)
  → hop 0: full analysis + SoF
      → hop 1: full analysis for TOP 25 (entity, flags, taint, cached)
          → hop 2: full analysis for TOP 12 (entity, flags, taint, cached)
              → hop 3: fixed entity resolution + flags + correct volume
```

## 6. Testing

Updated test expectations in `taint-model.test.ts`:

- Taint accumulation now includes hop-2 entity classification → taint score may increase for deep paths
- Test with counterparty that has mixer-like entity at hop 2 → verify taint score > previous baseline
- Test time deadline truncation: ensure 90s budget still produces partial results
- Test `classifySourceBucket` against hop-2 derived entity flags → verify trusted/dangerous/suspicious buckets correct
- Test trust calibration continuous formula: verify smooth transition across full [0,1] trusted share range
- Test SoF dynamic depth: verify auto-increase for large-volume addresses
- Test hop 3 `riskyIncomingVolume`: verify it uses `pathShare * totalVolume` not raw `tVol`

## 7. Files Changed

| File | Change |
|------|--------|
| `backend/src/modules/address-check/address-check.service.ts` | Increase depth constants, fix hop-3 flags/volume, add hop-2 entity flag propagation |
| `backend/src/modules/address-check/address-check.constants.ts` | Update `SOF_STABLECOIN_MAX_PAGES` default to 50 |
| `backend/src/modules/address-check/address-check.utils/advanced-risk.constants.ts` | Add `TRUST_CALIBRATION_A`/`TRUST_CALIBRATION_B` constants |
| `backend/src/modules/address-check/address-check.utils/trusted-share-calibration.ts` | Replace discrete thresholds with continuous formulas |
| `backend/src/modules/address-check/__tests__/taint-model.test.ts` | Update for new depth, hop-3 fix, and trust calibration |
| `.env.example` | Document new defaults for `SOF_STABLECOIN_MAX_PAGES`, `CRAWLER_*` (no change to crawler, just doc) |

## 8. Rollout

1. Deploy changes, monitor `TaintCalculationStats` in logs (counterpartyCacheHits, skippedDust, analyzedCounterparties)
2. Compare risk scores for a sample of addresses before/after — expect slight increases for addresses connected to risky hop-2 counterparties
3. If deadline truncation (> 5% of analyses hitting MAX_TAINT_MS), consider reducing TOP_K values or increasing deadline further
4. No schema migration required (no new DB fields)
