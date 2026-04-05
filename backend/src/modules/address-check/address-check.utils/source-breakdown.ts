import type { RiskFlag, SourceBreakdown } from '../address-check.types';

export interface VolumeWeightedSourceRow {
  /** Share of analyzed stablecoin inflow (0..1). */
  volumeShare: number;
  /** Resolved AML entity (classify + heuristics). */
  entity: string;
  flags: RiskFlag[];
}

function labelForRow(
  entity: string,
  flags: RiskFlag[],
  bucket: 'trusted' | 'suspicious' | 'dangerous'
): string {
  const f = new Set(flags);
  if (bucket === 'dangerous') {
    if (f.has('blacklisted')) return 'Blacklisted';
    if (entity === 'sanctions') return 'Sanctions';
    if (f.has('scam') || entity === 'scam') return 'Scam';
    if (f.has('phishing') || entity === 'phishing') return 'Phishing';
    if (entity === 'mixer') return 'Mixer';
    if (entity === 'darknet') return 'Darknet';
    if (entity === 'gambling') return 'Gambling';
    if (f.has('malicious')) return 'Malicious';
    return 'HighRisk';
  }
  if (bucket === 'trusted') {
    if (entity === 'exchange') return 'Exchange';
    if (entity === 'payment_processor') return 'PaymentProcessor';
    if (entity === 'bridge') return 'Bridge';
    return 'TrustedOther';
  }
  if (entity === 'liquidity_pool' || entity === 'defi') return 'DeFi/LP';
  if (f.has('liquidity-pool')) return 'LiquidityPool';
  if (f.has('high-frequency')) return 'HighFrequency';
  if (f.has('new-address')) return 'NewAddress';
  if (f.has('limited-counterparties')) return 'LimitedCounterparties';
  if (entity === 'p2p') return 'P2P';
  if (entity === 'unknown') return 'Unknown';
  return entity || 'Unclassified';
}

/**
 * Map entity + flags into AML bucket. Unknown / behavioral flags → suspicious (not trusted).
 */
export function categorizeAmlSourceBucket(
  entity: string,
  flags: RiskFlag[]
): 'trusted' | 'suspicious' | 'dangerous' {
  const f = new Set(flags);
  if (f.has('blacklisted')) return 'dangerous';
  if (f.has('scam') || f.has('phishing')) return 'dangerous';
  if (f.has('malicious')) return 'dangerous';

  if (
    entity === 'sanctions' ||
    entity === 'scam' ||
    entity === 'phishing' ||
    entity === 'darknet' ||
    entity === 'mixer'
  ) {
    return 'dangerous';
  }
  if (entity === 'gambling') return 'dangerous';

  if (entity === 'exchange' || entity === 'payment_processor') {
    return 'trusted';
  }

  return 'suspicious';
}

/**
 * Volume-weighted breakdown over analyzed stablecoin sources.
 * `summary` trusted + suspicious + dangerous = 100 (over analyzed share).
 */
export function computeVolumeWeightedSourceBreakdown(
  rows: VolumeWeightedSourceRow[]
): SourceBreakdown {
  const trustedDetail: Record<string, number> = {};
  const suspiciousDetail: Record<string, number> = {};
  const dangerousDetail: Record<string, number> = {};

  let trusted = 0;
  let suspicious = 0;
  let dangerous = 0;

  const analyzed = rows.reduce((s, r) => s + r.volumeShare, 0);
  const scale = analyzed > 0 ? 100 / analyzed : 0;

  for (const row of rows) {
    const wPct = row.volumeShare * 100;
    const bucket = categorizeAmlSourceBucket(row.entity, row.flags);
    const label = labelForRow(row.entity, row.flags, bucket);

    if (bucket === 'dangerous') {
      dangerous += wPct;
      dangerousDetail[label] = (dangerousDetail[label] ?? 0) + wPct;
    } else if (bucket === 'trusted') {
      trusted += wPct;
      trustedDetail[label] = (trustedDetail[label] ?? 0) + wPct;
    } else {
      suspicious += wPct;
      suspiciousDetail[label] = (suspiciousDetail[label] ?? 0) + wPct;
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const normMap = (d: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(d).map(([k, v]) => [k, round2(v * scale)])
    );

  const st = round2(trusted * scale);
  const su = round2(suspicious * scale);
  const da = round2(dangerous * scale);
  const drift = round2(100 - (st + su + da));
  const suspiciousAdj = round2(su + drift);

  return {
    summary: {
      trusted: st,
      suspicious: suspiciousAdj,
      dangerous: da,
    },
    trusted: normMap(trustedDetail),
    suspicious: normMap(suspiciousDetail),
    dangerous: normMap(dangerousDetail),
  };
}

/**
 * Legacy: equal weight per hop entity (often mislabels unknown as trusted).
 * Kept for fallback when no volume rows exist.
 */
export function computeSourceBreakdown(
  entityFlagsList: RiskFlag[][]
): SourceBreakdown {
  const dangerous: Record<string, number> = {
    Blacklisted: 0,
    Scam: 0,
    Phishing: 0,
    Malicious: 0,
  };
  const suspicious: Record<string, number> = {
    'Liquidity Pools': 0,
    'New Address': 0,
    'High Frequency': 0,
    'Limited Counterparties': 0,
  };
  const trusted: Record<string, number> = { Other: 0 };

  let bucketTrusted = 0;
  let bucketSuspicious = 0;
  let bucketDangerous = 0;

  for (const flags of entityFlagsList) {
    const set = new Set(flags);
    if (set.has('blacklisted')) {
      dangerous.Blacklisted++;
      bucketDangerous++;
      continue;
    }
    if (set.has('scam')) {
      dangerous.Scam++;
      bucketDangerous++;
      continue;
    }
    if (set.has('phishing')) {
      dangerous.Phishing++;
      bucketDangerous++;
      continue;
    }
    if (set.has('malicious')) {
      dangerous.Malicious++;
      bucketDangerous++;
      continue;
    }
    if (set.has('liquidity-pool')) {
      suspicious['Liquidity Pools']++;
      bucketSuspicious++;
      continue;
    }
    if (set.has('new-address')) {
      suspicious['New Address']++;
      bucketSuspicious++;
      continue;
    }
    if (set.has('high-frequency')) {
      suspicious['High Frequency']++;
      bucketSuspicious++;
      continue;
    }
    if (set.has('limited-counterparties')) {
      suspicious['Limited Counterparties']++;
      bucketSuspicious++;
      continue;
    }
    trusted.Other++;
    bucketTrusted++;
  }

  const total = entityFlagsList.length;
  const pct = (count: number) =>
    total === 0 ? 0 : Math.round((count / total) * 10000) / 100;

  const st = pct(bucketTrusted);
  const su = pct(bucketSuspicious);
  const da = pct(bucketDangerous);
  const norm = st + su + da > 0 ? 100 / (st + su + da) : 1;

  return {
    summary: {
      trusted: Math.round(st * norm * 100) / 100,
      suspicious: Math.round(su * norm * 100) / 100,
      dangerous: Math.round(da * norm * 100) / 100,
    },
    trusted: Object.fromEntries(
      Object.entries(trusted).map(([k, v]) => [k, pct(v)])
    ),
    suspicious: Object.fromEntries(
      Object.entries(suspicious).map(([k, v]) => [k, pct(v)])
    ),
    dangerous: Object.fromEntries(
      Object.entries(dangerous).map(([k, v]) => [k, pct(v)])
    ),
  };
}
