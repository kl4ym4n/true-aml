import type {
  AddressAnalysisMetadata,
  SourceBreakdown,
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
  totalIncomingVolume?: number;
  riskyIncomingVolume?: number;
  taintPercent?: number;
  topRiskyCounterparties?: Array<{
    address: string;
    incomingVolume: number;
    riskScore: number;
    risky: boolean;
  }>;
  taintCalculationStats?: {
    maxConsidered: number;
    checkedCounterparties: number;
    analyzedCounterparties: number;
    skippedVisited: number;
  };
  scoreBreakdown?: {
    baseRiskScore: number;
    taintScore: number;
    behavioralScore: number;
    volumeScore: number;
    preWhitelistScore: number;
    whitelistLevel?: WhitelistLevel;
    postWhitelistScore: number;
  };
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
    totalIncomingVolume,
    riskyIncomingVolume,
    taintPercent,
    topRiskyCounterparties,
    taintCalculationStats,
    scoreBreakdown,
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
    ...(totalIncomingVolume !== undefined && { totalIncomingVolume }),
    ...(riskyIncomingVolume !== undefined && { riskyIncomingVolume }),
    ...(taintPercent !== undefined && { taintPercent }),
    ...(topRiskyCounterparties !== undefined && { topRiskyCounterparties }),
    ...(taintCalculationStats !== undefined && { taintCalculationStats }),
    ...(scoreBreakdown !== undefined && { scoreBreakdown }),
  };
}
