import { Transaction } from './address-check.transaction-analyzer';
import { KNOWN_LIQUIDITY_POOLS } from './address-check.constants';

export interface TransactionPatterns {
  uniqueCounterparties: number;
  averageTimeBetweenTx: number | null;
  hasHighFrequency: boolean;
  /** Many transactions within a short wall-clock window (velocity / layering). */
  hasHighVelocity: boolean;
  transactionTypes: string[];
  liquidityPoolInteractions: number;
  liquidityPoolAddresses: Set<string>;
  totalIncoming: number;
  totalOutgoing: number;
  avgIncoming: number;
  maxIncoming: number;
  hasFastCashOut: boolean;
  isFanIn: boolean;
  /** One source → many destinations (TRC20 heuristic). */
  isFanOut: boolean;
  /** Same sender repeatedly funds the address (possible smurfing / loops). */
  hasLoopingFunds: boolean;
  /** 0–1 concentration of repeated sender interactions. */
  repeatedInteractionScore: number;
  /** Share of swap-like contract calls among all txs. */
  swapLikeRatio: number;
}

export interface AddressInfo {
  address: string;
  balance: string;
  accountType?: string;
  trc20token_balances?: Array<unknown>;
  date_created?: number;
}

export interface ContractInfo {
  contract_address?: string;
  contract_name?: string;
  verified?: boolean;
  open_source?: boolean;
  trx_count?: number;
  contract_type?: string;
}

export interface LiquidityEvents {
  hasLiquidityEvents: boolean;
  eventCount: number;
  eventTypes: string[];
}

/**
 * Service for analyzing transaction patterns and detecting suspicious behavior
 */
export class PatternAnalyzer {
  /**
   * Extract additional insights from transaction data
   * Analyzes transaction patterns for risk assessment
   * Uses TronScan API data: contract info, events, etc.
   */
  analyzeTransactionPatterns(
    transactions: Transaction[],
    addressInfo?: AddressInfo | null,
    contractInfo?: ContractInfo | null,
    liquidityEvents?: LiquidityEvents | null,
    analyzedAddress?: string
  ): TransactionPatterns {
    console.log(`[PatternAnalyzer] Starting pattern analysis:`, {
      transactionCount: transactions.length,
      isContract: addressInfo?.accountType === 'Contract',
      hasContractInfo: !!contractInfo,
      hasLiquidityEvents: liquidityEvents?.hasLiquidityEvents,
    });

    if (transactions.length === 0) {
      return {
        uniqueCounterparties: 0,
        averageTimeBetweenTx: null,
        hasHighFrequency: false,
        hasHighVelocity: false,
        transactionTypes: [],
        liquidityPoolInteractions: 0,
        liquidityPoolAddresses: new Set<string>(),
        totalIncoming: 0,
        totalOutgoing: 0,
        avgIncoming: 0,
        maxIncoming: 0,
        hasFastCashOut: false,
        isFanIn: false,
        isFanOut: false,
        hasLoopingFunds: false,
        repeatedInteractionScore: 0,
        swapLikeRatio: 0,
      };
    }

    const subjectAddress = (
      analyzedAddress ??
      addressInfo?.address ??
      ''
    ).toLowerCase();

    // Extract unique counterparties
    const counterparties = new Set<string>();
    const transactionTypes = new Set<string>();
    const liquidityPoolAddresses = new Set<string>();

    let totalIncoming = 0;
    let totalOutgoing = 0;
    let incomingCount = 0;
    let maxIncoming = 0;
    const incomingSenders = new Set<string>();
    const incomingPerSenderCount = new Map<string, number>();
    const outgoingRecipients = new Set<string>();

    // Fast cash-out heuristic: outgoing shortly after significant incoming
    const FAST_CASHOUT_WINDOW_MS = 10 * 60 * 1000;
    const MIN_FAST_CASHOUT_INCOMING = 10;
    const FAST_CASHOUT_RATIO = 0.7;
    const sortedByTime = [...transactions].sort(
      (a, b) => (a.block_timestamp ?? 0) - (b.block_timestamp ?? 0)
    );
    let lastIncomingTs: number | null = null;
    let lastIncomingAmount = 0;
    let hasFastCashOut = false;

    transactions.forEach(tx => {
      if (tx.from) {
        counterparties.add(tx.from);
      }
      if (tx.to) {
        counterparties.add(tx.to);
      }

      // Volume features (TRC20 only: tokenInfo present)
      const isTRC20 = !!tx.tokenInfo;
      const amt = tx.amount ?? 0;
      if (subjectAddress && isTRC20 && typeof amt === 'number' && amt > 0) {
        const from = tx.from?.toLowerCase?.() ?? '';
        const to = tx.to?.toLowerCase?.() ?? '';
        if (to && to === subjectAddress) {
          totalIncoming += amt;
          incomingCount++;
          maxIncoming = Math.max(maxIncoming, amt);
          if (from) {
            incomingSenders.add(from);
            incomingPerSenderCount.set(
              from,
              (incomingPerSenderCount.get(from) ?? 0) + 1
            );
          }
        } else if (from && from === subjectAddress) {
          totalOutgoing += amt;
          if (to) outgoingRecipients.add(to);
        }
      }

      // Check if transaction interacts with known liquidity pools
      if (tx.to && KNOWN_LIQUIDITY_POOLS.has(tx.to)) {
        liquidityPoolAddresses.add(tx.to);
      }
      if (tx.from && KNOWN_LIQUIDITY_POOLS.has(tx.from)) {
        liquidityPoolAddresses.add(tx.from);
      }

      // Check in raw_data contracts (for smart contract calls)
      if (tx.raw_data?.contract) {
        tx.raw_data.contract.forEach(contract => {
          const rawContract = contract as {
            type?: string;
            parameter?: {
              value?: {
                data?: string;
                contract_address?: string;
              };
            };
          };
          transactionTypes.add(rawContract.type || 'unknown');

          // Detect swap-like patterns (TriggerSmartContract with specific methods)
          // Liquidity pools often use swap methods
          if (rawContract.type === 'TriggerSmartContract') {
            const param = rawContract.parameter?.value;
            if (param?.data) {
              const methodSignature = param.data.slice(0, 10); // First 4 bytes (8 hex chars + 0x)
              // Common swap method signatures (simplified check)
              // swapExactTokensForTokens, swapTokensForExactTokens, etc.
              if (
                methodSignature === '0x38ed1739' || // swapExactTokensForTokens
                methodSignature === '0x8803dbee' || // swapTokensForExactTokens
                methodSignature === '0x5c11d795' || // swapExactTokensForTokensSupportingFeeOnTransferTokens
                methodSignature.startsWith('0x') // Any contract call might be a swap
              ) {
                // If calling a contract, it might be a liquidity pool interaction
                if (param.contract_address) {
                  // Mark as potential liquidity pool interaction
                  // We'll count it if the contract address is in our known list
                  // or if it's a frequent pattern
                }
              }
            }
          }
        });
      }
    });

    // Fast cash-out check using time-ordered tx list (TRC20 only).
    if (subjectAddress) {
      for (const tx of sortedByTime) {
        const isTRC20 = !!tx.tokenInfo;
        const amt = tx.amount ?? 0;
        if (!isTRC20 || typeof amt !== 'number' || amt <= 0) continue;
        const from = tx.from?.toLowerCase?.() ?? '';
        const to = tx.to?.toLowerCase?.() ?? '';
        const ts = tx.block_timestamp ?? 0;
        if (to && to === subjectAddress) {
          lastIncomingTs = ts;
          lastIncomingAmount = amt;
        } else if (from && from === subjectAddress && lastIncomingTs) {
          if (
            ts - lastIncomingTs <= FAST_CASHOUT_WINDOW_MS &&
            lastIncomingAmount >= MIN_FAST_CASHOUT_INCOMING &&
            amt >= lastIncomingAmount * FAST_CASHOUT_RATIO
          ) {
            hasFastCashOut = true;
            break;
          }
        }
      }
    }

    // Fan-in heuristic: many incoming senders, relatively little outgoing
    const isFanIn =
      incomingCount >= 12 &&
      incomingSenders.size >= 6 &&
      totalIncoming >= 50 &&
      totalOutgoing > 0 &&
      totalOutgoing / totalIncoming <= 0.3 &&
      (incomingCount > 0 ? totalIncoming / incomingCount : 0) <=
        maxIncoming * 0.8;

    // They check: 1) known pool addresses, 2) swap operation patterns, 3) contract interactions
    // Count transactions that look like swap operations (TriggerSmartContract calls)
    const swapLikeTransactions = transactions.filter(tx => {
      if (tx.raw_data?.contract) {
        return tx.raw_data.contract.some(
          contract =>
            contract.type === 'TriggerSmartContract' &&
            !!(
              contract as {
                parameter?: { value?: { data?: string } };
              }
            ).parameter?.value?.data
        );
      }
      return false;
    }).length;

    const totalTransactions = transactions.length;
    const swapRatio =
      totalTransactions > 0 ? swapLikeTransactions / totalTransactions : 0;

    let maxRepeatIncoming = 0;
    for (const c of incomingPerSenderCount.values()) {
      maxRepeatIncoming = Math.max(maxRepeatIncoming, c);
    }
    const hasLoopingFunds = maxRepeatIncoming >= 3;
    const repeatedInteractionScore =
      incomingCount > 0
        ? Math.min(1, maxRepeatIncoming / Math.max(incomingCount, 1))
        : 0;

    const isFanOut =
      outgoingRecipients.size >= 4 &&
      totalOutgoing > 0 &&
      totalOutgoing > totalIncoming * 0.35;

    console.log(`[PatternAnalyzer] Swap analysis:`, {
      totalTransactions,
      swapLikeTransactions,
      swapRatio: (swapRatio * 100).toFixed(2) + '%',
    });

    // it's likely interacting with liquidity pools
    // They mark 100% if most/all transactions are with pools
    if (totalTransactions > 0) {
      // and analyzing transaction patterns (swap operations, contract calls)
      // If the address itself is a contract, it might be a liquidity pool
      const isContractAddress =
        addressInfo?.accountType === 'Contract' ||
        addressInfo?.accountType === 'ContractCreator';

      // Enhanced detection using TronScan contract info and events
      // If contract has liquidity events (Swap, AddLiquidity, etc.), it's likely a pool
      const hasConfirmedLiquidityEvents =
        liquidityEvents?.hasLiquidityEvents === true &&
        liquidityEvents.eventCount > 0;

      // If contract is verified and has high transaction count, might be a DEX/pool
      const isHighActivityContract =
        contractInfo?.verified === true &&
        contractInfo?.trx_count &&
        contractInfo.trx_count > 1000;

      // Enhanced detection: if contract has confirmed liquidity events, it's definitely a pool
      if (hasConfirmedLiquidityEvents) {
        console.log(
          `[PatternAnalyzer] Confirmed liquidity events detected, marking as pool`
        );
        // This is a confirmed liquidity pool - mark all interactions
        transactions.forEach(tx => {
          if (tx.to) liquidityPoolAddresses.add(tx.to);
          if (tx.from) liquidityPoolAddresses.add(tx.from);
        });
      }
      // If address is a contract itself, it might be a liquidity pool
      else if (isContractAddress) {
        // High activity verified contract might be a DEX/pool
        if (isHighActivityContract) {
          console.log(
            `[PatternAnalyzer] High activity contract detected, marking as pool`
          );
          transactions.forEach(tx => {
            if (tx.to) liquidityPoolAddresses.add(tx.to);
            if (tx.from) liquidityPoolAddresses.add(tx.from);
          });
        }
      }

      // If high ratio of swap-like transactions (>=50%), mark as liquidity pool interaction
      if (swapRatio >= 0.5) {
        console.log(
          `[PatternAnalyzer] High swap ratio (${(swapRatio * 100).toFixed(2)}%), marking as liquidity pool interaction`
        );
        // High liquidity pool interaction - add all contract addresses
        transactions.forEach(tx => {
          if (tx.to) {
            liquidityPoolAddresses.add(tx.to);
          }
          // Also check contract addresses in raw_data
          if (tx.raw_data?.contract) {
            tx.raw_data.contract.forEach(contract => {
              const rawContract = contract as {
                type?: string;
                parameter?: {
                  value?: {
                    contract_address?: string;
                  };
                };
              };
              if (rawContract.type === 'TriggerSmartContract') {
                const param = rawContract.parameter?.value;
                if (param?.contract_address) {
                  // Contract address is in hex, but we can still track the pattern
                  // The to/from fields should have the base58 address
                }
              }
            });
          }
        });
      } else if (swapRatio >= 0.2) {
        console.log(
          `[PatternAnalyzer] Medium swap ratio (${(swapRatio * 100).toFixed(2)}%), analyzing frequent contract addresses`
        );
        // Medium liquidity pool interaction (20-50%)
        // Add frequent contract addresses
        const contractAddressCounts = new Map<string, number>();
        transactions.forEach(tx => {
          if (tx.to) {
            const count = contractAddressCounts.get(tx.to) || 0;
            contractAddressCounts.set(tx.to, count + 1);
          }
        });
        // Add addresses that appear in multiple transactions
        contractAddressCounts.forEach((count, addr) => {
          if (count >= 2) {
            liquidityPoolAddresses.add(addr);
          }
        });
        console.log(
          `[PatternAnalyzer] Added ${contractAddressCounts.size} frequent contract addresses`
        );
      }
    }

    // Calculate average time between transactions
    const sortedTimestamps = transactions
      .map(tx => tx.block_timestamp)
      .filter(ts => ts && ts > 0)
      .sort((a, b) => a - b);

    let averageTimeBetweenTx: number | null = null;
    if (sortedTimestamps.length > 1) {
      const timeDiffs: number[] = [];
      for (let i = 1; i < sortedTimestamps.length; i++) {
        timeDiffs.push(sortedTimestamps[i] - sortedTimestamps[i - 1]);
      }
      averageTimeBetweenTx =
        timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    }

    // Check for high frequency (multiple transactions in short time)
    const hasHighFrequency =
      sortedTimestamps.length > 1 &&
      sortedTimestamps.some((ts, i) => {
        if (i === 0) return false;
        const diff = ts - sortedTimestamps[i - 1];
        return diff < 60000; // Less than 1 minute between transactions
      });

    const WINDOW_15M_MS = 15 * 60 * 1000;
    let hasHighVelocity = false;
    if (sortedTimestamps.length >= 5) {
      for (let i = 0; i < sortedTimestamps.length; i++) {
        let j = i;
        while (
          j < sortedTimestamps.length &&
          sortedTimestamps[j] - sortedTimestamps[i] <= WINDOW_15M_MS
        ) {
          j++;
        }
        if (j - i >= 5) {
          hasHighVelocity = true;
          break;
        }
      }
    }

    const result: TransactionPatterns = {
      uniqueCounterparties: counterparties.size,
      averageTimeBetweenTx,
      hasHighFrequency,
      hasHighVelocity,
      transactionTypes: Array.from(transactionTypes),
      liquidityPoolInteractions: liquidityPoolAddresses.size,
      liquidityPoolAddresses,
      totalIncoming,
      totalOutgoing,
      avgIncoming: incomingCount > 0 ? totalIncoming / incomingCount : 0,
      maxIncoming,
      hasFastCashOut,
      isFanIn,
      isFanOut,
      hasLoopingFunds,
      repeatedInteractionScore,
      swapLikeRatio: swapRatio,
    };

    console.log(`[PatternAnalyzer] Pattern analysis complete:`, {
      uniqueCounterparties: result.uniqueCounterparties,
      averageTimeBetweenTx: result.averageTimeBetweenTx,
      hasHighFrequency: result.hasHighFrequency,
      transactionTypesCount: result.transactionTypes.length,
      liquidityPoolInteractions: result.liquidityPoolInteractions,
      liquidityPoolAddressesCount: result.liquidityPoolAddresses.size,
    });

    return result;
  }
}
