import {
  RiskEngineConfig,
  RiskScoreResult,
  RiskMetric,
  RiskRule,
  AppliedRule,
} from './risk-engine.types';

// Default risk level thresholds
const DEFAULT_THRESHOLDS = {
  critical: 80,
  high: 50,
  medium: 25,
};

export class RiskEngine {
  private config: Required<RiskEngineConfig>;

  constructor(config: RiskEngineConfig) {
    this.config = {
      rules: config.rules,
      riskLevelThresholds: {
        ...DEFAULT_THRESHOLDS,
        ...config.riskLevelThresholds,
      },
      maxScore: config.maxScore ?? 100,
    };

    // Validate rules
    this.validateRules();
  }

  /**
   * Calculate risk score based on flags and metrics
   * @param flags - Array of risk flags
   * @param metrics - Risk metrics (numbers, booleans, etc.)
   * @returns Risk score result with explanation
   */
  calculateRisk(flags: string[], metrics: RiskMetric = {}): RiskScoreResult {
    // Evaluate all rules
    const appliedRules = this.evaluateRules(flags, metrics);

    // Calculate risk score
    const triggeredRules = appliedRules.filter(rule => rule.triggered);
    const triggeredWeight = triggeredRules.reduce(
      (sum, rule) => sum + rule.weight,
      0
    );
    const totalWeight = this.config.rules.reduce(
      (sum, rule) => sum + rule.weight,
      0
    );

    // Calculate score as percentage of triggered weights
    // If total weight is 0, return 0
    const baseScore =
      totalWeight > 0
        ? (triggeredWeight / totalWeight) * this.config.maxScore
        : 0;

    // Apply severity multipliers for critical/high severity rules
    const severityMultiplier = this.calculateSeverityMultiplier(triggeredRules);
    const riskScore = Math.min(
      Math.round(baseScore * severityMultiplier),
      this.config.maxScore
    );

    // Determine risk level
    const riskLevel = this.determineRiskLevel(riskScore);

    return {
      riskScore,
      riskLevel,
      appliedRules,
      breakdown: {
        totalWeight,
        triggeredWeight,
        ruleCount: this.config.rules.length,
        triggeredCount: triggeredRules.length,
      },
    };
  }

  /**
   * Evaluate all rules against flags and metrics
   */
  private evaluateRules(flags: string[], metrics: RiskMetric): AppliedRule[] {
    return this.config.rules.map(rule => ({
      name: rule.name,
      description: rule.description,
      weight: rule.weight,
      triggered: rule.condition(flags, metrics),
      severity: rule.severity,
    }));
  }

  /**
   * Calculate severity multiplier based on triggered rules
   */
  private calculateSeverityMultiplier(triggeredRules: AppliedRule[]): number {
    const hasCritical = triggeredRules.some(
      rule => rule.severity === 'critical' && rule.triggered
    );
    const hasHigh = triggeredRules.some(
      rule => rule.severity === 'high' && rule.triggered
    );

    if (hasCritical) {
      return 1.2; // 20% boost for critical rules
    } else if (hasHigh) {
      return 1.1; // 10% boost for high severity rules
    }

    return 1.0;
  }

  /**
   * Determine risk level based on score
   */
  private determineRiskLevel(
    score: number
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const thresholds = this.config.riskLevelThresholds;
    const critical = thresholds.critical ?? DEFAULT_THRESHOLDS.critical;
    const high = thresholds.high ?? DEFAULT_THRESHOLDS.high;
    const medium = thresholds.medium ?? DEFAULT_THRESHOLDS.medium;

    if (score >= critical) {
      return 'CRITICAL';
    } else if (score >= high) {
      return 'HIGH';
    } else if (score >= medium) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * Validate rules configuration
   */
  private validateRules(): void {
    if (this.config.rules.length === 0) {
      throw new Error('Risk engine must have at least one rule');
    }

    // Check for duplicate rule names
    const ruleNames = this.config.rules.map(rule => rule.name);
    const uniqueNames = new Set(ruleNames);
    if (uniqueNames.size !== ruleNames.length) {
      throw new Error('Risk engine rules must have unique names');
    }

    // Validate weights are non-negative
    const invalidWeights = this.config.rules.filter(rule => rule.weight < 0);
    if (invalidWeights.length > 0) {
      throw new Error('Risk rule weights must be non-negative');
    }
  }

  /**
   * Get rule by name
   */
  getRule(name: string): RiskRule | undefined {
    return this.config.rules.find(rule => rule.name === name);
  }

  /**
   * Update rule weight
   */
  updateRuleWeight(name: string, weight: number): void {
    const rule = this.config.rules.find(r => r.name === name);
    if (!rule) {
      throw new Error(`Rule ${name} not found`);
    }
    if (weight < 0) {
      throw new Error('Rule weight must be non-negative');
    }
    rule.weight = weight;
  }

  /**
   * Add a new rule
   */
  addRule(rule: RiskRule): void {
    // Check for duplicate name
    if (this.config.rules.some(r => r.name === rule.name)) {
      throw new Error(`Rule ${rule.name} already exists`);
    }
    this.config.rules.push(rule);
  }

  /**
   * Remove a rule
   */
  removeRule(name: string): void {
    const index = this.config.rules.findIndex(r => r.name === name);
    if (index === -1) {
      throw new Error(`Rule ${name} not found`);
    }
    this.config.rules.splice(index, 1);
  }
}

/**
 * Helper functions for common rule conditions
 */
export const RuleConditions = {
  /**
   * Check if any of the specified flags are present
   */
  hasAnyFlag: (flagNames: string[]) => {
    return (flags: string[], _metrics: RiskMetric) => {
      return flagNames.some(flag => flags.includes(flag));
    };
  },

  /**
   * Check if all specified flags are present
   */
  hasAllFlags: (flagNames: string[]) => {
    return (flags: string[], _metrics: RiskMetric) => {
      return flagNames.every(flag => flags.includes(flag));
    };
  },

  /**
   * Check if a flag matches a pattern (supports wildcards)
   */
  flagMatches: (pattern: string) => {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return (flags: string[], _metrics: RiskMetric) => {
      return flags.some(flag => regex.test(flag));
    };
  },

  /**
   * Check if a metric value is greater than threshold
   */
  metricGreaterThan: (metricName: string, threshold: number) => {
    return (_flags: string[], metrics: RiskMetric) => {
      const value = metrics[metricName];
      return typeof value === 'number' && value > threshold;
    };
  },

  /**
   * Check if a metric value is less than threshold
   */
  metricLessThan: (metricName: string, threshold: number) => {
    return (_flags: string[], metrics: RiskMetric) => {
      const value = metrics[metricName];
      return typeof value === 'number' && value < threshold;
    };
  },

  /**
   * Check if a metric value equals a specific value
   */
  metricEquals: (metricName: string, expectedValue: unknown) => {
    return (_flags: string[], metrics: RiskMetric) => {
      return metrics[metricName] === expectedValue;
    };
  },

  /**
   * Check if a boolean metric is true
   */
  metricIsTrue: (metricName: string) => {
    return (_flags: string[], metrics: RiskMetric) => {
      return metrics[metricName] === true;
    };
  },

  /**
   * Combine multiple conditions with AND logic
   */
  and: (
    ...conditions: Array<(flags: string[], metrics: RiskMetric) => boolean>
  ) => {
    return (flags: string[], metrics: RiskMetric) => {
      return conditions.every(condition => condition(flags, metrics));
    };
  },

  /**
   * Combine multiple conditions with OR logic
   */
  or: (
    ...conditions: Array<(flags: string[], metrics: RiskMetric) => boolean>
  ) => {
    return (flags: string[], metrics: RiskMetric) => {
      return conditions.some(condition => condition(flags, metrics));
    };
  },
};

/**
 * Predefined rule sets for common use cases
 */
export const PredefinedRuleSets = {
  /**
   * Address risk rules
   */
  addressRules: (): RiskRule[] => [
    {
      name: 'blacklisted',
      description: 'Address is in blacklist',
      weight: 100,
      severity: 'critical',
      condition: RuleConditions.hasAnyFlag(['blacklisted']),
    },
    {
      name: 'new-address',
      description: 'Address is less than 30 days old',
      weight: 30,
      severity: 'medium',
      condition: RuleConditions.hasAnyFlag(['new-address']),
    },
    {
      name: 'low-activity',
      description: 'Address has low transaction activity',
      weight: 20,
      severity: 'low',
      condition: RuleConditions.hasAnyFlag(['low-activity']),
    },
    {
      name: 'very-new-address',
      description: 'Address is less than 7 days old',
      weight: 50,
      severity: 'high',
      condition: RuleConditions.and(
        RuleConditions.hasAnyFlag(['new-address']),
        RuleConditions.metricLessThan('addressAgeDays', 7)
      ),
    },
  ],

  /**
   * Transaction risk rules
   */
  transactionRules: (): RiskRule[] => [
    {
      name: 'sender-blacklisted',
      description: 'Transaction sender is blacklisted',
      weight: 100,
      severity: 'critical',
      condition: RuleConditions.hasAnyFlag(['sender-blacklisted']),
    },
    {
      name: 'receiver-blacklisted',
      description: 'Transaction receiver is blacklisted',
      weight: 100,
      severity: 'critical',
      condition: RuleConditions.hasAnyFlag(['receiver-blacklisted']),
    },
    {
      name: 'tainted-1hop',
      description:
        'Sender received funds from blacklisted address (1-hop tainting)',
      weight: 80,
      severity: 'high',
      condition: RuleConditions.hasAnyFlag(['tainted-1hop']),
    },
    {
      name: 'both-new-addresses',
      description: 'Both sender and receiver are new addresses',
      weight: 40,
      severity: 'medium',
      condition: RuleConditions.and(
        RuleConditions.hasAnyFlag(['sender-new-address']),
        RuleConditions.hasAnyFlag(['receiver-new-address'])
      ),
    },
    {
      name: 'sender-low-activity',
      description: 'Sender has low transaction activity',
      weight: 25,
      severity: 'low',
      condition: RuleConditions.hasAnyFlag(['sender-low-activity']),
    },
    {
      name: 'receiver-low-activity',
      description: 'Receiver has low transaction activity',
      weight: 25,
      severity: 'low',
      condition: RuleConditions.hasAnyFlag(['receiver-low-activity']),
    },
  ],
};
