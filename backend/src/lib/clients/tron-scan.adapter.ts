import { tronscanClient } from '../tronscan';
import {
  IBlockchainClient,
  Transaction,
  TransactionsResponse,
  TransactionsOptions,
  AddressInfo,
  AddressSecurity,
} from '../blockchain-client.interface';

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
    console.log('info: ', info);
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
      console.log(security);
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
}
