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
 * `summary` sums to ~100 over analyzed flow (volume-weighted path).
 */
export interface SourceBreakdown {
  summary?: {
    trusted: number;
    suspicious: number;
    dangerous: number;
  };
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
  /** Pattern analyzer: sum of incoming TRC20 transfers for every token in the sampled history (not stablecoin-only). */
  allTrc20IncomingVolume?: number;
  /** Incoming USDT/USDC only (taint path); not the same as {@link allTrc20IncomingVolume}. */
  totalIncomingVolume?: number;
  /** Details about what the taint model scanned and how it was computed */
  taintInput?: {
    symbols: string[];
    pagesFetched: number;
    scannedTxCount: number;
    stablecoinTxCount: number;
    truncated: boolean;
  };
  /** Incoming stablecoin volume attributed to high–entity-risk sources (taint model) */
  riskyIncomingVolume?: number;
  /** Percentage of incoming volume that is tainted */
  taintPercent?: number;
  /** Top counterparties used in taint calculation, sorted by incoming volume */
  topRiskyCounterparties?: Array<{
    address: string;
    incomingVolume: number;
    riskScore: number;
    risky: boolean;
    entityType?: string;
    hopLevel?: number;
  }>;
  /** Human-readable AML explanations */
  explanation?: string[];
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
