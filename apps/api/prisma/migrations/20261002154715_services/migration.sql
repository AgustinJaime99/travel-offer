-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('TRANSPORT', 'LODGING', 'MEALS', 'EXCURSIONS', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "PricingUnit" AS ENUM ('PER_PASSENGER');

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "category" "ServiceCategory" NOT NULL,
    "pricingUnit" "PricingUnit" NOT NULL DEFAULT 'PER_PASSENGER',
    "basePriceMinor" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_normalizedName_key" ON "Service"("normalizedName");

-- CreateIndex
CREATE INDEX "Service_active_category_idx" ON "Service"("active", "category");

-- CreateIndex
CREATE INDEX "Service_normalizedName_trgm_idx" ON "Service" USING GIN ("normalizedName" gin_trgm_ops);

-- Hand-written (ADR-06): amounts within the pricing contract limits; normalized search column.
ALTER TABLE "Service"
  ADD CONSTRAINT "Service_basePriceMinor_check" CHECK ("basePriceMinor" BETWEEN 0 AND 100000000000000),
  ADD CONSTRAINT "Service_normalizedName_format_check" CHECK ("normalizedName" ~ '^[a-z0-9]+( [a-z0-9]+)*$');
