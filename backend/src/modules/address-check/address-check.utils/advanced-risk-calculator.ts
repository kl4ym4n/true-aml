import {
  WEIGHT_AML_BASE,
  WEIGHT_AML_BEHAVIORAL,
  WEIGHT_AML_TAINT,
  WEIGHT_AML_VOLUME,
} from './advanced-risk.constants';
import type { TransactionPatterns } from '../address-check.pattern-analyzer';

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
    } = input;

    const raw =
      baseRisk * this.weights.base +
      taintScore * this.weights.taint +
      behavioralScore * this.weights.behavioral +
      volumeScore * this.weights.volume;

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
    if (taintScore >= 40) {
      explanation.push('Elevated source-of-funds taint score');
    }
    if (baseRisk >= 40) {
      explanation.push('Elevated base risk from direct signals');
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
    };
  }
}
