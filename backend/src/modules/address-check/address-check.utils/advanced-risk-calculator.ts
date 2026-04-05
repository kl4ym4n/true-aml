import {
  WEIGHT_AML_BASE,
  WEIGHT_AML_BEHAVIORAL,
  WEIGHT_AML_TAINT,
  WEIGHT_AML_VOLUME,
  isExchangeLikePattern,
} from './advanced-risk.constants';
import type { TransactionPatterns } from '../address-check.pattern-analyzer';
import { behaviorMultiplierFromTrustedShare } from './trusted-share-calibration';

export interface ScoreBreakdownAml {
  baseRisk: number;
  taintScore: number;
  behavioralScore: number;
  volumeScore: number;
}

export interface AdvancedRiskResult {
  score: number;
  breakdown: ScoreBreakdownAml;
  explanation: string[];
  behavioralTrustMultiplier: number;
}

export interface AdvancedRiskInput {
  baseRisk: number;
  /** 0–100 taint contribution (already normalized) */
  taintScore: number;
  /** 0–100 */
  behavioralScore: number;
  /** 0–100 */
  volumeScore: number;
  patterns?: TransactionPatterns;
  /** Optional labels for explainability */
  taintHints?: string[];
  /** Volume-weighted trusted share (0..1) from source-of-funds breakdown */
  trustedShare01?: number;
  /** Volume-weighted dangerous share (0..1) */
  dangerousShare01?: number;
}

/**
 * Central AML blend: configurable weights, clamped 0–100, human explanations.
 */
export class AdvancedRiskCalculator {
  constructor(
    private readonly weights = {
      base: WEIGHT_AML_BASE,
      taint: WEIGHT_AML_TAINT,
      behavioral: WEIGHT_AML_BEHAVIORAL,
      volume: WEIGHT_AML_VOLUME,
    }
  ) {}

  calculate(input: AdvancedRiskInput): AdvancedRiskResult {
    const {
      baseRisk,
      taintScore,
      behavioralScore,
      volumeScore,
      patterns,
      taintHints,
      trustedShare01 = 0,
      dangerousShare01 = 0,
    } = input;

    const exchangeLike = patterns && isExchangeLikePattern(patterns);
    const trustBeh = behaviorMultiplierFromTrustedShare(trustedShare01);
    const behavioralEff =
      behavioralScore *
      (exchangeLike ? 0.42 : 1) *
      trustBeh;
    const taintTrustMul =
      trustedShare01 >= 0.7 ? 0.62 : trustedShare01 >= 0.5 ? 0.82 : 1;
    const taintEff =
      taintScore * (exchangeLike ? 1.08 : 1) * taintTrustMul;
    const volumeEff = exchangeLike ? volumeScore * 0.85 : volumeScore;

    const raw =
      baseRisk * this.weights.base +
      taintEff * this.weights.taint +
      behavioralEff * this.weights.behavioral +
      volumeEff * this.weights.volume;

    const score = Math.max(0, Math.min(100, Math.round(raw * 100) / 100));

    const explanation: string[] = [];

    if (taintHints && taintHints.length > 0) {
      explanation.push(...taintHints.slice(0, 6));
    }

    if (patterns?.hasHighVelocity) {
      explanation.push('High velocity transaction pattern');
    }
    if (patterns?.hasLoopingFunds) {
      explanation.push(
        'Repeated funding from the same sources (looping / smurfing-like)'
      );
    }
    if (patterns?.isFanIn) {
      explanation.push('Fan-in pattern (many sources → one address)');
    }
    if (patterns?.isFanOut) {
      explanation.push('Fan-out pattern (one address → many destinations)');
    }
    if (patterns?.hasFastCashOut) {
      explanation.push('Fast cash-out after incoming funds');
    }
    if (taintScore >= 40 && trustedShare01 < 0.55) {
      explanation.push('Elevated source-of-funds taint score');
    }
    if (baseRisk >= 40) {
      explanation.push('Elevated base risk from direct signals');
    }

    if (trustedShare01 >= 0.55) {
      explanation.push(
        'Most analyzed stablecoin inflow is classified as trusted (e.g. known exchanges or payment rails).'
      );
    }
    if (trustedShare01 >= 0.5 && dangerousShare01 > 0) {
      explanation.push(
        `Residual dangerous source share remains visible (${(dangerousShare01 * 100).toFixed(2)}% of analyzed inflow).`
      );
    }
    if (patterns?.isFanIn && trustedShare01 >= 0.55) {
      explanation.push(
        'Behavioral fan-in is partly discounted because inflow maps to trusted-classified sources.'
      );
    }
    if (trustBeh < 1) {
      explanation.push(
        'Behavioral signal is partially suppressed due to a trusted exchange-like source profile.'
      );
    }

    if (explanation.length === 0) {
      explanation.push('No strong AML signals beyond baseline analysis');
    }

    return {
      score,
      breakdown: {
        baseRisk,
        taintScore,
        behavioralScore,
        volumeScore,
      },
      explanation: [...new Set(explanation)].slice(0, 12),
      behavioralTrustMultiplier: trustBeh,
    };
  }
}
