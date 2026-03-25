import type { RiskFlag } from '../address-check.types';
import {
  WEIGHT_DIRECT_RISK,
  WEIGHT_TAINT,
  WEIGHT_BEHAVIORAL,
  WEIGHT_VOLUME,
} from '../address-check.constants';

/** Taint score 0–100 from taint percent */
export function getTaintScore(taintPercent: number): number {
  if (taintPercent > 50) return 90;
  if (taintPercent > 30) return 70;
  if (taintPercent > 10) return 40;
  if (taintPercent > 5) return 20;
  return 0;
}

const BEHAVIORAL_FLAG_SCORES: Record<string, number> = {
  blacklisted: 100,
  scam: 90,
  phishing: 85,
  malicious: 70,
  'liquidity-pool': 40,
  'high-frequency': 30,
  'limited-counterparties': 25,
  'new-address': 20,
  'low-activity': 10,
};

/** Behavioral score 0–100 from direct and counterparty flags (max of flag scores). */
export function getBehavioralScore(
  flags: RiskFlag[],
  flagsFromOtherHops: RiskFlag[]
): number {
  let score = 0;
  for (const f of flags) {
    score = Math.max(score, BEHAVIORAL_FLAG_SCORES[f] ?? 0);
  }
  for (const f of flagsFromOtherHops) {
    score = Math.max(score, BEHAVIORAL_FLAG_SCORES[f] ?? 0);
  }
  return Math.min(100, score);
}

/** Volume score 0–100 from total incoming TRC20 volume (log scale). */
export function getVolumeScore(totalIncomingVolume: number): number {
  if (totalIncomingVolume <= 0) return 0;
  return Math.min(100, Math.log10(1 + totalIncomingVolume) * 25);
}

/** Final risk: DirectRisk*0.5 + TaintScore*0.25 + BehavioralScore*0.15 + VolumeScore*0.10, cap 100. */
export function getFinalRiskScore(
  directRisk: number,
  taintScore: number,
  behavioralScore: number,
  volumeScore: number
): number {
  return Math.min(
    100,
    directRisk * WEIGHT_DIRECT_RISK +
      taintScore * WEIGHT_TAINT +
      behavioralScore * WEIGHT_BEHAVIORAL +
      volumeScore * WEIGHT_VOLUME
  );
}
