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
  /** True when no stablecoin (USDT/USDC) inflow sample exists, so SoF breakdown is unavailable. */
  sampleEmpty?: boolean;
  /** UX/debug note for empty/partial samples. */
  note?: string;
  trusted: Record<string, number>;
  suspicious: Record<string, number>;
  dangerous: Record<string, number>;
}

/** Trust / SoF calibration emitted on root hop for debugging and UI alignment. */
/** Per hop-1 counterparty: SoF bucket + entity resolution audit (root check only). */
export interface TopCounterpartySoFDebug {
  /** Share of root stablecoin inflow from this counterparty (0..1). */
  volumeShare: number;
  volume?: number;
  txCount: number;
  uniqueCounterpartyCount: number;
  /** Counterparty's max TRC20 incoming concentration from one sender (0..1). */
  maxCounterpartyShare: number;
  whitelistMatched: boolean;
  blacklistCategory?: string | null;
  securityTags?: string[];
  bucket: 'trusted' | 'suspicious' | 'dangerous';
  whyEntityResolved: string;
  exchangeLikeFallback: boolean;
  graphLinkedToWhitelistedExchange: boolean;
  candidateSignalExchangeInfra: boolean;
  securityTagsSuggestExchange: boolean;
  trustedReason:
    | 'strong_whitelist'
    | 'exchange_entity'
    | 'payment_processor'
    | 'db_exchange_category'
    | 'security_tags_exchange'
    | 'graph_linked_to_whitelisted_exchange'
    | 'candidate_signal_exchange_infra'
    | 'exchange_like_fallback'
    | null;
}

export interface SourceOfFundsAggregationDebug {
  sumTrustedVolume: number;
  sumSuspiciousVolume: number;
  sumDangerousVolume: number;
  numberOfTrustedRows: number;
  numberOfExchangeOrWhitelistRows: number;
  numberOfWhitelistMatches: number;
  numberOfGraphTrustedLinks: number;
  numberOfCandidateInfraMatches: number;
}

export interface SourceOfFundsSampleDebug {
  aggregation: SourceOfFundsAggregationDebug;
  /** Full row-level detail (hop-1 sample); may be truncated when many counterparties. */
  counterparties: TopCounterpartySoFDebug[];
}

export interface WalletContextHints {
  exchangeLikeWalletProfile: boolean;
  trustedContextOutsideSample: boolean;
  note?: string;
}

export interface SourceFlowCalibration {
  trustedShare: number;
  suspiciousShare: number;
  dangerousShare: number;
  exchangeShare: number;
  whitelistMatchedCount: number;
  trustedSuppressionApplied: boolean;
  /** Multiplier from post-blend trust layer (1 = none). */
  trustedSuppressionFactor: number;
  /** Multiplier applied to behavioral component from trusted inflow share. */
  behavioralTrustMultiplier: number;
  dangerousUplift: number;
  /** Weighted AML blend before trust-layer calibration. */
  amlWeightedBlendScore: number;
  counterpartyBuckets?: Array<{
    address: string;
    bucket: 'trusted' | 'suspicious' | 'dangerous';
    volumeSharePercent: number;
  }>;
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
  /** Incoming USDT/USDC only (taint path). */
  stablecoinIncomingVolume?: number;
  /**
   * Backwards-compat alias for `stablecoinIncomingVolume`.
   * Kept temporarily while frontend migrates away from ambiguous naming.
   */
  totalIncomingVolume?: number;
  /** Whether stablecoin SoF/taint sample exists (incoming USDT/USDC found). */
  hasStablecoinSourceSample?: boolean;
  /** Why stablecoin sample is empty/unavailable (when `hasStablecoinSourceSample === false`). */
  stablecoinSourceSampleReason?: string;
  /** Minimal wallet-level activity context (independent from stablecoin SoF sample). */
  walletActivityContext?: {
    hasIncomingActivity: boolean;
    incomingTxCount: number;
    hasStablecoinIncomingActivity: boolean;
  };
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
    sofDebug?: TopCounterpartySoFDebug;
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
    /** Weighted AML blend before trusted-flow calibration. */
    amlWeightedBlendScore?: number;
    preWhitelistScore: number;
    whitelistLevel?: 'strong' | 'soft';
    postWhitelistScore: number;
  };
  sourceFlowCalibration?: SourceFlowCalibration;
  /** Hop-1 stablecoin sample: per-row SoF + aggregation (audit). */
  sourceOfFundsSampleDebug?: SourceOfFundsSampleDebug;
  /** Broader wallet profile vs. sample SoF (UX when sample is all suspicious). */
  walletContext?: WalletContextHints;
}

export interface AddressAnalysisResult {
  riskScore: number;
  flags: RiskFlag[];
  metadata: AddressAnalysisMetadata;
}
