import type { CrawlSeedKind, EntityType } from '@prisma/client';
import { getWhitelistLevel } from '../address-check/address-check.utils/whitelist';
import type { InfrastructureCandidateInput } from './crawler.types';
import { clamp01 } from './ingestion.types';

/** Ordered strength for queue row `seedKind` upgrades. */
const SEED_ORDER: Record<CrawlSeedKind, number> = {
  DIRECT_STRONG: 3,
  DERIVED_SUSPICIOUS: 2,
  OBSERVED_LOW: 1,
};

export function preferStrongerCrawlSeedKind(
  a: CrawlSeedKind,
  b: CrawlSeedKind
): CrawlSeedKind {
  return SEED_ORDER[b] > SEED_ORDER[a] ? b : a;
}

export function queuePriorityForSeed(
  kind: CrawlSeedKind,
  rootConfidence?: number
): number {
  const base =
    kind === 'DIRECT_STRONG' ? 1000 : kind === 'DERIVED_SUSPICIOUS' ? 100 : 10;
  const c = rootConfidence != null ? clamp01(rootConfidence) * 50 : 0;
  return base + c;
}

function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Spec: shareWeight = clamp(share / 0.25, 0.1, 1), volumeWeight = clamp(log10(v+1)/5, 0.2, 1),
 * interactionWeight = clamp(txCount/5, 0.3, 1), depthPenalty = 1 / ((hopDepth + 1) + 1).
 */
export function computeCrawlerSignalConfidence(input: {
  rootConfidence: number;
  share: number;
  counterpartyVolume: number;
  txCount: number;
  hopDepth: number;
}): number {
  const shareWeight = clamp(input.share / 0.25, 0.1, 1);
  const volumeWeight = clamp(
    Math.log10(input.counterpartyVolume + 1) / 5,
    0.2,
    1
  );
  const interactionWeight = clamp(input.txCount / 5, 0.3, 1);
  const d = Math.max(0, input.hopDepth);
  const depthPenalty = 1 / (d + 2);
  return clamp01(
    clamp01(input.rootConfidence) *
      shareWeight *
      volumeWeight *
      interactionWeight *
      depthPenalty
  );
}

/** Probabilistic OR of independent hit probabilities; clamp 0..1. */
export function combineConfidenceProbabilistic(
  oldConfidence: number,
  signalConfidence: number
): number {
  const a = clamp01(oldConfidence);
  const b = clamp01(signalConfidence);
  return clamp01(1 - (1 - a) * (1 - b));
}

export function recrawlIntervalMsForSeedKind(
  kind: CrawlSeedKind,
  opts: {
    directRecrawlHours: number;
    derivedRecrawlHours: number;
    lowConfidenceRecrawlHours: number;
    /** When seed is observed_low and root confidence is below this, use longer TTL. */
    lowConfidenceThreshold?: number;
    rootConfidence?: number;
  }
): number {
  if (kind === 'DIRECT_STRONG') {
    return opts.directRecrawlHours * 3600_000;
  }
  if (kind === 'DERIVED_SUSPICIOUS') {
    return opts.derivedRecrawlHours * 3600_000;
  }
  const th = opts.lowConfidenceThreshold ?? 0.35;
  const rc = opts.rootConfidence ?? 0;
  if (rc < th) {
    return opts.lowConfidenceRecrawlHours * 3600_000;
  }
  return opts.derivedRecrawlHours * 3600_000;
}

export function failureBackoffMs(
  consecutiveFailures: number,
  baseMinutes: number,
  maxMinutes: number
): number {
  const exp = Math.min(
    maxMinutes,
    baseMinutes * Math.pow(2, Math.max(0, consecutiveFailures - 1))
  );
  return exp * 60_000;
}

/**
 * Suppress blacklist promotion for likely CEX / bridge / LP style wallets.
 * Keeps edges & candidate rows; only blocks promotion (caller sets `isInfrastructure`).
 *
 * TODO: plug chain-agnostic labels (TronScan tags, Arkham, …) via `externalTags` / `entityType`.
 */
export function isLikelyInfrastructureCandidate(
  input: InfrastructureCandidateInput
): boolean {
  const wl = getWhitelistLevel(input.address);
  if (wl === 'strong') return true;

  const et = input.entityType;
  if (
    et === 'exchange' ||
    et === 'payment_processor' ||
    et === 'bridge' ||
    et === 'lp'
  ) {
    return true;
  }

  const tags = (input.externalTags ?? []).map(t => t.toLowerCase());
  if (
    tags.some(
      x =>
        x.includes('exchange') ||
        x.includes('bridge') ||
        x.includes('liquidity') ||
        x.includes('binance') ||
        x.includes('okx')
    )
  ) {
    return true;
  }

  const { edge } = input;
  if (edge && edge.volume >= 500_000 && edge.share < 0.003) {
    return true;
  }

  if (input.uniqueCounterpartyCount >= 120) {
    return true;
  }

  if (
    input.interactionCount >= 25 &&
    input.maxObservedShare > 0 &&
    input.maxObservedShare < 0.015
  ) {
    return true;
  }

  return false;
}

/** TODO(classification): map tags / heuristics to EntityType without full ML. */
export function suggestEntityTypeFromHeuristics(input: {
  isWhitelistedExchange: boolean;
  tags?: string[];
}): EntityType | null {
  if (input.isWhitelistedExchange) return 'exchange';
  return null;
}

const MIN_ROOT_SIGNAL_FOR_CONTRIBUTOR = 0.04;
const MAX_STORED_ROOTS = 48;

/**
 * Distinct crawl roots that contributed material signal; drives multi-root confidence boost.
 * Formula per edge: signal × (1 + 0.3 × max(0, n−1)) after adding this root.
 */
export function mergeRiskyContributorRoots(
  existingJson: unknown,
  rootAddress: string,
  signalConfidence: number
): { roots: string[]; signalMultiplier: number } {
  const prev = Array.isArray(existingJson)
    ? (existingJson as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const set = new Set(prev);
  if (
    rootAddress &&
    signalConfidence >= MIN_ROOT_SIGNAL_FOR_CONTRIBUTOR
  ) {
    set.add(rootAddress);
  }
  const roots = [...set].slice(0, MAX_STORED_ROOTS);
  const n = roots.length;
  const signalMultiplier = 1 + 0.3 * Math.max(0, n - 1);
  return { roots, signalMultiplier };
}
