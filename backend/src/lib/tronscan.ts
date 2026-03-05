import axios, { AxiosInstance, AxiosError } from 'axios';
import { env } from '../config/env';
import {
  TronScanTransactionsResponse,
  TronScanTransactionDetail,
  TronScanAddressSecurity,
  TronScanTokenSecurity,
  TronScanAddressInfo,
  TronScanAccountResponse,
  TronScanErrorResponse,
  TronScanError,
  RetryConfig,
  TronScanClientConfig,
  TronScanTransactionsOptions,
  TronScanContractInfo,
  TronScanContractEventsResponse,
} from './tronscan.types';

// TronScan API base URL
const TRONSCAN_BASE_URL = 'https://apilist.tronscanapi.com';

export class TronScanClient {
  private axiosInstance: AxiosInstance;
  private retryConfig: RetryConfig;

  constructor(config: TronScanClientConfig) {
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      retryableStatusCodes: [429, 500, 502, 503, 504],
      ...config.retryConfig,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add API key if provided
    if (config.apiKey) {
      headers['TRON-PRO-API-KEY'] = config.apiKey;
    }

    this.axiosInstance = axios.create({
      baseURL: config.baseURL || TRONSCAN_BASE_URL,
      timeout: config.timeout || 30000,
      headers,
    });

    // Add request interceptor for logging (optional)
    this.axiosInstance.interceptors.request.use(
      config => config,
      error => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      response => response,
      (error: AxiosError<TronScanErrorResponse>) => {
        if (error.response) {
          const tronScanError = error.response.data;
          throw new TronScanError(
            tronScanError?.error ||
              tronScanError?.message ||
              error.message ||
              'TronScan API error',
            error.response.status,
            undefined
          );
        }
        if (error.request) {
          throw new TronScanError('No response received from TronScan API', 0);
        }
        throw new TronScanError(error.message || 'Unknown error', 0);
      }
    );
  }

  /**
   * Retry logic for failed requests
   */
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      if (error instanceof TronScanError) {
        const shouldRetry =
          retryCount < this.retryConfig.maxRetries &&
          (error.statusCode === undefined ||
            this.retryConfig.retryableStatusCodes.includes(error.statusCode));

        if (shouldRetry) {
          const delay = this.retryConfig.retryDelay * Math.pow(2, retryCount);
          await this.sleep(delay);
          return this.retryRequest(requestFn, retryCount + 1);
        }
      }
      throw error;
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch transactions for a given address
   * @param address - TRON address
   * @param options - Query options (limit, start, sort, etc.)
   */
  async getTransactions(
    address: string,
    options?: TronScanTransactionsOptions
  ): Promise<TronScanTransactionsResponse> {
    const params: Record<string, string | number | boolean> = { address };

    // API has only fromAddress/toAddress (no generic "address")
    if (options?.only_to) {
      params.toAddress = address;
    } else if (options?.only_from) {
      params.fromAddress = address;
    } else {
      // All transactions: pass same address as both (API may return union)
      params.fromAddress = address;
      params.toAddress = address;
    }

    if (options?.limit) {
      params.limit = options.limit;
    }
    if (options?.start) {
      params.start = options.start;
    }
    if (options?.sort) {
      params.sort = options.sort;
    }
    if (options?.count !== undefined) {
      params.count = options.count;
    }
    if (options?.filterTokenValue) {
      params.filterTokenValue = options.filterTokenValue;
    }
    if (options?.start_timestamp) {
      params.start_timestamp = options.start_timestamp;
    }
    if (options?.end_timestamp) {
      params.end_timestamp = options.end_timestamp;
    }

    return this.retryRequest(async () => {
      const response =
        await this.axiosInstance.get<TronScanTransactionsResponse>(
          '/api/transaction',
          { params }
        );

      if (!response.data) {
        throw new TronScanError('Failed to fetch transactions');
      }

      return response.data;
    });
  }

  /**
   * Fetch transaction details by transaction hash
   * @param txHash - Transaction hash
   */
  async getTransactionDetails(
    txHash: string
  ): Promise<TronScanTransactionDetail> {
    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get<TronScanTransactionDetail>(
        `/api/transaction/${txHash}`
      );

      if (!response.data) {
        throw new TronScanError('Failed to fetch transaction details');
      }

      return response.data;
    });
  }

  /**
   * Get address information
   * Uses TronScan account API; response format: balance (number), accountType (number), withPriceTokens (tokens list).
   * @param address - TRON address
   */
  async getAddressInfo(address: string): Promise<TronScanAddressInfo> {
    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get<TronScanAccountResponse>(
        `/api/accountv2?address=${address}`
      );

      if (!response.data) {
        throw new TronScanError('Failed to fetch address info');
      }

      const data = response.data;
      const accountTypeMap: Record<number, string> = {
        0: 'Normal',
        1: 'Contract',
        2: 'ContractCreator',
      };
      const accountTypeStr =
        data.accountType !== undefined
          ? (accountTypeMap[data.accountType] ?? String(data.accountType))
          : undefined;

      const trc20token_balances = (data.withPriceTokens ?? []).map(t => ({
        tokenId: t.tokenId,
        balance: t.balance ?? '0',
        tokenName: t.tokenName ?? '',
        tokenAbbr: t.tokenAbbr ?? '',
        tokenDecimal: t.tokenDecimal ?? 6,
        ...(t.tokenLogo && { tokenLogo: t.tokenLogo }),
        ...(t.vip !== undefined && { vip: t.vip }),
      }));

      return {
        address: data.address,
        balance: String(data.balance ?? 0),
        date_created: data.date_created,
        accountType: accountTypeStr,
        ...(trc20token_balances.length > 0 && { trc20token_balances }),
      };
    });
  }

  /**
   * Check address security/risk score
   * This is TronScan's security API for checking if an address is malicious
   * @param address - TRON address to check
   */
  async checkAddressSecurity(
    address: string
  ): Promise<TronScanAddressSecurity> {
    return this.retryRequest(async () => {
      try {
        // TronScan security API endpoint returns token security data
        const response = await this.axiosInstance.get<TronScanTokenSecurity>(
          `/api/security/token/data?address=${address}`
        );

        if (response.data) {
          const tokenSecurity = response.data;
          console.log(response.data);
          // Convert TronScan token security data to AddressSecurity format
          const tokenLevel = parseInt(tokenSecurity.token_level || '0', 10);

          // Map token_level to risk level
          // 0: Unknown, 1: Neutral, 2: OK, 3: Suspicious, 4: Unsafe
          let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
          let riskScore = 0;

          if (tokenLevel === 4) {
            riskLevel = 'CRITICAL';
            riskScore = 100;
          } else if (tokenLevel === 3) {
            riskLevel = 'HIGH';
            riskScore = 75;
          } else if (tokenLevel === 2) {
            riskLevel = 'LOW';
            riskScore = 10;
          } else if (tokenLevel === 1) {
            riskLevel = 'LOW';
            riskScore = 20;
          } else {
            riskLevel = 'MEDIUM';
            riskScore = 20;
          }

          // Check blacklist (black_list_type: 1 = has blacklist)
          const isBlacklisted = tokenSecurity.black_list_type === 1;
          if (isBlacklisted) {
            riskLevel = 'CRITICAL';
            riskScore = 100;
          }

          // Build tags array
          const tags: string[] = [];
          if (tokenSecurity.is_vip) tags.push('vip');
          if (isBlacklisted) tags.push('blacklisted');
          if (tokenSecurity.has_url) tags.push('has-url');
          if (tokenSecurity.swap_token) tags.push('swap-token');
          if (tokenSecurity.open_source) tags.push('open-source');
          if (tokenSecurity.is_proxy) tags.push('proxy');
          if (tokenSecurity.increase_total_supply === 1) tags.push('mintable');

          return {
            address,
            riskScore,
            riskLevel,
            isScam: tokenLevel === 4 || isBlacklisted,
            isPhishing: tokenSecurity.has_url && tokenLevel >= 3,
            isMalicious: tokenLevel === 4 || isBlacklisted,
            isBlacklisted,
            tags,
          };
        }

        // Fallback: if security endpoint doesn't exist, construct from address info
        const addressInfo = await this.getAddressInfo(address);

        // Basic security check based on address info
        return {
          address: address,
          riskScore: 0,
          riskLevel: 'UNKNOWN',
          isScam: false,
          isPhishing: false,
          isMalicious: false,
          isBlacklisted: false,
          tags: [],
          firstSeen: addressInfo.date_created,
          transactionCount: 0,
        };
      } catch (error: any) {
        // If security endpoint doesn't exist, return safe default
        if (error instanceof TronScanError && error.statusCode === 404) {
          return {
            address: address,
            riskScore: 0,
            riskLevel: 'UNKNOWN',
            isScam: false,
            isPhishing: false,
            isMalicious: false,
            isBlacklisted: false,
            tags: [],
          };
        }
        throw error;
      }
    });
  }

  /**
   * Get TRC-20 token transactions for an address
   * @param address - TRON address
   * @param options - Query options
   */
  async getTRC20Transactions(
    address: string,
    options?: TronScanTransactionsOptions
  ): Promise<TronScanTransactionsResponse> {
    const params: Record<string, string | number | boolean> = {
      address,
      contract_address: address, // For TRC-20 transactions
    };

    if (options?.limit) {
      params.limit = options.limit;
    }
    if (options?.start) {
      params.start = options.start;
    }
    if (options?.sort) {
      params.sort = options.sort;
    }

    return this.retryRequest(async () => {
      const response =
        await this.axiosInstance.get<TronScanTransactionsResponse>(
          '/api/transaction/trc20',
          { params }
        );

      if (!response.data) {
        throw new TronScanError('Failed to fetch TRC-20 transactions');
      }

      return response.data;
    });
  }

  /**
   * Get contract information
   * Useful for determining if an address is a smart contract and its type
   * @param contractAddress - Contract address
   */
  async getContractInfo(
    contractAddress: string
  ): Promise<TronScanContractInfo | null> {
    return this.retryRequest(async () => {
      try {
        const response = await this.axiosInstance.get<TronScanContractInfo>(
          `/api/contract?contract=${contractAddress}`
        );

        if (!response.data) {
          return null;
        }

        return response.data;
      } catch (error: any) {
        // If contract doesn't exist or not found, return null
        if (error instanceof TronScanError && error.statusCode === 404) {
          return null;
        }
        throw error;
      }
    });
  }

  /**
   * Get contract events
   * Useful for detecting liquidity pool operations (Swap, AddLiquidity, RemoveLiquidity)
   * @param contractAddress - Contract address
   * @param options - Query options
   */
  async getContractEvents(
    contractAddress: string,
    options?: {
      limit?: number;
      start?: number;
      event_name?: string;
      start_timestamp?: number;
      end_timestamp?: number;
    }
  ): Promise<TronScanContractEventsResponse> {
    const params: Record<string, string | number> = {
      contract: contractAddress,
    };

    if (options?.limit) {
      params.limit = options.limit;
    }
    if (options?.start) {
      params.start = options.start;
    }
    if (options?.event_name) {
      params.event_name = options.event_name;
    }
    if (options?.start_timestamp) {
      params.start_timestamp = options.start_timestamp;
    }
    if (options?.end_timestamp) {
      params.end_timestamp = options.end_timestamp;
    }

    return this.retryRequest(async () => {
      try {
        const response =
          await this.axiosInstance.get<TronScanContractEventsResponse>(
            '/api/contract/events',
            { params }
          );

        if (!response.data) {
          return { total: 0, data: [] };
        }

        return response.data;
      } catch (error: any) {
        // If events endpoint doesn't exist, return empty
        if (error instanceof TronScanError && error.statusCode === 404) {
          return { total: 0, data: [] };
        }
        throw error;
      }
    });
  }

  /**
   * Check if address has liquidity pool related events
   * This helps identify addresses that interact with DEX/liquidity pools
   * @param address - Address to check
   * @param limit - Maximum number of events to check
   */
  async hasLiquidityPoolEvents(
    address: string,
    limit = 100
  ): Promise<{
    hasLiquidityEvents: boolean;
    eventCount: number;
    eventTypes: string[];
  }> {
    try {
      // First check if address is a contract
      const contractInfo = await this.getContractInfo(address);
      if (!contractInfo) {
        // If not a contract, check events from transactions
        // We'll check contract events from transactions instead
        return {
          hasLiquidityEvents: false,
          eventCount: 0,
          eventTypes: [],
        };
      }

      // Get contract events
      const events = await this.getContractEvents(address, { limit });

      // Look for liquidity-related event names
      const liquidityEventNames = [
        'Swap',
        'AddLiquidity',
        'RemoveLiquidity',
        'TokenExchange',
        'Mint',
        'Burn',
        'Transfer',
      ];

      const foundEvents = events.data.filter(event =>
        liquidityEventNames.some(name =>
          event.event_name.toLowerCase().includes(name.toLowerCase())
        )
      );

      const eventTypes = [...new Set(foundEvents.map(e => e.event_name))];

      return {
        hasLiquidityEvents: foundEvents.length > 0,
        eventCount: foundEvents.length,
        eventTypes,
      };
    } catch (error) {
      // If check fails, return safe default
      return {
        hasLiquidityEvents: false,
        eventCount: 0,
        eventTypes: [],
      };
    }
  }
}

// Export a singleton instance using environment config
export const tronscanClient = new TronScanClient({
  apiKey: env.tronscanApiKey,
});
