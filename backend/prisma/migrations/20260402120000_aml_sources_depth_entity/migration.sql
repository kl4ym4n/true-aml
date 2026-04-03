-- New blacklist categories (AML priority model)
ALTER TYPE "BlacklistCategory" ADD VALUE 'STOLEN_FUNDS';
ALTER TYPE "BlacklistCategory" ADD VALUE 'RANSOM';
ALTER TYPE "BlacklistCategory" ADD VALUE 'DARK_MARKET';

-- Entity classification (separate from category over time)
CREATE TYPE "EntityType" AS ENUM ('exchange', 'mixer', 'bridge', 'lp', 'unknown');

-- AlterTable
ALTER TABLE "blacklisted_addresses" ADD COLUMN "depth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "blacklisted_addresses" ADD COLUMN "entityType" "EntityType";
ALTER TABLE "blacklisted_addresses" ADD COLUMN "sourcesJson" JSONB;

-- Preserve full provenance (no 255-char truncation)
ALTER TABLE "blacklisted_addresses" ALTER COLUMN "source" TYPE TEXT;

CREATE INDEX "blacklisted_addresses_depth_idx" ON "blacklisted_addresses"("depth");
