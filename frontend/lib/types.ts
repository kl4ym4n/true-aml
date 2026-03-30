// API Response Types

export type RiskLevelLowercase = 'low' | 'medium' | 'high' | 'critical';
export type RiskLevelUppercase = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
// Backend currently returns uppercase; keep lowercase for backwards compatibility.
export type RiskLevel = RiskLevelLowercase | RiskLevelUppercase;

// API Error response format
export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    statusCode: number;
  };
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    statusCode: number;
  };
}

// Source breakdown (trusted / suspicious / dangerous)
export interface SourceBreakdown {
  trusted: Record<string, number>;
  suspicious: Record<string, number>;
  dangerous: Record<string, number>;
}

// Backend response format
export interface AddressCheckResponse {
  address: string;
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
  metadata: {
    isBlacklisted: boolean;
    blacklistCategory?: string;
    blacklistRiskScore?: number;
    transactionCount: number;
    addressAgeDays: number | null;
    firstSeenAt: string | null;
    addressSecurity?: {
      riskScore: number;
      riskLevel: string;
      isScam: boolean;
      isPhishing?: boolean;
      isMalicious: boolean;
      tags: string[];
    };
    liquidityPoolInteractions?: {
      count: number;
      percentage: number;
      addresses: string[];
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
    taintCalculationStats?: {
      maxConsidered: number;
      checkedCounterparties: number;
      analyzedCounterparties: number;
      skippedVisited: number;
      skippedDust?: number;
      counterpartyCacheHits?: number;
      counterpartyCacheMisses?: number;
    };
    scoreBreakdown?: {
      baseRiskScore: number;
      taintScore: number;
      behavioralScore: number;
      volumeScore: number;
      preWhitelistScore: number;
      whitelistLevel?: 'strong' | 'soft';
      postWhitelistScore: number;
    };
    explanation?: string[];
  };
}

export interface TransactionCheckResponse {
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
  details: {
    txHash?: string;
    transferData?: {
      from: string;
      to: string;
      amount: string;
      tokenAddress: string;
      tokenSymbol?: string;
    };
    sender?: {
      address: string;
      riskScore: number;
      flags: string[];
      isBlacklisted: boolean;
    };
    receiver?: {
      address: string;
      riskScore: number;
      flags: string[];
      isBlacklisted: boolean;
    };
    tainting?: {
      isTainted: boolean;
      taintedFromAddress?: string;
    };
    timestamp?: string;
    [key: string]: unknown;
  };
}

// Helper function to convert risk level to uppercase for display
export function toUppercaseRiskLevel(level: RiskLevel): RiskLevelUppercase {
  return String(level).toUpperCase() as RiskLevelUppercase;
}

