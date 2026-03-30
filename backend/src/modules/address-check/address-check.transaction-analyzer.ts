import { IBlockchainClient } from '../../lib/blockchain-client.interface';
import { TAINT_STABLECOIN_SYMBOLS } from './address-check.constants';

/**
 * Normalized transaction row used by analyzers. Provider payloads are mapped in
 * `IBlockchainClient`; see `chain-transaction.types.ts` for a chain-agnostic view.
 */
export interface Transaction {
  block_timestamp: number;
  raw_data?: {
    contract?: Array<{
      type?: string;
      parameter?: {
        value?: {
          owner_address?: string;
          to_address?: string;
        };
      };
    }>;
  };
  from?: string;
  to?: string;
  txID?: string;
  amount?: number;
  tokenInfo?: {
    symbol: string;
    address: string;
    decimals: number;
    name: string;
  };
}

/**
 * Service for analyzing and extracting data from blockchain transactions
 */
export class TransactionAnalyzer {
  constructor(private blockchainClient: IBlockchainClient) {}

  private isTaintStablecoin(symbol?: string): boolean {
    if (!symbol) return false;
    return TAINT_STABLECOIN_SYMBOLS.has(symbol.toUpperCase());
  }

  private normalizeTokenAmount(
    amount: unknown,
    decimals?: number | null
  ): number {
    const rawStr = String(amount ?? '0');
    const raw = parseFloat(rawStr);
    if (!Number.isFinite(raw) || raw <= 0) return 0;

    // If value already looks like a decimal amount, keep as-is.
    if (rawStr.includes('.')) return raw;

    // If decimals provided and amount is integer-like, convert from base units.
    if (typeof decimals === 'number' && decimals >= 0 && decimals <= 30) {
      return raw / Math.pow(10, decimals);
    }

    return raw;
  }

  /**
   * Fetch transactions for an address (both TRC-20 and regular TRX).
   * By default, fetches only incoming transactions (only_to) for AML source-of-funds analysis.
   */
  async fetchAddressTransactions(
    address: string,
    options?: { onlyIncoming?: boolean }
  ): Promise<Transaction[]> {
    try {
      const onlyIncoming = options?.onlyIncoming !== false;
      console.log(
        `[TransactionAnalyzer] Fetching ${onlyIncoming ? 'incoming' : 'all'} transactions for: ${address}`
      );
      // Fetch transactions with a reasonable limit; only_to = only incoming for this address
      const response = await this.blockchainClient.getTransactions(address, {
        limit: 200,
        only_confirmed: false,
        only_to: onlyIncoming,
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
        amount: this.normalizeTokenAmount(tx.amount, tx.tokenInfo?.decimals),
        tokenInfo: tx.tokenInfo,
      }));

      console.log(
        `[TransactionAnalyzer] Processed ${transactions.length} transactions`
      );
      return transactions;
    } catch (error: unknown) {
      // Handle different error types
      if (error instanceof Error && 'statusCode' in error) {
        const statusCode = (error as { statusCode?: number }).statusCode;

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
   * Fetch incoming TRC20 volumes for an address: total volume and volume per sender (counterparty).
   * Uses getTransactions (only_to) only; does not use getTRC20Transactions (not available in TronScan API).
   * Counts only transfers that have tokenInfo (TRC20); ignores plain TRX transfers.
   */
  async fetchTRC20IncomingVolumes(address: string): Promise<{
    totalVolume: number;
    volumeByCounterparty: Map<string, number>;
    pagesFetched: number;
    scannedTxCount: number;
    stablecoinTxCount: number;
    truncated: boolean;
  }> {
    const volumeByCounterparty = new Map<string, number>();
    let totalVolume = 0;
    const seenTxIds = new Set<string>();
    const pageLimit = 200;
    const maxPages = 5;
    let pagesFetched = 0;
    let scannedTxCount = 0;
    let stablecoinTxCount = 0;
    let truncated = false;
    try {
      const normalizedAddress = address.toLowerCase();

      for (let page = 0; page < maxPages; page++) {
        const response = await this.blockchainClient.getTransactions(address, {
          limit: pageLimit,
          only_to: true,
          start: page * pageLimit,
        });
        const list = response.data || [];
        if (list.length === 0) break;
        pagesFetched++;
        scannedTxCount += list.length;

        let newItemsInPage = 0;
        for (const tx of list) {
          const txId = tx.hash ?? '';
          if (txId && seenTxIds.has(txId)) continue;
          if (txId) {
            seenTxIds.add(txId);
            newItemsInPage++;
          }

          const to = tx.to ?? '';
          if (to.toLowerCase() !== normalizedAddress) continue;
          // Only TRC20: count when tokenInfo is present (token transfer); skip plain TRX
          const tokenInfo = tx.tokenInfo;
          if (!tokenInfo) continue;
          if (!this.isTaintStablecoin(tokenInfo.symbol)) continue;
          stablecoinTxCount++;
          const from = tx.from ?? '';
          const amount = this.normalizeTokenAmount(
            tx.amount,
            tokenInfo.decimals
          );
          if (amount <= 0) continue;
          totalVolume += amount;
          volumeByCounterparty.set(
            from,
            (volumeByCounterparty.get(from) ?? 0) + amount
          );
        }

        if (!response.hasMore) break;
        // Safety break for providers that ignore "start" or return duplicates.
        if (newItemsInPage === 0) break;
      }
      truncated = pagesFetched >= maxPages;
    } catch {
      // return zeros
    }
    return {
      totalVolume,
      volumeByCounterparty,
      pagesFetched,
      scannedTxCount,
      stablecoinTxCount,
      truncated,
    };
  }

  /**
   * Extract unique counterparties from transactions.
   * Optionally excludes an address (e.g. the analyzed address when using incoming-only tx).
   */
  extractUniqueCounterparties(
    transactions: Transaction[],
    excludeAddress?: string
  ): Set<string> {
    const counterparties = new Set<string>();

    transactions.forEach(tx => {
      if (tx.from && tx.from !== excludeAddress) {
        counterparties.add(tx.from);
      }
      if (tx.to && tx.to !== excludeAddress) {
        counterparties.add(tx.to);
      }

      if (tx.raw_data?.contract) {
        tx.raw_data.contract.forEach(contract => {
          if (contract.type === 'TransferContract') {
            const param = contract.parameter?.value;
            if (
              param?.owner_address &&
              param.owner_address !== excludeAddress
            ) {
              counterparties.add(param.owner_address);
            }
            if (param?.to_address && param.to_address !== excludeAddress) {
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

  /** Days since the most recent transaction (for taint time decay). */
  static lastActivityDaysFromTransactions(transactions: Transaction[]): number {
    const timestamps = transactions
      .map(tx => tx.block_timestamp)
      .filter((ts): ts is number => ts > 0);
    if (timestamps.length === 0) return 365;
    const latest = Math.max(...timestamps);
    return (Date.now() - latest) / (1000 * 60 * 60 * 24);
  }
}
