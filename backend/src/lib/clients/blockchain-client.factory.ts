import {
  IBlockchainClient,
  StablecoinTrc20TransfersResult,
} from '../blockchain-client.interface';
import { TronGridAdapter } from './tron-grid.adapter';
import { TronScanAdapter } from './tron-scan.adapter';

export type BlockchainProvider = 'trongrid' | 'tronscan' | 'auto';

/**
 * Factory for creating blockchain clients
 * Allows easy switching between providers
 */
export class BlockchainClientFactory {
  private static instances: Map<BlockchainProvider, IBlockchainClient> =
    new Map();

  /**
   * Get blockchain client instance
   * @param provider - Provider name ('trongrid', 'tronscan', or 'auto')
   * @returns Blockchain client instance
   */
  static getClient(provider: BlockchainProvider = 'auto'): IBlockchainClient {
    // Use cached instance if available
    if (this.instances.has(provider)) {
      return this.instances.get(provider)!;
    }

    let client: IBlockchainClient;

    switch (provider) {
      case 'trongrid':
        client = new TronGridAdapter();
        break;
      case 'tronscan':
        client = new TronScanAdapter();
        break;
      case 'auto':
      default:
        // Auto mode: use TronScan for security checks, TronGrid for transactions
        client = new CompositeBlockchainClient();
        break;
    }

    this.instances.set(provider, client);
    return client;
  }

  /**
   * Clear cached instances (useful for testing)
   */
  static clearCache(): void {
    this.instances.clear();
  }
}

/**
 * Composite client that uses multiple providers
 * Uses TronScan for security checks, TronGrid for transactions
 */
class CompositeBlockchainClient implements IBlockchainClient {
  private trongridClient = new TronGridAdapter();
  private tronscanClient = new TronScanAdapter();

  async getTransactions(address: string, options?: any): Promise<any> {
    // Prefer TronGrid for transactions (more reliable)
    try {
      return await this.trongridClient.getTransactions(address, options);
    } catch (error) {
      console.warn('TronGrid failed, falling back to TronScan:', error);
      return await this.tronscanClient.getTransactions(address, options);
    }
  }

  async getTransactionDetails(txHash: string): Promise<any> {
    // Try TronGrid first, fallback to TronScan
    try {
      return await this.trongridClient.getTransactionDetails(txHash);
    } catch (error) {
      console.warn('TronGrid failed, falling back to TronScan:', error);
      return await this.tronscanClient.getTransactionDetails(txHash);
    }
  }

  async getAddressInfo(address: string): Promise<any> {
    // Use TronScan for address info (more detailed)
    return await this.tronscanClient.getAddressInfo(address);
  }

  async checkAddressSecurity(address: string): Promise<any> {
    // Use TronScan for security checks (only provider that supports it)
    return await this.tronscanClient.checkAddressSecurity(address);
  }

  async getTRC20Transactions(address: string, options?: any): Promise<any> {
    // Prefer TronGrid for TRC-20 transactions
    try {
      return await this.trongridClient.getTRC20Transactions(address, options);
    } catch (error) {
      console.warn('TronGrid failed, falling back to TronScan:', error);
      return await this.tronscanClient.getTRC20Transactions(address, options);
    }
  }

  /**
   * SoF / taint stablecoin sample: always TronScan (token_trc20/transfers), not generic tx history.
   */
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
    return this.tronscanClient.getStablecoinTrc20Transfers(address, options);
  }
}
