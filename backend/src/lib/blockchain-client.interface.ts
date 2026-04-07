// Interface for blockchain data providers (TronGrid, TronScan, etc.)

export interface Transaction {
  hash: string;
  blockNumber: number;
  blockTimestamp: number;
  from: string;
  to: string;
  amount: string;
  tokenInfo?: {
    symbol: string;
    address: string;
    decimals: number;
    name: string;
  };
  contractType?: string;
  confirmed: boolean;
  raw_data?: any;
}

export interface AddressSecurity {
  address: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
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

export interface AddressInfo {
  address: string;
  balance: string;
  trc20token_balances?: Array<{
    tokenId: string;
    balance: string;
    tokenName: string;
    tokenAbbr: string;
    tokenDecimal: number;
  }>;
  date_created?: number;
  accountType?: string;
}

export interface TransactionsResponse {
  total: number;
  data: Transaction[];
  hasMore: boolean;
}

export interface TransactionsOptions {
  limit?: number;
  start?: number;
  sort?: 'timestamp' | 'block';
  only_confirmed?: boolean;
  only_to?: boolean;
  only_from?: boolean;
  contract_address?: string;
  start_timestamp?: number;
  end_timestamp?: number;
}

/** Normalized TRC20 transfer (TronScan token_trc20/transfers or TronGrid equivalent). */
export interface NormalizedTrc20Transfer {
  txHash: string;
  timestamp: number;
  fromAddress: string;
  toAddress: string;
  contractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimals: number;
  rawAmount: string;
  amount: number;
  confirmed: boolean;
}

export interface StablecoinTrc20TransfersResult {
  transfers: NormalizedTrc20Transfer[];
  meta: {
    pagesFetched: number;
    totalRowsFetched: number;
    matchedTransfers: number;
    uniqueCounterparties: number;
    contractsSeen: string[];
    tokenSymbolsSeen: string[];
    totalNormalizedVolume: number;
    truncated: boolean;
  };
}

/**
 * Interface for blockchain data providers
 * Allows easy switching between different providers (TronGrid, TronScan, etc.)
 */
export interface IBlockchainClient {
  /**
   * Get transactions for an address
   */
  getTransactions(
    address: string,
    options?: TransactionsOptions
  ): Promise<TransactionsResponse>;

  /**
   * Get transaction details by hash
   */
  getTransactionDetails(txHash: string): Promise<any>;

  /**
   * Get address information
   */
  getAddressInfo(address: string): Promise<AddressInfo>;

  /**
   * Check address security/risk score
   * Returns null if security check is not supported
   */
  checkAddressSecurity(address: string): Promise<AddressSecurity | null>;

  /**
   * Get TRC-20 token transactions
   */
  getTRC20Transactions(
    address: string,
    options?: TransactionsOptions
  ): Promise<TransactionsResponse>;

  /**
   * Stablecoin (USDT/USDC) TRC20 transfers by contract — used for SoF / taint only.
   * Must not use generic /api/transaction; TronScan uses /api/token_trc20/transfers.
   */
  getStablecoinTrc20Transfers(
    address: string,
    options: {
      direction: 'incoming' | 'outgoing';
      contractAddresses: string[];
      maxPages?: number;
      pageSize?: number;
      confirm?: boolean;
      debug?: boolean;
    }
  ): Promise<StablecoinTrc20TransfersResult>;
}
