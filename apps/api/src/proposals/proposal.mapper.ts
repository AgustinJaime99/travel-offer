import {
  type Proposal,
  type ProposalSummary,
  proposalPricingSnapshotSchema,
} from '@travel-rock/shared';
import type { Prisma } from '../generated/prisma/client.js';

const staffRef = { select: { id: true, fullName: true } } as const;

export const proposalSummaryInclude = {
  schoolGroup: {
    select: {
      id: true,
      name: true,
      travelYear: true,
      status: true,
      school: { select: { id: true, name: true, active: true } },
    },
  },
  createdBy: staffRef,
  publishedBy: staffRef,
} satisfies Prisma.CommercialProposalInclude;

export const proposalDetailInclude = {
  ...proposalSummaryInclude,
  items: { orderBy: { position: 'asc' } },
  paymentPlan: true,
} satisfies Prisma.CommercialProposalInclude;

export type ProposalSummaryRecord = Prisma.CommercialProposalGetPayload<{
  include: typeof proposalSummaryInclude;
}>;
export type ProposalDetailRecord = Prisma.CommercialProposalGetPayload<{
  include: typeof proposalDetailInclude;
}>;

export function toProposalSummaryDto(proposal: ProposalSummaryRecord): ProposalSummary {
  return {
    id: proposal.id,
    version: proposal.version,
    status: proposal.status,
    schoolGroup: proposal.schoolGroup,
    clonedFromId: proposal.clonedFromId,
    validFrom: proposal.validFrom?.toISOString() ?? null,
    validUntil: proposal.validUntil?.toISOString() ?? null,
    cashPriceMinor: proposal.cashPriceMinor.toString(),
    totalPayableMinor: proposal.totalPayableMinor.toString(),
    createdBy: proposal.createdBy,
    publishedBy: proposal.publishedBy,
    publishedAt: proposal.publishedAt?.toISOString() ?? null,
    archivedAt: proposal.archivedAt?.toISOString() ?? null,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
  };
}

export function toProposalDto(proposal: ProposalDetailRecord): Proposal {
  const plan = proposal.paymentPlan;
  if (!plan) throw new Error(`Proposal ${proposal.id} has no payment plan`);
  return {
    ...toProposalSummaryDto(proposal),
    items: proposal.items.map((item) => ({
      id: item.id,
      position: item.position,
      serviceId: item.serviceId,
      serviceName: item.serviceNameSnapshot,
      serviceCategory: item.serviceCategorySnapshot,
      pricingUnit: item.pricingUnitSnapshot,
      catalogUnitPriceMinor: item.catalogUnitPriceMinor.toString(),
      unitPriceMinor: item.unitPriceMinor.toString(),
      priceOverridden: item.unitPriceMinor !== item.catalogUnitPriceMinor,
      quantity: item.quantity,
      discountMinor: item.discountMinor.toString(),
    })),
    paymentPlan: {
      commercialDiscountMinor: plan.commercialDiscountMinor.toString(),
      downPaymentMinor: plan.downPaymentMinor.toString(),
      installments: plan.installments,
      tnaBps: plan.tnaBps,
      passengerCount: plan.passengerCount,
    },
    pricing: proposalPricingSnapshotSchema.parse(plan.pricingSnapshot),
  };
}
