import type { TransactionPatterns } from '../address-check.pattern-analyzer';

export interface LiquidityPoolInfo {
  count: number;
  percentage: number;
  addresses: string[];
}

/** Build liquidity pool metadata from patterns and transaction count. */
export function buildLiquidityPoolInfo(
  patterns: TransactionPatterns | undefined,
  transactionCount: number
): LiquidityPoolInfo | undefined {
  if (!patterns || patterns.liquidityPoolInteractions === 0) {
    return undefined;
  }
  const count = patterns.liquidityPoolInteractions;
  const percentage =
    transactionCount > 0 ? (count / transactionCount) * 100 : 0;
  return {
    count,
    percentage,
    addresses: Array.from(patterns.liquidityPoolAddresses),
  };
}
