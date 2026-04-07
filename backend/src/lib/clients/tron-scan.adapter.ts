import { tronscanClient } from '../tronscan';
import {
  IBlockchainClient,
  Transaction,
  TransactionsResponse,
  TransactionsOptions,
  AddressInfo,
  AddressSecurity,
  NormalizedTrc20Transfer,
  StablecoinTrc20TransfersResult,
} from '../blockchain-client.interface';
import type { NormalizedTronScanTRC20Transfer } from '../tronscan.types';

/**
 * TronScan adapter implementing IBlockchainClient interface
 */
export class TronScanAdapter implements IBlockchainClient {
  async getTransactions(
    address: string,
    options?: TransactionsOptions
  ): Promise<TransactionsResponse> {
    const response = await tronscanClient.getTransactions(address, {
      limit: options?.limit || 200,
      start: options?.start,
      sort: options?.sort === 'timestamp' ? 'timestamp' : 'block',
      start_timestamp: options?.start_timestamp,
      end_timestamp: options?.end_timestamp,
      only_to: options?.only_to,
      only_from: options?.only_from,
    });

    const transactions: Transaction[] = (response.data || []).map(
      (tx: any) => ({
        hash: tx.hash,
        blockNumber: tx.block,
        blockTimestamp: tx.timestamp,
        from: tx.ownerAddress || '',
        to: tx.toAddress || '',
        amount: tx.amount || '0',
        tokenInfo: tx.tokenInfo,
        contractType: tx.contractType,
        confirmed: tx.confirmed !== false,
      })
    );

    return {
      total: response.total || transactions.length,
      data: transactions,
      hasMore:
        response.rangeTotal > (options?.start || 0) + transactions.length,
    };
  }

  async getTransactionDetails(txHash: string): Promise<any> {
    return await tronscanClient.getTransactionDetails(txHash);
  }

  async getAddressInfo(address: string): Promise<AddressInfo> {
    const info = await tronscanClient.getAddressInfo(address);
    return {
      address: info.address,
      balance: info.balance || '0',
      trc20token_balances: info.trc20token_balances?.map((token: any) => ({
        tokenId: token.tokenId,
        balance: token.balance,
        tokenName: token.tokenName,
        tokenAbbr: token.tokenAbbr,
        tokenDecimal: token.tokenDecimal,
      })),
      date_created: info.date_created,
      accountType: info.accountType,
    };
  }

  async checkAddressSecurity(address: string): Promise<AddressSecurity | null> {
    try {
      const security = await tronscanClient.checkAddressSecurity(address);
      const riskLevel =
        security.riskLevel === 'UNKNOWN' ? 'MEDIUM' : security.riskLevel;
      return {
        address: security.address,
        riskScore: security.riskScore,
        riskLevel,
        isScam: security.isScam,
        isPhishing: security.isPhishing,
        isMalicious: security.isMalicious,
        isBlacklisted: security.isBlacklisted,
        tags: security.tags || [],
        description: security.description,
        firstSeen: security.firstSeen,
        lastSeen: security.lastSeen,
        transactionCount: security.transactionCount,
      };
    } catch (error) {
      console.warn(`TronScan security check failed for ${address}:`, error);
      return null;
    }
  }

  async getTRC20Transactions(
    address: string,
    options?: TransactionsOptions
  ): Promise<TransactionsResponse> {
    const response = await tronscanClient.getTRC20Transactions(address, {
      limit: options?.limit || 200,
      start: options?.start,
      sort: options?.sort === 'timestamp' ? 'timestamp' : 'block',
    });

    const transactions: Transaction[] = (response.data || []).map(
      (tx: any) => ({
        hash: tx.hash,
        blockNumber: tx.block,
        blockTimestamp: tx.timestamp,
        from: tx.ownerAddress || '',
        to: tx.toAddress || '',
        amount: tx.amount || '0',
        tokenInfo: tx.tokenInfo,
        contractType: tx.contractType,
        confirmed: tx.confirmed !== false,
      })
    );

    return {
      total: response.total || transactions.length,
      data: transactions,
      hasMore:
        response.rangeTotal > (options?.start || 0) + transactions.length,
    };
  }

  async getStablecoinTrc20Transfers(
    address: string,
    options: {
      direction: 'incoming' | 'outgoing';
      contractAddresses: string[];
      maxPages?: number;
      pageSize?: number;
      confirm?: boolean;
      debug?: boolean;
    }
  ): Promise<StablecoinTrc20TransfersResult> {
    const pageSize = Math.min(200, options.pageSize ?? 200);
    const maxPages = Math.max(1, options.maxPages ?? 5);
    const onlyIncoming = options.direction === 'incoming';
    const onlyOutgoing = options.direction === 'outgoing';

    const dedupe = new Set<string>();
    const transfers: NormalizedTrc20Transfer[] = [];
    let pagesFetched = 0;
    let totalRowsFetched = 0;
    let truncated = false;
    const contractsSeen = new Set<string>();
    const tokenSymbolsSeen = new Set<string>();

    for (const contract of options.contractAddresses) {
      if (!contract?.trim()) continue;
      contractsSeen.add(contract);
      let start = 0;
      for (let p = 0; p < maxPages; p++) {
        const page = await tronscanClient.getTRC20TransfersByAddress(address, {
          contractAddress: contract,
          onlyIncoming,
          onlyOutgoing,
          start,
          limit: pageSize,
          confirm: options.confirm !== false,
        });
        pagesFetched++;
        const rows = page.data as NormalizedTronScanTRC20Transfer[];
        totalRowsFetched += rows.length;
        for (const row of rows) {
          const key = `${row.txHash}|${row.fromAddress}|${row.toAddress}|${row.contractAddress}|${row.rawAmount}`;
          if (dedupe.has(key)) continue;
          dedupe.add(key);
          if (row.tokenSymbol) tokenSymbolsSeen.add(row.tokenSymbol);
          transfers.push(row as NormalizedTrc20Transfer);
        }
        if (rows.length === pageSize && p === maxPages - 1) {
          truncated = true;
        }
        if (rows.length === 0) break;
        if (rows.length < pageSize) break;
        start += rows.length;
        if (start >= (page.rangeTotal ?? page.total)) break;
      }
    }

    const cpKey = onlyIncoming ? 'fromAddress' : 'toAddress';
    const counterparties = new Set(
      transfers.map(t => (t as NormalizedTrc20Transfer)[cpKey])
    );
    const totalNormalizedVolume = transfers.reduce((s, t) => s + t.amount, 0);

    const meta = {
      pagesFetched,
      totalRowsFetched,
      matchedTransfers: transfers.length,
      uniqueCounterparties: counterparties.size,
      contractsSeen: Array.from(contractsSeen),
      tokenSymbolsSeen: Array.from(tokenSymbolsSeen).slice(0, 40),
      totalNormalizedVolume,
      truncated,
    };

    if (options.debug) {
      console.log(`[TronScanAdapter] Stablecoin TRC20 transfers (${options.direction})`, {
        address,
        ...meta,
      });
    }

    return { transfers, meta };
  }
}
