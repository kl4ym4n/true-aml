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
 * Post-blend calibration: high trusted share + low dangerous → lower score,
 * but small dangerous exposure still adds uplift (BitOK-style visibility).
 */
export function applyTrustedShareScoreCalibration(input: {
  preliminaryScore: number;
  trustedShare01: number;
  dangerousShare01: number;
}): TrustedFlowCalibrationResult {
  const lines: string[] = [];
  let trustLayerFactor = 1;
  let trustLayerApplied = false;

  const d = input.dangerousShare01;
  const t = input.trustedShare01;

  if (t >= 0.7 && d < 0.01) {
    trustLayerFactor = 0.65;
    trustLayerApplied = true;
    lines.push(
      'Trusted exchange-like inflow dominates; overall risk is calibrated down (small dangerous traces still count).'
    );
  } else if (t >= 0.5 && d < 0.02) {
    trustLayerFactor = 0.8;
    trustLayerApplied = true;
    lines.push(
      'Majority of inflow is trusted-classified; score partially suppressed versus a pure behavior-only read.'
    );
  }

  let dangerousUplift = 0;
  const dpct = d * 100;
  if (dpct > 2) {
    dangerousUplift = 12;
    lines.push(
      'Meaningful dangerous source share detected — score includes a dedicated uplift.'
    );
  } else if (dpct > 0.5) {
    dangerousUplift = 7;
    lines.push(
      'Moderate dangerous exposure in inflow — reflected in the final score.'
    );
  } else if (dpct > 0.1) {
    dangerousUplift = 3;
    lines.push(
      'Small but non-zero dangerous share kept visible in scoring (sanctions / scam / mixer path).'
    );
  }

  const blended =
    input.preliminaryScore * trustLayerFactor + dangerousUplift;
  const score = Math.max(
    0,
    Math.min(100, Math.round(blended * 100) / 100)
  );

  return {
    score,
    trustLayerFactor,
    trustLayerApplied,
    dangerousUplift,
    explanationLines: lines,
  };
}
