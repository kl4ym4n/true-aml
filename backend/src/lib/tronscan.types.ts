// Type definitions for TronScan API responses

export interface TronScanTransaction {
  hash: string;
  block: number;
  timestamp: number;
  ownerAddress: string;
  toAddress: string;
  amount: string;
  tokenInfo?: {
    symbol: string;
    address: string;
    decimals: number;
    name: string;
  };
  contractType: string;
  confirmed: boolean;
}

export interface TronScanTransactionsResponse {
  total: number;
  data: TronScanTransaction[];
  rangeTotal: number;
}

export interface TronScanTransactionDetail {
  hash: string;
  block: number;
  timestamp: number;
  ownerAddress: string;
  toAddress: string;
  amount: string;
  fee: string;
  netFee: string;
  energyFee: string;
  energyUsageTotal: number;
  netUsage: number;
  result: string;
  contractResult: string[];
  contractAddress: string;
  receipt: {
    energyUsageTotal: number;
    energyFee: number;
    originEnergyUsage: number;
    energyUsage: number;
    netUsage: number;
    netFee: number;
    result: string;
  };
  log: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
  internalTransactions: Array<{
    hash: string;
    callerAddress: string;
    transferToAddress: string;
    callValueInfo: Array<{
      callValue: number;
    }>;
    note: string;
    rejected: boolean;
  }>;
  contractType: string;
  confirmed: boolean;
}

export interface TronScanTokenSecurity {
  is_vip: boolean;
  black_list_type: number; // 0-not recognized, 1-has black list, 2-do not have backlist
  increase_total_supply: number; // 0-not recognized, 1-increase allowed, 2-increase not allowed
  token_level: string; // "0": Unknown, "1": Neutral, "2": OK, "3": Suspicious, "4": Unsafe
  has_url: boolean;
  swap_token: boolean;
  sun_liquidity: string;
  open_source: boolean;
  is_proxy: boolean;
}

export interface TronScanAddressSecurity {
  address: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
  isScam: boolean;
  isPhishing: boolean;
  isMalicious: boolean;
  isBlacklisted: boolean;
  tags: string[];
  description?: string;
  firstSeen?: number;
  lastSeen?: number;
  transactionCount?: number;
}

/**
 * Raw response from TronScan account API (e.g. /api/accountv2?address=...)
 * Matches current TronScan API docs.
 */
export interface TronScanAccountResponse {
  address: string;
  balance: number;
  date_created?: number;
  accountType?: number; // 0 = Normal, 1 = Contract, etc.
  withPriceTokens?: Array<{
    tokenId: string;
    balance: string;
    tokenName: string;
    tokenAbbr: string;
    tokenDecimal: number;
    tokenType?: string;
    tokenLogo?: string;
    vip?: boolean;
    amount?: string;
    tokenPriceInTrx?: number;
    tokenCanShow?: number;
  }>;
  [key: string]: unknown;
}

export interface TronScanAddressInfo {
  address: string;
  balance: string;
  trc20token_balances?: Array<{
    tokenId: string;
    balance: string;
    tokenName: string;
    tokenAbbr: string;
    tokenDecimal: number;
    tokenCanShow?: number;
    tokenType?: string;
    tokenLogo?: string;
    vip?: boolean;
  }>;
  date_created?: number;
  accountType?: string;
  [key: string]: unknown;
}

export interface TronScanErrorResponse {
  success: boolean;
  error?: string;
  message?: string;
}

export class TronScanError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: number
  ) {
    super(message);
    this.name = 'TronScanError';
    Object.setPrototypeOf(this, TronScanError.prototype);
  }
}

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryableStatusCodes: number[];
}

export interface TronScanClientConfig {
  apiKey?: string;
  baseURL?: string;
  timeout?: number;
  retryConfig?: Partial<RetryConfig>;
}

export interface TronScanTransactionsOptions {
  limit?: number;
  start?: number;
  sort?: 'timestamp' | 'block';
  count?: boolean;
  filterTokenValue?: number;
  start_timestamp?: number;
  end_timestamp?: number;
  /** Filter: only transactions where the given address is recipient (incoming) */
  only_to?: boolean;
  /** Filter: only transactions where the given address is sender (outgoing) */
  only_from?: boolean;
}

export interface TronScanContractInfo {
  contract_address: string;
  contract_name?: string;
  creator_address?: string;
  contract_type?: string;
  verified?: boolean;
  open_source?: boolean;
  trx_count?: number;
  balance?: string;
  date_created?: number;
  description?: string;
  website?: string;
  github?: string;
}

export interface TronScanContractEvent {
  block: number;
  timestamp: number;
  contract_address: string;
  event_name: string;
  caller_address: string;
  transaction_hash: string;
  result?: any;
}

export interface TronScanContractEventsResponse {
  total: number;
  data: TronScanContractEvent[];
}

export interface TronScanLiquidityOperation {
  transaction_hash: string;
  block: number;
  timestamp: number;
  pool_address: string;
  operation_type: 'AddLiquidity' | 'RemoveLiquidity' | 'Swap' | 'TokenExchange';
  token_a?: string;
  token_b?: string;
  amount_a?: string;
  amount_b?: string;
  user_address?: string;
}
