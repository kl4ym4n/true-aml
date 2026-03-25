import type { RiskFlag, SourceBreakdown } from '../address-check.types';

/**
 * Compute source breakdown (trusted / suspicious / dangerous) from per-entity flags.
 * Each entity is classified into worst category; percentages are share of entities.
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

  for (const flags of entityFlagsList) {
    const set = new Set(flags);
    if (set.has('blacklisted')) {
      dangerous.Blacklisted++;
      continue;
    }
    if (set.has('scam')) {
      dangerous.Scam++;
      continue;
    }
    if (set.has('phishing')) {
      dangerous.Phishing++;
      continue;
    }
    if (set.has('malicious')) {
      dangerous.Malicious++;
      continue;
    }
    if (set.has('liquidity-pool')) {
      suspicious['Liquidity Pools']++;
      continue;
    }
    if (set.has('new-address')) {
      suspicious['New Address']++;
      continue;
    }
    if (set.has('high-frequency')) {
      suspicious['High Frequency']++;
      continue;
    }
    if (set.has('limited-counterparties')) {
      suspicious['Limited Counterparties']++;
      continue;
    }
    trusted.Other++;
  }

  const total = entityFlagsList.length;
  const pct = (count: number) =>
    total === 0 ? 0 : Math.round((count / total) * 10000) / 100;

  return {
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
