import { randomUUID } from 'node:crypto';
import type { BlacklistedAddress, CrawlQueue, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { env } from '../../config/env';
import { BlockchainClientFactory } from '../../lib/clients';
import { mapWithConcurrency } from '../address-check/address-check.utils';
import { TransactionAnalyzer } from '../address-check/address-check.transaction-analyzer';
import { getWhitelistLevel } from '../address-check/address-check.utils/whitelist';
import {
  combineConfidenceProbabilistic,
  computeCrawlerSignalConfidence,
  failureBackoffMs,
  isLikelyInfrastructureCandidate,
  preferStrongerCrawlSeedKind,
  queuePriorityForSeed,
  recrawlIntervalMsForSeedKind,
  suggestEntityTypeFromHeuristics,
} from './crawler.helpers';
import type { CrawlerEnqueueInput, GraphCrawlerBatchResult } from './crawler.types';
import { mergeCategoryForExpansion } from './ingestion.utils';
import { LruCache } from '../address-check/address-check.utils/lru-cache';
import {
  graphCrawlerProvenanceEntry,
  mergeSourceProvenance,
  provenanceEntriesFromJson,
  sourcesSummary,
} from './source-provenance';

const DEFAULT_CHAIN = 'tron';

export class GraphCrawlerService {
  private readonly txAnalyzer: TransactionAnalyzer;
  /** Hot blacklist rows during one batch (avoids repeat DB reads for same root). */
  private readonly blacklistCache = new LruCache<string, BlacklistedAddress | null>(25_000);

  constructor() {
    const client = BlockchainClientFactory.getClient(
      env.blockchainProvider || 'auto'
    );
    this.txAnalyzer = new TransactionAnalyzer(client);
  }

  /**
   * One scheduler tick: claim work, crawl with bounded concurrency, then promote.
   */
  async runBatch(): Promise<GraphCrawlerBatchResult> {
    const cfg = env.crawler;
    const out: GraphCrawlerBatchResult = {
      claimed: 0,
      processed: 0,
      failures: 0,
      edgesUpserted: 0,
      candidatesTouched: 0,
      promoted: 0,
      skippedInfrastructure: 0,
    };

    if (!cfg.enabled) {
      return out;
    }

    await this.reclaimStaleLocks();
    const batchId = randomUUID();
    const claimed = await this.claimBatch();
    out.claimed = claimed.length;
    if (claimed.length === 0) {
      const pr = await this.promoteCandidates({ batchId });
      out.promoted = pr.promoted;
      out.skippedInfrastructure = pr.skippedInfrastructure;
      return out;
    }

    this.blacklistCache.clear();

    const results = await mapWithConcurrency(
      claimed,
      cfg.concurrency,
      async item => {
        try {
          const r = await this.processQueueItem(item, batchId);
          await this.completeQueueItemSuccess(item);
          return r;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[GraphCrawler] queue item failed', {
            address: item.address,
            error: err instanceof Error ? err.message : String(err),
          });
          await this.completeQueueItemFailure(item, err);
          return {
            ok: false as const,
            edges: 0,
            candidates: 0,
          };
        }
      }
    );

    for (const r of results) {
      if (r.ok) {
        out.processed++;
        out.edgesUpserted += r.edges;
        out.candidatesTouched += r.candidates;
      } else {
        out.failures++;
      }
    }

    const pr = await this.promoteCandidates({ batchId });
    out.promoted = pr.promoted;
    out.skippedInfrastructure = pr.skippedInfrastructure;
    return out;
  }

  async promoteCandidates(input: {
    batchId: string;
  }): Promise<{ promoted: number; skippedInfrastructure: number }> {
    const cfg = env.crawler;
    if (!cfg.enabled) {
      return { promoted: 0, skippedInfrastructure: 0 };
    }

    let promoted = 0;
    let skippedInfrastructure = 0;

    const candidates = await prisma.candidateSignal.findMany({
      where: {
        promotedAt: null,
        isInfrastructure: false,
        aggregatedConfidence: { gte: cfg.promotionThreshold },
        minHopToRiskyRoot: { lte: cfg.maxHop },
        OR: [
          { interactionCount: { gte: 2 } },
          { totalRiskVolume: { gte: cfg.minPromotionVolume } },
        ],
      },
      take: 500,
      orderBy: { aggregatedConfidence: 'desc' },
    });

    await mapWithConcurrency(candidates, 2, async c => {
      if (
        isLikelyInfrastructureCandidate({
          address: c.address,
          aggregatedConfidence: c.aggregatedConfidence,
          minHopToRiskyRoot: c.minHopToRiskyRoot,
          interactionCount: c.interactionCount,
          totalRiskVolume: c.totalRiskVolume,
          uniqueCounterpartyCount: c.uniqueCounterpartyCount,
          maxObservedShare: c.maxObservedShare,
          entityType: c.entityType,
        })
      ) {
        await prisma.candidateSignal.update({
          where: { id: c.id },
          data: {
            isInfrastructure: true,
            entityType:
              c.entityType ??
              suggestEntityTypeFromHeuristics({
                isWhitelistedExchange: getWhitelistLevel(c.address) === 'strong',
              }),
          },
        });
        skippedInfrastructure++;
        return;
      }

      const existing = await prisma.blacklistedAddress.findUnique({
        where: { address: c.address },
      });

      if (existing && !existing.isDerived) {
        return;
      }

      const rootForProv = c.primaryRootAddress ?? 'unknown';
      const prov = graphCrawlerProvenanceEntry({
        rootAddress: rootForProv,
        signalConfidence: c.aggregatedConfidence,
        batchId: input.batchId,
      });
      const mergedJson = mergeSourceProvenance(
        existing?.sourcesJson,
        [prov]
      ) as Prisma.InputJsonValue;
      const nextSummary = sourcesSummary(
        provenanceEntriesFromJson(mergedJson as Prisma.JsonValue)
      );

      const nextCategory = mergeCategoryForExpansion({
        existing: existing ?? undefined,
      });
      const nextConfidence = existing
        ? combineConfidenceProbabilistic(
            existing.confidence ?? 0,
            c.aggregatedConfidence
          )
        : c.aggregatedConfidence;
      const nextRisk = Math.round(Math.min(1, Math.max(0, nextConfidence)) * 100);
      const derivedFrom = c.primaryRootAddress ?? rootForProv;

      await prisma.blacklistedAddress.upsert({
        where: { address: c.address },
        create: {
          address: c.address,
          category: 'SUSPICIOUS',
          confidence: nextConfidence,
          riskScore: nextRisk,
          source: nextSummary,
          sourcesJson: mergedJson,
          depth: Math.max(0, c.minHopToRiskyRoot),
          entityType: c.entityType,
          isDerived: true,
          derivedFrom,
        },
        update: {
          category: nextCategory,
          confidence: nextConfidence,
          riskScore: nextRisk,
          source: nextSummary,
          sourcesJson: mergedJson,
          depth: Math.max(existing?.depth ?? 0, c.minHopToRiskyRoot),
          isDerived: true,
          derivedFrom: existing?.derivedFrom ?? derivedFrom,
          entityType: c.entityType ?? existing?.entityType,
        },
      });

      await prisma.candidateSignal.update({
        where: { id: c.id },
        data: { promotedAt: new Date() },
      });
      promoted++;
    });

    return { promoted, skippedInfrastructure };
  }

  /**
   * Enqueue high-trust seeds after ingestion (OFAC, etc.). Idempotent per address+chain.
   */
  async enqueueStrongSeedsFromBlacklist(opts?: {
    limit?: number;
  }): Promise<{ enqueued: number }> {
    if (!env.crawler.enabled || !env.crawler.enqueueAfterIngestion) {
      return { enqueued: 0 };
    }

    const rows = await prisma.blacklistedAddress.findMany({
      where: {
        isDerived: false,
        category: {
          in: [
            'SANCTION',
            'STOLEN_FUNDS',
            'RANSOM',
            'DARK_MARKET',
            'SCAM',
            'PHISHING',
          ],
        },
      },
      take: opts?.limit ?? 500,
      orderBy: { updatedAt: 'desc' },
    });

    let enqueued = 0;
    for (const r of rows) {
      const did = await this.enqueueAddress({
        address: r.address,
        chain: DEFAULT_CHAIN,
        seedKind: 'DIRECT_STRONG',
        hopFromRiskyRoot: 0,
        priority: queuePriorityForSeed('DIRECT_STRONG', r.confidence ?? undefined),
        rootConfidence: r.confidence ?? undefined,
      });
      if (did) enqueued++;
    }
    return { enqueued };
  }

  /** Optional: enqueue derived addresses from expansion for deeper hops. */
  async enqueueFromExpansionAddresses(
    addresses: string[],
    hopFromRiskyRoot: number
  ): Promise<number> {
    if (
      !env.crawler.enabled ||
      !env.crawler.enqueueFromExpansion ||
      hopFromRiskyRoot >= env.crawler.maxHop
    ) {
      return 0;
    }

    let n = 0;
    for (const address of addresses) {
      const did = await this.enqueueAddress({
        address,
        chain: DEFAULT_CHAIN,
        seedKind: 'DERIVED_SUSPICIOUS',
        hopFromRiskyRoot,
        priority: queuePriorityForSeed('DERIVED_SUSPICIOUS'),
      });
      if (did) n++;
    }
    return n;
  }

  async enqueueAddress(input: CrawlerEnqueueInput): Promise<boolean> {
    const cfg = env.crawler;
    if (!cfg.enabled) return false;

    const chain = input.chain ?? DEFAULT_CHAIN;
    const priority =
      input.priority ??
      queuePriorityForSeed(input.seedKind, input.rootConfidence);
    const nextRunAt = input.nextRunAt ?? new Date();

    const existing = await prisma.crawlQueue.findUnique({
      where: { address_chain: { address: input.address, chain } },
    });

    if (!existing) {
      await prisma.crawlQueue.create({
        data: {
          address: input.address,
          chain,
          seedKind: input.seedKind,
          hopFromRiskyRoot: input.hopFromRiskyRoot,
          priority,
          nextRunAt,
          status: 'PENDING',
        },
      });
      return true;
    }

    const soonMs = 5 * 60_000;
    if (
      existing.status === 'PENDING' &&
      existing.nextRunAt.getTime() - Date.now() > soonMs &&
      priority <= existing.priority
    ) {
      return false;
    }

    await prisma.crawlQueue.update({
      where: { id: existing.id },
      data: {
        priority: Math.max(existing.priority, priority),
        seedKind: preferStrongerCrawlSeedKind(existing.seedKind, input.seedKind),
        hopFromRiskyRoot: Math.min(
          existing.hopFromRiskyRoot,
          input.hopFromRiskyRoot
        ),
        nextRunAt:
          nextRunAt < existing.nextRunAt ? nextRunAt : existing.nextRunAt,
      },
    });
    return true;
  }

  private async reclaimStaleLocks(): Promise<void> {
    const cfg = env.crawler;
    const cutoff = new Date(Date.now() - cfg.staleLockMinutes * 60_000);
    const r = await prisma.crawlQueue.updateMany({
      where: {
        status: 'PROCESSING',
        lockedAt: { lt: cutoff },
      },
      data: {
        status: 'PENDING',
        lockedAt: null,
      },
    });
    if (r.count > 0) {
      // eslint-disable-next-line no-console
      console.warn('[GraphCrawler] reclaimed stale PROCESSING rows', {
        count: r.count,
      });
    }
  }

  private async claimBatch(): Promise<CrawlQueue[]> {
    const cfg = env.crawler;
    const now = new Date();
    return prisma.$transaction(async tx => {
      const rows = await tx.crawlQueue.findMany({
        where: { status: 'PENDING', nextRunAt: { lte: now } },
        orderBy: [{ priority: 'desc' }, { nextRunAt: 'asc' }],
        take: cfg.batchSize,
      });
      if (rows.length === 0) return [];
      await tx.crawlQueue.updateMany({
        where: { id: { in: rows.map(r => r.id) } },
        data: { status: 'PROCESSING', lockedAt: now, lastRunAt: now },
      });
      return rows;
    });
  }

  private async completeQueueItemSuccess(item: CrawlQueue): Promise<void> {
    const cfg = env.crawler;
    const rootRow = await this.getBlacklistRowCached(item.address);
    const rootConf =
      rootRow != null
        ? (rootRow.confidence ?? (rootRow.riskScore ?? 0) / 100)
        : 0.45;

    const interval = recrawlIntervalMsForSeedKind(item.seedKind, {
      directRecrawlHours: cfg.directRecrawlHours,
      derivedRecrawlHours: cfg.derivedRecrawlHours,
      lowConfidenceRecrawlHours: cfg.lowConfidenceRecrawlHours,
      rootConfidence: rootConf,
    });

    await prisma.crawlQueue.update({
      where: { id: item.id },
      data: {
        status: 'PENDING',
        consecutiveFailures: 0,
        lastError: null,
        lastCompletedAt: new Date(),
        nextRunAt: new Date(Date.now() + interval),
        lockedAt: null,
      },
    });
  }

  private async completeQueueItemFailure(
    item: CrawlQueue,
    err: unknown
  ): Promise<void> {
    const cfg = env.crawler;
    const backoff = failureBackoffMs(
      item.consecutiveFailures + 1,
      cfg.failureBackoffBaseMinutes,
      cfg.failureBackoffMaxMinutes
    );
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.crawlQueue.update({
      where: { id: item.id },
      data: {
        status: 'PENDING',
        consecutiveFailures: item.consecutiveFailures + 1,
        lastError: msg.slice(0, 2000),
        nextRunAt: new Date(Date.now() + backoff),
        lockedAt: null,
      },
    });
  }

  private async getBlacklistRowCached(
    address: string
  ): Promise<BlacklistedAddress | null> {
    const hit = this.blacklistCache.get(address);
    if (hit !== undefined) return hit;
    const row = await prisma.blacklistedAddress.findUnique({
      where: { address },
    });
    this.blacklistCache.set(address, row);
    return row;
  }

  private async processQueueItem(
    item: CrawlQueue,
    batchId: string
  ): Promise<{ ok: true; edges: number; candidates: number }> {
    const cfg = env.crawler;
    let edges = 0;
    let candidates = 0;

    const rootWl = getWhitelistLevel(item.address);
    if (rootWl === 'strong') {
      await this.upsertSelfInfrastructureProfile(item.address, item);
      return { ok: true, edges: 0, candidates: 1 };
    }

    const rootRow = await this.getBlacklistRowCached(item.address);
    const rootConfidence =
      rootRow != null
        ? (rootRow.confidence ?? (rootRow.riskScore ?? 0) / 100)
        : 0.45;

    const incoming = await this.txAnalyzer.fetchTRC20IncomingVolumes(
      item.address
    );
    const outgoing = await this.txAnalyzer.fetchTRC20OutgoingVolumes(
      item.address
    );

    const combined = new Map<string, number>();
    const txCountByCounterparty = new Map<string, number>();

    for (const [addr, vol] of incoming.volumeByCounterparty.entries()) {
      combined.set(addr, (combined.get(addr) || 0) + vol);
    }
    for (const [addr, vol] of outgoing.volumeByCounterparty.entries()) {
      combined.set(addr, (combined.get(addr) || 0) + vol);
    }

    const recentTxs = await this.txAnalyzer.fetchAddressTransactions(
      item.address,
      { onlyIncoming: false }
    );
    const rootLower = item.address.toLowerCase();
    for (const tx of recentTxs) {
      const from = tx.from ?? '';
      const to = tx.to ?? '';
      if (!from || !to) continue;
      if (from.toLowerCase() === rootLower) {
        txCountByCounterparty.set(
          to,
          (txCountByCounterparty.get(to) ?? 0) + 1
        );
      } else if (to.toLowerCase() === rootLower) {
        txCountByCounterparty.set(
          from,
          (txCountByCounterparty.get(from) ?? 0) + 1
        );
      }
    }

    const totalRootObservedVolume = Array.from(combined.values()).reduce(
      (a, b) => a + b,
      0
    );

    if (totalRootObservedVolume <= 0) {
      await this.upsertSelfCandidateProfile(item.address, {
        uniqueCounterpartyCount: 0,
        hopFromRiskyRoot: item.hopFromRiskyRoot,
      });
      return { ok: true, edges: 0, candidates: 1 };
    }

    const entries = Array.from(combined.entries())
      .map(([address, volume]) => ({
        address,
        volume,
        share: volume / totalRootObservedVolume,
        txCount: txCountByCounterparty.get(address) ?? 1,
      }))
      .filter(
        x =>
          x.volume >= cfg.minEdgeVolume && x.share >= cfg.minEdgeShare
      )
      .sort((a, b) => b.volume - a.volume);

    await this.upsertSelfCandidateProfile(item.address, {
      uniqueCounterpartyCount: entries.length,
      hopFromRiskyRoot: item.hopFromRiskyRoot,
    });
    candidates++;

    const cpAddresses = entries.map(e => e.address);
    const existingCandidates = await prisma.candidateSignal.findMany({
      where: { address: { in: cpAddresses } },
    });
    const candByAddr = new Map(existingCandidates.map(c => [c.address, c]));

    const counterpartyHop = item.hopFromRiskyRoot + 1;
    const hopDepthForSignal = counterpartyHop;

    for (const e of entries) {
      await prisma.addressEdge.upsert({
        where: {
          rootAddress_counterpartyAddress_chain: {
            rootAddress: item.address,
            counterpartyAddress: e.address,
            chain: item.chain,
          },
        },
        create: {
          rootAddress: item.address,
          counterpartyAddress: e.address,
          chain: item.chain,
          totalVolume: e.volume,
          txCount: e.txCount,
          share: e.share,
          lastObservedAt: new Date(),
        },
        update: {
          totalVolume: e.volume,
          txCount: e.txCount,
          share: e.share,
          lastObservedAt: new Date(),
        },
      });
      edges++;

      const signalConfidence = computeCrawlerSignalConfidence({
        rootConfidence,
        share: e.share,
        counterpartyVolume: e.volume,
        txCount: e.txCount,
        hopDepth: hopDepthForSignal,
      });

      const existing = candByAddr.get(e.address);
      const newAgg = combineConfidenceProbabilistic(
        existing?.aggregatedConfidence ?? 0,
        signalConfidence
      );
      const minHop = Math.min(
        existing?.minHopToRiskyRoot ?? 999,
        counterpartyHop
      );
      const interactionCount = Math.max(
        existing?.interactionCount ?? 0,
        e.txCount
      );
      const totalRiskVolume = Math.max(
        existing?.totalRiskVolume ?? 0,
        e.volume
      );
      const maxObservedShare = Math.max(
        existing?.maxObservedShare ?? 0,
        e.share
      );

      const primaryRoot =
        !existing?.primaryRootAddress ||
        signalConfidence >= (existing.aggregatedConfidence || 0)
          ? item.address
          : existing.primaryRootAddress;

      const prov = graphCrawlerProvenanceEntry({
        rootAddress: item.address,
        signalConfidence,
        batchId,
      });
      const mergedSources = mergeSourceProvenance(
        existing?.sourcesJson,
        [prov]
      ) as Prisma.InputJsonValue;

      const cpWl = getWhitelistLevel(e.address);
      const suggestedEt = suggestEntityTypeFromHeuristics({
        isWhitelistedExchange: cpWl === 'strong',
      });

      const infra = isLikelyInfrastructureCandidate({
        address: e.address,
        aggregatedConfidence: newAgg,
        minHopToRiskyRoot: minHop,
        interactionCount,
        totalRiskVolume,
        uniqueCounterpartyCount:
          existing?.uniqueCounterpartyCount ?? 0,
        maxObservedShare,
        entityType: suggestedEt ?? existing?.entityType,
        edge: { share: e.share, volume: e.volume, txCount: e.txCount },
      });

      await prisma.candidateSignal.upsert({
        where: { address: e.address },
        create: {
          address: e.address,
          chain: item.chain,
          aggregatedConfidence: newAgg,
          minHopToRiskyRoot: minHop,
          interactionCount,
          totalRiskVolume,
          uniqueCounterpartyCount: existing?.uniqueCounterpartyCount ?? 0,
          maxObservedShare,
          primaryRootAddress: primaryRoot ?? item.address,
          hopDepth: hopDepthForSignal,
          entityType: suggestedEt ?? existing?.entityType ?? undefined,
          isInfrastructure: infra,
          sourcesJson: mergedSources,
        },
        update: {
          aggregatedConfidence: newAgg,
          minHopToRiskyRoot: minHop,
          interactionCount,
          totalRiskVolume,
          maxObservedShare,
          primaryRootAddress: primaryRoot ?? item.address,
          hopDepth: hopDepthForSignal,
          entityType: suggestedEt ?? existing?.entityType ?? undefined,
          isInfrastructure: infra,
          sourcesJson: mergedSources,
        },
      });
      candidates++;

      if (
        counterpartyHop <= cfg.maxHop &&
        !infra &&
        cpWl !== 'strong'
      ) {
        await this.enqueueAddress({
          address: e.address,
          chain: item.chain,
          seedKind: 'OBSERVED_LOW',
          hopFromRiskyRoot: counterpartyHop,
          priority: queuePriorityForSeed('OBSERVED_LOW', rootConfidence),
          rootConfidence,
        });
      }
    }

    return { ok: true, edges, candidates };
  }

  private async upsertSelfInfrastructureProfile(
    address: string,
    item: CrawlQueue
  ): Promise<void> {
    await prisma.candidateSignal.upsert({
      where: { address },
      create: {
        address,
        chain: item.chain,
        aggregatedConfidence: 0,
        minHopToRiskyRoot: item.hopFromRiskyRoot,
        isInfrastructure: true,
        entityType: 'exchange',
        uniqueCounterpartyCount: 0,
      },
      update: {
        isInfrastructure: true,
        entityType: 'exchange',
      },
    });
  }

  private async upsertSelfCandidateProfile(
    address: string,
    input: { uniqueCounterpartyCount: number; hopFromRiskyRoot: number }
  ): Promise<void> {
    const prev = await prisma.candidateSignal.findUnique({
      where: { address },
      select: { uniqueCounterpartyCount: true },
    });
    const ucs = Math.max(
      prev?.uniqueCounterpartyCount ?? 0,
      input.uniqueCounterpartyCount
    );
    await prisma.candidateSignal.upsert({
      where: { address },
      create: {
        address,
        chain: DEFAULT_CHAIN,
        uniqueCounterpartyCount: ucs,
        minHopToRiskyRoot: input.hopFromRiskyRoot,
      },
      update: {
        uniqueCounterpartyCount: ucs,
        minHopToRiskyRoot: input.hopFromRiskyRoot,
      },
    });
  }
}
