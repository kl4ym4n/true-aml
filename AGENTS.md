# AML Project Coding Rules

You are working on a production-grade crypto AML (Anti-Money Laundering) system.

This is NOT a generic backend project.
This is a DATA + GRAPH + RISK system.

Incorrect logic here leads to WRONG RISK SCORES.

Follow ALL rules strictly.

---

# 🧠 CORE PRINCIPLES

## 1. DATA > LOGIC

- Never assume data is complete
- Always preserve signal from external sources
- Do not overwrite strong signals with weaker ones

Golden rule:
> Bad data destroys good algorithms

---

## 2. DO NOT CONTAMINATE THE GRAPH

CRITICAL:

- NEVER propagate strong categories (SCAM, SANCTION, etc.) via expansion
- Derived addresses MUST NOT inherit root category

Correct:
- derived → SUSPICIOUS

Wrong:
- root SCAM → all neighbors SCAM ❌

---

## 3. CATEGORY PRIORITY IS STRICT

Always use priority when merging:

SANCTION > STOLEN_FUNDS > RANSOM > DARK_MARKET > SCAM > PHISHING > MIXER > SUSPICIOUS > EXCHANGE

Rules:
- Never downgrade stronger category
- Never overwrite direct source data with derived data

---

## 4. CONFIDENCE IS PROBABILISTIC

Confidence is NOT arbitrary.

Always:
- Clamp to 0..1
- Combine sources using:

finalConfidence = 1 - Π(1 - sourceConfidence)

Never:
- overwrite confidence blindly
- reduce strong confidence with weak data

---

## 5. DERIVED DATA IS WEAKER BY DEFAULT

Derived data MUST:
- have lower confidence
- have depth penalty
- never override direct data

---

# 🔗 GRAPH RULES

## 6. EXPANSION IS HEURISTIC, NOT TRUTH

When expanding:

- Use BOTH:
    - incoming flows
    - outgoing flows

- Filter:
    - minVolume
    - minShare

- Limit:
    - topK counterparties

---

## 7. DO NOT ADD NOISE

Skip addresses if:
- share < threshold (e.g. 3%)
- volume too small
- likely exchange (high volume + low share)

Noise destroys graph quality.

---

## 8. DEPTH MATTERS

Always track:

depth = 0 → seed  
depth = 1 → direct neighbor  
depth = 2 → second hop

Apply penalty:

effectiveConfidence = confidence * (1 / (depth + 1))

---

## 9. ENTITY ≠ CATEGORY

Important distinction:

- category = risk (scam, sanction, etc.)
- entityType = behavior (exchange, mixer, bridge)

Never mix them.

---

# 📊 RISK SCORING RULES

## 10. TAINT IS WEIGHTED

Never use binary taint.

Correct:
taint += volumeShare * confidence * depthPenalty

Wrong:
if risky → +volume ❌

---

## 11. ALWAYS EXPLAIN RISK

Every score must be explainable:

Include:
- top risky counterparties
- % tainted funds
- behavioral signals

---

# 🛠 DATABASE RULES

## 12. NEVER LOSE DATA

- Do not overwrite:
    - higher confidence
    - stronger category
    - original source

---

## 13. STORE PROVENANCE

Every address must track:
- source(s)
- confidence
- derivedFrom
- isDerived

---

## 14. NO N+1 QUERIES

Always:
- batch load data
- use maps in memory

---

# ⚙️ PERFORMANCE RULES

## 15. USE CACHING

- LRU cache for hot addresses
- avoid repeated blockchain calls

---

## 16. LIMIT PARALLELISM

- Use controlled concurrency (p-limit)
- Never spawn unbounded async calls

---

## 17. CRON SAFETY

- No overlapping jobs
- Always use locks or flags

---

# 🚫 WHAT NOT TO DO

NEVER:

- ❌ propagate SCAM/SANCTION via graph blindly
- ❌ overwrite strong data with weak data
- ❌ treat all counterparties equally
- ❌ ignore volumeShare
- ❌ ignore depth
- ❌ build binary risk models
- ❌ trust a single data source

---

# ✅ WHAT GOOD CODE LOOKS LIKE

- deterministic
- explainable
- conservative with labeling
- aggressive with data collection
- careful with propagation

---

# 🧠 MENTAL MODEL

This system is:

NOT:
- a simple API
- a CRUD backend

THIS IS:
- a probabilistic graph engine
- with partial data
- making risk estimations

Always think in:
- graphs
- probabilities
- signal vs noise

---

# 🚀 FINAL RULE

When unsure:

👉 prefer UNDER-classifying over OVER-classifying

False positive (marking clean as scam) is worse than false negative.

---

End of rules.


Always batch when possible.

Use:
- preload existing candidates
- preload existing blacklist rows
- preload queue rows
- use maps in memory

Do not query the database once per discovered address unless unavoidable.

---

## 28. NO UNBOUNDED ASYNC FAN-OUT

Always use controlled concurrency.

Allowed:
- p-limit
- bounded worker pools
- batch processing

Not allowed:
- raw unbounded Promise.all over large graphs

---

## 29. CACHE HOT LOOKUPS

Use in-memory cache for:
- recently seen addresses
- repeated root metadata
- repeat queue checks within the same run

But do not rely on cache as the source of truth.

---

## 30. RECRAWL MUST BE SCHEDULED INTELLIGENTLY

Not all nodes deserve the same recrawl cadence.

Suggested policy:
- strong direct seed: frequent recrawl
- suspicious derived node: less frequent
- low-confidence observed node: infrequent
- failures: exponential backoff

---

# 🛡 SAFETY RULES

## 31. CRAWLER FAILURE MUST NOT CORRUPT STATE

Use:
- try/finally around worker status updates
- clear state transitions
- failure logging
- retry/backoff logic

A failed crawl should be recoverable.

---

## 32. OVERLAPPING JOBS MUST BE PREVENTED

Do not let the same worker logic run on overlapping schedules without protection.

Use:
- in-process lock at minimum
- preferably distributed lock later

---

## 33. EVERY PROMOTION MUST BE EXPLAINABLE

If a candidate becomes a BlacklistedAddress record as derived suspicious, it must be explainable by:
- root(s)
- hop depth
- volume/share
- txCount
- confidence formula
- timestamps

If you cannot explain the promotion, the promotion is too weak.

---

# ✅ WHAT GOOD CRAWLER CODE LOOKS LIKE

Good crawler code is:
- conservative in labeling
- aggressive in data collection
- deterministic
- auditable
- idempotent
- graph-aware
- probability-aware
- resistant to noise

---

# 🚫 WHAT NOT TO DO

NEVER:

- ❌ propagate SCAM/SANCTION/MIXER blindly through neighbors
- ❌ store only nodes and ignore edges
- ❌ treat observed graph contact as proof of maliciousness
- ❌ ignore hop depth
- ❌ ignore share
- ❌ ignore interaction count
- ❌ overwrite direct source data with crawler-derived data
- ❌ enqueue the graph without limits
- ❌ classify infrastructure as malicious by default
- ❌ rely on one-off huge transfers as primary evidence

---

# 🧠 FINAL MENTAL MODEL

This crawler is not a blacklist generator.

It is:
- a graph intelligence collector
- a suspicious candidate builder
- a foundation for clustering and taint analysis

The crawler should maximize reusable intelligence while minimizing false positives.

---

# 🚀 FINAL RULE

When unsure:

Prefer:
- storing the edge
- storing the signal
- delaying promotion

instead of:
- blacklisting too early

A missed suspicious candidate can be revisited later.
A poisoned blacklist damages the whole AML system.


# ENTITY LAYER RULES

## 1. ENTITY ≠ RISK

- entityType describes behavior (exchange, mixer, etc.)
- category describes risk (scam, sanction, etc.)

Never mix them.

---

## 2. EXCHANGE IS NOT RISK

- exchange activity is normal
- high volume + high frequency ≠ malicious

Always apply suppression to exchange-like entities.

---

## 3. SMALL TAINT MATTERS

- even 1% sanctions is meaningful
- never ignore low-percentage risk

---

## 4. GRAPH ≠ TRUTH

- graph signals are probabilistic
- direct sources are stronger

---

## 5. DO NOT OVERCLASSIFY

Prefer:
- suspicious

Avoid:
- false SCAM/SANCTION labels

---

## 6. BREAKDOWN MUST BE REALISTIC

Never output:
- 100% suspicious

Always split:
- trusted
- suspicious
- dangerous

---

## 7. BEHAVIOR IS SECONDARY

- behavior alone is not risk
- taint > behavior

---

## 8. FINAL RULE

Better:
- miss some risky wallets

Than:
- mark clean wallets as risky


# TRUSTED SOURCES / EXCHANGE RULES

## 1. STRONG_WHITELIST = TRUSTED EXCHANGE SIGNAL

If an address is in STRONG_WHITELIST, treat it as:

- trusted source
- exchange entity
- high-confidence semantic signal

It must NOT be placed into suspicious by default.

---

## 2. TRUSTED SOURCES MUST AFFECT BREAKDOWN

If counterparty is:

- in STRONG_WHITELIST
- or entityType == exchange
- or entityType == payment_processor

then its flow must go to:

- trusted

and NOT to:

- suspicious

---

## 3. SOURCE BUCKET PRIORITY IS STRICT

Always classify buckets in this order:

1. trusted
2. dangerous
3. suspicious

Meaning:

- trusted exchange-like flow must be recognized before fallback classification
- dangerous categories still override if direct evidence exists
- suspicious is fallback, not default for everything unknown

---

## 4. NEVER SHOW EXCHANGE-HEAVY WALLETS AS 100% SUSPICIOUS

If most inflow comes from exchange-like or whitelisted CEX addresses, breakdown must reflect that.

Bad:
- Trusted: 0%
- Suspicious: 100%

Good:
- Trusted: high
- Suspicious: moderate/low
- Dangerous: small if present

---

## 5. TRUSTED FLOW MUST SUPPRESS RISK

If trustedShare is high:

- reduce behavioral impact
- reduce suspicious interpretation
- soften final score

But:
- do NOT erase real dangerous taint completely

---

## 6. SMALL DANGEROUS TAINT MUST REMAIN VISIBLE

Even if wallet is mostly trusted, small dangerous exposure must still appear in:

- dangerous share
- AML explanation
- final risk uplift

Do not hide sanctions / gambling / enforcement just because trusted share is dominant.

---

## 7. ENTITY TYPE MUST BE USED, NOT JUST DETECTED

Detecting entityType = exchange is not enough.

It must affect:
- source-of-funds breakdown
- taint classification
- behavioral suppression
- explanation text
- final score calibration

---

## 8. SUSPICIOUS IS FALLBACK, NOT DEFAULT

Do not use logic like:

- "if not dangerous => suspicious"

Use logic like:

- if trusted => trusted
- else if dangerous => dangerous
- else => suspicious

---

## 9. WHITELIST IS STRONGER THAN WEAK HEURISTICS

If STRONG_WHITELIST says exchange, this should override weaker graph suspicion.

Priority:
1. whitelist
2. direct source evidence
3. entity heuristics
4. fallback unknown

---

## 10. FINAL RULE

Trusted exchange flow is a semantic signal, not just a cosmetic label.

If the model detects or knows exchange flow but still outputs 100% suspicious,
the model is semantically wrong even if the raw risk score is low.

# TRONSCAN TRANSFERS / SOURCE-OF-FUNDS RULES

## 1. TRANSACTIONS ≠ TRANSFERS

- /api/transaction → используется ТОЛЬКО для:
  - общего профиля кошелька
  - поведенческих паттернов (frequency, fan-in/out, etc.)

- /api/token_trc20/transfers → используется ТОЛЬКО для:
  - AML source-of-funds
  - taint analysis
  - stablecoin inflow

Никогда не смешивать эти два источника.

---

## 2. SOURCE-OF-FUNDS СТРОИТСЯ ТОЛЬКО ПО TRANSFERS

Для расчёта:
- stablecoinIncomingVolume
- volumeByCounterparty
- taintPercent
- sourceBreakdown

использовать только TRC20 transfers.

Не использовать:
- getTransactions(...)
- generic transaction list

---

## 3. ВХОДЯЩИЙ ОБЪЁМ = toAddress

Incoming transfer определяется строго:

- to_address == analyzed wallet

Контрагент:
- from_address

Нельзя:
- использовать relatedAddress без фильтра
- смешивать входящие и исходящие

---

## 4. КОНТРАКТЫ ВАЖНЕЕ СИМВОЛОВ

Никогда не полагаться только на:
- "USDT"
- "USDC"

Всегда использовать:
- contract_address

Пример:
- TRON_USDT_CONTRACT
- TRON_USDC_CONTRACT

---

## 5. totalIncomingVolume ДОЛЖЕН БЫТЬ ЯВНЫМ

Если считается только по стейблам:

- НЕ называть это totalIncomingVolume
- использовать:
  - stablecoinIncomingVolume
  - stablecoinSourceSampleVolume

Иначе ломается логика и дебаг.

---

## 6. EMPTY SAMPLE ≠ SUSPICIOUS

Если:
- stablecoinIncomingVolume === 0

то это значит:
- нет данных для SoF

Это НЕ значит:
- suspicious = 100%

Всегда:
- показывать empty state
- не фейкать breakdown

---

## 7. COUNTERPARTY = FROM_ADDRESS

При построении графа:

- узел = analyzed wallet
- контрагент = from_address (для inflow)

Объём:
- volumeByCounterparty[from_address] += amount

---

## 8. PAGINATION ОБЯЗАТЕЛЬНА

TronScan API:
- ограничивает количество записей

Всегда:
- использовать start + limit
- итерировать страницы
- не доверять одной странице

---

## 9. CONFIRMED ONLY

Для AML:

- использовать только confirmed transfers
- исключать неподтверждённые

---

## 10. FINAL RULE

Если:
- SoF считается не из TRC20 transfers

значит:
- AML модель работает на неправильных данных

и любые дальнейшие улучшения скоринга бессмысленны.