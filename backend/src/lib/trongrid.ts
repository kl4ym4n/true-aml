import axios, { AxiosInstance, AxiosError } from 'axios';
import { env } from '../config/env';
import {
  TRC20TransactionsResponse,
  TransactionDetailResponse,
  TronGridErrorResponse,
  TronGridError,
  RetryConfig,
  TronGridClientConfig,
  TRC20TransactionsOptions,
} from './trongrid.types';

// TronGrid API base URL
const TRONGRID_BASE_URL = 'https://api.trongrid.io';

export class TronGridClient {
  private axiosInstance: AxiosInstance;
  private retryConfig: RetryConfig;

  constructor(config: TronGridClientConfig) {
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      retryableStatusCodes: [429, 500, 502, 503, 504],
      ...config.retryConfig,
    };

    this.axiosInstance = axios.create({
      baseURL: config.baseURL || TRONGRID_BASE_URL,
      timeout: config.timeout || 30000,
      headers: {
        'TRON-PRO-API-KEY': config.apiKey,
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for logging (optional)
    this.axiosInstance.interceptors.request.use(
      config => config,
      error => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      response => response,
      (error: AxiosError<TronGridErrorResponse>) => {
        if (error.response) {
          const tronGridError = error.response.data;
          throw new TronGridError(
            tronGridError?.Error || error.message || 'TronGrid API error',
            error.response.status,
            tronGridError?.code
          );
        }
        if (error.request) {
          throw new TronGridError('No response received from TronGrid API', 0);
        }
        throw new TronGridError(error.message || 'Unknown error', 0);
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
      if (error instanceof TronGridError) {
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
   * Fetch TRC-20 transactions for a given address
   * @param address - TRON address
   * @param options - Query options (limit, fingerprint, etc.)
   */
  async getTRC20Transactions(
    address: string,
    options?: TRC20TransactionsOptions
  ): Promise<TRC20TransactionsResponse> {
    const params: Record<string, string | number | boolean> = {};

    if (options?.limit) {
      params.limit = options.limit;
    }
    if (options?.fingerprint) {
      params.fingerprint = options.fingerprint;
    }
    if (options?.only_confirmed !== undefined) {
      params.only_confirmed = options.only_confirmed;
    }
    if (options?.only_to !== undefined) {
      params.only_to = options.only_to;
    }
    if (options?.only_from !== undefined) {
      params.only_from = options.only_from;
    }
    if (options?.contract_address) {
      params.contract_address = options.contract_address;
    }

    return this.retryRequest(async () => {
      const url = `/v1/accounts/${address}/transactions`;
      const response = await this.axiosInstance.get<TRC20TransactionsResponse>(
        url,
        {
          params,
        }
      );

      if (!response.data.success) {
        throw new TronGridError('Failed to fetch TRC-20 transactions');
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
  ): Promise<TransactionDetailResponse> {
    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get<TransactionDetailResponse>(
        `/v1/transactions/${txHash}`
      );
      if (!response.data.success) {
        throw new TronGridError('Failed to fetch transaction details');
      }

      return response.data;
    });
  }

  /**
   * Fetch contract events (e.g., blacklist events from token contracts)
   * @param contractAddress - Smart contract address
   * @param eventName - Event name (e.g., "AddedBlackList", "RemovedBlackList")
   * @param options - Query options (limit, fingerprint, etc.)
   */
  async getContractEvents(
    contractAddress: string,
    eventName: string,
    options?: {
      limit?: number;
      fingerprint?: string;
      only_confirmed?: boolean;
      blockNumber?: number;
      minBlockNumber?: number;
      maxBlockNumber?: number;
    }
  ): Promise<{
    success: boolean;
    data: Array<{
      block_number: number;
      block_timestamp: number;
      contract_address: string;
      event_name: string;
      result: Record<string, unknown>;
      transaction: string;
    }>;
    meta: {
      at: number;
      page_size: number;
      links?: {
        next?: string;
      };
    };
  }> {
    const params: Record<string, string | number | boolean> = {
      event_name: eventName,
      only_confirmed: options?.only_confirmed ?? true,
    };

    if (options?.limit) {
      params.limit = options.limit;
    }
    if (options?.fingerprint) {
      params.fingerprint = options.fingerprint;
    }
    if (options?.blockNumber) {
      params.block_number = options.blockNumber;
    }
    if (options?.minBlockNumber) {
      params.min_block_timestamp = options.minBlockNumber;
    }
    if (options?.maxBlockNumber) {
      params.max_block_timestamp = options.maxBlockNumber;
    }

    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get(
        `/v1/contracts/${contractAddress}/events`,
        { params }
      );

      if (!response.data.success) {
        throw new TronGridError('Failed to fetch contract events');
      }

      return response.data;
    });
  }

  /**
   * Get blacklisted addresses from a token contract (e.g., USDT)
   * This fetches AddedBlackList and RemovedBlackList events
   * @param contractAddress - Token contract address (e.g., USDT: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)
   * @param options - Query options
   */
  async getTokenBlacklist(
    contractAddress: string,
    options?: {
      limit?: number;
      only_confirmed?: boolean;
    }
  ): Promise<{
    blacklisted: Set<string>;
    removed: Set<string>;
    events: Array<{
      address: string;
      action: 'added' | 'removed';
      blockNumber: number;
      timestamp: number;
      txHash: string;
    }>;
  }> {
    const blacklisted = new Set<string>();
    const removed = new Set<string>();
    const events: Array<{
      address: string;
      action: 'added' | 'removed';
      blockNumber: number;
      timestamp: number;
      txHash: string;
    }> = [];

    try {
      // Fetch AddedBlackList events
      const addedEvents = await this.getContractEvents(
        contractAddress,
        'AddedBlackList',
        {
          limit: options?.limit || 1000,
          only_confirmed: options?.only_confirmed ?? true,
        }
      );

      // Fetch RemovedBlackList events
      const removedEvents = await this.getContractEvents(
        contractAddress,
        'RemovedBlackList',
        {
          limit: options?.limit || 1000,
          only_confirmed: options?.only_confirmed ?? true,
        }
      );

      // Process AddedBlackList events
      for (const event of addedEvents.data || []) {
        const address =
          (event.result as any)?.account || (event.result as any)?.address;
        if (address) {
          blacklisted.add(address);
          events.push({
            address,
            action: 'added',
            blockNumber: event.block_number,
            timestamp: event.block_timestamp,
            txHash: event.transaction,
          });
        }
      }

      // Process RemovedBlackList events
      for (const event of removedEvents.data || []) {
        const address =
          (event.result as any)?.account || (event.result as any)?.address;
        if (address) {
          removed.add(address);
          blacklisted.delete(address); // Remove from blacklist if it was removed
          events.push({
            address,
            action: 'removed',
            blockNumber: event.block_number,
            timestamp: event.block_timestamp,
            txHash: event.transaction,
          });
        }
      }
    } catch (error) {
      console.error(
        `Failed to fetch blacklist from contract ${contractAddress}:`,
        error
      );
    }

    return {
      blacklisted,
      removed,
      events,
    };
  }
}

// Export a singleton instance using environment config
export const trongridClient = new TronGridClient({
  apiKey: env.trongridApiKey,
});
