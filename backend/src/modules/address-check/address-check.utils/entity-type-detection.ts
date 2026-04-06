import type { EntityType as PrismaEntityType } from '@prisma/client';
import type { TransactionPatterns } from '../address-check.pattern-analyzer';
import { isStrongWhitelistedExchange } from './whitelist';

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
  address: string,
  stats: EntityDetectionStats,
  patterns?: TransactionPatterns | null
): PrismaEntityType {
  if (isStrongWhitelistedExchange(address)) {
    return 'exchange';
  }

  const liq =
    stats.liquidityPoolInteractions ?? patterns?.liquidityPoolInteractions ?? 0;
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

  const uc = stats.uniqueCounterpartyCount;
  const tx = stats.txCount;
  const mx = stats.maxCounterpartyShare;

  if (tx > 50 && mx < 0.2 && uc >= 15) {
    return 'exchange';
  }

  if (tx > 40 && mx < 0.25 && uc >= 30) {
    return 'exchange';
  }

  if (tx > 35 && mx < 0.22 && uc >= 20) {
    return 'payment_processor';
  }

  if (tx > 28 && mx < 0.28 && uc >= 18) {
    return 'payment_processor';
  }

  return 'unknown';
}
