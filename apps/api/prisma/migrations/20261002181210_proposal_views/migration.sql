-- CreateTable
CREATE TABLE "ProposalView" (
    "enrollmentId" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalView_pkey" PRIMARY KEY ("enrollmentId","proposalId")
);

-- AddForeignKey
ALTER TABLE "ProposalView" ADD CONSTRAINT "ProposalView_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalView" ADD CONSTRAINT "ProposalView_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "CommercialProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
