import type { RiskFlag, AddressAnalysisResult } from '../address-check.types';
import { SEVERITY_BLACKLISTED, RISK_SCORE_BLACKLISTED } from '../address-check.constants';

export interface BlacklistInput {
  address: string;
  blacklistEntry: { category?: string; riskScore?: number } | null;
  addressSecurity: {
    riskScore: number;
    riskLevel: string;
    isScam: boolean;
    isPhishing: boolean;
    isMalicious: boolean;
    tags: string[];
  } | null;
}

/** Build flags for blacklisted address (direct + security tags). */
export function buildBlacklistFlags(
  addressSecurity: BlacklistInput['addressSecurity']
): RiskFlag[] {
  const flags: RiskFlag[] = ['blacklisted'];
  if (addressSecurity?.isScam) flags.push('scam');
  if (addressSecurity?.isPhishing) flags.push('phishing');
  if (addressSecurity?.isMalicious) flags.push('malicious');
  return flags;
}

/** Compute risk score when address is blacklisted. */
export function getBlacklistRiskScore(
  blacklistEntry: BlacklistInput['blacklistEntry']
): number {
  return (
    Math.round(
      Math.max(
        SEVERITY_BLACKLISTED,
        blacklistEntry?.riskScore ?? RISK_SCORE_BLACKLISTED
      ) * 100
    ) / 100
  );
}

/** Build full early-return result for a blacklisted address. */
export function buildBlacklistResult(
  input: BlacklistInput
): AddressAnalysisResult {
  const flags = buildBlacklistFlags(input.addressSecurity);
  const riskScore = getBlacklistRiskScore(input.blacklistEntry);
  return {
    riskScore,
    flags,
    metadata: {
      address: input.address,
      isBlacklisted: true,
      blacklistCategory: input.blacklistEntry?.category,
      blacklistRiskScore: input.blacklistEntry?.riskScore,
      transactionCount: 0,
      firstSeenAt: null,
      addressAgeDays: null,
      lastCheckedAt: new Date(),
      liquidityPoolInteractions: undefined,
      addressSecurity: input.addressSecurity
        ? {
            riskScore: input.addressSecurity.riskScore,
            riskLevel: input.addressSecurity.riskLevel,
            isScam: input.addressSecurity.isScam,
            isPhishing: input.addressSecurity.isPhishing,
            isMalicious: input.addressSecurity.isMalicious,
            tags: input.addressSecurity.tags,
          }
        : undefined,
    },
  };
}
