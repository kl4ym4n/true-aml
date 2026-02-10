export interface RiskMetric {
  [key: string]: number | boolean | string | null | undefined;
}

export interface RiskRule {
  name: string;
  description: string;
  weight: number; // Contribution to risk score (0-100)
  condition: (flags: string[], metrics: RiskMetric) => boolean;
  severity?: 'low' | 'medium' | 'high' | 'critical'; // Optional severity classification
}

export interface AppliedRule {
  name: string;
  description: string;
  weight: number;
  triggered: boolean;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface RiskScoreResult {
  riskScore: number; // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  appliedRules: AppliedRule[];
  breakdown: {
    totalWeight: number;
    triggeredWeight: number;
    ruleCount: number;
    triggeredCount: number;
  };
}

export interface RiskEngineConfig {
  rules: RiskRule[];
  riskLevelThresholds?: {
    critical?: number;
    high?: number;
    medium?: number;
  };
  maxScore?: number; // Default 100
}

