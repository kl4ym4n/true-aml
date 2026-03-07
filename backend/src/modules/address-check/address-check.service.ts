import { blacklistService } from '../blacklist';
import { BlockchainClientFactory } from '../../lib/clients';
import { IBlockchainClient } from '../../lib/blockchain-client.interface';
import { env } from '../../config/env';
import prisma from '../../config/database';
import type { AddressAnalysisResult, RiskFlag } from './address-check.types';
import { INDIRECT_RISK_WEIGHT } from './address-check.constants';
import { TransactionAnalyzer } from './address-check.transaction-analyzer';
import type { Transaction } from './address-check.transaction-analyzer';
import { PatternAnalyzer } from './address-check.pattern-analyzer';
import {
  RiskCalculator,
  AddressSecurity,
} from './address-check.risk-calculator';
import {
  buildBlacklistResult,
  fetchAddressContext,
  buildLiquidityPoolInfo,
  computeSourceBreakdown,
  buildAnalysisMetadata,
  updateAddressProfile,
  createSkipResult,
} from './address-check.utils';

const MAX_HOP_LEVEL = 2;
const MAX_COUNTERPARTIES_2ND_HOP = 10;
const MAX_COUNTERPARTIES_3RD_HOP = 5;
const MAX_THIRD_HOP_PER_COUNTERPARTY = 3;
const LOW_SCORE_THRESHOLD = 60;

export class AddressCheckService {
  private blockchainClient: IBlockchainClient;
  private transactionAnalyzer: TransactionAnalyzer;
  private patternAnalyzer: PatternAnalyzer;
  private riskCalculator: RiskCalculator;

  constructor() {
    this.blockchainClient = BlockchainClientFactory.getClient(
      env.blockchainProvider || 'auto'
    );
    this.transactionAnalyzer = new TransactionAnalyzer(this.blockchainClient);
    this.patternAnalyzer = new PatternAnalyzer();
    this.riskCalculator = new RiskCalculator();
  }

  async analyzeAddress(address: string): Promise<AddressAnalysisResult> {
    console.log(`[AddressCheck] Starting analysis for address: ${address}`);
    const startTime = Date.now();

    const blacklistEntry = await blacklistService.getBlacklistEntry(address);
    const isBlacklisted = blacklistEntry !== null;

    let addressSecurity = null;
    try {
      addressSecurity =
        await this.blockchainClient.checkAddressSecurity(address);
    } catch (error) {
      console.warn(
        `[AddressCheck] Security check failed for ${address}:`,
        error
      );
    }

    const isSecurityBlacklisted =
      isBlacklisted || addressSecurity?.isBlacklisted || false;

    if (isSecurityBlacklisted) {
      const result = buildBlacklistResult({
        address,
        blacklistEntry,
        addressSecurity,
      });
      console.log(`[AddressCheck] Address is blacklisted, returning early`);
      return result;
    }

    const result = await this.analyzeAddressWithHops(
      address,
      0,
      new Set<string>(),
      { addressSecurity, blacklistEntry }
    );
    console.log(`[AddressCheck] Analysis completed:`, {
      address,
      riskScore: result.riskScore,
      duration: Date.now() - startTime,
    });
    return result;
  }

  private async analyzeAddressWithHops(
    address: string,
    hopLevel: number,
    visitedAddresses: Set<string>,
    cachedData?: { addressSecurity?: any; blacklistEntry?: any }
  ): Promise<AddressAnalysisResult> {
    console.log(
      `[AddressCheck] Analyzing address at hop level ${hopLevel}: ${address}`
    );

    if (hopLevel > MAX_HOP_LEVEL || visitedAddresses.has(address)) {
      return createSkipResult(address) as AddressAnalysisResult;
    }

    visitedAddresses.add(address);

    const { blacklistEntry, addressSecurity, isBlacklisted } =
      await this.resolveSecurityAndBlacklist(address, hopLevel, cachedData);

    const { addressInfo, contractInfo, liquidityEvents } =
      await fetchAddressContext(this.blockchainClient, address);

    const transactions =
      await this.transactionAnalyzer.fetchAddressTransactions(address);
    const transactionCount = transactions.length;

    const firstSeenAt =
      this.transactionAnalyzer.calculateFirstSeenAt(transactions);
    const addressAgeDays = firstSeenAt
      ? this.transactionAnalyzer.calculateAgeInDays(firstSeenAt)
      : null;

    const patterns = this.patternAnalyzer.analyzeTransactionPatterns(
      transactions,
      addressInfo,
      contractInfo,
      liquidityEvents
    );

    const flags = this.riskCalculator.determineRiskFlags(
      isBlacklisted || addressSecurity?.isBlacklisted || false,
      addressAgeDays,
      transactionCount,
      patterns,
      addressSecurity as AddressSecurity | null
    );

    const baseRiskScore = this.riskCalculator.calculateRiskScore(
      isBlacklisted || addressSecurity?.isBlacklisted || false,
      blacklistEntry?.riskScore,
      addressAgeDays,
      transactionCount,
      flags,
      patterns,
      addressSecurity as AddressSecurity | null
    );

    const { finalRiskScore, flagsFromOtherHops, hopEntityFlags } =
      await this.runMultiHopIfNeeded(
        address,
        hopLevel,
        baseRiskScore,
        transactions,
        visitedAddresses,
        flags
      );

    const cappedScore = Math.round(Math.min(finalRiskScore, 100) * 100) / 100;

    if (hopLevel === 0) {
      await updateAddressProfile(
        prisma,
        address,
        firstSeenAt,
        transactionCount
      );
    }

    const liquidityPoolInfo = buildLiquidityPoolInfo(
      patterns,
      transactionCount
    );
    const sourceBreakdown =
      hopLevel === 0 ? computeSourceBreakdown(hopEntityFlags) : undefined;

    const metadata = buildAnalysisMetadata({
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
      sourceBreakdown,
    });

    const finalFlags =
      flagsFromOtherHops.length > 0
        ? ([...new Set([...flags, ...flagsFromOtherHops])] as RiskFlag[])
        : flags;

    return {
      riskScore: cappedScore,
      flags: finalFlags,
      metadata,
    };
  }

  private async resolveSecurityAndBlacklist(
    address: string,
    hopLevel: number,
    cachedData?: { addressSecurity?: any; blacklistEntry?: any }
  ): Promise<{
    blacklistEntry: any;
    addressSecurity: any;
    isBlacklisted: boolean;
  }> {
    if (hopLevel === 0 && cachedData) {
      return {
        blacklistEntry: cachedData.blacklistEntry,
        addressSecurity: cachedData.addressSecurity,
        isBlacklisted: cachedData.blacklistEntry !== null,
      };
    }

    const blacklistEntry = await blacklistService.getBlacklistEntry(address);
    let addressSecurity = null;
    try {
      addressSecurity =
        await this.blockchainClient.checkAddressSecurity(address);
    } catch {
      // continue
    }
    return {
      blacklistEntry,
      addressSecurity,
      isBlacklisted: blacklistEntry !== null,
    };
  }

  private async runMultiHopIfNeeded(
    address: string,
    hopLevel: number,
    baseRiskScore: number,
    transactions: Transaction[],
    visitedAddresses: Set<string>,
    flags: RiskFlag[]
  ): Promise<{
    finalRiskScore: number;
    flagsFromOtherHops: RiskFlag[];
    hopEntityFlags: RiskFlag[][];
  }> {
    let finalRiskScore = baseRiskScore;
    const flagsFromOtherHops: RiskFlag[] = [];
    const hopEntityFlags: RiskFlag[][] = [flags];

    if (hopLevel !== 0) {
      return { finalRiskScore, flagsFromOtherHops, hopEntityFlags };
    }

    if (baseRiskScore >= LOW_SCORE_THRESHOLD) {
      return { finalRiskScore, flagsFromOtherHops, hopEntityFlags };
    }

    const counterparties = this.transactionAnalyzer.extractUniqueCounterparties(
      transactions,
      address
    );
    if (counterparties.size === 0) {
      return { finalRiskScore, flagsFromOtherHops, hopEntityFlags };
    }

    const secondHopAddresses = Array.from(counterparties).slice(
      0,
      MAX_COUNTERPARTIES_2ND_HOP
    );
    const secondHopResult = await this.runHop(
      secondHopAddresses,
      1,
      visitedAddresses,
      INDIRECT_RISK_WEIGHT
    );
    finalRiskScore += secondHopResult.contribution;
    flagsFromOtherHops.push(...secondHopResult.newFlags);
    hopEntityFlags.push(...secondHopResult.newHopFlags);

    if (
      finalRiskScore < LOW_SCORE_THRESHOLD &&
      secondHopResult.checkedCount > 0
    ) {
      const thirdHopAddresses = await this.gatherThirdHopAddresses(
        Array.from(counterparties).slice(
          0,
          Math.min(MAX_COUNTERPARTIES_3RD_HOP, MAX_COUNTERPARTIES_2ND_HOP)
        ),
        visitedAddresses
      );
      const thirdHopResult = await this.runHop(
        thirdHopAddresses,
        2,
        visitedAddresses,
        INDIRECT_RISK_WEIGHT * 0.5
      );
      finalRiskScore += thirdHopResult.contribution;
      flagsFromOtherHops.push(...thirdHopResult.newFlags);
      hopEntityFlags.push(...thirdHopResult.newHopFlags);
    }

    return {
      finalRiskScore,
      flagsFromOtherHops,
      hopEntityFlags,
    };
  }

  /**
   * Run risk analysis for a list of addresses at given hop level.
   * Returns contribution to add to base score, and collected flags for source breakdown.
   */
  private async runHop(
    addresses: string[],
    hopLevel: number,
    visitedAddresses: Set<string>,
    weightMultiplier: number
  ): Promise<{
    contribution: number;
    checkedCount: number;
    newFlags: RiskFlag[];
    newHopFlags: RiskFlag[][];
  }> {
    let totalScore = 0;
    let checkedCount = 0;
    const newFlags: RiskFlag[] = [];
    const newHopFlags: RiskFlag[][] = [];

    for (const addr of addresses) {
      if (visitedAddresses.has(addr)) continue;

      const result = await this.analyzeAddressWithHops(
        addr,
        hopLevel,
        new Set(visitedAddresses)
      );
      totalScore += result.riskScore;
      checkedCount++;
      newFlags.push(...result.flags);
      newHopFlags.push(result.flags);
    }

    const avgScore = checkedCount > 0 ? totalScore / checkedCount : 0;
    const contribution = avgScore * weightMultiplier;

    return {
      contribution,
      checkedCount,
      newFlags,
      newHopFlags,
    };
  }

  /** Build list of 3rd-hop addresses from 2nd-hop counterparties (their transaction counterparties). */
  private async gatherThirdHopAddresses(
    secondHopCounterparties: string[],
    visitedAddresses: Set<string>
  ): Promise<string[]> {
    const thirdHop: string[] = [];
    for (const counterparty of secondHopCounterparties) {
      if (visitedAddresses.has(counterparty)) continue;
      const tx =
        await this.transactionAnalyzer.fetchAddressTransactions(counterparty);
      const addrs = this.transactionAnalyzer.extractUniqueCounterparties(
        tx,
        counterparty
      );
      for (const addr of Array.from(addrs).slice(
        0,
        MAX_THIRD_HOP_PER_COUNTERPARTY
      )) {
        thirdHop.push(addr);
      }
    }
    return thirdHop;
  }
}

export const addressCheckService = new AddressCheckService();
