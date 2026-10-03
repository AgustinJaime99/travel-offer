import { describe, expect, it } from 'vitest';
import {
  bpsToPercentInput,
  formatBps,
  parsePercentToBps,
  pricingPreviewRequestSchema,
} from './pricing.js';

describe('formatBps', () => {
  it.each([
    [4120, '41,20 %'],
    [3500, '35,00 %'],
    [0, '0,00 %'],
    [9012, '90,12 %'],
    [5, '0,05 %'],
  ])('%s → %s', (bps, expected) => {
    expect(formatBps(bps)).toBe(expected);
  });
});

describe('pricingPreviewRequestSchema', () => {
  it('defaults optional amounts to zero', () => {
    expect(
      pricingPreviewRequestSchema.parse({
        items: [{ quantity: 1, unitPriceMinor: '100' }],
        installments: 0,
        tnaBps: 0,
      }),
    ).toEqual({
      items: [
        { quantity: 1, unitPriceMinor: '100', discountMinor: '0', pricingUnit: 'PER_PASSENGER' },
      ],
      commercialDiscountMinor: '0',
      downPaymentMinor: '0',
      installments: 0,
      tnaBps: 0,
      passengerCount: null,
    });
  });

  it('never accepts client totals', () => {
    const result = pricingPreviewRequestSchema.safeParse({
      items: [],
      installments: 0,
      tnaBps: 0,
      totalPayableMinor: '1',
    });
    expect(result.success).toBe(false);
  });

  it('requires integers and centavo strings', () => {
    const base = { items: [{ quantity: 1, unitPriceMinor: '100' }], installments: 1, tnaBps: 0 };
    expect(pricingPreviewRequestSchema.safeParse({ ...base, installments: 1.5 }).success).toBe(
      false,
    );
    expect(
      pricingPreviewRequestSchema.safeParse({
        ...base,
        items: [{ quantity: 1, unitPriceMinor: 100 }],
      }).success,
    ).toBe(false);
  });
});

describe('percent input', () => {
  it.each([
    ['35', 3500],
    ['35,5', 3550],
    ['27,25', 2725],
    ['0', 0],
    ['66 %', 6600],
    [' 12,05 ', 1205],
  ])('%s → %s bps', (input, bps) => {
    expect(parsePercentToBps(input)).toBe(bps);
  });

  it.each(['', 'abc', '35.5', '1,234', '-5', '1000'])('rejects %s', (input) => {
    expect(parsePercentToBps(input)).toBeNull();
  });

  it('round-trips', () => {
    for (const bps of [0, 5, 50, 1205, 2725, 3500, 3550, 6600]) {
      expect(parsePercentToBps(bpsToPercentInput(bps))).toBe(bps);
    }
  });
});
