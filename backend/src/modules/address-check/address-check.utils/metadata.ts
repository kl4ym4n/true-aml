import type {
  AddressAnalysisMetadata,
  SourceBreakdown,
  SourceFlowCalibration,
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
  totalIncomingVolume?: number;
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
    totalIncomingVolume,
    taintInput,
    riskyIncomingVolume,
    taintPercent,
    topRiskyCounterparties,
    taintCalculationStats,
    scoreBreakdown,
    explanation,
    sourceFlowCalibration,
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
    ...(totalIncomingVolume !== undefined && { totalIncomingVolume }),
    ...(taintInput !== undefined && { taintInput }),
    ...(riskyIncomingVolume !== undefined && { riskyIncomingVolume }),
    ...(taintPercent !== undefined && { taintPercent }),
    ...(topRiskyCounterparties !== undefined && { topRiskyCounterparties }),
    ...(taintCalculationStats !== undefined && { taintCalculationStats }),
    ...(scoreBreakdown !== undefined && { scoreBreakdown }),
    ...(explanation !== undefined && explanation.length > 0 && { explanation }),
    ...(sourceFlowCalibration !== undefined && { sourceFlowCalibration }),
  };
}
