import { z } from 'zod';
import { moneyMinorSchema } from './money.js';
import { pricingUnitSchema } from './service.js';

// Shapes only: business limits (ranges, discount ≤ line, down payment ≤ cash price, $ 1,00 per
// installment…) are enforced by the API pricing engine, which reports them as field issues.
const intSchema = z
  .number({ error: 'Tiene que ser un número entero.' })
  .int({ error: 'Tiene que ser un número entero.' });

export const pricingItemInputSchema = z.object({
  quantity: intSchema,
  unitPriceMinor: moneyMinorSchema,
  discountMinor: moneyMinorSchema.default('0'),
  pricingUnit: pricingUnitSchema.default('PER_PASSENGER'),
});

/** Inputs only: totals are always computed by the server and never accepted from clients. */
export const pricingPreviewRequestSchema = z.strictObject({
  items: z.array(pricingItemInputSchema).max(100, { error: 'Hasta 100 ítems.' }),
  commercialDiscountMinor: moneyMinorSchema.default('0'),
  downPaymentMinor: moneyMinorSchema.default('0'),
  installments: intSchema,
  tnaBps: intSchema,
  /** Passengers the per-group lines are divided among. */
  passengerCount: intSchema.nullable().default(null),
});
export type PricingPreviewRequest = z.output<typeof pricingPreviewRequestSchema>;

const amount = z.string().regex(/^\d+$/);

/**
 * Installment tiers (owner, 2026-10-03): staff choose the maximum and families see every tier up to
 * it, plus the cash price. Same down payment and TNA for every option.
 */
export const installmentTiers = [3, 6, 12, 18, 24] as const;

const scheduleRowSchema = z.object({
  number: z.number().int(),
  paymentMinor: amount,
  interestMinor: amount,
  principalMinor: amount,
  balanceMinor: amount,
});
const scheduleSummarySchema = z.array(z.object({ count: z.number().int(), paymentMinor: amount }));

/** One installment plan the family can choose (every disclosure of that plan). */
export const installmentOptionSchema = z.object({
  installments: z.number().int(),
  tnaBps: z.number().int(),
  teaBps: z.number().int(),
  cftBps: z.number().int(),
  financedPrincipalMinor: amount,
  schedule: z.array(scheduleRowSchema),
  scheduleSummary: scheduleSummarySchema,
  totalInstallmentsMinor: amount,
  totalInterestMinor: amount,
  totalPayableMinor: amount,
});
export type InstallmentOption = z.infer<typeof installmentOptionSchema>;

/** v1 snapshots (published before per-group pricing) stay readable: v2 only adds fields. */
export const formulaVersions = ['french-tna12-v1', 'french-tna12-v2'] as const;

export const pricingResultSchema = z.object({
  formulaVersion: z.enum(formulaVersions),
  currency: z.literal('ARS'),
  pricingUnit: z.literal('PER_PASSENGER'),
  passengerCount: z.number().int().nullable().default(null),
  lines: z.array(
    z.object({
      pricingUnit: pricingUnitSchema.default('PER_PASSENGER'),
      /** In the line's own unit: group amounts for PER_GROUP lines. */
      lineGrossMinor: amount,
      lineNetMinor: amount,
      perPassengerMinor: amount,
    }),
  ),
  subtotalMinor: amount,
  commercialDiscountMinor: amount,
  cashPriceMinor: amount,
  downPaymentMinor: amount,
  financedPrincipalMinor: amount,
  installments: z.number().int(),
  tnaBps: z.number().int(),
  teaBps: z.number().int(),
  cftBps: z.number().int(),
  cftIncludesCosts: z.literal(false),
  schedule: z.array(
    z.object({
      number: z.number().int(),
      paymentMinor: amount,
      interestMinor: amount,
      principalMinor: amount,
      balanceMinor: amount,
    }),
  ),
  scheduleSummary: z.array(z.object({ count: z.number().int(), paymentMinor: amount })),
  totalInstallmentsMinor: amount,
  totalInterestMinor: amount,
  totalPayableMinor: amount,
  roundingPolicy: z.string(),
  /** Every valid tier up to the maximum; the fields above describe the largest one. */
  installmentOptions: z.array(installmentOptionSchema).default([]),
  /** Staff only: tiers up to the maximum left out because they break a commercial rule. */
  excludedInstallments: z
    .array(z.object({ installments: z.number().int(), message: z.string() }))
    .default([]),
});
export type PricingResult = z.infer<typeof pricingResultSchema>;

/** 4120 → "41,20 %". Rates are integer basis points (0.01 %). */
export function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const cents = String(Math.abs(bps % 100)).padStart(2, '0');
  return `${whole},${cents} %`;
}

/**
 * Parses a percentage typed in Argentine format into basis points, exactly: "35" → 3500,
 * "35,5" → 3550, "27,25" → 2725. At most 2 decimals; returns null if invalid.
 */
export function parsePercentToBps(input: string): number | null {
  const match = /^(\d{1,3})(?:,(\d{1,2}))?$/.exec(input.trim().replace(/\s*%$/, ''));
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** Editable form of a rate: 3500 → "35", 3550 → "35,5", 2725 → "27,25". */
export function bpsToPercentInput(bps: number): string {
  const decimals = String(bps % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return decimals ? `${Math.trunc(bps / 100)},${decimals}` : String(Math.trunc(bps / 100));
}
