import type { PricingResult as PricingResultDto } from '@travel-rock/shared';
import {
  type InstallmentOption,
  type OfferResult,
  type PricingResult,
  ROUNDING_POLICY,
} from './domain/pricing-engine.js';

const scheduleDto = (schedule: PricingResult['schedule']) =>
  schedule.map((row) => ({
    number: row.number,
    paymentMinor: row.paymentMinor.toString(),
    interestMinor: row.interestMinor.toString(),
    principalMinor: row.principalMinor.toString(),
    balanceMinor: row.balanceMinor.toString(),
  }));
const summaryDto = (summary: PricingResult['scheduleSummary']) =>
  summary.map((run) => ({ count: run.count, paymentMinor: run.paymentMinor.toString() }));

function optionDto(option: InstallmentOption) {
  return {
    installments: option.installments,
    tnaBps: option.tnaBps,
    teaBps: option.teaBps,
    cftBps: option.cftBps,
    financedPrincipalMinor: option.financedPrincipalMinor.toString(),
    schedule: scheduleDto(option.schedule),
    scheduleSummary: summaryDto(option.scheduleSummary),
    totalInstallmentsMinor: option.totalInstallmentsMinor.toString(),
    totalInterestMinor: option.totalInterestMinor.toString(),
    totalPayableMinor: option.totalPayableMinor.toString(),
  };
}

/** The offer: the primary calculation plus every installment option (and the staff-only exclusions). */
export function toOfferDto(offer: OfferResult): PricingResultDto {
  return {
    ...toPricingResultDto(offer.primary),
    installmentOptions: offer.options.map(optionDto),
    excludedInstallments: offer.excluded,
  };
}

/** bigint → decimal strings of centavos (T2). */
export function toPricingResultDto(result: PricingResult): PricingResultDto {
  return {
    formulaVersion: result.formulaVersion,
    currency: result.currency,
    pricingUnit: result.pricingUnit,
    passengerCount: result.passengerCount,
    lines: result.lines.map((line) => ({
      pricingUnit: line.pricingUnit,
      lineGrossMinor: line.lineGrossMinor.toString(),
      lineNetMinor: line.lineNetMinor.toString(),
      perPassengerMinor: line.perPassengerMinor.toString(),
    })),
    subtotalMinor: result.subtotalMinor.toString(),
    commercialDiscountMinor: result.commercialDiscountMinor.toString(),
    cashPriceMinor: result.cashPriceMinor.toString(),
    downPaymentMinor: result.downPaymentMinor.toString(),
    financedPrincipalMinor: result.financedPrincipalMinor.toString(),
    installments: result.installments,
    tnaBps: result.tnaBps,
    teaBps: result.teaBps,
    cftBps: result.cftBps,
    cftIncludesCosts: result.cftIncludesCosts,
    schedule: scheduleDto(result.schedule),
    scheduleSummary: summaryDto(result.scheduleSummary),
    totalInstallmentsMinor: result.totalInstallmentsMinor.toString(),
    totalInterestMinor: result.totalInterestMinor.toString(),
    totalPayableMinor: result.totalPayableMinor.toString(),
    roundingPolicy: ROUNDING_POLICY,
    installmentOptions: [],
    excludedInstallments: [],
  };
}
