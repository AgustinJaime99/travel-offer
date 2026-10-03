-- CreateTable
CREATE TABLE "PlanPreference" (
    "enrollmentId" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "installments" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPreference_pkey" PRIMARY KEY ("enrollmentId")
);

-- CreateIndex
CREATE INDEX "PlanPreference_proposalId_idx" ON "PlanPreference"("proposalId");

-- AddForeignKey
ALTER TABLE "PlanPreference" ADD CONSTRAINT "PlanPreference_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPreference" ADD CONSTRAINT "PlanPreference_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "CommercialProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 0 = contado; otherwise an installment option of that version (the API checks it against the snapshot).
ALTER TABLE "PlanPreference" ADD CONSTRAINT "PlanPreference_installments_check"
  CHECK ("installments" BETWEEN 0 AND 36);
