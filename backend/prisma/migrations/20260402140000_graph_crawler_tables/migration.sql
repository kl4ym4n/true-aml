-- Graph crawler subsystem: queue, edges, candidate signals (additive).
--
-- Apply after migrations that define "EntityType" (see 20260402120000_aml_sources_depth_entity).
-- Deploy: `cd backend && DATABASE_URL=... npx prisma migrate deploy`
-- Dev: `npx prisma migrate dev` (or run this SQL manually if you squash migrations).

CREATE TYPE "CrawlQueueStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
CREATE TYPE "CrawlSeedKind" AS ENUM ('DIRECT_STRONG', 'DERIVED_SUSPICIOUS', 'OBSERVED_LOW');

CREATE TABLE "crawl_queue" (
    "id" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "chain" VARCHAR(32) NOT NULL DEFAULT 'tron',
    "status" "CrawlQueueStatus" NOT NULL DEFAULT 'PENDING',
    "seedKind" "CrawlSeedKind" NOT NULL DEFAULT 'OBSERVED_LOW',
    "priority" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hopFromRiskyRoot" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRunAt" TIMESTAMP(3),
    "lastCompletedAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crawl_queue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crawl_queue_address_chain_key" ON "crawl_queue"("address", "chain");
CREATE INDEX "crawl_queue_status_nextRunAt_idx" ON "crawl_queue"("status", "nextRunAt");
CREATE INDEX "crawl_queue_priority_idx" ON "crawl_queue"("priority" DESC);

CREATE TABLE "address_edges" (
    "id" TEXT NOT NULL,
    "rootAddress" VARCHAR(42) NOT NULL,
    "counterpartyAddress" VARCHAR(42) NOT NULL,
    "chain" VARCHAR(32) NOT NULL DEFAULT 'tron',
    "totalVolume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "txCount" INTEGER NOT NULL DEFAULT 0,
    "share" DOUBLE PRECISION,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "address_edges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "address_edges_rootAddress_counterpartyAddress_chain_key" ON "address_edges"("rootAddress", "counterpartyAddress", "chain");
CREATE INDEX "address_edges_counterpartyAddress_idx" ON "address_edges"("counterpartyAddress");

CREATE TABLE "candidate_signals" (
    "id" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "chain" VARCHAR(32) NOT NULL DEFAULT 'tron',
    "aggregatedConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minHopToRiskyRoot" INTEGER NOT NULL DEFAULT 999,
    "interactionCount" INTEGER NOT NULL DEFAULT 0,
    "totalRiskVolume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "uniqueCounterpartyCount" INTEGER NOT NULL DEFAULT 0,
    "maxObservedShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "primaryRootAddress" VARCHAR(42),
    "hopDepth" INTEGER NOT NULL DEFAULT 0,
    "entityType" "EntityType",
    "isInfrastructure" BOOLEAN NOT NULL DEFAULT false,
    "sourcesJson" JSONB,
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_signals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "candidate_signals_address_key" ON "candidate_signals"("address");
CREATE INDEX "candidate_signals_aggregatedConfidence_idx" ON "candidate_signals"("aggregatedConfidence");
CREATE INDEX "candidate_signals_promotedAt_idx" ON "candidate_signals"("promotedAt");
CREATE INDEX "candidate_signals_isInfrastructure_idx" ON "candidate_signals"("isInfrastructure");
