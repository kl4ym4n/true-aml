import { blacklistService } from '../blacklist';
import { BlockchainClientFactory } from '../../lib/clients';
import { IBlockchainClient } from '../../lib/blockchain-client.interface';
import { env } from '../../config/env';
import prisma from '../../config/database';
import {
  AddressAnalysisResult,
  AddressAnalysisMetadata,
  RiskFlag,
  SourceBreakdown,
} from './address-check.types';
import {
  SEVERITY_BLACKLISTED,
  RISK_SCORE_BLACKLISTED,
  INDIRECT_RISK_WEIGHT,
} from './address-check.constants';
import { TransactionAnalyzer } from './address-check.transaction-analyzer';
import {
  PatternAnalyzer,
  AddressInfo,
  ContractInfo,
  LiquidityEvents,
} from './address-check.pattern-analyzer';
import {
  RiskCalculator,
  AddressSecurity,
} from './address-check.risk-calculator';

export class AddressCheckService {
  private blockchainClient: IBlockchainClient;
  private transactionAnalyzer: TransactionAnalyzer;
  private patternAnalyzer: PatternAnalyzer;
  private riskCalculator: RiskCalculator;

  constructor() {
    // Get blockchain client based on environment configuration
    this.blockchainClient = BlockchainClientFactory.getClient(
      env.blockchainProvider || 'auto'
    );
    this.transactionAnalyzer = new TransactionAnalyzer(this.blockchainClient);
    this.patternAnalyzer = new PatternAnalyzer();
    this.riskCalculator = new RiskCalculator();
  }

  /**
   * Analyze a TRON address for AML risk with multi-hop transaction graph analysis
   * @param address - TRON address to analyze
   * @returns Analysis result with risk score, flags, and metadata
   */
  async analyzeAddress(address: string): Promise<AddressAnalysisResult> {
    console.log(`[AddressCheck] Starting analysis for address: ${address}`);
    const startTime = Date.now();

    // Check security first - if blacklisted, return immediately with HIGH risk
    console.log(`[AddressCheck] Checking blacklist for: ${address}`);
    const blacklistEntry = await blacklistService.getBlacklistEntry(address);
    const isBlacklisted = blacklistEntry !== null;
    console.log(`[AddressCheck] Blacklist check result:`, {
      isBlacklisted,
      category: blacklistEntry?.category,
      riskScore: blacklistEntry?.riskScore,
    });

    let addressSecurity = null;
    try {
      console.log(
        `[AddressCheck] Requesting security check from blockchain client: ${address}`
      );
      addressSecurity =
        await this.blockchainClient.checkAddressSecurity(address);
      console.log(`[AddressCheck] Security check result:`, {
        riskScore: addressSecurity?.riskScore,
        riskLevel: addressSecurity?.riskLevel,
        isScam: addressSecurity?.isScam,
        isPhishing: addressSecurity?.isPhishing,
        isMalicious: addressSecurity?.isMalicious,
        isBlacklisted: addressSecurity?.isBlacklisted,
        tags: addressSecurity?.tags,
      });
    } catch (error) {
      console.warn(
        `[AddressCheck] Security check failed for ${address}:`,
        error
      );
      // Continue analysis even if security check fails
    }

    const isSecurityBlacklisted =
      isBlacklisted || addressSecurity?.isBlacklisted || false;

    // If blacklisted, return immediately with HIGH risk
    if (isSecurityBlacklisted) {
      const flags: RiskFlag[] = ['blacklisted'];
      if (addressSecurity?.isScam) flags.push('scam');
      if (addressSecurity?.isPhishing) flags.push('phishing');
      if (addressSecurity?.isMalicious) flags.push('malicious');

      const riskScore =
        Math.round(
          Math.max(
            SEVERITY_BLACKLISTED,
            blacklistEntry?.riskScore ?? RISK_SCORE_BLACKLISTED
          ) * 100
        ) / 100;

      console.log(`[AddressCheck] Address is blacklisted, returning early:`, {
        address,
        riskScore,
        flags,
        duration: Date.now() - startTime,
      });

      return {
        riskScore,
        flags,
        metadata: {
          address,
          isBlacklisted: true,
          blacklistCategory: blacklistEntry?.category,
          blacklistRiskScore: blacklistEntry?.riskScore,
          transactionCount: 0,
          firstSeenAt: null,
          addressAgeDays: null,
          lastCheckedAt: new Date(),
          liquidityPoolInteractions: undefined,
          addressSecurity: addressSecurity
            ? {
                riskScore: addressSecurity.riskScore,
                riskLevel: addressSecurity.riskLevel,
                isScam: addressSecurity.isScam,
                isPhishing: addressSecurity.isPhishing,
                isMalicious: addressSecurity.isMalicious,
                tags: addressSecurity.tags,
              }
            : undefined,
        },
      };
    }

    // If not blacklisted, proceed with full analysis
    // Pass already fetched security data to avoid duplicate API calls
    console.log(
      `[AddressCheck] Address not blacklisted, proceeding with full multi-hop analysis`
    );
    const result = await this.analyzeAddressWithHops(
      address,
      0,
      new Set<string>(),
      {
        addressSecurity, // Pass already fetched security data
        blacklistEntry, // Pass already fetched blacklist entry
      }
    );
    console.log(`[AddressCheck] Analysis completed:`, {
      address,
      riskScore: result.riskScore,
      flags: result.flags,
      duration: Date.now() - startTime,
    });
    return result;
  }

  /**
   * Analyze address with multi-hop transaction graph traversal
   * @param address - Address to analyze
   * @param hopLevel - Current hop level (0 = direct, 1 = 2nd hop, 2 = 3rd hop)
   * @param visitedAddresses - Set of already visited addresses to avoid cycles
   * @param cachedData - Optional cached data to avoid duplicate API calls (for hopLevel 0)
   * @returns Analysis result
   */
  private async analyzeAddressWithHops(
    address: string,
    hopLevel: number,
    visitedAddresses: Set<string>,
    cachedData?: {
      addressSecurity?: any;
      blacklistEntry?: any;
    }
  ): Promise<AddressAnalysisResult> {
    console.log(
      `[AddressCheck] Analyzing address at hop level ${hopLevel}: ${address}`
    );

    // Prevent cycles and limit depth
    if (hopLevel > 2 || visitedAddresses.has(address)) {
      console.log(
        `[AddressCheck] Skipping address (max hops reached or already visited): ${address}`
      );
      return {
        riskScore: 0,
        flags: [],
        metadata: {
          address,
          isBlacklisted: false,
          transactionCount: 0,
          firstSeenAt: null,
          addressAgeDays: null,
          lastCheckedAt: new Date(),
        },
      };
    }

    visitedAddresses.add(address);

    // Check blacklist and security for this address
    // Use cached data for hopLevel 0 to avoid duplicate API calls
    let blacklistEntry;
    let addressSecurity;
    let isBlacklisted;

    if (hopLevel === 0 && cachedData) {
      // Use cached data from initial check
      console.log(
        `[AddressCheck] [Hop ${hopLevel}] Using cached blacklist and security data for: ${address}`
      );
      blacklistEntry = cachedData.blacklistEntry;
      addressSecurity = cachedData.addressSecurity;
      isBlacklisted = blacklistEntry !== null;
    } else {
      // Fetch fresh data for subsequent hops
      console.log(
        `[AddressCheck] [Hop ${hopLevel}] Checking blacklist for: ${address}`
      );
      blacklistEntry = await blacklistService.getBlacklistEntry(address);
      isBlacklisted = blacklistEntry !== null;
      console.log(`[AddressCheck] [Hop ${hopLevel}] Blacklist result:`, {
        isBlacklisted,
        category: blacklistEntry?.category,
      });

      try {
        console.log(
          `[AddressCheck] [Hop ${hopLevel}] Requesting security check: ${address}`
        );
        addressSecurity =
          await this.blockchainClient.checkAddressSecurity(address);
        console.log(`[AddressCheck] [Hop ${hopLevel}] Security check result:`, {
          riskScore: addressSecurity?.riskScore,
          riskLevel: addressSecurity?.riskLevel,
          isScam: addressSecurity?.isScam,
          isPhishing: addressSecurity?.isPhishing,
          isMalicious: addressSecurity?.isMalicious,
        });
      } catch (error) {
        console.warn(
          `[AddressCheck] [Hop ${hopLevel}] Security check failed:`,
          error
        );
        // Continue analysis even if security check fails
        addressSecurity = null;
      }
    }

    // Get address info to check if it's a contract (liquidity pool indicator)
    let addressInfo: AddressInfo | null = null;
    let contractInfo: ContractInfo | null = null;
    let liquidityEvents: LiquidityEvents | null = null;
    try {
      console.log(
        `[AddressCheck] [Hop ${hopLevel}] Requesting address info: ${address}`
      );
      const addressInfoResponse =
        await this.blockchainClient.getAddressInfo(address);
      addressInfo = addressInfoResponse as AddressInfo;
      console.log(`[AddressCheck] [Hop ${hopLevel}] Address info received:`, {
        accountType: addressInfo?.accountType,
        balance: addressInfo?.balance,
        date_created: addressInfo?.date_created,
        trc20token_balances_count:
          addressInfo?.trc20token_balances?.length || 0,
      });

      // If address is a contract, get additional contract information
      if (
        addressInfo?.accountType === 'Contract' ||
        addressInfo?.accountType === 'ContractCreator'
      ) {
        console.log(
          `[AddressCheck] [Hop ${hopLevel}] Address is a contract, fetching contract details`
        );
        try {
          // Check if blockchain client supports contract info (TronScan adapter)
          if (
            'getContractInfo' in this.blockchainClient &&
            typeof this.blockchainClient.getContractInfo === 'function'
          ) {
            console.log(
              `[AddressCheck] [Hop ${hopLevel}] Requesting contract info: ${address}`
            );
            contractInfo = (await (
              this.blockchainClient as any
            ).getContractInfo(address)) as ContractInfo;
            console.log(
              `[AddressCheck] [Hop ${hopLevel}] Contract info received:`,
              {
                contract_name: contractInfo?.contract_name,
                verified: contractInfo?.verified,
                open_source: contractInfo?.open_source,
                trx_count: contractInfo?.trx_count,
                contract_type: contractInfo?.contract_type,
              }
            );
          }

          // Check for liquidity pool events
          if (
            'hasLiquidityPoolEvents' in this.blockchainClient &&
            typeof this.blockchainClient.hasLiquidityPoolEvents === 'function'
          ) {
            console.log(
              `[AddressCheck] [Hop ${hopLevel}] Checking for liquidity pool events: ${address}`
            );
            liquidityEvents = (await (
              this.blockchainClient as any
            ).hasLiquidityPoolEvents(address, 50)) as LiquidityEvents;
            console.log(
              `[AddressCheck] [Hop ${hopLevel}] Liquidity events result:`,
              {
                hasLiquidityEvents: liquidityEvents?.hasLiquidityEvents,
                eventCount: liquidityEvents?.eventCount,
                eventTypes: liquidityEvents?.eventTypes,
              }
            );
          }
        } catch (error) {
          console.warn(
            `[AddressCheck] [Hop ${hopLevel}] Contract info fetch failed:`,
            error
          );
          // Continue if contract info fetch fails
        }
      }
    } catch (error) {
      console.warn(
        `[AddressCheck] [Hop ${hopLevel}] Address info fetch failed:`,
        error
      );
      // Continue if address info fetch fails
    }

    // Fetch transactions
    console.log(
      `[AddressCheck] [Hop ${hopLevel}] Fetching transactions for: ${address}`
    );
    const transactions =
      await this.transactionAnalyzer.fetchAddressTransactions(address);
    console.log(
      `[AddressCheck] [Hop ${hopLevel}] Transactions: ${transactions}`
    );

    const transactionCount = transactions.length;
    console.log(`[AddressCheck] [Hop ${hopLevel}] Transactions fetched:`, {
      count: transactionCount,
    });

    // Calculate address age from first transaction
    const firstSeenAt =
      this.transactionAnalyzer.calculateFirstSeenAt(transactions);
    const addressAgeDays = firstSeenAt
      ? this.transactionAnalyzer.calculateAgeInDays(firstSeenAt)
      : null;
    console.log(`[AddressCheck] [Hop ${hopLevel}] Address age calculated:`, {
      firstSeenAt: firstSeenAt?.toISOString(),
      addressAgeDays,
    });

    // Analyze transaction patterns (including liquidity pool detection)
    console.log(
      `[AddressCheck] [Hop ${hopLevel}] Analyzing transaction patterns`
    );
    const patterns = this.patternAnalyzer.analyzeTransactionPatterns(
      transactions,
      addressInfo,
      contractInfo,
      liquidityEvents
    );
    console.log(`[AddressCheck] [Hop ${hopLevel}] Pattern analysis result:`, {
      uniqueCounterparties: patterns.uniqueCounterparties,
      hasHighFrequency: patterns.hasHighFrequency,
      transactionTypes: patterns.transactionTypes,
      liquidityPoolInteractions: patterns.liquidityPoolInteractions,
      liquidityPoolAddressesCount: patterns.liquidityPoolAddresses.size,
    });

    // Determine risk flags
    console.log(`[AddressCheck] [Hop ${hopLevel}] Determining risk flags`);
    const flags = this.riskCalculator.determineRiskFlags(
      isBlacklisted || addressSecurity?.isBlacklisted || false,
      addressAgeDays,
      transactionCount,
      patterns,
      addressSecurity as AddressSecurity | null
    );
    console.log(`[AddressCheck] [Hop ${hopLevel}] Risk flags determined:`, {
      flags,
    });

    // Calculate base risk score for this address
    console.log(`[AddressCheck] [Hop ${hopLevel}] Calculating base risk score`);
    const baseRiskScore = this.riskCalculator.calculateRiskScore(
      isBlacklisted || addressSecurity?.isBlacklisted || false,
      blacklistEntry?.riskScore,
      addressAgeDays,
      transactionCount,
      flags,
      patterns,
      addressSecurity as AddressSecurity | null
    );
    console.log(
      `[AddressCheck] [Hop ${hopLevel}] Base risk score calculated:`,
      { baseRiskScore }
    );

    // For direct address (hopLevel 0), check counterparties if score is low
    // Logic: We've already analyzed the original address (patterns, flags, base score)
    // If base score is low, we check unique counterparties to see if they have high risk
    let finalRiskScore = baseRiskScore;
    const flagsFromOtherHops: RiskFlag[] = []; // collect flags from 2nd/3rd hop for main address result
    const hopEntityFlags: RiskFlag[][] = [flags]; // per-entity flags for source breakdown (direct + 2nd + 3rd hop)

    if (hopLevel === 0) {
      if (baseRiskScore < 60) {
        console.log(
          `[AddressCheck] Base score is low (${baseRiskScore}), checking counterparties for multi-hop analysis`
        );
        // Extract unique counterparties from the original address transactions
        const counterparties =
          this.transactionAnalyzer.extractUniqueCounterparties(
            transactions,
            address
          );
        console.log(
          `[AddressCheck] Found ${counterparties.size} unique counterparties from original address transactions`
        );

        if (counterparties.size === 0) {
          console.log(
            `[AddressCheck] No counterparties found, skipping multi-hop analysis`
          );
        } else {
          // Check 2nd hop (counterparties of the original address)
          let secondHopScore = 0;
          let checkedCounterparties = 0;
          const maxCounterpartiesToCheck = 10; // Limit to avoid too many API calls

          console.log(
            `[AddressCheck] Starting 2nd hop analysis (checking up to ${maxCounterpartiesToCheck} counterparties)`
          );
          for (const counterparty of Array.from(counterparties).slice(
            0,
            maxCounterpartiesToCheck
          )) {
            // Skip if already visited (shouldn't happen for 2nd hop, but safety check)
            if (visitedAddresses.has(counterparty)) {
              console.log(
                `[AddressCheck] Skipping already visited 2nd hop counterparty: ${counterparty}`
              );
              continue;
            }

            console.log(
              `[AddressCheck] Analyzing 2nd hop counterparty: ${counterparty}`
            );
            const counterpartyResult = await this.analyzeAddressWithHops(
              counterparty,
              1,
              new Set(visitedAddresses)
            );
            secondHopScore += counterpartyResult.riskScore;
            checkedCounterparties++;
            flagsFromOtherHops.push(...counterpartyResult.flags);
            hopEntityFlags.push(counterpartyResult.flags);
            console.log(`[AddressCheck] 2nd hop result for ${counterparty}:`, {
              riskScore: counterpartyResult.riskScore,
              flags: counterpartyResult.flags,
            });
          }

          // Average score from 2nd hop and apply indirect risk weight
          if (checkedCounterparties > 0) {
            const avgSecondHopScore = secondHopScore / checkedCounterparties;
            const secondHopContribution =
              avgSecondHopScore * INDIRECT_RISK_WEIGHT;
            finalRiskScore += secondHopContribution;

            console.log(`[AddressCheck] 2nd hop analysis complete:`, {
              checkedCounterparties,
              avgSecondHopScore: avgSecondHopScore.toFixed(2),
              contribution: secondHopContribution.toFixed(2),
              baseScore: baseRiskScore.toFixed(2),
              newScore: finalRiskScore.toFixed(2),
            });
          }

          // If still low after 2nd hop, check 3rd hop
          if (finalRiskScore < 60 && checkedCounterparties > 0) {
            console.log(
              `[AddressCheck] Score still low after 2nd hop (${finalRiskScore.toFixed(2)}), checking 3rd hop`
            );
            let thirdHopScore = 0;
            let checkedThirdHop = 0;

            // Check 3rd hop for a subset of 2nd hop counterparties
            for (const counterparty of Array.from(counterparties).slice(
              0,
              Math.min(5, maxCounterpartiesToCheck)
            )) {
              // Skip if already visited
              if (visitedAddresses.has(counterparty)) {
                continue;
              }

              console.log(
                `[AddressCheck] Fetching transactions for 3rd hop analysis: ${counterparty}`
              );
              const counterpartyTx =
                await this.transactionAnalyzer.fetchAddressTransactions(
                  counterparty
                );
              const thirdHopCounterparties =
                this.transactionAnalyzer.extractUniqueCounterparties(
                  counterpartyTx,
                  counterparty
                );
              console.log(
                `[AddressCheck] Found ${thirdHopCounterparties.size} 3rd hop counterparties for ${counterparty}`
              );

              // Check up to 3 counterparties from each 2nd hop address
              for (const thirdHopAddr of Array.from(
                thirdHopCounterparties
              ).slice(0, 3)) {
                // Skip if already visited
                if (visitedAddresses.has(thirdHopAddr)) {
                  console.log(
                    `[AddressCheck] Skipping already visited 3rd hop counterparty: ${thirdHopAddr}`
                  );
                  continue;
                }

                console.log(
                  `[AddressCheck] Analyzing 3rd hop counterparty: ${thirdHopAddr}`
                );
                const thirdHopResult = await this.analyzeAddressWithHops(
                  thirdHopAddr,
                  2,
                  new Set(visitedAddresses)
                );
                thirdHopScore += thirdHopResult.riskScore;
                checkedThirdHop++;
                flagsFromOtherHops.push(...thirdHopResult.flags);
                hopEntityFlags.push(thirdHopResult.flags);
                console.log(
                  `[AddressCheck] 3rd hop result for ${thirdHopAddr}:`,
                  {
                    riskScore: thirdHopResult.riskScore,
                    flags: thirdHopResult.flags,
                  }
                );
              }
            }

            // Average score from 3rd hop and apply indirect risk weight (reduced)
            if (checkedThirdHop > 0) {
              const avgThirdHopScore = thirdHopScore / checkedThirdHop;
              const thirdHopContribution =
                avgThirdHopScore * INDIRECT_RISK_WEIGHT * 0.5; // Reduced weight for 3rd hop
              finalRiskScore += thirdHopContribution;
              console.log(`[AddressCheck] 3rd hop analysis complete:`, {
                checkedThirdHop,
                avgThirdHopScore: avgThirdHopScore.toFixed(2),
                contribution: thirdHopContribution.toFixed(2),
                scoreAfter2ndHop: (
                  finalRiskScore - thirdHopContribution
                ).toFixed(2),
                newScore: finalRiskScore.toFixed(2),
              });
            }
          }
        }
      } else {
        console.log(
          `[AddressCheck] Base score is high (${baseRiskScore}), skipping multi-hop analysis`
        );
      }
    }

    // Cap at 100 and round to hundredths
    finalRiskScore = Math.round(Math.min(finalRiskScore, 100) * 100) / 100;
    console.log(`[AddressCheck] [Hop ${hopLevel}] Final risk score (capped):`, {
      finalRiskScore,
    });

    // Update or create address profile (only for direct address)
    if (hopLevel === 0) {
      console.log(`[AddressCheck] Updating address profile in database`);
      await this.updateAddressProfile(address, firstSeenAt, transactionCount);
    }

    // Build metadata
    const liquidityPoolInfo =
      patterns && patterns.liquidityPoolInteractions > 0
        ? {
            count: patterns.liquidityPoolInteractions,
            percentage:
              transactionCount > 0
                ? (patterns.liquidityPoolInteractions / transactionCount) * 100
                : 0,
            addresses: Array.from(patterns.liquidityPoolAddresses),
          }
        : undefined;

    const sourceBreakdown =
      hopLevel === 0 ? this.computeSourceBreakdown(hopEntityFlags) : undefined;

    const metadata: AddressAnalysisMetadata = {
      address,
      isBlacklisted: isBlacklisted || addressSecurity?.isBlacklisted || false,
      blacklistCategory: blacklistEntry?.category,
      blacklistRiskScore: blacklistEntry?.riskScore,
      transactionCount,
      firstSeenAt,
      addressAgeDays,
      lastCheckedAt: new Date(),
      liquidityPoolInteractions: liquidityPoolInfo,
      addressSecurity: addressSecurity
        ? {
            riskScore: addressSecurity.riskScore,
            riskLevel: addressSecurity.riskLevel,
            isScam: addressSecurity.isScam,
            isPhishing: addressSecurity.isPhishing,
            isMalicious: addressSecurity.isMalicious,
            tags: addressSecurity.tags,
          }
        : undefined,
      ...(sourceBreakdown && { sourceBreakdown }),
    };

    const finalFlags =
      flagsFromOtherHops.length > 0
        ? ([...new Set([...flags, ...flagsFromOtherHops])] as RiskFlag[])
        : flags;

    return {
      riskScore: finalRiskScore,
      flags: finalFlags,
      metadata,
    };
  }

  /**
   * Compute source breakdown (trusted / suspicious / dangerous) from per-entity flags.
   * Each entity (direct address or counterparty) is classified into worst category and one sub-label; percentages are share of entities.
   */
  private computeSourceBreakdown(
    entityFlagsList: RiskFlag[][]
  ): SourceBreakdown {
    const dangerous: Record<string, number> = {
      Blacklisted: 0,
      Scam: 0,
      Phishing: 0,
      Malicious: 0,
    };
    const suspicious: Record<string, number> = {
      'Liquidity Pools': 0,
      'New Address': 0,
      'High Frequency': 0,
      'Limited Counterparties': 0,
    };
    const trusted: Record<string, number> = {
      Other: 0,
    };

    for (const flags of entityFlagsList) {
      const set = new Set(flags);
      if (set.has('blacklisted')) {
        dangerous.Blacklisted++;
        continue;
      }
      if (set.has('scam')) {
        dangerous.Scam++;
        continue;
      }
      if (set.has('phishing')) {
        dangerous.Phishing++;
        continue;
      }
      if (set.has('malicious')) {
        dangerous.Malicious++;
        continue;
      }
      if (set.has('liquidity-pool')) {
        suspicious['Liquidity Pools']++;
        continue;
      }
      if (set.has('new-address')) {
        suspicious['New Address']++;
        continue;
      }
      if (set.has('high-frequency')) {
        suspicious['High Frequency']++;
        continue;
      }
      if (set.has('limited-counterparties')) {
        suspicious['Limited Counterparties']++;
        continue;
      }
      trusted.Other++;
    }

    const total = entityFlagsList.length;
    const pct = (count: number) =>
      total === 0 ? 0 : Math.round((count / total) * 10000) / 100;

    return {
      trusted: Object.fromEntries(
        Object.entries(trusted).map(([k, v]) => [k, pct(v)])
      ),
      suspicious: Object.fromEntries(
        Object.entries(suspicious).map(([k, v]) => [k, pct(v)])
      ),
      dangerous: Object.fromEntries(
        Object.entries(dangerous).map(([k, v]) => [k, pct(v)])
      ),
    };
  }

  /**
   * Update or create address profile in database
   */
  private async updateAddressProfile(
    address: string,
    firstSeenAt: Date | null,
    txCount: number
  ): Promise<void> {
    const now = new Date();

    // Get existing profile to check if we need to update firstSeenAt
    const existing = await prisma.addressProfile.findUnique({
      where: { address },
    });

    const updateData: {
      txCount: number;
      lastCheckedAt: Date;
      firstSeenAt?: Date;
    } = {
      txCount,
      lastCheckedAt: now,
    };

    // Only update firstSeenAt if:
    // 1. We found a firstSeenAt from transactions
    // 2. Either no existing profile, or new firstSeenAt is earlier
    if (firstSeenAt) {
      if (!existing || firstSeenAt < existing.firstSeenAt) {
        updateData.firstSeenAt = firstSeenAt;
      }
    }

    await prisma.addressProfile.upsert({
      where: { address },
      update: updateData,
      create: {
        address,
        firstSeenAt: firstSeenAt || now, // Use current time if no transactions found
        txCount,
        lastCheckedAt: now,
      },
    });
  }
}

// Export singleton instance
export const addressCheckService = new AddressCheckService();
