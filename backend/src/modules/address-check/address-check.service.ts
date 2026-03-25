import { blacklistService } from '../blacklist';
import { BlockchainClientFactory } from '../../lib/clients';
import { IBlockchainClient } from '../../lib/blockchain-client.interface';
import { env } from '../../config/env';
import prisma from '../../config/database';
import type { AddressAnalysisResult, RiskFlag } from './address-check.types';
import {
  MIN_TAINT_COUNTERPARTY_VOLUME,
  MIN_TAINT_VOLUME_SHARE_PERCENT,
} from './address-check.constants';
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
  getTaintScore,
  getBehavioralScore,
  getVolumeScore,
  getFinalRiskScore,
  getWhitelistLevel,
  WhitelistLevel,
} from './address-check.utils';

const MAX_HOP_LEVEL = 1;
const MAX_COUNTERPARTIES_TAINT = 10;

interface CachedSecurityData {
  addressSecurity?: AddressSecurity | null;
  blacklistEntry?: {
    category?: string;
    riskScore?: number;
  } | null;
}

interface TaintCounterpartyInsight {
  address: string;
  incomingVolume: number;
  riskScore: number;
  risky: boolean;
}

interface TaintCalculationStats {
  maxConsidered: number;
  checkedCounterparties: number;
  analyzedCounterparties: number;
  skippedVisited: number;
  skippedDust: number;
  counterpartyCacheHits: number;
  counterpartyCacheMisses: number;
}

interface CounterpartyCacheEntry {
  result: AddressAnalysisResult;
  cachedAt: number;
}

export class AddressCheckService {
  private blockchainClient: IBlockchainClient;
  private transactionAnalyzer: TransactionAnalyzer;
  private patternAnalyzer: PatternAnalyzer;
  private riskCalculator: RiskCalculator;
  private counterpartyAnalysisCache = new Map<string, CounterpartyCacheEntry>();
  private readonly counterpartyCacheTtlMs = 10 * 60 * 1000;
  private readonly counterpartyCacheMaxSize = 1000;
  private requestsSinceCacheCleanup = 0;

  constructor() {
    this.blockchainClient = BlockchainClientFactory.getClient(
      env.blockchainProvider || 'auto'
    );
    this.transactionAnalyzer = new TransactionAnalyzer(this.blockchainClient);
    this.patternAnalyzer = new PatternAnalyzer();
    this.riskCalculator = new RiskCalculator();
  }

  async analyzeAddress(address: string): Promise<AddressAnalysisResult> {
    this.requestsSinceCacheCleanup++;
    if (this.requestsSinceCacheCleanup % 100 === 0) {
      this.cleanupCounterpartyCache();
    }

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
    cachedData?: CachedSecurityData
  ): Promise<AddressAnalysisResult> {
    console.log(
      `[AddressCheck] Analyzing address at hop level ${hopLevel}: ${address}`
    );

    if (hopLevel > MAX_HOP_LEVEL || visitedAddresses.has(address)) {
      return createSkipResult(address) as AddressAnalysisResult;
    }

    // Cache only non-root analyses to speed up repeated counterparty checks.
    if (hopLevel > 0) {
      const cached = this.counterpartyAnalysisCache.get(address);
      if (
        cached &&
        Date.now() - cached.cachedAt < this.counterpartyCacheTtlMs
      ) {
        return cached.result;
      }
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
      liquidityEvents,
      address
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

    const {
      finalRiskScore,
      flagsFromOtherHops,
      hopEntityFlags,
      totalIncomingVolume,
      taintInput,
      riskyIncomingVolume,
      taintPercent,
      topRiskyCounterparties,
      taintCalculationStats,
      taintScore,
      behavioralScore,
      volumeScore,
    } = await this.runMultiHopIfNeeded(
      address,
      hopLevel,
      baseRiskScore,
      transactions,
      visitedAddresses,
      flags
    );

    let cappedScore = Math.round(Math.min(finalRiskScore, 100) * 100) / 100;

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

    const finalFlags =
      flagsFromOtherHops.length > 0
        ? ([...new Set([...flags, ...flagsFromOtherHops])] as RiskFlag[])
        : flags;

    // Whitelist adjustments (only for the directly analyzed address)
    let whitelistLevel: WhitelistLevel | undefined;
    if (hopLevel === 0) {
      const wl = getWhitelistLevel(address);
      if (wl === 'strong') {
        cappedScore = 0;
        whitelistLevel = wl;
      } else if (wl === 'soft') {
        cappedScore = Math.round(cappedScore * 0.3 * 100) / 100;
        whitelistLevel = wl;
      }
    }

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
      ...(hopLevel === 0 && {
        allTrc20IncomingVolume: patterns.totalIncoming,
        totalIncomingVolume,
        taintInput,
        riskyIncomingVolume,
        taintPercent,
        topRiskyCounterparties,
        taintCalculationStats,
        scoreBreakdown: {
          baseRiskScore: Math.round(baseRiskScore * 100) / 100,
          taintScore,
          behavioralScore: Math.round(behavioralScore * 100) / 100,
          volumeScore: Math.round(volumeScore * 100) / 100,
          preWhitelistScore: Math.round(finalRiskScore * 100) / 100,
          whitelistLevel,
          postWhitelistScore: cappedScore,
        },
      }),
    });

    const output: AddressAnalysisResult = {
      riskScore: cappedScore,
      flags: finalFlags,
      metadata,
    };

    if (hopLevel > 0) {
      this.counterpartyAnalysisCache.set(address, {
        result: output,
        cachedAt: Date.now(),
      });
      this.evictCounterpartyCacheIfNeeded();
    }

    return output;
  }

  private cleanupCounterpartyCache(): void {
    const now = Date.now();
    for (const [addr, entry] of this.counterpartyAnalysisCache.entries()) {
      if (now - entry.cachedAt >= this.counterpartyCacheTtlMs) {
        this.counterpartyAnalysisCache.delete(addr);
      }
    }
  }

  private evictCounterpartyCacheIfNeeded(): void {
    if (this.counterpartyAnalysisCache.size <= this.counterpartyCacheMaxSize) {
      return;
    }
    // Remove oldest entries until size is within limit.
    const entries = Array.from(this.counterpartyAnalysisCache.entries()).sort(
      (a, b) => a[1].cachedAt - b[1].cachedAt
    );
    const toRemove =
      this.counterpartyAnalysisCache.size - this.counterpartyCacheMaxSize;
    for (let i = 0; i < toRemove; i++) {
      this.counterpartyAnalysisCache.delete(entries[i][0]);
    }
  }

  private async resolveSecurityAndBlacklist(
    address: string,
    hopLevel: number,
    cachedData?: CachedSecurityData
  ): Promise<{
    blacklistEntry: CachedSecurityData['blacklistEntry'];
    addressSecurity: AddressSecurity | null | undefined;
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
    _transactions: Transaction[],
    visitedAddresses: Set<string>,
    flags: RiskFlag[]
  ): Promise<{
    finalRiskScore: number;
    flagsFromOtherHops: RiskFlag[];
    hopEntityFlags: RiskFlag[][];
    totalIncomingVolume: number;
    riskyIncomingVolume: number;
    taintPercent: number;
    topRiskyCounterparties: TaintCounterpartyInsight[];
    taintCalculationStats: TaintCalculationStats;
    taintScore: number;
    behavioralScore: number;
    volumeScore: number;
    taintInput: {
      symbols: string[];
      pagesFetched: number;
      scannedTxCount: number;
      stablecoinTxCount: number;
      truncated: boolean;
    };
  }> {
    let finalRiskScore = baseRiskScore;
    const flagsFromOtherHops: RiskFlag[] = [];
    const hopEntityFlags: RiskFlag[][] = [flags];
    let totalIncomingVolume = 0;
    let riskyIncomingVolume = 0;
    let taintPercent = 0;
    const topRiskyCounterparties: TaintCounterpartyInsight[] = [];
    const taintCalculationStats: TaintCalculationStats = {
      maxConsidered: 0,
      checkedCounterparties: 0,
      analyzedCounterparties: 0,
      skippedVisited: 0,
      skippedDust: 0,
      counterpartyCacheHits: 0,
      counterpartyCacheMisses: 0,
    };
    let taintScore = 0;
    let behavioralScore = 0;
    let volumeScore = 0;
    let taintInput = {
      symbols: ['USDT', 'USDC'],
      pagesFetched: 0,
      scannedTxCount: 0,
      stablecoinTxCount: 0,
      truncated: false,
    };

    if (hopLevel !== 0) {
      return {
        finalRiskScore,
        flagsFromOtherHops,
        hopEntityFlags,
        totalIncomingVolume,
        riskyIncomingVolume,
        taintPercent,
        topRiskyCounterparties,
        taintCalculationStats,
        taintScore,
        behavioralScore,
        volumeScore,
        taintInput,
      };
    }

    const {
      totalVolume,
      volumeByCounterparty,
      pagesFetched,
      scannedTxCount,
      stablecoinTxCount,
      truncated,
    } = await this.transactionAnalyzer.fetchTRC20IncomingVolumes(address);
    totalIncomingVolume = totalVolume;
    taintInput = {
      symbols: ['USDT', 'USDC'],
      pagesFetched,
      scannedTxCount,
      stablecoinTxCount,
      truncated,
    };

    console.log(`[AddressCheck] Taint input (USDT/USDC only):`, {
      address,
      stablecoinIncomingTotal: totalVolume,
      counterpartyCount: volumeByCounterparty.size,
      pagesFetched,
      scannedTxCount,
      stablecoinTxCount,
      truncated,
    });

    if (totalVolume > 0 && volumeByCounterparty.size > 0) {
      const sorted = Array.from(volumeByCounterparty.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_COUNTERPARTIES_TAINT);
      taintCalculationStats.maxConsidered = MAX_COUNTERPARTIES_TAINT;
      taintCalculationStats.checkedCounterparties = sorted.length;

      for (const [counterparty, incomingVolume] of sorted) {
        if (visitedAddresses.has(counterparty)) {
          taintCalculationStats.skippedVisited++;
          continue;
        }
        const sharePercent =
          totalVolume > 0 ? (incomingVolume / totalVolume) * 100 : 0;
        if (
          incomingVolume < MIN_TAINT_COUNTERPARTY_VOLUME &&
          sharePercent < MIN_TAINT_VOLUME_SHARE_PERCENT
        ) {
          // Ignore dust/noise counterparties for taint stability.
          taintCalculationStats.skippedDust++;
          continue;
        }
        taintCalculationStats.analyzedCounterparties++;

        const cached = this.counterpartyAnalysisCache.get(counterparty);
        if (
          cached &&
          Date.now() - cached.cachedAt < this.counterpartyCacheTtlMs
        ) {
          taintCalculationStats.counterpartyCacheHits++;
        } else {
          taintCalculationStats.counterpartyCacheMisses++;
        }

        const result = await this.analyzeAddressWithHops(
          counterparty,
          1,
          new Set(visitedAddresses)
        );
        flagsFromOtherHops.push(...result.flags);
        hopEntityFlags.push(result.flags);

        // For taint, prefer "source/entity risk" signals over the full score,
        // to avoid marking counterparties as taint-risky due to volume/behavior alone.
        const isRisky =
          (result as AddressAnalysisResult).metadata?.isBlacklisted ||
          result.flags.includes('blacklisted') ||
          result.flags.includes('scam') ||
          result.flags.includes('phishing') ||
          result.flags.includes('malicious');
        topRiskyCounterparties.push({
          address: counterparty,
          incomingVolume: Math.round(incomingVolume * 100) / 100,
          riskScore: Math.round(result.riskScore * 100) / 100,
          risky: isRisky,
        });

        if (isRisky) {
          riskyIncomingVolume += incomingVolume;
        }
      }

      taintPercent =
        totalVolume > 0
          ? Math.round((riskyIncomingVolume / totalVolume) * 10000) / 100
          : 0;
    }

    taintScore = getTaintScore(taintPercent);
    const directRisk = baseRiskScore;
    behavioralScore = getBehavioralScore(flags, flagsFromOtherHops);
    volumeScore = getVolumeScore(totalIncomingVolume);
    finalRiskScore = getFinalRiskScore(
      directRisk,
      taintScore,
      behavioralScore,
      volumeScore
    );

    return {
      finalRiskScore,
      flagsFromOtherHops,
      hopEntityFlags,
      totalIncomingVolume,
      riskyIncomingVolume,
      taintPercent,
      topRiskyCounterparties,
      taintCalculationStats,
      taintScore,
      behavioralScore,
      volumeScore,
      taintInput,
    };
  }
}

export const addressCheckService = new AddressCheckService();
