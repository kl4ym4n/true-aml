import { IBlockchainClient } from '../../lib/blockchain-client.interface';
import { env } from '../../config/env';
import {
  TAINT_STABLECOIN_CONTRACT_ADDRESSES,
  TAINT_STABLECOIN_SYMBOLS,
} from './address-check.constants';

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

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isRetriableProviderError(err: unknown): boolean {
    // TronScan client throws TronScanError with statusCode; also allow generic transient failures.
    const anyErr = err as any;
    const status = Number(anyErr?.statusCode);
    if ([0, 429, 500, 502, 503, 504].includes(status)) return true;
    const msg = String(anyErr?.message ?? '');
    return (
      msg.includes('No response received') ||
      msg.includes('ECONNRESET') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('socket hang up')
    );
  }

  private async withRetries<T>(
    fn: () => Promise<T>,
    opts: { maxRetries: number; baseDelayMs: number }
  ): Promise<{ value?: T; error?: unknown; attempts: number }> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        const value = await fn();
        return { value, attempts: attempt + 1 };
      } catch (e) {
        lastErr = e;
        if (!this.isRetriableProviderError(e) || attempt === opts.maxRetries) {
          break;
        }
        const delay = opts.baseDelayMs * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
    return { error: lastErr, attempts: opts.maxRetries + 1 };
  }

  /** USDT/USDC mainnet contracts for SoF (env override + defaults). */
  private stablecoinContractAddresses(): string[] {
    return [
      ...new Set(
        [env.tronUsdtContract, env.tronUsdcContract].filter(
          (c): c is string => !!c?.trim()
        )
      ),
    ];
  }

  /** True if this TRC20 row is USDT/USDC by symbol or by mainnet contract address. */
  private isTaintStablecoinToken(tokenInfo?: {
    symbol?: string;
    address?: string;
  } | null): boolean {
    if (!tokenInfo) return false;
    const contract = tokenInfo.address?.trim();
    if (contract && TAINT_STABLECOIN_CONTRACT_ADDRESSES.has(contract)) {
      return true;
    }
    const sym = tokenInfo.symbol?.trim();
    if (!sym) return false;
    return TAINT_STABLECOIN_SYMBOLS.has(sym.toUpperCase());
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
   * Fetch incoming USDT/USDC (TRC20) volumes via contract-scoped transfers (TronScan:
   * /api/token_trc20/transfers). Does not use generic /api/transaction.
   */
  async fetchTRC20IncomingVolumes(
    address: string,
    opts?: { debug?: boolean }
  ): Promise<{
    totalVolume: number;
    volumeByCounterparty: Map<string, number>;
    pagesFetched: number;
    scannedTxCount: number;
    stablecoinTxCount: number;
    truncated: boolean;
    provider?: 'tronscan_transfers' | 'legacy_tx_list';
    warning?: string;
  }> {
    try {
      const contracts = this.stablecoinContractAddresses();
      const attempt = await this.withRetries(
        () =>
          this.blockchainClient.getStablecoinTrc20Transfers(address, {
            direction: 'incoming',
            contractAddresses: contracts,
            maxPages: 5,
            pageSize: 200,
            confirm: true,
            debug: opts?.debug,
          }),
        { maxRetries: 2, baseDelayMs: 400 }
      );

      if (!attempt.value) {
        throw attempt.error;
      }
      const { transfers, meta } = attempt.value;

      const normalizedAddress = address.toLowerCase();
      const volumeByCounterparty = new Map<string, number>();
      let totalVolume = 0;
      let stablecoinTxCount = 0;

      for (const t of transfers) {
        if (t.toAddress.toLowerCase() !== normalizedAddress) continue;
        if (t.amount <= 0) continue;
        stablecoinTxCount++;
        totalVolume += t.amount;
        volumeByCounterparty.set(
          t.fromAddress,
          (volumeByCounterparty.get(t.fromAddress) ?? 0) + t.amount
        );
      }

      if (opts?.debug) {
        console.log(`[TransactionAnalyzer] Stablecoin incoming scan summary`, {
          address,
          source: 'token_trc20_transfers',
          attempts: attempt.attempts,
          pagesFetched: meta.pagesFetched,
          totalRowsFetched: meta.totalRowsFetched,
          matchedIncomingTransfers: meta.matchedTransfers,
          uniqueCounterparties: meta.uniqueCounterparties,
          contractsSeen: meta.contractsSeen,
          tokenSymbolsSeen: meta.tokenSymbolsSeen,
          totalNormalizedVolume: meta.totalNormalizedVolume,
          stablecoinIncomingTotal: totalVolume,
          truncated: meta.truncated,
        });
      }

      return {
        totalVolume,
        volumeByCounterparty,
        pagesFetched: meta.pagesFetched,
        scannedTxCount: meta.totalRowsFetched,
        stablecoinTxCount,
        truncated: meta.truncated,
        provider: 'tronscan_transfers',
      };
    } catch (e) {
      console.warn(
        '[TransactionAnalyzer] Stablecoin transfer fetch failed; falling back to tx list:',
        e
      );
      const legacy = await this.fetchTRC20IncomingVolumesLegacy(address, opts);
      return {
        ...legacy,
        provider: 'legacy_tx_list',
        warning:
          'Stablecoin transfers API temporarily failed; SoF/taint may be incomplete (fallback to generic tx list).',
      };
    }
  }

  /**
   * Legacy: scan generic tx feed for TRC20 + symbol/contract heuristics (last resort).
   */
  private async fetchTRC20IncomingVolumesLegacy(
    address: string,
    opts?: { debug?: boolean }
  ): Promise<{
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
    const tokenSymbolsSeen = new Set<string>();
    let skippedToMismatch = 0;
    let skippedNoTokenInfo = 0;
    let skippedNonStablecoin = 0;
    let skippedNonPositiveAmount = 0;
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
          if (to.toLowerCase() !== normalizedAddress) {
            skippedToMismatch++;
            continue;
          }
          const tokenInfo = tx.tokenInfo;
          if (!tokenInfo) {
            skippedNoTokenInfo++;
            continue;
          }
          if (tokenInfo.symbol) tokenSymbolsSeen.add(tokenInfo.symbol);
          else if (tokenInfo.address)
            tokenSymbolsSeen.add(`contract:${tokenInfo.address}`);
          if (!this.isTaintStablecoinToken(tokenInfo)) {
            skippedNonStablecoin++;
            continue;
          }
          stablecoinTxCount++;
          const from = tx.from ?? '';
          const amount = this.normalizeTokenAmount(
            tx.amount,
            tokenInfo.decimals
          );
          if (amount <= 0) {
            skippedNonPositiveAmount++;
            continue;
          }
          totalVolume += amount;
          volumeByCounterparty.set(
            from,
            (volumeByCounterparty.get(from) ?? 0) + amount
          );
        }

        if (!response.hasMore) break;
        if (newItemsInPage === 0) break;
      }
      truncated = pagesFetched >= maxPages;
    } catch {
      // return zeros
    }
    if (opts?.debug) {
      console.log(`[TransactionAnalyzer] Stablecoin incoming (legacy tx list)`, {
        address,
        pagesFetched,
        scannedTxCount,
        stablecoinTxCount,
        stablecoinIncomingTotal: totalVolume,
        uniqueCounterparties: volumeByCounterparty.size,
        tokenSymbolsSeen: Array.from(tokenSymbolsSeen).slice(0, 25),
        skippedToMismatch,
        skippedNoTokenInfo,
        skippedNonStablecoin,
        skippedNonPositiveAmount,
        truncated,
      });
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
   * Outgoing USDT/USDC via contract-scoped transfers.
   */
  async fetchTRC20OutgoingVolumes(address: string): Promise<{
    totalVolume: number;
    volumeByCounterparty: Map<string, number>;
    pagesFetched: number;
    scannedTxCount: number;
    stablecoinTxCount: number;
    truncated: boolean;
  }> {
    try {
      const contracts = this.stablecoinContractAddresses();
      const { transfers, meta } =
        await this.blockchainClient.getStablecoinTrc20Transfers(address, {
          direction: 'outgoing',
          contractAddresses: contracts,
          maxPages: 5,
          pageSize: 200,
          confirm: true,
        });

      const normalizedAddress = address.toLowerCase();
      const volumeByCounterparty = new Map<string, number>();
      let totalVolume = 0;
      let stablecoinTxCount = 0;

      for (const t of transfers) {
        if (t.fromAddress.toLowerCase() !== normalizedAddress) continue;
        if (t.amount <= 0) continue;
        stablecoinTxCount++;
        totalVolume += t.amount;
        volumeByCounterparty.set(
          t.toAddress,
          (volumeByCounterparty.get(t.toAddress) ?? 0) + t.amount
        );
      }

      return {
        totalVolume,
        volumeByCounterparty,
        pagesFetched: meta.pagesFetched,
        scannedTxCount: meta.totalRowsFetched,
        stablecoinTxCount,
        truncated: meta.truncated,
      };
    } catch (e) {
      console.warn(
        '[TransactionAnalyzer] Stablecoin outgoing transfer fetch failed; falling back to tx list:',
        e
      );
      return this.fetchTRC20OutgoingVolumesLegacy(address);
    }
  }

  private async fetchTRC20OutgoingVolumesLegacy(address: string): Promise<{
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
          only_to: false,
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

          const from = tx.from ?? '';
          if (from.toLowerCase() !== normalizedAddress) continue;
          const tokenInfo = tx.tokenInfo;
          if (!tokenInfo) continue;
          if (!this.isTaintStablecoinToken(tokenInfo)) continue;
          stablecoinTxCount++;
          const to = tx.to ?? '';
          const amount = this.normalizeTokenAmount(
            tx.amount,
            tokenInfo.decimals
          );
          if (amount <= 0) continue;
          totalVolume += amount;
          volumeByCounterparty.set(
            to,
            (volumeByCounterparty.get(to) ?? 0) + amount
          );
        }

        if (!response.hasMore) break;
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
