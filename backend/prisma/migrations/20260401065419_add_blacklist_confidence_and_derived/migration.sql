-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BlacklistCategory" ADD VALUE 'PHISHING';
ALTER TYPE "BlacklistCategory" ADD VALUE 'SUSPICIOUS';

-- AlterTable
ALTER TABLE "blacklisted_addresses" ADD COLUMN     "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "derivedFrom" VARCHAR(255),
ADD COLUMN     "isDerived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "blacklisted_addresses_confidence_idx" ON "blacklisted_addresses"("confidence");

-- CreateIndex
CREATE INDEX "blacklisted_addresses_isDerived_idx" ON "blacklisted_addresses"("isDerived");
