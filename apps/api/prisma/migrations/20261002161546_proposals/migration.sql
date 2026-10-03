-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "CommercialProposal" (
    "id" UUID NOT NULL,
    "schoolGroupId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "clonedFromId" UUID,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "publishedById" UUID,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "cashPriceMinor" BIGINT NOT NULL,
    "totalPayableMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalItem" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "serviceNameSnapshot" TEXT NOT NULL,
    "serviceCategorySnapshot" "ServiceCategory" NOT NULL,
    "pricingUnitSnapshot" "PricingUnit" NOT NULL,
    "catalogUnitPriceMinor" BIGINT NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "ProposalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPlan" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "commercialDiscountMinor" BIGINT NOT NULL DEFAULT 0,
    "downPaymentMinor" BIGINT NOT NULL DEFAULT 0,
    "installments" INTEGER NOT NULL DEFAULT 0,
    "tnaBps" INTEGER NOT NULL DEFAULT 0,
    "pricingSnapshot" JSONB NOT NULL,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialProposal_status_idx" ON "CommercialProposal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialProposal_schoolGroupId_version_key" ON "CommercialProposal"("schoolGroupId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalItem_proposalId_position_key" ON "ProposalItem"("proposalId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalItem_proposalId_serviceId_key" ON "ProposalItem"("proposalId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentPlan_proposalId_key" ON "PaymentPlan"("proposalId");

-- AddForeignKey
ALTER TABLE "CommercialProposal" ADD CONSTRAINT "CommercialProposal_schoolGroupId_fkey" FOREIGN KEY ("schoolGroupId") REFERENCES "SchoolGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialProposal" ADD CONSTRAINT "CommercialProposal_clonedFromId_fkey" FOREIGN KEY ("clonedFromId") REFERENCES "CommercialProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialProposal" ADD CONSTRAINT "CommercialProposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialProposal" ADD CONSTRAINT "CommercialProposal_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalItem" ADD CONSTRAINT "ProposalItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "CommercialProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalItem" ADD CONSTRAINT "ProposalItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "CommercialProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Hand-written (ADR-05, ADR-06). Prisma does not manage these objects.
-- ============================================================================

-- At most one current publication and one draft per group.
CREATE UNIQUE INDEX "CommercialProposal_one_published_per_group"
  ON "CommercialProposal" ("schoolGroupId") WHERE status = 'PUBLISHED';
CREATE UNIQUE INDEX "CommercialProposal_one_draft_per_group"
  ON "CommercialProposal" ("schoolGroupId") WHERE status = 'DRAFT';

ALTER TABLE "CommercialProposal"
  ADD CONSTRAINT "CommercialProposal_version_check" CHECK (version >= 1),
  ADD CONSTRAINT "CommercialProposal_amounts_check" CHECK (
    "cashPriceMinor" BETWEEN 0 AND 100000000000000 AND "totalPayableMinor" BETWEEN 0 AND 100000000000000),
  ADD CONSTRAINT "CommercialProposal_validity_check" CHECK (
    "validFrom" IS NULL OR "validUntil" IS NULL OR "validFrom" <= "validUntil"),
  ADD CONSTRAINT "CommercialProposal_status_consistency_check" CHECK (
    (status = 'DRAFT' AND "publishedAt" IS NULL AND "publishedById" IS NULL AND "archivedAt" IS NULL)
    OR (status = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "publishedById" IS NOT NULL
        AND "validUntil" IS NOT NULL AND "archivedAt" IS NULL)
    OR (status = 'ARCHIVED' AND "archivedAt" IS NOT NULL));

ALTER TABLE "ProposalItem"
  ADD CONSTRAINT "ProposalItem_quantity_check" CHECK (quantity BETWEEN 1 AND 999),
  ADD CONSTRAINT "ProposalItem_position_check" CHECK (position >= 0),
  ADD CONSTRAINT "ProposalItem_amounts_check" CHECK (
    "catalogUnitPriceMinor" BETWEEN 0 AND 100000000000000
    AND "unitPriceMinor" BETWEEN 0 AND 100000000000000
    AND "discountMinor" >= 0 AND "discountMinor" <= quantity * "unitPriceMinor");

ALTER TABLE "PaymentPlan"
  ADD CONSTRAINT "PaymentPlan_installments_check" CHECK (installments BETWEEN 0 AND 36),
  ADD CONSTRAINT "PaymentPlan_tnaBps_check" CHECK ("tnaBps" BETWEEN 0 AND 6600),
  ADD CONSTRAINT "PaymentPlan_amounts_check" CHECK (
    "commercialDiscountMinor" BETWEEN 0 AND 100000000000000
    AND "downPaymentMinor" BETWEEN 0 AND 100000000000000);

-- Immutability: once a version leaves DRAFT nothing changes, except PUBLISHED -> ARCHIVED
-- (status, archivedAt, updatedAt). Enforced even for direct SQL.
CREATE FUNCTION "proposal_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'ARCHIVED'
     AND (NEW."schoolGroupId", NEW.version, NEW."clonedFromId", NEW."validFrom", NEW."validUntil",
          NEW."createdById", NEW."publishedById", NEW."publishedAt", NEW."cashPriceMinor",
          NEW."totalPayableMinor", NEW."createdAt")
         IS NOT DISTINCT FROM
         (OLD."schoolGroupId", OLD.version, OLD."clonedFromId", OLD."validFrom", OLD."validUntil",
          OLD."createdById", OLD."publishedById", OLD."publishedAt", OLD."cashPriceMinor",
          OLD."totalPayableMinor", OLD."createdAt") THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'proposal % is % and cannot be modified', OLD.id, OLD.status
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE TRIGGER "CommercialProposal_immutable_update"
  BEFORE UPDATE ON "CommercialProposal" FOR EACH ROW EXECUTE FUNCTION "proposal_guard_update"();

CREATE FUNCTION "proposal_guard_delete"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'proposal % is % and cannot be deleted', OLD.id, OLD.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER "CommercialProposal_immutable_delete"
  BEFORE DELETE ON "CommercialProposal" FOR EACH ROW EXECUTE FUNCTION "proposal_guard_delete"();

-- Items and payment plans can only be inserted, changed or removed while their proposal is a DRAFT.
CREATE FUNCTION "proposal_child_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status "ProposalStatus";
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT status INTO parent_status FROM "CommercialProposal" WHERE id = OLD."proposalId";
    IF parent_status <> 'DRAFT' THEN
      RAISE EXCEPTION '% of a % proposal is not allowed', TG_OP, parent_status
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT status INTO parent_status FROM "CommercialProposal" WHERE id = NEW."proposalId";
    IF parent_status <> 'DRAFT' THEN
      RAISE EXCEPTION '% into a % proposal is not allowed', TG_OP, parent_status
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER "ProposalItem_draft_only"
  BEFORE INSERT OR UPDATE OR DELETE ON "ProposalItem" FOR EACH ROW EXECUTE FUNCTION "proposal_child_guard"();
CREATE TRIGGER "PaymentPlan_draft_only"
  BEFORE INSERT OR UPDATE OR DELETE ON "PaymentPlan" FOR EACH ROW EXECUTE FUNCTION "proposal_child_guard"();
