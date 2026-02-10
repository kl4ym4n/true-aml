// Import RiskLevel from Prisma - it's exported as a type
// Using string union to avoid import issues, but matching Prisma enum values
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
import type { AddressAnalysisResult } from '../address-check';

export interface TRC20TransferData {
  from: string;
  to: string;
  amount: string;
  tokenAddress: string;
  tokenSymbol?: string;
}

export interface TaintingCheckResult {
  isTainted: boolean;
  taintedFromAddress?: string;
  taintedTransactionHash?: string;
}

export interface TransactionAnalysisMetadata {
  txHash: string;
  transferData: TRC20TransferData;
  senderAnalysis: AddressAnalysisResult;
  receiverAnalysis: AddressAnalysisResult;
  taintingCheck: TaintingCheckResult;
  timestamp: Date;
}

export interface TransactionAnalysisResult {
  txHash: string;
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
  metadata: TransactionAnalysisMetadata;
}

