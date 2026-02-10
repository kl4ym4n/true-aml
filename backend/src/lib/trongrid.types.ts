// Type definitions for TronGrid API responses

export interface TRC20Transaction {
  transaction_id: string;
  token_info: {
    symbol: string;
    address: string;
    decimals: number;
    name: string;
  };
  block_timestamp: number;
  from: string;
  to: string;
  type: string;
  value: string;
}

export interface TRC20TransactionsResponse {
  success: boolean;
  data: TRC20Transaction[];
  meta: {
    at: number;
    page_size: number;
    links?: {
      next?: string;
    };
  };
}

export interface TransactionDetail {
  ret: string[];
  signature: string[];
  txID: string;
  net_usage: number;
  raw_data_hex: string;
  net_fee: number;
  energy_usage: number;
  blockNumber: number;
  block_timestamp: number;
  energy_fee: number;
  energy_usage_total: number;
  raw_data: {
    contract: Array<{
      parameter: {
        value: Record<string, unknown>;
        type_url: string;
      };
      type: string;
    }>;
    ref_block_bytes: string;
    ref_block_hash: string;
    expiration: number;
    fee_limit: number;
    timestamp: number;
  };
  internal_transactions: Array<{
    hash: string;
    caller_address: string;
    transferTo_address: string;
    callValueInfo: Array<{
      callValue: number;
    }>;
    note: string;
    rejected: boolean;
  }>;
  contractResult: string[];
  receipt: {
    energy_usage_total: number;
    energy_fee: number;
    origin_energy_usage: number;
    energy_usage: number;
    net_usage: number;
    net_fee: number;
    result: string;
  };
  log: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
}

export interface TransactionDetailResponse {
  success: boolean;
  data: TransactionDetail[];
}

export interface TronGridErrorResponse {
  Error: string;
  code?: number;
}

export class TronGridError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: number
  ) {
    super(message);
    this.name = 'TronGridError';
    Object.setPrototypeOf(this, TronGridError.prototype);
  }
}

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryableStatusCodes: number[];
}

export interface TronGridClientConfig {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
  retryConfig?: Partial<RetryConfig>;
}

export interface TRC20TransactionsOptions {
  limit?: number;
  fingerprint?: string;
  only_confirmed?: boolean;
  only_to?: boolean;
  only_from?: boolean;
  contract_address?: string;
}
