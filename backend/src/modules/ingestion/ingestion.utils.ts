import type { BlacklistCategory } from '@prisma/client';
import { clamp01, type AddressRecord } from './ingestion.types';

export const CATEGORY_PRIORITY: Record<BlacklistCategory, number> = {
  SANCTION: 4,
  SCAM: 3,
  PHISHING: 2,
  SUSPICIOUS: 1,
  MIXER: 0,
  EXCHANGE: 0,
};

export function pickStrongerCategory(
  a: BlacklistCategory,
  b: BlacklistCategory
): BlacklistCategory {
  return (CATEGORY_PRIORITY[b] ?? 0) > (CATEGORY_PRIORITY[a] ?? 0) ? b : a;
}

export function combineIndependentConfidences(confidences: number[]): number {
  // 1 - Π(1 - c_i)
  let prod = 1;
  for (const c of confidences) prod *= 1 - clamp01(c);
  return clamp01(1 - prod);
}

export function mergeAddressRecords(records: AddressRecord[]): Map<
  string,
  {
    address: string;
    category: AddressRecord['category'];
    combinedConfidence: number;
    sources: string[];
  }
> {
  const grouped = new Map<
    string,
    {
      address: string;
      category: AddressRecord['category'];
      confidences: number[];
      sources: Set<string>;
    }
  >();

  const rank: Record<AddressRecord['category'], number> = {
    sanctions: 4,
    scam: 3,
    phishing: 2,
    suspicious: 1,
  };

  for (const r of records) {
    const cur = grouped.get(r.address);
    if (!cur) {
      grouped.set(r.address, {
        address: r.address,
        category: r.category,
        confidences: [clamp01(r.confidence)],
        sources: new Set([r.source]),
      });
      continue;
    }

    if ((rank[r.category] ?? 0) > (rank[cur.category] ?? 0)) {
      cur.category = r.category;
    }
    cur.confidences.push(clamp01(r.confidence));
    cur.sources.add(r.source);
  }

  const out = new Map<string, any>();
  for (const [address, g] of grouped.entries()) {
    out.set(address, {
      address,
      category: g.category,
      combinedConfidence: combineIndependentConfidences(g.confidences),
      sources: Array.from(g.sources.values()).sort(),
    });
  }
  return out;
}
