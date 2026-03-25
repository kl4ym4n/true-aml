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
  /** Total incoming TRC20 volume across all tokens (token units) */
  allTrc20IncomingVolume?: number;
  /** Total incoming TRC20 volume (token units) */
  totalIncomingVolume?: number;
  /** Details about what the taint model scanned and how it was computed */
  taintInput?: {
    symbols: string[];
    pagesFetched: number;
    scannedTxCount: number;
    stablecoinTxCount: number;
    truncated: boolean;
  };
  /** Incoming TRC20 volume from counterparties with risk score > 60 */
  riskyIncomingVolume?: number;
  /** Percentage of incoming volume that is tainted */
  taintPercent?: number;
  /** Top counterparties used in taint calculation, sorted by incoming volume */
  topRiskyCounterparties?: Array<{
    address: string;
    incomingVolume: number;
    riskScore: number;
    risky: boolean;
  }>;
  /** Taint run stats for debugging and observability */
  taintCalculationStats?: {
    maxConsidered: number;
    checkedCounterparties: number;
    analyzedCounterparties: number;
    skippedVisited: number;
    skippedDust: number;
    counterpartyCacheHits: number;
    counterpartyCacheMisses: number;
  };
  /** Explainable score breakdown for debugging/auditing */
  scoreBreakdown?: {
    baseRiskScore: number;
    taintScore: number;
    behavioralScore: number;
    volumeScore: number;
    preWhitelistScore: number;
    whitelistLevel?: 'strong' | 'soft';
    postWhitelistScore: number;
  };
}

export interface AddressAnalysisResult {
  riskScore: number;
  flags: RiskFlag[];
  metadata: AddressAnalysisMetadata;
}
