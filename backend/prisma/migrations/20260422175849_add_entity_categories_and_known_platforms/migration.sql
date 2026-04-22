-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BlacklistCategory" ADD VALUE 'GAMBLING';
ALTER TYPE "BlacklistCategory" ADD VALUE 'HIGH_RISK_EXCHANGE';
ALTER TYPE "BlacklistCategory" ADD VALUE 'TERRORIST_FINANCING';
ALTER TYPE "BlacklistCategory" ADD VALUE 'CHILD_EXPLOITATION';

-- CreateTable
CREATE TABLE "known_platforms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "BlacklistCategory" NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'TRON',
    "contractAddresses" TEXT[],
    "hotWalletAddresses" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "known_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "known_platforms_category_idx" ON "known_platforms"("category");

-- CreateIndex
CREATE INDEX "known_platforms_chain_idx" ON "known_platforms"("chain");

-- CreateIndex
CREATE UNIQUE INDEX "known_platforms_name_chain_key" ON "known_platforms"("name", "chain");
