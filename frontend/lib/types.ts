// API Response Types

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type RiskLevelUppercase = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

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

// Backend response format
export interface AddressCheckResponse {
  address: string;
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
  metadata: {
    isBlacklisted: boolean;
    transactionCount: number;
    addressAgeDays: number | null;
    firstSeenAt: string | null;
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

// Helper function to convert lowercase risk level to uppercase for display
export function toUppercaseRiskLevel(level: RiskLevel): RiskLevelUppercase {
  return level.toUpperCase() as RiskLevelUppercase;
}

