import type {
  AddressAnalysisMetadata,
  SourceBreakdown,
} from '../address-check.types';

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
  };
}
