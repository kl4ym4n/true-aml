import { blacklistService } from '../blacklist';
import { BlockchainClientFactory } from '../../lib/clients';
import { IBlockchainClient } from '../../lib/blockchain-client.interface';
import { env } from '../../config/env';
import prisma from '../../config/database';
import type {
  AddressAnalysisResult,
  RiskFlag,
  TopCounterpartySoFDebug,
  SourceOfFundsSampleDebug,
} from './address-check.types';
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
  computeVolumeWeightedSourceBreakdown,
  computeExchangeTrustedShare01,
  applyTrustedShareScoreCalibration,
  classifySourceBucket,
  isStrongWhitelistedExchange,
  buildAnalysisMetadata,
  updateAddressProfile,
  createSkipResult,
  getVolumeScore,
  getWhitelistLevel,
  WhitelistLevel,
  resolveCounterpartyEntity,
  computeCounterpartyOnchainStats,
  isExchangeLikeCounterparty,
  isAmlRiskyCounterparty,
} from './address-check.utils';
import {
  findAddressesCandidateExchangeInfra,
  findAddressesGraphLinkedToStrongWhitelist,
} from './address-check.utils';
import {
  resolveTrustedSourceSemantics,
  securityTagsSuggestExchangeRail,
} from './address-check.utils';
import { computeWalletContextHints } from './address-check.utils';
import { AdvancedRiskCalculator } from './address-check.utils';
import { LruCache } from './address-check.utils';
import { mapWithConcurrency } from './address-check.utils';
import {
  getEntityRiskWeight,
  taintHopWeight,
  TAINT_TIME_DECAY_LAMBDA,
  TAINT_EXP_K,
  SMALL_TAINT_PERCENT_MULTIPLIER,
} from './address-check.utils/advanced-risk.constants';
import { computeBehavioralPatternScore } from './address-check.utils';
import type { VolumeWeightedSourceRow } from './address-check.utils';
import type { SourceFlowCalibration } from './address-check.types';
import type { TransactionPatterns } from './address-check.pattern-analyzer';

const MAX_HOP_LEVEL = 1;
const MAX_TAINT_HOPS = 3;
const TOP_K_ROOT_COUNT = 15;
const TOP_K_DEEP = 8;
const TAINT_CONCURRENCY = 4;
const MAX_TAINT_MS = 45_000;

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
  entityType?: string;
  hopLevel?: number;
  sofDebug?: TopCounterpartySoFDebug;
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
  private readonly advancedRiskCalculator = new AdvancedRiskCalculator();
  private counterpartyAnalysisCache = new LruCache<
    string,
    CounterpartyCacheEntry
  >(2000);
  private readonly securityCache = new LruCache<
    string,
    { value: AddressSecurity | null }
  >(2000);
  private readonly counterpartyCacheTtlMs = 10 * 60 * 1000;

  constructor() {
    this.blockchainClient = BlockchainClientFactory.getClient(
      env.blockchainProvider || 'auto'
    );
    this.transactionAnalyzer = new TransactionAnalyzer(this.blockchainClient);
    this.patternAnalyzer = new PatternAnalyzer();
    this.riskCalculator = new RiskCalculator();
  }

  private getCachedCounterpartyAnalysis(
    address: string
  ): AddressAnalysisResult | null {
    const e = this.counterpartyAnalysisCache.get(address);
    if (!e) return null;
    if (Date.now() - e.cachedAt >= this.counterpartyCacheTtlMs) {
      this.counterpartyAnalysisCache.delete(address);
      return null;
    }
    return e.result;
  }

  private setCachedCounterpartyAnalysis(
    address: string,
    result: AddressAnalysisResult
  ): void {
    this.counterpartyAnalysisCache.set(address, {
      result,
      cachedAt: Date.now(),
    });
  }

  private async getAddressSecurityCached(
    address: string
  ): Promise<AddressSecurity | null> {
    const w = this.securityCache.get(address);
    if (w !== undefined) return w.value;
    try {
      const s = await this.blockchainClient.checkAddressSecurity(address);
      this.securityCache.set(address, { value: s });
      return s;
    } catch {
      this.securityCache.set(address, { value: null });
      return null;
    }
  }

  async analyzeAddress(
    address: string,
    opts?: { debugSof?: boolean }
  ): Promise<AddressAnalysisResult> {
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
      { addressSecurity, blacklistEntry },
      opts
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
    cachedData?: CachedSecurityData,
    opts?: { debugSof?: boolean }
  ): Promise<AddressAnalysisResult> {
    console.log(
      `[AddressCheck] Analyzing address at hop level ${hopLevel}: ${address}`
    );

    if (hopLevel > MAX_HOP_LEVEL || visitedAddresses.has(address)) {
      return createSkipResult(address) as AddressAnalysisResult;
    }

    // Cache only non-root analyses to speed up repeated counterparty checks.
    if (hopLevel > 0) {
      const cached = this.getCachedCounterpartyAnalysis(address);
      if (cached) {
        return cached;
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
      stablecoinIncomingVolume,
      taintInput,
      riskyIncomingVolume,
      taintPercent,
      topRiskyCounterparties,
      taintCalculationStats,
      taintScore,
      behavioralScore,
      volumeScore,
      explanation,
      taintBreakdownRows,
      sourceFlowCalibration,
      sourceOfFundsSampleDebug,
      stablecoinSofWarning,
      stablecoinSofDataSource,
    } = await this.runMultiHopIfNeeded(
      address,
      hopLevel,
      baseRiskScore,
      transactions,
      visitedAddresses,
      flags,
      patterns,
      opts
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
    const hasStablecoinSourceSample =
      hopLevel === 0 &&
      (taintInput?.stablecoinTxCount ?? 0) > 0 &&
      stablecoinIncomingVolume > 0;

    const sourceBreakdown =
      hopLevel === 0 && taintBreakdownRows && taintBreakdownRows.length > 0
        ? computeVolumeWeightedSourceBreakdown(taintBreakdownRows)
        : hopLevel === 0 && !hasStablecoinSourceSample
          ? {
              summary: { trusted: 0, suspicious: 0, dangerous: 0 },
              trusted: {},
              suspicious: {},
              dangerous: {},
              sampleEmpty: true,
              note: 'No incoming USDT/USDC transfers in analyzed source-of-funds sample.',
            }
          : hopLevel === 0
            ? computeSourceBreakdown(hopEntityFlags)
            : undefined;

    const walletContext =
      hopLevel === 0
        ? computeWalletContextHints({
            patterns,
            sourceBreakdown: sourceBreakdown ?? null,
          })
        : undefined;

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
        stablecoinIncomingVolume,
        // Backwards-compat alias (will be removed once frontend is migrated).
        totalIncomingVolume: stablecoinIncomingVolume,
        hasStablecoinSourceSample,
        stablecoinSourceSampleReason: hasStablecoinSourceSample
          ? undefined
          : 'No incoming USDT/USDC transfers in analyzed source-of-funds sample',
        stablecoinSofWarning,
        stablecoinSofDataSource,
        walletActivityContext: {
          hasIncomingActivity: transactionCount > 0,
          incomingTxCount: transactionCount,
          hasStablecoinIncomingActivity:
            (taintInput?.stablecoinTxCount ?? 0) > 0,
        },
        taintInput,
        riskyIncomingVolume,
        taintPercent,
        topRiskyCounterparties,
        taintCalculationStats,
        ...(explanation !== undefined &&
          explanation.length > 0 && { explanation }),
        scoreBreakdown: {
          baseRiskScore: Math.round(baseRiskScore * 100) / 100,
          taintScore,
          behavioralScore: Math.round(behavioralScore * 100) / 100,
          volumeScore: Math.round(volumeScore * 100) / 100,
          ...(sourceFlowCalibration !== undefined && {
            amlWeightedBlendScore:
              Math.round(sourceFlowCalibration.amlWeightedBlendScore * 100) /
              100,
          }),
          preWhitelistScore: Math.round(finalRiskScore * 100) / 100,
          whitelistLevel,
          postWhitelistScore: cappedScore,
        },
        ...(sourceFlowCalibration !== undefined && { sourceFlowCalibration }),
        ...(sourceOfFundsSampleDebug !== undefined && {
          sourceOfFundsSampleDebug,
        }),
        ...(walletContext !== undefined && { walletContext }),
      }),
    });

    const output: AddressAnalysisResult = {
      riskScore: cappedScore,
      flags: finalFlags,
      metadata,
    };

    if (hopLevel > 0) {
      this.setCachedCounterpartyAnalysis(address, output);
    }

    return output;
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

  private resolveCounterpartyEntityFromTxs(
    addr: string,
    addressSecurity: AddressSecurity | null | undefined,
    transactions: Transaction[],
    rootIncomingShare: number
  ): {
    resolution: ReturnType<typeof resolveCounterpartyEntity>;
    txCount: number;
    uniqueCounterpartyCount: number;
    maxIncomingSenderShare: number;
  } {
    const cpPatterns = this.patternAnalyzer.analyzeTransactionPatterns(
      transactions,
      null,
      null,
      null,
      addr
    );
    const onchain = computeCounterpartyOnchainStats(transactions, addr);
    const uc = Math.max(
      cpPatterns.uniqueCounterparties,
      onchain.uniqueIncomingSenders
    );
    const resolution = resolveCounterpartyEntity(
      addr,
      addressSecurity,
      {
        rootIncomingShare: rootIncomingShare,
        txCount: onchain.txCount,
        uniqueCounterpartyCount: uc,
        maxCounterpartyShare: onchain.maxIncomingSenderShare,
        liquidityPoolInteractions: cpPatterns.liquidityPoolInteractions,
        swapLikeRatio: cpPatterns.swapLikeRatio,
      },
      cpPatterns
    );
    return {
      resolution,
      txCount: onchain.txCount,
      uniqueCounterpartyCount: uc,
      maxIncomingSenderShare: onchain.maxIncomingSenderShare,
    };
  }

  private async runMultiHopIfNeeded(
    address: string,
    hopLevel: number,
    baseRiskScore: number,
    _transactions: Transaction[],
    visitedAddresses: Set<string>,
    flags: RiskFlag[],
    patterns: TransactionPatterns,
    sofOpts?: { debugSof?: boolean }
  ): Promise<{
    finalRiskScore: number;
    flagsFromOtherHops: RiskFlag[];
    hopEntityFlags: RiskFlag[][];
    stablecoinIncomingVolume: number;
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
    stablecoinSofWarning?: string;
    stablecoinSofDataSource?: 'tronscan_transfers' | 'legacy_tx_list';
    explanation: string[];
    taintBreakdownRows?: VolumeWeightedSourceRow[];
    sourceFlowCalibration?: SourceFlowCalibration;
    sourceOfFundsSampleDebug?: SourceOfFundsSampleDebug;
  }> {
    const emptyTaintInput = {
      symbols: ['USDT', 'USDC'] as string[],
      pagesFetched: 0,
      scannedTxCount: 0,
      stablecoinTxCount: 0,
      truncated: false,
    };

    let finalRiskScore = baseRiskScore;
    const flagsFromOtherHops: RiskFlag[] = [];
    const hopEntityFlags: RiskFlag[][] = [flags];
    let stablecoinIncomingVolume = 0;
    let riskyIncomingVolume = 0;
    let taintPercent = 0;
    const topRiskyCounterparties: TaintCounterpartyInsight[] = [];
    const taintCalculationStats: TaintCalculationStats = {
      maxConsidered: TOP_K_ROOT_COUNT,
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
    let taintInput = { ...emptyTaintInput };
    let stablecoinSofWarning: string | undefined;
    let stablecoinSofDataSource:
      | 'tronscan_transfers'
      | 'legacy_tx_list'
      | undefined;
    const taintHints: string[] = [];
    let cumulativeTaintRaw = 0;
    let trustedShare01 = 0;
    let suspiciousShare01 = 0;
    let dangerousShare01 = 0;
    let exchangeShare01 = 0;
    let whitelistMatchedHop1 = 0;
    let sourceOfFundsSampleDebug: SourceOfFundsSampleDebug | undefined;

    if (hopLevel !== 0) {
      return {
        finalRiskScore,
        flagsFromOtherHops,
        hopEntityFlags,
        stablecoinIncomingVolume,
        riskyIncomingVolume,
        taintPercent,
        topRiskyCounterparties,
        taintCalculationStats,
        taintScore,
        behavioralScore,
        volumeScore,
        taintInput,
        stablecoinSofWarning,
        stablecoinSofDataSource,
        explanation: [],
        taintBreakdownRows: undefined,
        sourceFlowCalibration: undefined,
        sourceOfFundsSampleDebug: undefined,
      };
    }

    const taintStarted = Date.now();
    const deadline = taintStarted + MAX_TAINT_MS;

    const {
      totalVolume,
      volumeByCounterparty,
      pagesFetched,
      scannedTxCount,
      stablecoinTxCount,
      truncated,
      provider,
      warning,
    } = await this.transactionAnalyzer.fetchTRC20IncomingVolumes(address, {
      debug: !!sofOpts?.debugSof,
    });
    stablecoinIncomingVolume = totalVolume;
    stablecoinSofWarning = warning;
    stablecoinSofDataSource = provider;
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
      provider,
      ...(warning ? { warning } : {}),
      pagesFetched,
      scannedTxCount,
      stablecoinTxCount,
      truncated,
    });

    if (totalVolume <= 0 || volumeByCounterparty.size === 0) {
      behavioralScore = computeBehavioralPatternScore(patterns);
      volumeScore = getVolumeScore(stablecoinIncomingVolume);
      const aml = this.advancedRiskCalculator.calculate({
        baseRisk: baseRiskScore,
        taintScore: 0,
        behavioralScore,
        volumeScore,
        patterns,
        taintHints: [],
      });
      finalRiskScore = aml.score;
      return {
        finalRiskScore,
        flagsFromOtherHops,
        hopEntityFlags,
        stablecoinIncomingVolume,
        riskyIncomingVolume,
        taintPercent: 0,
        topRiskyCounterparties,
        taintCalculationStats,
        taintScore: 0,
        behavioralScore,
        volumeScore,
        taintInput,
        stablecoinSofWarning,
        stablecoinSofDataSource,
        explanation: aml.explanation,
        taintBreakdownRows: undefined,
        sourceFlowCalibration: undefined,
        sourceOfFundsSampleDebug: undefined,
      };
    }

    const sortedRoot = Array.from(volumeByCounterparty.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_K_ROOT_COUNT);
    taintCalculationStats.checkedCounterparties = sortedRoot.length;

    const filtered: Array<[string, number]> = [];
    for (const [cp, incomingVolume] of sortedRoot) {
      if (visitedAddresses.has(cp)) {
        taintCalculationStats.skippedVisited++;
        continue;
      }
      const sharePercent =
        totalVolume > 0 ? (incomingVolume / totalVolume) * 100 : 0;
      if (
        incomingVolume < MIN_TAINT_COUNTERPARTY_VOLUME &&
        sharePercent < MIN_TAINT_VOLUME_SHARE_PERCENT
      ) {
        taintCalculationStats.skippedDust++;
        continue;
      }
      filtered.push([cp, incomingVolume]);
    }

    type Hop1Row = {
      cp: string;
      incomingVolume: number;
      result: AddressAnalysisResult;
      entity: string;
      rw: number;
      whyEntityResolved: string;
      exchangeLikeFallback: boolean;
      securityTags: string[];
      onchainSnapshot: {
        txCount: number;
        uniqueCounterpartyCount: number;
        maxCounterpartyShare: number;
        volumeShare: number;
      };
    };

    const hop1Rows: Hop1Row[] = [];

    const hop1Results = await mapWithConcurrency(
      filtered,
      TAINT_CONCURRENCY,
      async ([cp, incomingVolume]) => {
        if (Date.now() > deadline) {
          return null;
        }

        const hadCache = !!this.getCachedCounterpartyAnalysis(cp);

        const result = await this.analyzeAddressWithHops(
          cp,
          1,
          new Set(visitedAddresses)
        );

        const sec = await this.getAddressSecurityCached(cp);
        const txs = await this.transactionAnalyzer.fetchAddressTransactions(cp);
        const lastDays =
          TransactionAnalyzer.lastActivityDaysFromTransactions(txs);
        const decay = Math.exp(-TAINT_TIME_DECAY_LAMBDA * lastDays);
        const volShare = incomingVolume / totalVolume;
        const packed = this.resolveCounterpartyEntityFromTxs(
          cp,
          sec,
          txs,
          volShare
        );
        const entity = packed.resolution.entity;
        const rw = getEntityRiskWeight(entity);
        const contrib = volShare * rw * taintHopWeight(1) * decay;
        const hint = `${(volShare * 100).toFixed(1)}% from ${entity} (hop 1, weight ${rw.toFixed(2)})`;

        return {
          cp,
          incomingVolume,
          result,
          entity,
          rw,
          contrib,
          hadCache,
          hint,
          whyEntityResolved: packed.resolution.why,
          onchainSnapshot: {
            txCount: packed.txCount,
            uniqueCounterpartyCount: packed.uniqueCounterpartyCount,
            maxCounterpartyShare: packed.maxIncomingSenderShare,
            volumeShare: volShare,
          },
          securityTags: sec?.tags ?? [],
        };
      }
    );

    const hop1Addresses = hop1Results
      .filter((r): r is NonNullable<(typeof hop1Results)[number]> => r != null)
      .map(r => r.cp);
    const graphLinkedSet = await findAddressesGraphLinkedToStrongWhitelist(
      prisma,
      hop1Addresses
    );
    const candidateInfraSet = await findAddressesCandidateExchangeInfra(
      prisma,
      hop1Addresses
    );

    let hop1Hits = 0;
    let hop1Misses = 0;
    for (const r of hop1Results) {
      if (!r) continue;
      if (r.hadCache) hop1Hits++;
      else hop1Misses++;
      cumulativeTaintRaw += r.contrib;
      taintHints.push(r.hint);
      if (
        isAmlRiskyCounterparty({
          address: r.cp,
          entity: r.entity,
          flags: r.result.flags,
          entityRiskWeight: r.rw,
          isMetadataBlacklisted: !!r.result.metadata?.isBlacklisted,
          blacklistCategory: r.result.metadata?.blacklistCategory ?? null,
        })
      ) {
        riskyIncomingVolume += r.incomingVolume;
      }
    }
    taintCalculationStats.counterpartyCacheHits = hop1Hits;
    taintCalculationStats.counterpartyCacheMisses = hop1Misses;
    taintCalculationStats.analyzedCounterparties =
      hop1Results.filter(Boolean).length;

    for (const row of hop1Results) {
      if (!row) continue;
      flagsFromOtherHops.push(...row.result.flags);
      hopEntityFlags.push(row.result.flags);
      const exchangeLike = isExchangeLikeCounterparty({
        flags: row.result.flags,
        blacklistCategory: row.result.metadata.blacklistCategory ?? null,
        isMetadataBlacklisted: !!row.result.metadata.isBlacklisted,
        txCount: row.onchainSnapshot.txCount,
        uniqueCounterpartyCount: row.onchainSnapshot.uniqueCounterpartyCount,
        maxIncomingSenderShare: row.onchainSnapshot.maxCounterpartyShare,
        rootIncomingShare: row.onchainSnapshot.volumeShare,
        entity: row.entity,
      });
      hop1Rows.push({
        cp: row.cp,
        incomingVolume: row.incomingVolume,
        result: row.result,
        entity: row.entity,
        rw: row.rw,
        whyEntityResolved: row.whyEntityResolved,
        exchangeLikeFallback: exchangeLike,
        securityTags: row.securityTags,
        onchainSnapshot: row.onchainSnapshot,
      });
      const isRisky = isAmlRiskyCounterparty({
        address: row.cp,
        entity: row.entity,
        flags: row.result.flags,
        entityRiskWeight: row.rw,
        isMetadataBlacklisted: !!row.result.metadata?.isBlacklisted,
        blacklistCategory: row.result.metadata?.blacklistCategory ?? null,
      });
      const bucket = classifySourceBucket({
        address: row.cp,
        entity: row.entity,
        flags: row.result.flags,
        blacklistCategory: row.result.metadata.blacklistCategory ?? null,
        exchangeLikeFallback: exchangeLike,
        graphLinkedToWhitelistedExchange: graphLinkedSet.has(row.cp),
        candidateSignalExchangeInfra: candidateInfraSet.has(row.cp),
        securityTags: row.securityTags,
      });
      const sem = resolveTrustedSourceSemantics({
        address: row.cp,
        entity: row.entity,
        flags: row.result.flags,
        blacklistCategory: row.result.metadata.blacklistCategory ?? null,
        exchangeLikeFallback: exchangeLike,
        graphLinkedToWhitelistedExchange: graphLinkedSet.has(row.cp),
        candidateSignalExchangeInfra: candidateInfraSet.has(row.cp),
        securityTags: row.securityTags,
      });
      const tagsSuggest = securityTagsSuggestExchangeRail(row.securityTags);
      const sofDebug: TopCounterpartySoFDebug = {
        volumeShare:
          Math.round(row.onchainSnapshot.volumeShare * 10000) / 10000,
        volume: Math.round(row.incomingVolume * 100) / 100,
        txCount: row.onchainSnapshot.txCount,
        uniqueCounterpartyCount: row.onchainSnapshot.uniqueCounterpartyCount,
        maxCounterpartyShare:
          Math.round(row.onchainSnapshot.maxCounterpartyShare * 10000) / 10000,
        whitelistMatched: isStrongWhitelistedExchange(row.cp),
        blacklistCategory: row.result.metadata.blacklistCategory ?? null,
        securityTags: row.securityTags,
        bucket,
        whyEntityResolved: row.whyEntityResolved,
        exchangeLikeFallback: exchangeLike,
        graphLinkedToWhitelistedExchange: graphLinkedSet.has(row.cp),
        candidateSignalExchangeInfra: candidateInfraSet.has(row.cp),
        securityTagsSuggestExchange: tagsSuggest,
        trustedReason: sem.isTrusted ? sem.trustedReason : null,
      };
      topRiskyCounterparties.push({
        address: row.cp,
        incomingVolume: Math.round(row.incomingVolume * 100) / 100,
        riskScore: Math.round(row.result.riskScore * 100) / 100,
        risky: isRisky,
        entityType: row.entity,
        hopLevel: 1,
        sofDebug,
      });
    }

    const taintBreakdownRows: VolumeWeightedSourceRow[] = hop1Rows.map(row => ({
      counterpartyAddress: row.cp,
      volumeShare: row.incomingVolume / totalVolume,
      entity: row.entity,
      flags: row.result.flags,
      blacklistCategory: row.result.metadata.blacklistCategory ?? null,
      exchangeLikeFallback: row.exchangeLikeFallback,
      graphLinkedToWhitelistedExchange: graphLinkedSet.has(row.cp),
      candidateSignalExchangeInfra: candidateInfraSet.has(row.cp),
      securityTags: row.securityTags,
    }));

    if (hop1Rows.length > 0 && totalVolume > 0) {
      let sumTrustedVolume = 0;
      let sumSuspiciousVolume = 0;
      let sumDangerousVolume = 0;
      let numberOfTrustedRows = 0;
      let numberOfExchangeOrWhitelistRows = 0;
      let numberOfWhitelistMatches = 0;
      let numberOfGraphTrustedLinks = 0;
      let numberOfCandidateInfraMatches = 0;

      for (const row of hop1Rows) {
        const b = classifySourceBucket({
          address: row.cp,
          entity: row.entity,
          flags: row.result.flags,
          blacklistCategory: row.result.metadata.blacklistCategory ?? null,
          exchangeLikeFallback: row.exchangeLikeFallback,
          graphLinkedToWhitelistedExchange: graphLinkedSet.has(row.cp),
          candidateSignalExchangeInfra: candidateInfraSet.has(row.cp),
          securityTags: row.securityTags,
        });
        const v = row.incomingVolume;
        if (b === 'trusted') {
          sumTrustedVolume += v;
          numberOfTrustedRows++;
        } else if (b === 'suspicious') {
          sumSuspiciousVolume += v;
        } else {
          sumDangerousVolume += v;
        }
        if (isStrongWhitelistedExchange(row.cp)) {
          numberOfWhitelistMatches++;
        }
        if (graphLinkedSet.has(row.cp)) {
          numberOfGraphTrustedLinks++;
        }
        if (candidateInfraSet.has(row.cp)) {
          numberOfCandidateInfraMatches++;
        }
        if (
          row.entity === 'exchange' ||
          row.entity === 'payment_processor' ||
          isStrongWhitelistedExchange(row.cp) ||
          row.result.metadata.blacklistCategory === 'EXCHANGE' ||
          graphLinkedSet.has(row.cp) ||
          candidateInfraSet.has(row.cp)
        ) {
          numberOfExchangeOrWhitelistRows++;
        }
      }

      const counterparties = topRiskyCounterparties
        .map(c => c.sofDebug)
        .filter((d): d is TopCounterpartySoFDebug => d != null);

      sourceOfFundsSampleDebug = {
        aggregation: {
          sumTrustedVolume: Math.round(sumTrustedVolume * 100) / 100,
          sumSuspiciousVolume: Math.round(sumSuspiciousVolume * 100) / 100,
          sumDangerousVolume: Math.round(sumDangerousVolume * 100) / 100,
          numberOfTrustedRows,
          numberOfExchangeOrWhitelistRows,
          numberOfWhitelistMatches,
          numberOfGraphTrustedLinks,
          numberOfCandidateInfraMatches,
        },
        counterparties,
      };

      if (sofOpts?.debugSof) {
        console.log(
          '[SoF sample debug]',
          JSON.stringify(
            {
              rootAddress: address,
              topCounterparties: hop1Addresses.slice(0, 15),
              aggregation: sourceOfFundsSampleDebug.aggregation,
              rows: counterparties.slice(0, 15),
            },
            null,
            2
          )
        );
      }
    }

    if (taintBreakdownRows.length > 0) {
      const flow = computeVolumeWeightedSourceBreakdown(taintBreakdownRows);
      trustedShare01 = (flow.summary?.trusted ?? 0) / 100;
      suspiciousShare01 = (flow.summary?.suspicious ?? 0) / 100;
      dangerousShare01 = (flow.summary?.dangerous ?? 0) / 100;
      exchangeShare01 = computeExchangeTrustedShare01(taintBreakdownRows);
      whitelistMatchedHop1 = taintBreakdownRows.filter(r =>
        isStrongWhitelistedExchange(r.counterpartyAddress)
      ).length;
    }

    const hop1ForDeep = [...hop1Rows]
      .sort((a, b) => b.incomingVolume - a.incomingVolume)
      .slice(0, TOP_K_DEEP);

    for (const h1 of hop1ForDeep) {
      if (Date.now() > deadline || MAX_TAINT_HOPS < 2) break;
      const alpha = h1.incomingVolume / totalVolume;
      const vols2 = await this.transactionAnalyzer.fetchTRC20IncomingVolumes(
        h1.cp
      );
      if (vols2.totalVolume <= 0) continue;
      const topT = Array.from(vols2.volumeByCounterparty.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_K_DEEP);
      for (const [tAddr, tVol] of topT) {
        if (Date.now() > deadline) break;
        if (tAddr === address || visitedAddresses.has(tAddr)) continue;
        const beta = tVol / vols2.totalVolume;
        const pathShare = alpha * beta;
        const secT = await this.getAddressSecurityCached(tAddr);
        const txsT =
          await this.transactionAnalyzer.fetchAddressTransactions(tAddr);
        const decayT = Math.exp(
          -TAINT_TIME_DECAY_LAMBDA *
            TransactionAnalyzer.lastActivityDaysFromTransactions(txsT)
        );
        const packedT = this.resolveCounterpartyEntityFromTxs(
          tAddr,
          secT,
          txsT,
          pathShare
        );
        const entityT = packedT.resolution.entity;
        const rwT = getEntityRiskWeight(entityT);
        cumulativeTaintRaw += pathShare * rwT * taintHopWeight(2) * decayT;
        taintHints.push(
          `${(pathShare * 100).toFixed(2)}% path via ${entityT} (hop 2)`
        );
        if (
          isAmlRiskyCounterparty({
            address: tAddr,
            entity: entityT,
            flags: [],
            entityRiskWeight: rwT,
          })
        ) {
          riskyIncomingVolume += tVol;
        }
      }
    }

    if (MAX_TAINT_HOPS >= 3 && Date.now() < deadline) {
      const hop3Seeds = hop1ForDeep.slice(0, 4);
      for (const h1 of hop3Seeds) {
        if (Date.now() > deadline) break;
        const vols2 = await this.transactionAnalyzer.fetchTRC20IncomingVolumes(
          h1.cp
        );
        if (vols2.totalVolume <= 0) continue;
        const alpha = h1.incomingVolume / totalVolume;
        const topT = Array.from(vols2.volumeByCounterparty.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        for (const [tAddr, tVol] of topT) {
          if (Date.now() > deadline) break;
          const beta = tVol / vols2.totalVolume;
          const vols3 =
            await this.transactionAnalyzer.fetchTRC20IncomingVolumes(tAddr);
          if (vols3.totalVolume <= 0) continue;
          const topU = Array.from(vols3.volumeByCounterparty.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
          for (const [uAddr, uVol] of topU) {
            if (Date.now() > deadline) break;
            if (uAddr === address || visitedAddresses.has(uAddr)) continue;
            const gamma = uVol / vols3.totalVolume;
            const pathShare = alpha * beta * gamma;
            const secU = await this.getAddressSecurityCached(uAddr);
            const txsU =
              await this.transactionAnalyzer.fetchAddressTransactions(uAddr);
            const decayU = Math.exp(
              -TAINT_TIME_DECAY_LAMBDA *
                TransactionAnalyzer.lastActivityDaysFromTransactions(txsU)
            );
            const packedU = this.resolveCounterpartyEntityFromTxs(
              uAddr,
              secU,
              txsU,
              pathShare
            );
            const entityU = packedU.resolution.entity;
            const rwU = getEntityRiskWeight(entityU);
            cumulativeTaintRaw += pathShare * rwU * taintHopWeight(3) * decayU;
            taintHints.push(
              `${(pathShare * 100).toFixed(3)}% path via ${entityU} (hop 3)`
            );
          }
        }
      }
    }

    taintPercent =
      totalVolume > 0
        ? Math.round((riskyIncomingVolume / totalVolume) * 10000) / 100
        : 0;

    const normalizedTaint = Math.min(
      1,
      1 - Math.exp(-cumulativeTaintRaw * TAINT_EXP_K)
    );
    taintScore = Math.round(normalizedTaint * 10000) / 100;
    if (taintPercent > 0 && taintPercent < 6) {
      taintScore = Math.min(
        100,
        taintScore + taintPercent * SMALL_TAINT_PERCENT_MULTIPLIER
      );
      taintScore = Math.round(taintScore * 100) / 100;
    }

    behavioralScore = computeBehavioralPatternScore(patterns);
    volumeScore = getVolumeScore(stablecoinIncomingVolume);

    const aml = this.advancedRiskCalculator.calculate({
      baseRisk: baseRiskScore,
      taintScore,
      behavioralScore,
      volumeScore,
      patterns,
      taintHints,
      trustedShare01,
      dangerousShare01,
    });

    const trustCal = applyTrustedShareScoreCalibration({
      preliminaryScore: aml.score,
      trustedShare01,
      dangerousShare01,
    });
    finalRiskScore = trustCal.score;

    const counterpartyBuckets =
      taintBreakdownRows.length > 0
        ? [...taintBreakdownRows]
            .sort((a, b) => b.volumeShare - a.volumeShare)
            .slice(0, 12)
            .map(r => ({
              address: r.counterpartyAddress,
              bucket: classifySourceBucket({
                address: r.counterpartyAddress,
                entity: r.entity,
                flags: r.flags,
                blacklistCategory: r.blacklistCategory,
                exchangeLikeFallback: r.exchangeLikeFallback,
                graphLinkedToWhitelistedExchange:
                  r.graphLinkedToWhitelistedExchange,
                candidateSignalExchangeInfra: r.candidateSignalExchangeInfra,
                securityTags: r.securityTags,
              }),
              volumeSharePercent: Math.round(r.volumeShare * 10000) / 100,
            }))
        : undefined;

    const sourceFlowCalibration: SourceFlowCalibration | undefined =
      taintBreakdownRows.length > 0
        ? {
            trustedShare: Math.round(trustedShare01 * 10000) / 100,
            suspiciousShare: Math.round(suspiciousShare01 * 10000) / 100,
            dangerousShare: Math.round(dangerousShare01 * 10000) / 100,
            exchangeShare: Math.round(exchangeShare01 * 10000) / 100,
            whitelistMatchedCount: whitelistMatchedHop1,
            trustedSuppressionApplied:
              trustCal.trustLayerApplied || aml.behavioralTrustMultiplier < 1,
            trustedSuppressionFactor: trustCal.trustLayerFactor,
            behavioralTrustMultiplier: aml.behavioralTrustMultiplier,
            dangerousUplift: trustCal.dangerousUplift,
            amlWeightedBlendScore: aml.score,
            counterpartyBuckets,
          }
        : undefined;

    const explanation = [...aml.explanation, ...trustCal.explanationLines];
    const explanationDedup = [...new Set(explanation)].slice(0, 14);

    return {
      finalRiskScore,
      flagsFromOtherHops,
      hopEntityFlags,
      stablecoinIncomingVolume,
      riskyIncomingVolume,
      taintPercent,
      topRiskyCounterparties,
      taintCalculationStats,
      taintScore,
      behavioralScore,
      volumeScore,
      taintInput,
      stablecoinSofWarning,
      stablecoinSofDataSource,
      explanation: explanationDedup,
      taintBreakdownRows:
        taintBreakdownRows.length > 0 ? taintBreakdownRows : undefined,
      sourceFlowCalibration,
      sourceOfFundsSampleDebug,
    };
  }
}

export const addressCheckService = new AddressCheckService();
