-- CreateEnum
CREATE TYPE "BlacklistCategory" AS ENUM ('SCAM', 'SANCTION', 'MIXER', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "blacklisted_addresses" (
    "id" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "category" "BlacklistCategory" NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blacklisted_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address_profiles" (
    "id" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "txCount" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "address_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_checks" (
    "id" TEXT NOT NULL,
    "txHash" VARCHAR(64) NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" "RiskLevel" NOT NULL,
    "flags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blacklisted_addresses_address_key" ON "blacklisted_addresses"("address");

-- CreateIndex
CREATE INDEX "blacklisted_addresses_address_idx" ON "blacklisted_addresses"("address");

-- CreateIndex
CREATE INDEX "blacklisted_addresses_category_idx" ON "blacklisted_addresses"("category");

-- CreateIndex
CREATE INDEX "blacklisted_addresses_riskScore_idx" ON "blacklisted_addresses"("riskScore");

-- CreateIndex
CREATE UNIQUE INDEX "address_profiles_address_key" ON "address_profiles"("address");

-- CreateIndex
CREATE INDEX "address_profiles_address_idx" ON "address_profiles"("address");

-- CreateIndex
CREATE INDEX "address_profiles_lastCheckedAt_idx" ON "address_profiles"("lastCheckedAt");

-- CreateIndex
CREATE INDEX "transaction_checks_txHash_idx" ON "transaction_checks"("txHash");

-- CreateIndex
CREATE INDEX "transaction_checks_riskLevel_idx" ON "transaction_checks"("riskLevel");

-- CreateIndex
CREATE INDEX "transaction_checks_riskScore_idx" ON "transaction_checks"("riskScore");

-- CreateIndex
CREATE INDEX "transaction_checks_createdAt_idx" ON "transaction_checks"("createdAt");
