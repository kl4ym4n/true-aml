import { BlockchainClientFactory } from '../../lib/clients';
import { IBlockchainClient } from '../../lib/blockchain-client.interface';
import { env } from '../../config/env';
import { addressCheckService } from '../address-check';
import { blacklistService } from '../blacklist';
import prisma from '../../config/database';
import { NotFoundError } from '../../lib/errors';

import {
  TransactionAnalysisResult,
  TransactionAnalysisMetadata,
  TRC20TransferData,
  TaintingCheckResult,
  RiskLevel,
} from './transaction-check.types';

// Risk score thresholds
const RISK_SCORE_CRITICAL = 80;
const RISK_SCORE_HIGH = 50;
const RISK_SCORE_MEDIUM = 25;

export class TransactionCheckService {
  private blockchainClient: IBlockchainClient;

  constructor() {
    // Get blockchain client based on environment configuration
    this.blockchainClient = BlockchainClientFactory.getClient(
      env.blockchainProvider || 'auto'
    );
  }

  /**
   * Analyze a TRC-20 transaction for AML risk
   * @param txHash - Transaction hash to analyze
   * @returns Full transaction analysis result
   */
  async analyzeTransaction(txHash: string): Promise<TransactionAnalysisResult> {
    // Fetch transaction details
    let txDetails;
    try {
      txDetails = await this.blockchainClient.getTransactionDetails(txHash);
    } catch (error: any) {
      // Handle API errors from different providers
      if (error?.statusCode === 404 || error?.message?.includes('not found')) {
        throw new NotFoundError(`Transaction ${txHash} not found`);
      }
      // Re-throw other errors
      throw error;
    }

    // Handle different response formats from different providers
    const transactionData = Array.isArray(txDetails.data)
      ? txDetails.data[0]
      : txDetails.data || txDetails;

    if (!transactionData) {
      throw new NotFoundError(`Transaction ${txHash} not found`);
    }

    const transaction = transactionData;

    // Extract TRC-20 transfer data
    const transferData = await this.extractTRC20TransferData(
      transaction,
      txHash
    );

    // Analyze sender address
    const senderAnalysis = await addressCheckService.analyzeAddress(
      transferData.from
    );

    // Analyze receiver address
    const receiverAnalysis = await addressCheckService.analyzeAddress(
      transferData.to
    );

    // Check 1-hop tainting (if sender received from blacklisted address)
    const taintingCheck = await this.checkTainting(transferData.from);

    // Calculate final risk score
    const riskScore = this.calculateTransactionRiskScore(
      senderAnalysis,
      receiverAnalysis,
      taintingCheck
    );

    // Determine risk level
    const riskLevel = this.determineRiskLevel(riskScore);

    // Collect all flags
    const flags = this.collectFlags(
      senderAnalysis,
      receiverAnalysis,
      taintingCheck
    );

    // Build metadata
    const metadata: TransactionAnalysisMetadata = {
      txHash,
      transferData,
      senderAnalysis,
      receiverAnalysis,
      taintingCheck,
      timestamp: new Date(transaction.block_timestamp),
    };

    const result: TransactionAnalysisResult = {
      txHash,
      riskScore,
      riskLevel,
      flags,
      metadata,
    };

    // Save to database
    await this.saveTransactionCheck(result);

    return result;
  }

  /**
   * Extract TRC-20 transfer data from transaction details
   * Uses a hybrid approach: tries to extract from transaction details,
   * falls back to fetching TRC-20 transaction list
   */
  private async extractTRC20TransferData(
    transaction: any,
    txHash: string
  ): Promise<TRC20TransferData> {
    // Method 1: Try to extract from contract parameter
    const contracts = transaction.raw_data?.contract || [];

    for (const contract of contracts) {
      if (contract.type === 'TriggerSmartContract') {
        const parameter = contract.parameter?.value as any;
        if (parameter) {
          const ownerAddress = this.hexToBase58(parameter.owner_address);
          const contractAddress = this.hexToBase58(parameter.contract_address);
          const data = parameter.data;

          if (data && typeof data === 'string' && data.startsWith('a9059cbb')) {
            // TRC-20 Transfer method signature: a9059cbb
            // Extract to address (20 bytes = 40 hex chars, but we need to pad)
            const toAddressHex = '41' + data.slice(32, 72).padStart(40, '0');
            const toAddress = this.hexToBase58(toAddressHex);
            const amountHex = data.slice(72).padStart(64, '0');
            const amount = BigInt('0x' + amountHex).toString();

            return {
              from: ownerAddress,
              to: toAddress,
              amount,
              tokenAddress: contractAddress,
            };
          }
        }
      }
    }

    // Method 2: Try to find matching TRC-20 transaction by fetching from sender
    // This is more reliable for TRC-20 transfers
    try {
      const contracts = transaction.raw_data?.contract || [];
      let senderAddress = '';

      // Find sender address from contract
      for (const contract of contracts) {
        const parameter = contract.parameter?.value as any;
        if (parameter?.owner_address) {
          senderAddress = this.hexToBase58(parameter.owner_address);
          break;
        }
      }

      if (senderAddress) {
        // Fetch recent TRC-20 transactions for sender
        const response = await this.blockchainClient.getTRC20Transactions(
          senderAddress,
          {
            limit: 100,
            only_confirmed: true,
          }
        );

        // Find transaction matching our txHash
        const matchingTx = response.data.find(
          tx => tx.hash === txHash || (tx as any).transaction_id === txHash
        );

        if (matchingTx) {
          return {
            from: matchingTx.from,
            to: matchingTx.to,
            amount: matchingTx.amount || (matchingTx as any).value,
            tokenAddress:
              matchingTx.tokenInfo?.address ||
              (matchingTx as any).token_info?.address ||
              '',
            tokenSymbol:
              matchingTx.tokenInfo?.symbol ||
              (matchingTx as any).token_info?.symbol,
          };
        }
      }
    } catch (error: any) {
      // Handle different error types
      if (error instanceof Error && 'statusCode' in error) {
        const statusCode = (error as any).statusCode;

        // 400/404 - Invalid address or no transactions (normal case, continue to fallback)
        if (statusCode === 400 || statusCode === 404) {
          // Silently continue to fallback method
        } else {
          console.warn('Failed to fetch TRC-20 transaction list:', error);
        }
      } else {
        console.warn('Failed to fetch TRC-20 transaction list:', error);
      }
    }

    // Fallback: try to extract from internal transactions (TRX transfers, not TRC-20)
    if (
      transaction.internal_transactions &&
      transaction.internal_transactions.length > 0
    ) {
      const internalTx = transaction.internal_transactions[0];
      const fromAddress = this.hexToBase58(internalTx.caller_address);
      const toAddress = this.hexToBase58(internalTx.transferTo_address);

      return {
        from: fromAddress,
        to: toAddress,
        amount: internalTx.callValueInfo?.[0]?.callValue?.toString() || '0',
        tokenAddress: '', // Internal transactions are TRX, not TRC-20
      };
    }

    throw new Error('Could not extract TRC-20 transfer data from transaction');
  }

  /**
   * Convert hex address to base58 TRON address
   * Simplified version - in production use proper TRON library (tronweb)
   */
  private hexToBase58(hex: string): string {
    // TRON addresses in hex format start with '41'
    // This is a simplified conversion - proper implementation would use base58 encoding
    // For now, we'll work with the hex format and convert when needed
    if (!hex) return '';

    // If it's already a base58 address (starts with T), return as-is
    if (hex.startsWith('T') && hex.length === 34) {
      return hex;
    }

    // For now, return hex format - in production you'd convert to base58
    // This is a placeholder - you should use tronweb or similar library
    return hex;
  }

  /**
   * Check 1-hop tainting: if sender received from blacklisted address
   */
  private async checkTainting(address: string): Promise<TaintingCheckResult> {
    try {
      // Fetch recent incoming TRC-20 transactions for the sender
      const transactions = await this.blockchainClient.getTRC20Transactions(
        address,
        {
          limit: 50,
          only_to: true, // Only incoming transactions
          only_confirmed: true,
        }
      );

      // Check if any sender is blacklisted
      for (const tx of transactions.data || []) {
        const fromAddress = tx.from || (tx as any).from;
        if (fromAddress) {
          const isBlacklisted =
            await blacklistService.isAddressBlacklisted(fromAddress);

          if (isBlacklisted) {
            return {
              isTainted: true,
              taintedFromAddress: fromAddress,
              taintedTransactionHash: tx.hash || (tx as any).transaction_id,
            };
          }
        }
      }

      return {
        isTainted: false,
      };
    } catch (error: any) {
      // Handle different error types
      if (error instanceof Error && 'statusCode' in error) {
        const statusCode = (error as any).statusCode;

        // 400/404 - Invalid address or no transactions (normal case)
        if (statusCode === 400 || statusCode === 404) {
          // Silently return false - address has no transactions to check
          return {
            isTainted: false,
          };
        }
      }

      // Log other errors but return safe default
      console.error(`Failed to check tainting for ${address}:`, error);
      return {
        isTainted: false,
      };
    }
  }

  /**
   * Calculate final transaction risk score
   */
  private calculateTransactionRiskScore(
    senderAnalysis: any,
    receiverAnalysis: any,
    taintingCheck: TaintingCheckResult
  ): number {
    let score = 0;

    // Sender risk contributes 40% to total score
    score += senderAnalysis.riskScore * 0.4;

    // Receiver risk contributes 40% to total score
    score += receiverAnalysis.riskScore * 0.4;

    // Tainting check contributes 20% (if tainted, add high risk)
    if (taintingCheck.isTainted) {
      score += 80 * 0.2; // High risk for tainting
    }

    // Additional penalties for specific flags
    if (senderAnalysis.flags.includes('blacklisted')) {
      score = Math.max(score, 100); // Maximum risk if sender is blacklisted
    }

    if (receiverAnalysis.flags.includes('blacklisted')) {
      score = Math.max(score, 100); // Maximum risk if receiver is blacklisted
    }

    // Both addresses are new = higher risk
    if (
      senderAnalysis.flags.includes('new-address') &&
      receiverAnalysis.flags.includes('new-address')
    ) {
      score += 15;
    }

    // Cap at 100
    return Math.min(Math.round(score), 100);
  }

  /**
   * Determine risk level based on risk score
   */
  private determineRiskLevel(riskScore: number): RiskLevel {
    if (riskScore >= RISK_SCORE_CRITICAL) {
      return 'CRITICAL';
    } else if (riskScore >= RISK_SCORE_HIGH) {
      return 'HIGH';
    } else if (riskScore >= RISK_SCORE_MEDIUM) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * Collect all risk flags from analysis
   */
  private collectFlags(
    senderAnalysis: any,
    receiverAnalysis: any,
    taintingCheck: TaintingCheckResult
  ): string[] {
    const flags: string[] = [];

    // Add sender flags with prefix
    senderAnalysis.flags.forEach((flag: string) => {
      flags.push(`sender-${flag}`);
    });

    // Add receiver flags with prefix
    receiverAnalysis.flags.forEach((flag: string) => {
      flags.push(`receiver-${flag}`);
    });

    // Add tainting flag
    if (taintingCheck.isTainted) {
      flags.push('tainted-1hop');
    }

    return flags;
  }

  /**
   * Save transaction check result to database
   */
  private async saveTransactionCheck(
    result: TransactionAnalysisResult
  ): Promise<void> {
    // Check if transaction check already exists
    const existing = await prisma.transactionCheck.findFirst({
      where: { txHash: result.txHash },
    });

    if (existing) {
      await prisma.transactionCheck.update({
        where: { id: existing.id },
        data: {
          riskScore: result.riskScore,
          riskLevel: result.riskLevel as any, // Type assertion for Prisma enum
          flags: result.flags,
        },
      });
    } else {
      await prisma.transactionCheck.create({
        data: {
          txHash: result.txHash,
          riskScore: result.riskScore,
          riskLevel: result.riskLevel as any, // Type assertion for Prisma enum
          flags: result.flags,
        },
      });
    }
  }
}

// Export singleton instance
export const transactionCheckService = new TransactionCheckService();
