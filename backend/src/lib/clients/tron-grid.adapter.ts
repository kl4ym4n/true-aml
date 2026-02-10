import { trongridClient } from '../trongrid';
import {
  IBlockchainClient,
  Transaction,
  TransactionsResponse,
  TransactionsOptions,
  AddressInfo,
  AddressSecurity,
} from '../blockchain-client.interface';

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

  async checkAddressSecurity(address: string): Promise<AddressSecurity | null> {
    console.log(address);
    // TronGrid doesn't provide security checks
    return null;
  }

  async getTRC20Transactions(
    address: string,
    options?: TransactionsOptions
  ): Promise<TransactionsResponse> {
    return this.getTransactions(address, options);
  }
}
