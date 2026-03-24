import { RiskFlag } from './address-check.types';
import {
  RISK_SCORE_BLACKLISTED,
  DIRECT_RISK_WEIGHT,
  INDIRECT_RISK_WEIGHT,
  BEHAVIOR_RISK_WEIGHT,
  TRUST_FACTORS_WEIGHT,
  DIRECT_RISK_SCAM_MIXER,
  DIRECT_RISK_BLACKLISTED,
  INDIRECT_RISK_1_HOP_MIXER,
  INDIRECT_RISK_2_HOPS_SCAM,
  BEHAVIOR_RISK_SMURFING,
  BEHAVIOR_RISK_FAST_WITHDRAWAL,
  BEHAVIOR_RISK_NO_CEX,
  TRUST_FACTOR_LONG_HISTORY,
  TRUST_FACTOR_FEW_TX,
  SEVERITY_BLACKLISTED,
  SEVERITY_PHISHING,
  SEVERITY_SCAM,
  SEVERITY_SUSPICIOUS,
  NEW_ADDRESS_DAYS_THRESHOLD,
  LOW_ACTIVITY_TX_THRESHOLD,
  LONG_HISTORY_DAYS,
} from './address-check.constants';
import { TransactionPatterns } from './address-check.pattern-analyzer';

export interface AddressSecurity {
  isScam: boolean;
  isPhishing: boolean;
  isMalicious: boolean;
  isBlacklisted: boolean;
  tags: string[];
  riskLevel: string;
  riskScore: number;
}

/**
 * Service for calculating risk scores and determining risk flags
 */
export class RiskCalculator {
  /**
   * Determine risk flags based on analysis
   */
  determineRiskFlags(
    isBlacklisted: boolean,
    addressAgeDays: number | null,
    transactionCount: number,
    patterns?: TransactionPatterns,
    addressSecurity?: AddressSecurity | null
  ): RiskFlag[] {
    const flags: RiskFlag[] = [];

    if (isBlacklisted) {
      flags.push('blacklisted');
    }

    // Address security flags
    if (addressSecurity) {
      if (addressSecurity.isScam) {
        flags.push('scam');
      }
      if (addressSecurity.isPhishing) {
        flags.push('phishing');
      }
      if (addressSecurity.isMalicious) {
        flags.push('malicious');
      }
      if (addressSecurity.isBlacklisted) {
        flags.push('blacklisted');
      }
    }

    if (
      addressAgeDays !== null &&
      addressAgeDays < NEW_ADDRESS_DAYS_THRESHOLD
    ) {
      flags.push('new-address');
    }

    if (transactionCount < LOW_ACTIVITY_TX_THRESHOLD) {
      flags.push('low-activity');
    }

    // Pattern-based flags
    if (patterns) {
      // High frequency transactions might indicate automated/bot activity
      if (patterns.hasHighFrequency && transactionCount > 10) {
        flags.push('high-frequency');
      }

      // Very few unique counterparties might indicate suspicious activity
      if (transactionCount > 5 && patterns.uniqueCounterparties < 2) {
        flags.push('limited-counterparties');
      }

      // Liquidity pool interactions - suspicious source indicator
      if (patterns.liquidityPoolInteractions > 0) {
        flags.push('liquidity-pool');
      }
    }

    return flags;
  }

  /**
   * Calculate risk score based on various factors
   * Formula: risk = direct_risk * 0.7 + indirect_risk * 0.4 + behavior_risk * 0.2 - trust_factors * 0.3
   */
  calculateRiskScore(
    isBlacklisted: boolean,
    blacklistRiskScore: number | undefined,
    addressAgeDays: number | null,
    transactionCount: number,
    flags: RiskFlag[],
    patterns?: TransactionPatterns,
    addressSecurity?: AddressSecurity | null
  ): number {
    console.log(`[RiskCalculator] Starting risk score calculation:`, {
      isBlacklisted,
      blacklistRiskScore,
      addressAgeDays,
      transactionCount,
      flags,
      hasPatterns: !!patterns,
      hasAddressSecurity: !!addressSecurity,
    });

    // Start with severity-based score (highest priority)
    let severityScore = 0;

    // Severity mapping from security check
    if (addressSecurity) {
      if (addressSecurity.isBlacklisted || isBlacklisted) {
        severityScore = SEVERITY_BLACKLISTED; // 0.9-1.0
        console.log(
          `[RiskCalculator] Severity: BLACKLISTED (${severityScore})`
        );
      } else if (addressSecurity.isPhishing) {
        severityScore = SEVERITY_PHISHING; // 0.8
        console.log(`[RiskCalculator] Severity: PHISHING (${severityScore})`);
      } else if (addressSecurity.isScam) {
        severityScore = SEVERITY_SCAM; // 0.7
        console.log(`[RiskCalculator] Severity: SCAM (${severityScore})`);
      } else if (addressSecurity.isMalicious) {
        severityScore = SEVERITY_SUSPICIOUS; // 0.4-0.5
        console.log(`[RiskCalculator] Severity: SUSPICIOUS (${severityScore})`);
      }
    }

    // If blacklisted, return maximum risk
    if (isBlacklisted) {
      const finalScore = Math.max(
        severityScore,
        blacklistRiskScore ?? RISK_SCORE_BLACKLISTED
      );
      console.log(
        `[RiskCalculator] Address is blacklisted, returning: ${finalScore}`
      );
      return finalScore;
    }

    // Calculate direct risk (strongest factors)
    let directRisk = 0;
    console.log(`[RiskCalculator] Calculating direct risk`);
    if (addressSecurity?.isBlacklisted) {
      directRisk += DIRECT_RISK_BLACKLISTED; // Received from blacklisted entity
      console.log(
        `[RiskCalculator] Direct risk: +${DIRECT_RISK_BLACKLISTED} (blacklisted)`
      );
    }
    if (addressSecurity?.isScam || flags.includes('scam')) {
      directRisk += DIRECT_RISK_SCAM_MIXER; // Direct input from scam/mixer
      console.log(
        `[RiskCalculator] Direct risk: +${DIRECT_RISK_SCAM_MIXER} (scam)`
      );
    }
    // Note: Sanctioned entity check would require additional data source
    if (flags.includes('malicious')) {
      directRisk += DIRECT_RISK_SCAM_MIXER; // Treat malicious as scam-like
      console.log(
        `[RiskCalculator] Direct risk: +${DIRECT_RISK_SCAM_MIXER} (malicious)`
      );
    }

    // Volume-based direct risk (incoming TRC20 volume heuristics)
    if (patterns?.totalIncoming) {
      if (patterns.totalIncoming > 1_000_000) {
        directRisk += 25;
        console.log(
          `[RiskCalculator] Direct risk: +25 (totalIncoming > 1M: ${patterns.totalIncoming})`
        );
      } else if (patterns.totalIncoming > 100_000) {
        directRisk += 15;
        console.log(
          `[RiskCalculator] Direct risk: +15 (totalIncoming > 100k: ${patterns.totalIncoming})`
        );
      }
    }
    console.log(`[RiskCalculator] Direct risk total: ${directRisk}`);

    // Calculate indirect risk (via 1-2 hops)
    // Note: This requires transaction graph analysis which is not yet implemented
    // For now, we use pattern-based heuristics
    let indirectRisk = 0;
    console.log(`[RiskCalculator] Calculating indirect risk`);
    if (patterns) {
      // Limited counterparties might indicate mixer usage
      if (flags.includes('limited-counterparties') && transactionCount > 10) {
        indirectRisk += INDIRECT_RISK_1_HOP_MIXER; // Approximate 1 hop from mixer
        console.log(
          `[RiskCalculator] Indirect risk: +${INDIRECT_RISK_1_HOP_MIXER} (limited counterparties)`
        );
      }
      // High frequency with limited counterparties
      if (
        flags.includes('high-frequency') &&
        patterns.uniqueCounterparties < 3
      ) {
        indirectRisk += INDIRECT_RISK_2_HOPS_SCAM; // Approximate 2 hops from scam
        console.log(
          `[RiskCalculator] Indirect risk: +${INDIRECT_RISK_2_HOPS_SCAM} (high frequency + limited counterparties)`
        );
      }
    }
    console.log(`[RiskCalculator] Indirect risk total: ${indirectRisk}`);

    // Calculate behavioral risk
    let behaviorRisk = 0;
    console.log(`[RiskCalculator] Calculating behavioral risk`);
    if (patterns) {
      // Frequent small inputs (smurfing pattern)
      if (flags.includes('high-frequency') && transactionCount > 20) {
        behaviorRisk += BEHAVIOR_RISK_SMURFING;
        console.log(
          `[RiskCalculator] Behavioral risk: +${BEHAVIOR_RISK_SMURFING} (smurfing)`
        );
      }
      // Fast withdrawal after input (detected via high frequency)
      if (
        patterns.averageTimeBetweenTx &&
        patterns.averageTimeBetweenTx < 60000 &&
        transactionCount > 5
      ) {
        behaviorRisk += BEHAVIOR_RISK_FAST_WITHDRAWAL;
        console.log(
          `[RiskCalculator] Behavioral risk: +${BEHAVIOR_RISK_FAST_WITHDRAWAL} (fast withdrawal)`
        );
      }

      if (patterns.hasFastCashOut) {
        behaviorRisk += 25;
        console.log(
          `[RiskCalculator] Behavioral risk: +25 (hasFastCashOut)`
        );
      }

      if (patterns.isFanIn) {
        behaviorRisk += 20;
        console.log(`[RiskCalculator] Behavioral risk: +20 (isFanIn)`);
      }
      // This is a strong indicator of potential money laundering through DeFi
      if (patterns.liquidityPoolInteractions > 0) {
        // Higher risk if multiple interactions or high percentage
        const liquidityPoolRatio =
          patterns.liquidityPoolInteractions / transactionCount;
        if (liquidityPoolRatio >= 0.5) {
          // 50%+ of transactions are with liquidity pools - very suspicious
          behaviorRisk += 50; // High risk
          console.log(
            `[RiskCalculator] Behavioral risk: +50 (high liquidity pool ratio: ${(liquidityPoolRatio * 100).toFixed(2)}%)`
          );
        } else if (liquidityPoolRatio >= 0.2) {
          // 20-50% of transactions
          behaviorRisk += 30; // Medium-high risk
          console.log(
            `[RiskCalculator] Behavioral risk: +30 (medium liquidity pool ratio: ${(liquidityPoolRatio * 100).toFixed(2)}%)`
          );
        } else {
          // Less than 20% but still present
          behaviorRisk += 15; // Medium risk
          console.log(
            `[RiskCalculator] Behavioral risk: +15 (low liquidity pool ratio: ${(liquidityPoolRatio * 100).toFixed(2)}%)`
          );
        }
      }
    }
    // No interaction with CEX (hard to detect without CEX address list)
    // For now, we use low unique counterparties as proxy
    if (patterns && patterns.uniqueCounterparties < 2 && transactionCount > 5) {
      behaviorRisk += BEHAVIOR_RISK_NO_CEX;
      console.log(
        `[RiskCalculator] Behavioral risk: +${BEHAVIOR_RISK_NO_CEX} (no CEX interaction)`
      );
    }
    console.log(`[RiskCalculator] Behavioral risk total: ${behaviorRisk}`);

    // Calculate trust factors (reduce risk)
    let trustFactors = 0;
    console.log(`[RiskCalculator] Calculating trust factors`);
    // Long history (more than 1 year)
    if (addressAgeDays !== null && addressAgeDays >= LONG_HISTORY_DAYS) {
      trustFactors += TRUST_FACTOR_LONG_HISTORY;
      console.log(
        `[RiskCalculator] Trust factor: +${TRUST_FACTOR_LONG_HISTORY} (long history: ${addressAgeDays} days)`
      );
    }
    // Few transactions (not actively trading, less risky)
    if (transactionCount > 0 && transactionCount < LOW_ACTIVITY_TX_THRESHOLD) {
      trustFactors += TRUST_FACTOR_FEW_TX;
      console.log(
        `[RiskCalculator] Trust factor: +${TRUST_FACTOR_FEW_TX} (few transactions: ${transactionCount})`
      );
    }
    // Note: Large CEX interaction would require CEX address list
    console.log(`[RiskCalculator] Trust factors total: ${trustFactors}`);

    // Apply formula: risk = direct_risk * 0.7 + indirect_risk * 0.4 + behavior_risk * 0.2 - trust_factors * 0.3
    const directContribution = directRisk * DIRECT_RISK_WEIGHT;
    const indirectContribution = indirectRisk * INDIRECT_RISK_WEIGHT;
    const behaviorContribution = behaviorRisk * BEHAVIOR_RISK_WEIGHT;
    const trustContribution = trustFactors * TRUST_FACTORS_WEIGHT;

    const calculatedRisk =
      directContribution +
      indirectContribution +
      behaviorContribution -
      trustContribution;

    console.log(`[RiskCalculator] Risk calculation breakdown:`, {
      directRisk,
      directContribution: directContribution.toFixed(2),
      indirectRisk,
      indirectContribution: indirectContribution.toFixed(2),
      behaviorRisk,
      behaviorContribution: behaviorContribution.toFixed(2),
      trustFactors,
      trustContribution: trustContribution.toFixed(2),
      calculatedRisk: calculatedRisk.toFixed(2),
      severityScore,
    });

    // Use severity score if higher, otherwise use calculated risk
    let finalScore = Math.max(severityScore, calculatedRisk);

    // Ensure score is between 0 and 100
    finalScore = Math.max(0, Math.min(100, finalScore));

    console.log(`[RiskCalculator] Final risk score: ${finalScore.toFixed(2)}`);
    return finalScore;
  }
}
