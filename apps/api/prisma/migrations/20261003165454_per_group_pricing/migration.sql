-- AlterEnum
ALTER TYPE "PricingUnit" ADD VALUE 'PER_GROUP';

-- AlterTable
ALTER TABLE "PaymentPlan" ADD COLUMN     "passengerCount" INTEGER;

-- Same range as the pricing engine (MAX_PASSENGERS).
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_passengerCount_check"
  CHECK ("passengerCount" IS NULL OR "passengerCount" BETWEEN 1 AND 999);
