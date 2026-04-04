import type { CrawlSeedKind, EntityType } from '@prisma/client';

/**
 * TODO(multi-chain): pass `chain` through all public APIs; default `tron` for now.
 */
export type CrawlerChainId = 'tron';

export interface CrawlerSignalInput {
  rootConfidence: number;
  /** counterpartyVolume / totalRootObservedVolume */
  share: number;
  counterpartyVolume: number;
  txCount: number;
  /** Hops from the risky seed to the current crawl root (0 = seed). Counterparty is +1 in minHop. */
  hopDepth: number;
}

export interface CrawlerEnqueueInput {
  address: string;
  /** Defaults to `tron`. */
  chain?: string;
  seedKind: CrawlSeedKind;
  hopFromRiskyRoot: number;
  /** Optional; derived from seed kind if omitted. */
  priority?: number;
  /** If set, schedules this run time unless an existing row has sooner high-priority work. */
  nextRunAt?: Date;
  rootConfidence?: number;
}

export interface InfrastructureCandidateInput {
  address: string;
  aggregatedConfidence: number;
  minHopToRiskyRoot: number;
  interactionCount: number;
  totalRiskVolume: number;
  uniqueCounterpartyCount: number;
  maxObservedShare: number;
  entityType: EntityType | null | undefined;
  /** Optional tags from future providers (exchange, bridge, …). */
  externalTags?: string[];
  /** Latest contributing edge (this observation). */
  edge?: {
    share: number;
    volume: number;
    txCount: number;
  };
}

export interface GraphCrawlerBatchResult {
  claimed: number;
  processed: number;
  failures: number;
  edgesUpserted: number;
  candidatesTouched: number;
  promoted: number;
  skippedInfrastructure: number;
}
