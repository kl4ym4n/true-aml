-- Extend EntityType for AML entity layer; store multi-root graph contributors on candidates.

ALTER TYPE "EntityType" ADD VALUE 'liquidity_pool';
ALTER TYPE "EntityType" ADD VALUE 'payment_processor';

ALTER TABLE "candidate_signals" ADD COLUMN "riskyContributorRoots" JSONB;
