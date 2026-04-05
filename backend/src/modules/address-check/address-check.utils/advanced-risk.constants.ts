import type { TransactionPatterns } from '../address-check.pattern-analyzer';

/** Final AML blend (configurable; sum should be 1.0) */
export const WEIGHT_AML_BASE = 0.38;
export const WEIGHT_AML_TAINT = 0.36;
export const WEIGHT_AML_BEHAVIORAL = 0.12;
export const WEIGHT_AML_VOLUME = 0.14;

/** Taint accumulation: time decay λ for exp(-λ * days) */
export const TAINT_TIME_DECAY_LAMBDA = 0.01;

/** Hop multipliers (1-based hop depth from root incoming edge) */
export function taintHopWeight(hopDepth: number): number {
  if (hopDepth <= 1) return 1;
  if (hopDepth === 2) return 0.5;
  return 1 / 3;
}

/** Entity risk weights for taint contribution (0–1) */
export const ENTITY_RISK_WEIGHT: Record<string, number> = {
  mixer: 1.0,
  sanctions: 1.0,
  scam: 0.95,
  darknet: 0.9,
  phishing: 0.9,
  gambling: 0.58,
  p2p: 0.3,
  defi: 0.35,
  liquidity_pool: 0.38,
  bridge: 0.4,
  exchange: 0.08,
  payment_processor: 0.1,
  unknown: 0.22,
};

export function getEntityRiskWeight(entityType: string): number {
  return ENTITY_RISK_WEIGHT[entityType] ?? ENTITY_RISK_WEIGHT.unknown;
}

/** CEX-like: many counterparties + fan-in → suppress overweight behavioral noise. */
export function isExchangeLikePattern(patterns: TransactionPatterns): boolean {
  return patterns.uniqueCounterparties >= 72 && patterns.isFanIn;
}

/** Taint curve: stronger saturation; small residual taint still moves the needle. */
export const TAINT_EXP_K = 2.15;
/** Extra taint score points per % risky stablecoin volume when taintPercent &lt; 6. */
export const SMALL_TAINT_PERCENT_MULTIPLIER = 2.8;
