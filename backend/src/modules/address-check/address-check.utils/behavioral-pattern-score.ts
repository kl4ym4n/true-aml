import type { TransactionPatterns } from '../address-check.pattern-analyzer';

/**
 * Numeric behavioral risk 0–100 from graph/velocity heuristics (not flag max).
 */
export function computeBehavioralPatternScore(
  patterns: TransactionPatterns
): number {
  let score = 0;

  // High velocity: many txs close in time
  if (patterns.hasHighVelocity) score += 28;
  else if (patterns.hasHighFrequency) score += 18;

  // Fan-in / fan-out topology
  if (patterns.isFanIn) score += 22;
  if (patterns.isFanOut) score += 18;

  // Looping / smurfing-like repetition
  if (patterns.hasLoopingFunds) score += 20;
  if (patterns.repeatedInteractionScore >= 0.5) score += 12;

  // Fast cash-out after inflow
  if (patterns.hasFastCashOut) score += 15;

  // DeFi / pool heavy (higher layering risk)
  if (patterns.liquidityPoolInteractions > 0) {
    score += Math.min(15, patterns.liquidityPoolInteractions * 3);
  }

  // Swap-heavy contract usage
  if (patterns.swapLikeRatio >= 0.4) score += 10;

  return Math.min(100, Math.round(score));
}
