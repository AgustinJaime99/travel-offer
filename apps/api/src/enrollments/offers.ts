import {
  itemPerPassengerMinor,
  type OfferState,
  type PublicProposal,
  proposalPricingSnapshotSchema,
  publicProposalSchema,
} from '@travel-rock/shared';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * DOMAIN.md → CommercialProposal "Eligible": published, inside its validity window, with an active
 * group and school. Drafts, archived, expired or not-yet-valid versions never qualify.
 */
export function eligiblePublicationWhere(now: Date): Prisma.CommercialProposalWhereInput {
  return {
    status: 'PUBLISHED',
    validUntil: { gt: now },
    OR: [{ validFrom: null }, { validFrom: { lte: now } }],
    schoolGroup: { status: 'ACTIVE', school: { active: true } },
  };
}

export const publicationInclude = {
  paymentPlan: true,
  schoolGroup: {
    select: {
      name: true,
      travelYear: true,
      school: { select: { name: true, city: true, province: true } },
    },
  },
} satisfies Prisma.CommercialProposalInclude;
export type PublicationRecord = Prisma.CommercialProposalGetPayload<{
  include: typeof publicationInclude;
}>;

/** Options a family may say it prefers for a publication: contado (0) and every installment option. */
export function preferableInstallments(publication: PublicationRecord): number[] {
  const snapshot = proposalPricingSnapshotSchema.parse(publication.paymentPlan?.pricingSnapshot);
  const options = snapshot.installmentOptions.map((option) => option.installments);
  // Versions published before the tiers (2026-10-03) have a single plan.
  if (options.length === 0 && snapshot.installments > 0) options.push(snapshot.installments);
  return [0, ...options];
}

/** CODE_REQUIRED is decided before looking at publications, so it reveals nothing about them. */
export function offerState(accessGranted: boolean, hasEligiblePublication: boolean): OfferState {
  if (!accessGranted) return 'CODE_REQUIRED';
  return hasEligiblePublication ? 'AVAILABLE' : 'PREPARING';
}

/** Built from the frozen snapshot only; staff identities, catalog prices and override flags stay internal. */
export function toPublicProposal(publication: PublicationRecord): PublicProposal {
  const snapshot = proposalPricingSnapshotSchema.parse(publication.paymentPlan?.pricingSnapshot);
  // The public schema only keeps the disclosure fields (zod drops the rest, e.g. publishedById).
  const pricing = publicProposalSchema.shape.pricing.parse(snapshot);
  return {
    school: publication.schoolGroup.school,
    group: { name: publication.schoolGroup.name, travelYear: publication.schoolGroup.travelYear },
    validFrom: publication.validFrom?.toISOString() ?? null,
    validUntil: publication.validUntil!.toISOString(),
    publishedAt: publication.publishedAt!.toISOString(),
    // A group cost is shown only as the passenger's share: never the group amount or the divisor.
    items: snapshot.items.map((item) =>
      item.pricingUnit === 'PER_GROUP'
        ? {
            serviceName: item.serviceName,
            serviceCategory: item.serviceCategory,
            quantity: 1,
            unitPriceMinor: itemPerPassengerMinor(item),
            discountMinor: '0',
            lineNetMinor: itemPerPassengerMinor(item),
            sharedCost: true,
          }
        : {
            serviceName: item.serviceName,
            serviceCategory: item.serviceCategory,
            quantity: item.quantity,
            unitPriceMinor: item.unitPriceMinor,
            discountMinor: item.discountMinor,
            lineNetMinor: item.lineNetMinor,
            sharedCost: false,
          },
    ),
    pricing,
  };
}
