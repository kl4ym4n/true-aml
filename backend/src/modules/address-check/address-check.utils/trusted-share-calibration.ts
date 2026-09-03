import {
  TRUST_CALIBRATION_EXP,
  TRUST_CALIBRATION_FLOOR,
  TRUST_DANGEROUS_UPLIFT_K,
} from './advanced-risk.constants';

/**
 * Behavioral dampening when analyzed stablecoin inflow is mostly trusted (CEX-like).
 */
export function behaviorMultiplierFromTrustedShare(trustedShare01: number): number {
  if (trustedShare01 >= 0.9) return 0.35;
  if (trustedShare01 >= 0.7) return 0.5;
  if (trustedShare01 >= 0.5) return 0.75;
  return 1;
}

export interface TrustedFlowCalibrationResult {
  score: number;
  trustLayerFactor: number;
  trustLayerApplied: boolean;
  dangerousUplift: number;
  explanationLines: string[];
}

/**
 * Post-blend calibration: smooth continuous curve instead of discrete thresholds.
 * trustLayerFactor = floor + (1 - floor) * (1 - trustedShare01) ^ exp
 * dangerousUplift = k * dangerousShare01 * 100
 *
 * This produces proportional suppression without sudden jumps at threshold boundaries.
 */
export function applyTrustedShareScoreCalibration(input: {
  preliminaryScore: number;
  trustedShare01: number;
  dangerousShare01: number;
}): TrustedFlowCalibrationResult {
  const lines: string[] = [];
  const d = input.dangerousShare01;
  const t = input.trustedShare01;

  // Continuous trust suppression curve
  const trustLayerFactor = Math.max(
    TRUST_CALIBRATION_FLOOR,
    TRUST_CALIBRATION_FLOOR + (1 - TRUST_CALIBRATION_FLOOR) * Math.pow(1 - t, TRUST_CALIBRATION_EXP)
  );
  const trustLayerApplied = trustLayerFactor < 1;

  if (trustLayerApplied) {
    lines.push(
      'Trusted exchange-like inflow dominates; overall risk is calibrated down (small dangerous traces still count).'
    );
  }

  // Proportional dangerous uplift
  const dpct = d * 100;
  const dangerousUplift = Math.round(TRUST_DANGEROUS_UPLIFT_K * dpct * 100) / 100;

  const upliftRounded = Math.round(dangerousUplift * 100) / 100;
  if (dpct > 0.1) {
    lines.push(
      `Dangerous exposure detected (${dpct.toFixed(2)}% of analyzed inflow) — score includes +${upliftRounded} uplift.`
    );
  }

  const blended = input.preliminaryScore * trustLayerFactor + dangerousUplift;
  const score = Math.max(0, Math.min(100, Math.round(blended * 100) / 100));

  return {
    score,
    trustLayerFactor: Math.round(trustLayerFactor * 10000) / 10000,
    trustLayerApplied,
    dangerousUplift,
    explanationLines: lines,
  };
}
