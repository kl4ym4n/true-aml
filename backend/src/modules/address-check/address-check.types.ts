export type RiskFlag =
  | 'blacklisted'
  | 'new-address'
  | 'low-activity'
  | 'high-frequency'
  | 'limited-counterparties'
  | 'scam'
  | 'phishing'
  | 'malicious'
  | 'liquidity-pool';

/**
 * Breakdown of fund sources by category (trusted / suspicious / dangerous).
 * Percentages per sub-label, 0–100, two decimals.
 */
export interface SourceBreakdown {
  trusted: Record<string, number>;
  suspicious: Record<string, number>;
  dangerous: Record<string, number>;
}

export interface AddressAnalysisMetadata {
  address: string;
  isBlacklisted: boolean;
  blacklistCategory?: string;
  blacklistRiskScore?: number;
  transactionCount: number;
  firstSeenAt: Date | null;
  addressAgeDays: number | null;
  lastCheckedAt: Date;
  liquidityPoolInteractions?: {
    count: number;
    percentage: number;
    addresses: string[];
  };
  addressSecurity?: {
    riskScore: number;
    riskLevel: string;
    isScam: boolean;
    isPhishing: boolean;
    isMalicious: boolean;
    tags: string[];
  };
  /** Breakdown of sources by category (trusted/suspicious/dangerous) with percentages */
  sourceBreakdown?: SourceBreakdown;
}

export interface AddressAnalysisResult {
  riskScore: number;
  flags: RiskFlag[];
  metadata: AddressAnalysisMetadata;
}
