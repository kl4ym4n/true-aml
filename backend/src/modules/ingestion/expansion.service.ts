import prisma from '../../config/database';
import {
  LruCache,
  mapWithConcurrency,
} from '../address-check/address-check.utils';
import { TransactionAnalyzer } from '../address-check/address-check.transaction-analyzer';
import { BlockchainClientFactory } from '../../lib/clients';
import { env } from '../../config/env';
import { pickStrongerCategory } from './ingestion.utils';

export interface ExpansionRunResult {
  scannedRoots: number;
  expandedRoots: number;
  derivedUpserted: number;
  skippedNoVolumes: number;
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
    const minShare = input?.minShare ?? 0.03; // 3%
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

    await mapWithConcurrency(roots, concurrency, async root => {
      const cached = this.expansionCache.get(root.address);
      if (cached && Date.now() - cached.expandedAt < reexpandTtlMs) return;

      // 🔹 BOTH directions
      const incoming = await this.txAnalyzer.fetchTRC20IncomingVolumes(
        root.address
      );
      const outgoing = await this.txAnalyzer.fetchTRC20OutgoingVolumes(
        root.address
      );

      const combined = new Map<string, number>();
      const txCountByCounterparty = new Map<string, number>();

      // merge incoming
      for (const [addr, vol] of incoming.volumeByCounterparty.entries()) {
        combined.set(addr, (combined.get(addr) || 0) + vol);
      }

      // merge outgoing
      for (const [addr, vol] of outgoing.volumeByCounterparty.entries()) {
        combined.set(addr, (combined.get(addr) || 0) + vol);
      }

      // (6) interaction-based signal: approximate tx count by scanning recent txs (both directions)
      const recentTxs = await this.txAnalyzer.fetchAddressTransactions(
        root.address,
        {
          onlyIncoming: false,
        }
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

      const ops = entries.map(async ({ address, volume, txCount }) => {
        const rootConfidence = root.confidence ?? root.riskScore / 100;

        // (3) Improved expansion confidence
        const volumeWeight = Math.min(1, volume / 10_000);
        let derivedConfidence = rootConfidence * 0.5 * volumeWeight;

        // (6) Interaction-based boost for repeated interactions
        const interactionScore = Math.min(
          1,
          Math.log1p(txCount) / Math.log1p(20)
        );
        derivedConfidence = Math.min(
          1,
          derivedConfidence * (1 + 0.25 * interactionScore)
        );

        const existing = await prisma.blacklistedAddress.findUnique({
          where: { address },
        });

        const nextCategory = existing
          ? pickStrongerCategory(existing.category, root.category)
          : root.category;
        const nextConfidence = existing
          ? Math.max(existing.confidence ?? 0, derivedConfidence)
          : derivedConfidence;

        const nextIsDerived = existing ? existing.isDerived || true : true;
        const nextDerivedFrom =
          existing && existing.derivedFrom
            ? existing.derivedFrom
            : root.address;

        return prisma.blacklistedAddress.upsert({
          where: { address },
          create: {
            address,
            category: nextCategory,
            confidence: nextConfidence,
            riskScore: Math.round(nextConfidence * 100),
            source: `derived:${root.source}`,
            isDerived: nextIsDerived,
            derivedFrom: nextDerivedFrom,
          },
          update: {
            category: nextCategory,
            confidence: nextConfidence,
            riskScore: Math.round(nextConfidence * 100),
            source: `derived:${root.source}`,
            isDerived: nextIsDerived,
            derivedFrom: nextDerivedFrom,
          },
        });
      });

      const results = await Promise.all(ops);
      derivedUpserted += results.filter(Boolean).length;

      expandedRoots++;
      this.expansionCache.set(root.address, { expandedAt: Date.now() });
    });

    return {
      scannedRoots: roots.length,
      expandedRoots,
      derivedUpserted,
      skippedNoVolumes,
    };
  }
}
