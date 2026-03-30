/**
 * Chain-agnostic transaction view (TRON / EVM-compatible).
 * `Transaction` in this module is the normalized shape; adapters map provider-specific payloads.
 */
export type SupportedChain = 'tron' | 'ethereum' | 'bsc';

export interface ChainTokenInfo {
  symbol: string;
  address: string;
  decimals: number;
  name: string;
}

export interface ChainTransaction {
  chain: SupportedChain;
  hash: string;
  blockTimestamp: number;
  from?: string;
  to?: string;
  amount?: string | number;
  tokenInfo?: ChainTokenInfo;
}
