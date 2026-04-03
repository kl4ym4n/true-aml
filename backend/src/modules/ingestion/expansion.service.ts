import type { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  LruCache,
  mapWithConcurrency,
} from '../address-check/address-check.utils';
import { TransactionAnalyzer } from '../address-check/address-check.transaction-analyzer';
import { BlockchainClientFactory } from '../../lib/clients';
import { env } from '../../config/env';
import {
  computeDerivedExpansionConfidence,
  mergeCategoryForExpansion,
} from './ingestion.utils';
import {
  derivedProvenanceEntry,
  mergeSourceProvenance,
  provenanceEntriesFromJson,
  sourcesSummary,
} from './source-provenance';

/** First hop from a non-derived expansion root. */
const COUNTERPARTY_HOP_DEPTH = 1;

export interface ExpansionRunResult {
  scannedRoots: number;
  expandedRoots: number;
  derivedUpserted: number;
  skippedNoVolumes: number;
  skippedExistingDirect: number;
}

export class ExpansionService {
  private readonly txAnalyzer: TransactionAnalyzer;
  private readonly expansionCache = new LruCache<
    string,
    { expandedAt: number }
  >(50_000);

  constructor() {
    const client = BlockchainClientFactory.getClient(
      env.blockchainProvider || 'auto'
    );
    this.txAnalyzer = new TransactionAnalyzer(client);
  }

  async expandOnce(input?: {
    rootBatchSize?: number;
    topK?: number;
    minVolume?: number;
    minShare?: number;
    concurrency?: number;
    reexpandTtlMs?: number;
  }): Promise<ExpansionRunResult> {
    const rootBatchSize = input?.rootBatchSize ?? 200;
    const topK = input?.topK ?? 20;
    const minVolume = input?.minVolume ?? 50;
    const minShare = input?.minShare ?? 0.03;
    const concurrency = input?.concurrency ?? 5;
    const reexpandTtlMs = input?.reexpandTtlMs ?? 6 * 60 * 60 * 1000;

    const roots = await prisma.blacklistedAddress.findMany({
      where: { isDerived: false },
      orderBy: { updatedAt: 'desc' },
      take: rootBatchSize,
    });

    let expandedRoots = 0;
    let derivedUpserted = 0;
    let skippedNoVolumes = 0;
    let skippedExistingDirect = 0;

    await mapWithConcurrency(roots, concurrency, async root => {
      const cached = this.expansionCache.get(root.address);
      if (cached && Date.now() - cached.expandedAt < reexpandTtlMs) return;

      const incoming = await this.txAnalyzer.fetchTRC20IncomingVolumes(
        root.address
      );
      const outgoing = await this.txAnalyzer.fetchTRC20OutgoingVolumes(
        root.address
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
        root.address,
        { onlyIncoming: false }
      );
      const rootLower = root.address.toLowerCase();
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

      const totalVolume = Array.from(combined.values()).reduce(
        (a, b) => a + b,
        0
      );

      if (totalVolume === 0) {
        skippedNoVolumes++;
        this.expansionCache.set(root.address, { expandedAt: Date.now() });
        return;
      }

      const entries = Array.from(combined.entries())
        .map(([address, volume]) => ({
          address,
          volume,
          share: volume / totalVolume,
          txCount: txCountByCounterparty.get(address) ?? 1,
        }))
        .filter(x => x.volume >= minVolume && x.share >= minShare)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, topK);

      if (entries.length === 0) {
        skippedNoVolumes++;
        this.expansionCache.set(root.address, { expandedAt: Date.now() });
        return;
      }

      const candidateAddresses = entries.map(e => e.address);
      const existingRows = await prisma.blacklistedAddress.findMany({
        where: { address: { in: candidateAddresses } },
      });
      const existingByAddress = new Map(
        existingRows.map(r => [r.address, r])
      );

      const rootConfidence = root.confidence ?? root.riskScore / 100;

      const ops = entries.map(
        async ({ address, volume, share, txCount }) => {
          const existing = existingByAddress.get(address);

          if (existing && !existing.isDerived) {
            skippedExistingDirect++;
            return 0;
          }

          const derivedConfidence = computeDerivedExpansionConfidence({
            rootConfidence,
            share,
            volume,
            txCount,
            depth: COUNTERPARTY_HOP_DEPTH,
          });

          const nextCategory = mergeCategoryForExpansion({ existing });
          const nextConfidence = existing
            ? Math.max(existing.confidence ?? 0, derivedConfidence)
            : derivedConfidence;

          const prov = derivedProvenanceEntry({
            rootAddress: root.address,
            rootSource: root.source,
            confidenceContribution: derivedConfidence,
          });
          const nextSourcesJson = mergeSourceProvenance(
            existing?.sourcesJson,
            [prov]
          );
          const nextSourceSummary = sourcesSummary(
            provenanceEntriesFromJson(
              nextSourcesJson as unknown as Prisma.JsonValue
            )
          );

          const nextIsDerived = true;
          const nextDerivedFrom =
            existing?.derivedFrom ?? root.address;
          const nextDepth = existing
            ? Math.max(existing.depth ?? 0, COUNTERPARTY_HOP_DEPTH)
            : COUNTERPARTY_HOP_DEPTH;

          await prisma.blacklistedAddress.upsert({
            where: { address },
            create: {
              address,
              category: nextCategory,
              confidence: nextConfidence,
              riskScore: Math.round(nextConfidence * 100),
              source: nextSourceSummary,
              sourcesJson: nextSourcesJson,
              depth: nextDepth,
              entityType: null,
              isDerived: nextIsDerived,
              derivedFrom: nextDerivedFrom,
            },
            update: {
              category: nextCategory,
              confidence: nextConfidence,
              riskScore: Math.round(nextConfidence * 100),
              source: nextSourceSummary,
              sourcesJson: nextSourcesJson,
              depth: nextDepth,
              isDerived: nextIsDerived,
              derivedFrom: nextDerivedFrom,
            },
          });
          return 1;
        }
      );

      const counts = await Promise.all(ops);
      derivedUpserted += counts.reduce<number>((a, b) => a + b, 0);

      expandedRoots++;
      this.expansionCache.set(root.address, { expandedAt: Date.now() });
    });

    return {
      scannedRoots: roots.length,
      expandedRoots,
      derivedUpserted,
      skippedNoVolumes,
      skippedExistingDirect,
    };
  }
}
