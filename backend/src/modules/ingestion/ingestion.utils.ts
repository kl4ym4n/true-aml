import type {
  BlacklistedAddress,
  BlacklistCategory,
  EntityType,
} from '@prisma/client';
import { clamp01, type AddressRecord } from './ingestion.types';

/**
 * Explicit AML category strength (higher = stronger signal).
 * MIXER / EXCHANGE are weak as blacklist *categories*; entity typing may move to {@link EntityType} later.
 */
export const CATEGORY_PRIORITY: Record<BlacklistCategory, number> = {
  SANCTION: 100,
  STOLEN_FUNDS: 95,
  RANSOM: 95,
  DARK_MARKET: 90,
  SCAM: 85,
  PHISHING: 80,
  MIXER: 80,
  SUSPICIOUS: 40,
  EXCHANGE: 10,
};

/** Propagation from graph expansion must not introduce labels stronger than this by default. */
export const PROPAGATION_MAX_CATEGORY: BlacklistCategory = 'SUSPICIOUS';

export function categoryPriority(c: BlacklistCategory): number {
  return CATEGORY_PRIORITY[c] ?? 0;
}

export function pickStrongerCategory(
  a: BlacklistCategory,
  b: BlacklistCategory
): BlacklistCategory {
  return categoryPriority(b) > categoryPriority(a) ? b : a;
}

/**
 * Optional hint for entity typing (P2); category remains the AML bucket.
 */
export function entityTypeHintFromCategory(
  category: BlacklistCategory
): EntityType | null {
  if (category === 'EXCHANGE') return 'exchange';
  if (category === 'MIXER') return 'mixer';
  return null;
}

/**
 * Depth-aware confidence (P2): use for reporting / secondary scoring — not double-applied inside
 * {@link computeDerivedExpansionConfidence} which already uses depthPenalty.
 */
export function effectiveConfidenceFromDepth(
  confidence: number,
  depth: number
): number {
  const d = Math.max(0, depth);
  return clamp01(confidence * (1 / (d + 1)));
}

/**
 * Expansion-derived confidence (P0): share, volume, interactions, hop depth.
 * depth = hop count from expansion root (1 for first hop from a seed root).
 */
export function computeDerivedExpansionConfidence(input: {
  rootConfidence: number;
  share: number;
  volume: number;
  txCount: number;
  /** Hop depth from root; use 1 for direct counterparties of a non-derived root. */
  depth: number;
}): number {
  const shareWeight = clamp01(
    Math.max(0.1, Math.min(1, input.share / 0.25))
  );
  const volumeWeight = clamp01(
    Math.max(0.2, Math.min(1, Math.log10(input.volume + 1) / 5))
  );
  const interactionWeight = clamp01(
    Math.max(0.3, Math.min(1, input.txCount / 5))
  );
  const d = Math.max(0, input.depth);
  const depthPenalty = 1 / (d + 1);
  return clamp01(
    input.rootConfidence *
      shareWeight *
      volumeWeight *
      interactionWeight *
      depthPenalty
  );
}

/**
 * Category merge for expansion-derived rows (P0 graph contamination fix).
 * - New derived row: SUSPICIOUS only (never copy root category).
 * - Existing non-derived (direct/seed): never overwrite category from propagation.
 * - Existing derived: may strengthen vs propagation ceiling only (no new SCAM/SANCTION from root alone).
 */
export function mergeCategoryForExpansion(args: {
  existing: BlacklistedAddress | undefined;
}): BlacklistCategory {
  if (!args.existing) {
    return 'SUSPICIOUS';
  }
  if (!args.existing.isDerived) {
    return args.existing.category;
  }
  return pickStrongerCategory(
    args.existing.category,
    PROPAGATION_MAX_CATEGORY
  );
}

export function combineIndependentConfidences(confidences: number[]): number {
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

  const out = new Map<string, {
    address: string;
    category: AddressRecord['category'];
    combinedConfidence: number;
    sources: string[];
  }>();
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
