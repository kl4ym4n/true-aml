/** Final AML blend (configurable; sum should be 1.0) */
export const WEIGHT_AML_BASE = 0.35;
export const WEIGHT_AML_TAINT = 0.3;
export const WEIGHT_AML_BEHAVIORAL = 0.2;
export const WEIGHT_AML_VOLUME = 0.15;

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
  gambling: 0.4,
  p2p: 0.3,
  defi: 0.35,
  bridge: 0.4,
  exchange: 0.1,
  unknown: 0.2,
};

export function getEntityRiskWeight(entityType: string): number {
  return ENTITY_RISK_WEIGHT[entityType] ?? ENTITY_RISK_WEIGHT.unknown;
}
