import { trongridClient } from '../trongrid';
import type { TRC20Transaction } from '../trongrid.types';
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

function trongridTxToNormalized(tx: TRC20Transaction): NormalizedTrc20Transfer {
  const decimals = Math.min(
    30,
    Math.max(0, tx.token_info?.decimals ?? 6)
  );
  const raw = String(tx.value ?? '0');
  const rawNum = parseFloat(raw);
  const amount = Number.isFinite(rawNum)
    ? rawNum / Math.pow(10, decimals)
    : 0;
  return {
    txHash: tx.transaction_id,
    timestamp: tx.block_timestamp,
    fromAddress: tx.from ?? '',
    toAddress: tx.to ?? '',
    contractAddress: tx.token_info?.address ?? '',
    tokenSymbol: tx.token_info?.symbol ?? '',
    tokenName: tx.token_info?.name ?? '',
    tokenDecimals: decimals,
    rawAmount: raw,
    amount,
    confirmed: true,
  };
}

function trongridNextFingerprint(links?: { next?: string }): string | undefined {
  const next = links?.next;
  if (!next) return undefined;
  try {
    const url = next.startsWith('http')
      ? new URL(next)
      : new URL(next, 'https://api.trongrid.io');
    return url.searchParams.get('fingerprint') || undefined;
  } catch {
    return undefined;
  }
}

/**
 * TronGrid adapter implementing IBlockchainClient interface
 */
export class TronGridAdapter implements IBlockchainClient {
  async getTransactions(
    address: string,
    options?: TransactionsOptions
  ): Promise<TransactionsResponse> {
    const response = await trongridClient.getTRC20Transactions(address, {
      limit: options?.limit || 200,
      only_confirmed: options?.only_confirmed,
      only_to: options?.only_to,
      only_from: options?.only_from,
      contract_address: options?.contract_address,
    });

    const transactions: Transaction[] = (response.data || []).map(
      (tx: any) => ({
        hash: tx.transaction_id || tx.txID,
        blockNumber: tx.blockNumber || 0,
        blockTimestamp: tx.block_timestamp,
        from: tx.from || '',
        to: tx.to || '',
        amount: tx.value || '0',
        tokenInfo: tx.token_info,
        contractType: tx.type,
        confirmed: true,
        raw_data: tx.raw_data,
      })
    );

    return {
      total: response.meta?.page_size || transactions.length,
      data: transactions,
      hasMore: !!response.meta?.links?.next,
    };
  }

  async getTransactionDetails(txHash: string): Promise<any> {
    return await trongridClient.getTransactionDetails(txHash);
  }

  async getAddressInfo(address: string): Promise<AddressInfo> {
    // TronGrid doesn't have a direct address info endpoint
    // We'll use transactions to infer some info
    const transactions = await this.getTransactions(address, { limit: 1 });

    return {
      address,
      balance: '0',
      date_created: transactions.data[0]?.blockTimestamp,
    };
  }

  async checkAddressSecurity(
    _address: string
  ): Promise<AddressSecurity | null> {
    // TronGrid doesn't provide security checks
    return null;
  }

  async getTRC20Transactions(
    address: string,
    options?: TransactionsOptions
  ): Promise<TransactionsResponse> {
    return this.getTransactions(address, options);
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
      let fingerprint: string | undefined;
      for (let p = 0; p < maxPages; p++) {
        const res = await trongridClient.getTRC20Transactions(address, {
          limit: pageSize,
          contract_address: contract,
          only_to: onlyIncoming,
          only_from: onlyOutgoing,
          only_confirmed: options.confirm !== false,
          fingerprint,
        });
        pagesFetched++;
        const rows = res.data ?? [];
        totalRowsFetched += rows.length;
        for (const tx of rows) {
          const n = trongridTxToNormalized(tx);
          const key = `${n.txHash}|${n.fromAddress}|${n.toAddress}|${n.contractAddress}|${n.rawAmount}`;
          if (dedupe.has(key)) continue;
          dedupe.add(key);
          if (n.tokenSymbol) tokenSymbolsSeen.add(n.tokenSymbol);
          transfers.push(n);
        }
        if (rows.length === pageSize && p === maxPages - 1) {
          truncated = true;
        }
        if (rows.length === 0) break;
        fingerprint = trongridNextFingerprint(res.meta?.links);
        if (!fingerprint) break;
      }
    }

    const cpKey = onlyIncoming ? 'fromAddress' : 'toAddress';
    const counterparties = new Set(transfers.map(t => t[cpKey]));
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
      console.log(`[TronGridAdapter] Stablecoin TRC20 transfers (${options.direction})`, {
        address,
        ...meta,
      });
    }

    return { transfers, meta };
  }
}
