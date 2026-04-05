import type { EntityType as PrismaEntityType } from '@prisma/client';
import type { TransactionPatterns } from '../address-check.pattern-analyzer';

/**
 * On-chain / graph stats for MVP entity typing (TRON today).
 * TODO(multi-chain): pass chain id; plug labeled registries when available.
 */
export interface EntityDetectionStats {
  uniqueCounterpartyCount: number;
  txCount: number;
  /** Max share of flow to a single counterparty (0..1). */
  maxCounterpartyShare: number;
  liquidityPoolInteractions?: number;
  swapLikeRatio?: number;
}

/**
 * Heuristic entity classification for CandidateSignal / refinement.
 * Prefer provider tags via {@link classifyEntity} when available; this fills gaps.
 */
export function detectEntityType(
  _address: string,
  stats: EntityDetectionStats,
  patterns?: TransactionPatterns | null
): PrismaEntityType {
  const liq =
    stats.liquidityPoolInteractions ??
    patterns?.liquidityPoolInteractions ??
    0;
  const swap = stats.swapLikeRatio ?? patterns?.swapLikeRatio ?? 0;

  if (liq >= 2 || swap >= 0.38) {
    return 'liquidity_pool';
  }

  const mixerLike =
    (patterns?.isFanIn &&
      patterns?.isFanOut &&
      (patterns?.hasHighVelocity || patterns?.hasHighFrequency)) ||
    (patterns?.repeatedInteractionScore ?? 0) >= 0.55;

  if (mixerLike && stats.txCount >= 30 && stats.maxCounterpartyShare < 0.12) {
    return 'mixer';
  }

  if (
    stats.uniqueCounterpartyCount > 100 &&
    stats.txCount > 200 &&
    stats.maxCounterpartyShare < 0.06
  ) {
    return 'exchange';
  }

  if (
    stats.uniqueCounterpartyCount > 60 &&
    stats.txCount > 120 &&
    stats.maxCounterpartyShare < 0.09
  ) {
    return 'payment_processor';
  }

  return 'unknown';
}
