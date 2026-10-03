import type { ProposalPricingSnapshot } from '@travel-rock/shared';
import type { PricingUnit, ServiceCategory } from '../generated/prisma/client.js';
import { calculateOffer, PricingValidationError } from '../pricing/domain/pricing-engine.js';
import { toOfferDto } from '../pricing/pricing-result.mapper.js';

/** What the pricing of a version is computed from: the item snapshots and the plan inputs. */
export interface ProposalPricingInputs {
  items: {
    serviceId: string;
    serviceNameSnapshot: string;
    serviceCategorySnapshot: ServiceCategory;
    pricingUnitSnapshot: PricingUnit;
    catalogUnitPriceMinor: bigint;
    unitPriceMinor: bigint;
    quantity: number;
    discountMinor: bigint;
  }[];
  commercialDiscountMinor: bigint;
  downPaymentMinor: bigint;
  installments: number;
  tnaBps: number;
  /** Divisor of the per-group items (null when there are none). */
  passengerCount: number | null;
}

/**
 * Runs the pure engine on the stored inputs (never on client totals) and builds the JSONB snapshot.
 * Throws PricingValidationError when the inputs break the pricing contract.
 */
export function buildPricingSnapshot(
  inputs: ProposalPricingInputs,
  meta: { calculatedAt: Date; publishedAt?: Date; publishedById?: string },
): { snapshot: ProposalPricingSnapshot; cashPriceMinor: bigint; totalPayableMinor: bigint } {
  const offer = calculateOffer({
    lines: inputs.items.map((item) => ({
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      discountMinor: item.discountMinor,
      pricingUnit: item.pricingUnitSnapshot,
    })),
    commercialDiscountMinor: inputs.commercialDiscountMinor,
    downPaymentMinor: inputs.downPaymentMinor,
    installments: inputs.installments,
    tnaBps: inputs.tnaBps,
    passengerCount: inputs.passengerCount,
  });
  const result = offer.primary;
  const { lines, ...pricing } = toOfferDto(offer);
  const snapshot: ProposalPricingSnapshot = {
    ...pricing,
    items: inputs.items.map((item, index) => ({
      serviceId: item.serviceId,
      serviceName: item.serviceNameSnapshot,
      serviceCategory: item.serviceCategorySnapshot,
      pricingUnit: item.pricingUnitSnapshot,
      catalogUnitPriceMinor: item.catalogUnitPriceMinor.toString(),
      unitPriceMinor: item.unitPriceMinor.toString(),
      quantity: item.quantity,
      discountMinor: item.discountMinor.toString(),
      lineGrossMinor: lines[index]!.lineGrossMinor,
      lineNetMinor: lines[index]!.lineNetMinor,
      perPassengerMinor: lines[index]!.perPassengerMinor,
    })),
    calculatedAt: meta.calculatedAt.toISOString(),
    publishedAt: meta.publishedAt?.toISOString() ?? null,
    publishedById: meta.publishedById ?? null,
  };
  return {
    snapshot,
    cashPriceMinor: result.cashPriceMinor,
    totalPayableMinor: result.totalPayableMinor,
  };
}

export { PricingValidationError };
