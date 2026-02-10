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
}

export interface AddressAnalysisResult {
  riskScore: number;
  flags: RiskFlag[];
  metadata: AddressAnalysisMetadata;
}
