import { IBlockchainClient } from '../../lib/blockchain-client.interface';

export interface Transaction {
  block_timestamp: number;
  raw_data?: any;
  from?: string;
  to?: string;
  txID?: string;
}

/**
 * Service for analyzing and extracting data from blockchain transactions
 */
export class TransactionAnalyzer {
  constructor(private blockchainClient: IBlockchainClient) {}

  /**
   * Fetch transactions for an address (both TRC-20 and regular TRX)
   */
  async fetchAddressTransactions(address: string): Promise<Transaction[]> {
    try {
      console.log(
        `[TransactionAnalyzer] Fetching transactions for: ${address}`
      );
      // Fetch transactions with a reasonable limit
      const response = await this.blockchainClient.getTransactions(address, {
        limit: 200, // Get up to 200 transactions for analysis
        only_confirmed: false,
      });

      console.log(`[TransactionAnalyzer] Transactions response received:`, {
        total: response.total,
        dataCount: response.data?.length || 0,
        hasMore: response.hasMore,
      });

      // Extract block_timestamp and addresses from transactions
      const transactions: Transaction[] = (response.data || []).map(tx => ({
        block_timestamp: tx.blockTimestamp,
        raw_data: tx.raw_data,
        txID: tx.hash,
        from: tx.from,
        to: tx.to,
      }));

      console.log(
        `[TransactionAnalyzer] Processed ${transactions.length} transactions`
      );
      return transactions;
    } catch (error: any) {
      // Handle different error types
      if (error instanceof Error && 'statusCode' in error) {
        const statusCode = (error as any).statusCode;

        // 400/404 - Invalid address or no transactions (normal case)
        if (statusCode === 400 || statusCode === 404) {
          return [];
        }

        // 429 - Rate limit (should be retried by trongrid client)
        if (statusCode === 429) {
          return [];
        }
      }

      // Return empty array to allow analysis to continue
      return [];
    }
  }

  /**
   * Extract unique counterparties from transactions
   * Uses both raw_data and transaction fields (from/to)
   */
  extractUniqueCounterparties(transactions: Transaction[]): Set<string> {
    const counterparties = new Set<string>();

    transactions.forEach(tx => {
      // Extract from transaction fields (if available)
      if (tx.from) {
        counterparties.add(tx.from);
      }
      if (tx.to) {
        counterparties.add(tx.to);
      }

      // Extract from raw_data contracts
      if (tx.raw_data?.contract) {
        tx.raw_data.contract.forEach((contract: any) => {
          // Extract addresses from TransferContract
          if (contract.type === 'TransferContract') {
            const param = contract.parameter?.value;
            if (param?.owner_address) {
              counterparties.add(param.owner_address);
            }
            if (param?.to_address) {
              counterparties.add(param.to_address);
            }
          }
        });
      }
    });

    return counterparties;
  }

  /**
   * Calculate first seen timestamp from transactions
   */
  calculateFirstSeenAt(transactions: Transaction[]): Date | null {
    if (transactions.length === 0) {
      return null;
    }

    // Find the earliest transaction (oldest timestamp)
    const timestamps = transactions
      .map(tx => tx.block_timestamp)
      .filter(ts => ts && ts > 0);

    if (timestamps.length === 0) {
      return null;
    }

    const earliestTimestamp = Math.min(...timestamps);

    // Convert from milliseconds to Date
    return new Date(earliestTimestamp);
  }

  /**
   * Calculate age in days from a date
   */
  calculateAgeInDays(date: Date): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }
}
