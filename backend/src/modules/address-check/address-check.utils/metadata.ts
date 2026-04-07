import type {
  AddressAnalysisMetadata,
  SourceBreakdown,
  SourceFlowCalibration,
  SourceOfFundsSampleDebug,
  TopCounterpartySoFDebug,
  WalletContextHints,
} from '../address-check.types';
import type { WhitelistLevel } from './whitelist';

export interface BuildMetadataParams {
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
  sourceBreakdown?: SourceBreakdown;
  allTrc20IncomingVolume?: number;
  stablecoinIncomingVolume?: number;
  /** Backwards-compat alias for stablecoin incoming volume. */
  totalIncomingVolume?: number;
  hasStablecoinSourceSample?: boolean;
  stablecoinSourceSampleReason?: string;
  stablecoinSofWarning?: string;
  stablecoinSofDataSource?: 'tronscan_transfers' | 'legacy_tx_list';
  walletActivityContext?: {
    hasIncomingActivity: boolean;
    incomingTxCount: number;
    hasStablecoinIncomingActivity: boolean;
  };
  taintInput?: {
    symbols: string[];
    pagesFetched: number;
    scannedTxCount: number;
    stablecoinTxCount: number;
    truncated: boolean;
  };
  riskyIncomingVolume?: number;
  taintPercent?: number;
  topRiskyCounterparties?: Array<{
    address: string;
    incomingVolume: number;
    riskScore: number;
    risky: boolean;
    entityType?: string;
    hopLevel?: number;
    sofDebug?: TopCounterpartySoFDebug;
  }>;
  explanation?: string[];
  taintCalculationStats?: {
    maxConsidered: number;
    checkedCounterparties: number;
    analyzedCounterparties: number;
    skippedVisited: number;
    skippedDust: number;
    counterpartyCacheHits: number;
    counterpartyCacheMisses: number;
  };
  scoreBreakdown?: {
    baseRiskScore: number;
    taintScore: number;
    behavioralScore: number;
    volumeScore: number;
    amlWeightedBlendScore?: number;
    preWhitelistScore: number;
    whitelistLevel?: WhitelistLevel;
    postWhitelistScore: number;
  };
  sourceFlowCalibration?: SourceFlowCalibration;
  sourceOfFundsSampleDebug?: SourceOfFundsSampleDebug;
  walletContext?: WalletContextHints;
}

/** Build AddressAnalysisMetadata from analysis results. */
export function buildAnalysisMetadata(
  params: BuildMetadataParams
): AddressAnalysisMetadata {
  const {
    address,
    isBlacklisted,
    blacklistCategory,
    blacklistRiskScore,
    transactionCount,
    firstSeenAt,
    addressAgeDays,
    lastCheckedAt,
    liquidityPoolInteractions,
    addressSecurity,
    sourceBreakdown,
    allTrc20IncomingVolume,
    stablecoinIncomingVolume,
    totalIncomingVolume,
    hasStablecoinSourceSample,
    stablecoinSourceSampleReason,
    stablecoinSofWarning,
    stablecoinSofDataSource,
    walletActivityContext,
    taintInput,
    riskyIncomingVolume,
    taintPercent,
    topRiskyCounterparties,
    taintCalculationStats,
    scoreBreakdown,
    explanation,
    sourceFlowCalibration,
    sourceOfFundsSampleDebug,
    walletContext,
  } = params;

  return {
    address,
    isBlacklisted,
    blacklistCategory,
    blacklistRiskScore,
    transactionCount,
    firstSeenAt,
    addressAgeDays,
    lastCheckedAt,
    liquidityPoolInteractions,
    addressSecurity,
    ...(sourceBreakdown && { sourceBreakdown }),
    ...(allTrc20IncomingVolume !== undefined && { allTrc20IncomingVolume }),
    ...(stablecoinIncomingVolume !== undefined && { stablecoinIncomingVolume }),
    ...(totalIncomingVolume !== undefined && { totalIncomingVolume }),
    ...(hasStablecoinSourceSample !== undefined && {
      hasStablecoinSourceSample,
    }),
    ...(stablecoinSourceSampleReason !== undefined && {
      stablecoinSourceSampleReason,
    }),
    ...(stablecoinSofWarning !== undefined && { stablecoinSofWarning }),
    ...(stablecoinSofDataSource !== undefined && { stablecoinSofDataSource }),
    ...(walletActivityContext !== undefined && { walletActivityContext }),
    ...(taintInput !== undefined && { taintInput }),
    ...(riskyIncomingVolume !== undefined && { riskyIncomingVolume }),
    ...(taintPercent !== undefined && { taintPercent }),
    ...(topRiskyCounterparties !== undefined && { topRiskyCounterparties }),
    ...(taintCalculationStats !== undefined && { taintCalculationStats }),
    ...(scoreBreakdown !== undefined && { scoreBreakdown }),
    ...(explanation !== undefined && explanation.length > 0 && { explanation }),
    ...(sourceFlowCalibration !== undefined && { sourceFlowCalibration }),
    ...(sourceOfFundsSampleDebug !== undefined && {
      sourceOfFundsSampleDebug,
    }),
    ...(walletContext !== undefined && { walletContext }),
  };
}
