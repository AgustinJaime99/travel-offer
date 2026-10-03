import { describe, expect, it } from 'vitest';
import {
  calculateOffer,
  calculatePricing,
  ceilDiv,
  FORMULA_VERSION,
  MAX_AMOUNT_MINOR,
  MAX_INSTALLMENTS,
  MAX_PASSENGERS,
  MIN_FINANCED_PER_INSTALLMENT_MINOR,
  MIN_INSTALLMENT_LABEL,
  MIN_INSTALLMENT_MINOR,
  type PricingInput,
  type PricingRules,
  PricingValidationError,
  roundHalfUp,
  teaBpsFor,
} from './pricing-engine.js';
import { formatArs } from '@travel-rock/shared';

/** The formula alone: reference vectors check the math, below the commercial minimum installment. */
const FORMULA_ONLY: PricingRules = { minInstallmentMinor: 0n };

const line = (unitPriceMinor: bigint, quantity = 1, discountMinor = 0n) =>
  ({ quantity, unitPriceMinor, discountMinor, pricingUnit: 'PER_PASSENGER' }) as const;

/** A single line equal to the financed amount, so P = price. */
function financed(principal: bigint, tnaBps: number, installments: number): PricingInput {
  return {
    lines: [line(principal)],
    commercialDiscountMinor: 0n,
    downPaymentMinor: 0n,
    installments,
    tnaBps,
  };
}

function issuesOf(input: PricingInput, rules?: PricingRules): { path: string; message: string }[] {
  try {
    calculatePricing(input, rules);
  } catch (error) {
    if (error instanceof PricingValidationError) return error.issues;
    throw error;
  }
  throw new Error('expected a PricingValidationError');
}

describe('roundHalfUp', () => {
  it.each([
    [5n, 2n, 3n],
    [4n, 2n, 2n],
    [7n, 3n, 2n],
    [8n, 3n, 3n],
    [0n, 7n, 0n],
  ])('%s / %s → %s', (a, b, expected) => {
    expect(roundHalfUp(a, b)).toBe(expected);
  });

  it('rejects negative numerators and non-positive denominators', () => {
    expect(() => roundHalfUp(-1n, 2n)).toThrow(RangeError);
    expect(() => roundHalfUp(1n, 0n)).toThrow(RangeError);
  });
});

describe('reference vectors (DOMAIN.md)', () => {
  it.each([
    {
      p: 100_000_000n,
      tna: 3500,
      n: 18,
      summary: [
        [17, 7_219_740n],
        [1, 7_219_741n],
      ],
      total: 129_955_321n,
      interest: 29_955_321n,
      tea: 4120,
    },
    {
      p: 100_000_000n,
      tna: 0,
      n: 36,
      summary: [
        [28, 2_777_778n],
        [8, 2_777_777n],
      ],
      total: 100_000_000n,
      interest: 0n,
      tea: 0,
    },
    {
      p: 100_000_000n,
      tna: 6600,
      n: 36,
      summary: [
        [35, 6_436_635n],
        [1, 6_436_611n],
      ],
      total: 231_718_836n,
      interest: 131_718_836n,
      tea: 9012,
    },
    {
      p: 100_000_000n,
      tna: 3500,
      n: 1,
      summary: [[1, 102_916_667n]],
      total: 102_916_667n,
      interest: 2_916_667n,
      tea: 4120,
    },
    {
      p: 123_456_789n,
      tna: 2750,
      n: 12,
      summary: [
        [11, 11_884_139n],
        [1, 11_884_143n],
      ],
      total: 142_609_672n,
      interest: 19_152_883n,
      tea: 3125,
    },
  ])('P=$p TNA=$tna n=$n', ({ p, tna, n, summary, total, interest, tea }) => {
    const result = calculatePricing(financed(p, tna, n), FORMULA_ONLY);
    expect(result.scheduleSummary.map((run) => [run.count, run.paymentMinor])).toEqual(summary);
    expect(result.totalInstallmentsMinor).toBe(total);
    expect(result.totalInterestMinor).toBe(interest);
    expect(result.teaBps).toBe(tea);
    expect(result.cftBps).toBe(tea);
    expect(result.schedule.at(-1)?.balanceMinor).toBe(0n);
  });
});

describe('full worked example (DOMAIN.md)', () => {
  it('matches every line of the illustration', () => {
    const result = calculatePricing({
      lines: [line(110_000_000n), line(150_000_000n), line(50_000_000n)],
      commercialDiscountMinor: 10_000_000n,
      downPaymentMinor: 60_000_000n,
      installments: 18,
      tnaBps: 3500,
    });
    expect(result).toMatchObject({
      formulaVersion: FORMULA_VERSION,
      currency: 'ARS',
      pricingUnit: 'PER_PASSENGER',
      subtotalMinor: 310_000_000n,
      commercialDiscountMinor: 10_000_000n,
      cashPriceMinor: 300_000_000n,
      downPaymentMinor: 60_000_000n,
      financedPrincipalMinor: 240_000_000n,
      installments: 18,
      tnaBps: 3500,
      teaBps: 4120,
      cftBps: 4120,
      cftIncludesCosts: false,
      totalInterestMinor: 71_892_769n,
      totalInstallmentsMinor: 311_892_769n,
      totalPayableMinor: 371_892_769n,
    });
    expect(result.scheduleSummary).toEqual([
      { count: 17, paymentMinor: 17_327_376n },
      { count: 1, paymentMinor: 17_327_377n },
    ]);
  });

  it('applies quantities and line discounts', () => {
    const result = calculatePricing(
      {
        lines: [line(1_000_000n, 3, 500_000n), line(250n, 2)],
        commercialDiscountMinor: 0n,
        downPaymentMinor: 0n,
        installments: 1,
        tnaBps: 0,
      },
      FORMULA_ONLY,
    );
    expect(result.lines).toEqual([
      {
        pricingUnit: 'PER_PASSENGER',
        lineGrossMinor: 3_000_000n,
        lineNetMinor: 2_500_000n,
        perPassengerMinor: 2_500_000n,
      },
      {
        pricingUnit: 'PER_PASSENGER',
        lineGrossMinor: 500n,
        lineNetMinor: 500n,
        perPassengerMinor: 500n,
      },
    ]);
    expect(result.subtotalMinor).toBe(2_500_500n);
  });
});

describe('cash sales and edge cases', () => {
  it('a down payment equal to the cash price is a cash sale with no installments and rate 0', () => {
    const result = calculatePricing({
      lines: [line(50_000_000n)],
      commercialDiscountMinor: 0n,
      downPaymentMinor: 50_000_000n,
      installments: 0,
      tnaBps: 3500,
    });
    expect(result).toMatchObject({
      financedPrincipalMinor: 0n,
      installments: 0,
      tnaBps: 0,
      teaBps: 0,
      schedule: [],
      totalPayableMinor: 50_000_000n,
    });
  });

  it('an empty proposal prices to zero (publication requires items, Phase 7)', () => {
    const result = calculatePricing({
      lines: [],
      commercialDiscountMinor: 0n,
      downPaymentMinor: 0n,
      installments: 0,
      tnaBps: 0,
    });
    expect(result.totalPayableMinor).toBe(0n);
  });

  it('each installment must finance at least $ 1,00 (found by the property test: 3 centavos in 6)', () => {
    for (let n = 1; n <= MAX_INSTALLMENTS; n++) {
      const minimum = BigInt(n) * MIN_FINANCED_PER_INSTALLMENT_MINOR;
      for (const tna of [0, 1, 3500, 6600]) {
        expect(
          calculatePricing(financed(minimum, tna, n), FORMULA_ONLY).schedule.at(-1)?.balanceMinor,
        ).toBe(0n);
        expect(issuesOf(financed(minimum - 1n, tna, n), FORMULA_ONLY)[0]?.path).toBe(
          'installments',
        );
      }
    }
    expect(issuesOf(financed(3n, 3500, 6), FORMULA_ONLY)[0]?.message).toBe(
      'Cada cuota tiene que financiar al menos $ 1,00: usá menos cuotas.',
    );
  });

  it('TEA is a pure function of the TNA', () => {
    expect(teaBpsFor(0)).toBe(0);
    expect(teaBpsFor(3500)).toBe(4120);
    expect(teaBpsFor(6600)).toBe(9012);
  });
});

describe('validation', () => {
  const valid = (): PricingInput => financed(240_000_000n, 3500, 18);

  it('rejects a line discount above the line amount', () => {
    expect(issuesOf({ ...valid(), lines: [line(1000n, 2, 2001n)] })).toEqual([
      {
        path: 'items.0.discountMinor',
        message: 'El descuento no puede superar el importe de la línea.',
      },
    ]);
  });

  it('rejects a commercial discount above the subtotal and a down payment above the cash price', () => {
    expect(issuesOf({ ...valid(), commercialDiscountMinor: 240_000_001n })[0]?.path).toBe(
      'commercialDiscountMinor',
    );
    expect(issuesOf({ ...valid(), downPaymentMinor: 240_000_001n })[0]?.path).toBe(
      'downPaymentMinor',
    );
  });

  it('requires installments only when something is financed', () => {
    expect(issuesOf({ ...valid(), installments: 0 })[0]?.path).toBe('installments');
    expect(issuesOf({ ...valid(), downPaymentMinor: 240_000_000n, installments: 3 })[0]?.path).toBe(
      'installments',
    );
  });

  it.each([
    [{ installments: 37 }, 'installments'],
    [{ installments: -1 }, 'installments'],
    [{ installments: 1.5 }, 'installments'],
    [{ tnaBps: 6601 }, 'tnaBps'],
    [{ tnaBps: -1 }, 'tnaBps'],
    [{ downPaymentMinor: -1n }, 'downPaymentMinor'],
    [{ commercialDiscountMinor: MAX_AMOUNT_MINOR + 1n }, 'commercialDiscountMinor'],
  ])('rejects %o', (patch, path) => {
    expect(issuesOf({ ...valid(), ...patch }).map((issue) => issue.path)).toContain(path);
  });

  it.each([
    [line(-1n), 'items.0.unitPriceMinor'],
    [line(100n, 0), 'items.0.quantity'],
    [line(100n, 1000), 'items.0.quantity'],
    [line(MAX_AMOUNT_MINOR, 2), 'items.0.quantity'],
    [{ ...line(100n), pricingUnit: 'PER_TRIP' as never }, 'items.0.pricingUnit'],
  ])('rejects invalid line %o', (badLine, path) => {
    expect(issuesOf({ ...valid(), lines: [badLine] }).map((issue) => issue.path)).toContain(path);
  });

  it('rejects totals above the amount limit', () => {
    const half = MAX_AMOUNT_MINOR / 2n + 1n;
    expect(issuesOf({ ...valid(), lines: [line(half), line(half)] })[0]?.path).toBe('items');
    expect(issuesOf(financed(MAX_AMOUNT_MINOR, 6600, 36))[0]?.message).toBe(
      'El total a pagar es demasiado grande.',
    );
  });

  it('reports all independent problems at once', () => {
    const paths = issuesOf({
      ...valid(),
      installments: 99,
      tnaBps: 99_999,
      lines: [line(-5n, 0)],
    }).map((i) => i.path);
    expect(paths.sort()).toEqual([
      'installments',
      'items.0.quantity',
      'items.0.unitPriceMinor',
      'tnaBps',
    ]);
  });
});

describe(`minimum installment (${MIN_INSTALLMENT_LABEL}, owner 2026-10-02)`, () => {
  const tooMany = (max: number) =>
    `Cada cuota tiene que ser de al menos $ 100.000,00: con este monto financiado, hasta ${max} cuotas.`;

  it('the label matches the amount', () => {
    expect(formatArs(MIN_INSTALLMENT_MINOR)).toBe(MIN_INSTALLMENT_LABEL);
  });

  it('applies to the installment the family pays, interest included', () => {
    // $ 1.000.000 at 35 % TNA: 11 installments reach the minimum, 12 do not.
    const at = (n: number) => financed(100_000_000n, 3500, n);
    expect(
      calculatePricing(at(11)).schedule.every((row) => row.paymentMinor >= MIN_INSTALLMENT_MINOR),
    ).toBe(true);
    expect(issuesOf(at(12))).toEqual([{ path: 'installments', message: tooMany(11) }]);
    // The previous worked example (18 installments of $ 72.197,40) is no longer allowed.
    expect(issuesOf(at(18))).toEqual([{ path: 'installments', message: tooMany(11) }]);
  });

  it('interest-free: exactly $ 100.000,00 per installment is the boundary', () => {
    expect(calculatePricing(financed(100_000_000n, 0, 10)).scheduleSummary).toEqual([
      { count: 10, paymentMinor: MIN_INSTALLMENT_MINOR },
    ]);
    expect(issuesOf(financed(100_000_000n - 1n, 0, 10))[0]?.message).toBe(tooMany(9));
  });

  it('a financed amount below one minimum installment cannot be financed at all', () => {
    expect(issuesOf(financed(MIN_INSTALLMENT_MINOR - 1n, 0, 1))[0]?.message).toBe(
      'Cada cuota tiene que ser de al menos $ 100.000,00 y el monto financiado no alcanza: aumentá el anticipo o vendelo de contado.',
    );
    expect(issuesOf(financed(MIN_INSTALLMENT_MINOR, 0, 2))[0]?.message).toBe(
      'Cada cuota tiene que ser de al menos $ 100.000,00: con este monto financiado, hasta 1 cuota.',
    );
  });

  it('cash sales are not affected', () => {
    expect(
      calculatePricing({
        lines: [line(5_000_000n)],
        commercialDiscountMinor: 0n,
        downPaymentMinor: 5_000_000n,
        installments: 0,
        tnaBps: 0,
      }).totalPayableMinor,
    ).toBe(5_000_000n);
  });
});

const groupLine = (unitPriceMinor: bigint, quantity = 1, discountMinor = 0n) =>
  ({ quantity, unitPriceMinor, discountMinor, pricingUnit: 'PER_GROUP' }) as const;
/** One interest-free installment: the amounts under test are the line shares and the cash price. */
const cash = (lines: PricingInput['lines'], passengerCount: number | null): PricingInput => ({
  lines,
  commercialDiscountMinor: 0n,
  downPaymentMinor: 0n,
  installments: 1,
  tnaBps: 0,
  passengerCount,
});

describe('per-group lines divided among passengers (v2, owner 2026-10-03)', () => {
  it('divides the group amount: $ 30.000.000 among 30 adds $ 1.000.000,00 per passenger', () => {
    const result = calculatePricing(
      cash([groupLine(3_000_000_000n), line(150_000_000n)], 30),
      FORMULA_ONLY,
    );
    expect(result.formulaVersion).toBe('french-tna12-v2');
    expect(result.passengerCount).toBe(30);
    expect(result.lines[0]).toEqual({
      pricingUnit: 'PER_GROUP',
      lineGrossMinor: 3_000_000_000n,
      lineNetMinor: 3_000_000_000n,
      perPassengerMinor: 100_000_000n,
    });
    expect(result.subtotalMinor).toBe(250_000_000n);
    expect(formatArs(result.cashPriceMinor)).toBe('$ 2.500.000,00');
  });

  it('rounds each share up to the centavo, so the shares always cover the group cost', () => {
    const result = calculatePricing(cash([groupLine(100_000_000n)], 3), FORMULA_ONLY);
    expect(result.lines[0]!.perPassengerMinor).toBe(33_333_334n);
    expect(formatArs(result.cashPriceMinor)).toBe('$ 333.333,34');
  });

  it('applies the line discount (a group amount) before dividing', () => {
    const result = calculatePricing(cash([groupLine(1_000_000n, 2, 500_000n)], 10), FORMULA_ONLY);
    expect(result.lines[0]).toMatchObject({
      lineNetMinor: 1_500_000n,
      perPassengerMinor: 150_000n,
    });
  });

  it('finances the per-passenger amount exactly as before', () => {
    const input: PricingInput = {
      lines: [groupLine(1_200_000_000n), line(100_000_000n)],
      commercialDiscountMinor: 0n,
      downPaymentMinor: 20_000_000n,
      installments: 6,
      tnaBps: 0,
      passengerCount: 40,
    };
    const result = calculatePricing(input);
    expect(result.cashPriceMinor).toBe(130_000_000n);
    expect(result.financedPrincipalMinor).toBe(110_000_000n);
    expect(result.downPaymentMinor + result.totalInstallmentsMinor).toBe(result.totalPayableMinor);
  });

  it('keeps per-passenger-only calculations identical to v1', () => {
    const result = calculatePricing(cash([line(1_000_000n, 3, 500_000n)], null), FORMULA_ONLY);
    expect(result.passengerCount).toBeNull();
    expect(result.subtotalMinor).toBe(2_500_000n);
  });

  it.each<[number | null, string]>([
    [null, 'missing'],
    [0, 'zero'],
    [MAX_PASSENGERS + 1, 'over the limit'],
    [2.5, 'not an integer'],
  ])('requires a valid passenger count with group lines (%s: %s)', (count) => {
    const issues = issuesOf(cash([groupLine(100_000_000n)], count));
    expect(issues.map((issue) => issue.path)).toEqual(['passengerCount']);
  });

  it('rejects an invalid passenger count even without group lines', () => {
    expect(issuesOf(cash([line(100n)], 0)).map((issue) => issue.path)).toEqual(['passengerCount']);
  });

  it('property: shares cover the cost and exceed it by less than one centavo per passenger', () => {
    let seed = 7;
    const random = (max: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed % max;
    };
    for (let i = 0; i < 2_000; i++) {
      const net = BigInt(random(2_000_000_000));
      const passengers = BigInt(1 + random(MAX_PASSENGERS));
      const share = ceilDiv(net, passengers);
      expect(share * passengers >= net).toBe(true);
      expect(share * passengers - net < passengers).toBe(true);
    }
  });
});

describe('installment tiers offered to families (owner 2026-10-03)', () => {
  const offerInput = (installments: number, financedMinor: bigint): PricingInput => ({
    lines: [line(financedMinor)],
    commercialDiscountMinor: 0n,
    downPaymentMinor: 0n,
    installments,
    tnaBps: 1000,
  });

  it('offers every tier up to the maximum, with the same TNA, fewest installments first', () => {
    const offer = calculateOffer(offerInput(24, 1_000_000_000n));
    expect(offer.options.map((option) => option.installments)).toEqual([3, 6, 12, 18, 24]);
    expect(offer.excluded).toEqual([]);
    expect(offer.primary.installments).toBe(24);
    for (const option of offer.options) {
      expect(option.tnaBps).toBe(1000);
      expect(option.totalPayableMinor).toBe(
        option.totalInstallmentsMinor + offer.primary.downPaymentMinor,
      );
    }
    // Longer plans pay more interest.
    const interests = offer.options.map((option) => option.totalInterestMinor);
    expect(interests).toEqual([...interests].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('excludes tiers below the minimum installment and keeps the largest valid one as primary', () => {
    // $ 1.550.000 at 10 %: 24 and 18 installments are below $ 100.000; 12 is the largest valid.
    const offer = calculateOffer(offerInput(24, 155_000_000n));
    expect(offer.options.map((option) => option.installments)).toEqual([3, 6, 12]);
    expect(offer.excluded.map((item) => item.installments)).toEqual([18, 24]);
    expect(offer.excluded[0]?.message).toMatch(/al menos \$ 100\.000,00/);
    expect(offer.primary.installments).toBe(12);
    expect(offer.primary.scheduleSummary).toEqual([
      { count: 11, paymentMinor: 13_626_963n },
      { count: 1, paymentMinor: 13_626_957n },
    ]);
  });

  it('a cash-only proposal has no installment options', () => {
    const offer = calculateOffer({
      ...offerInput(0, 100_000_000n),
      downPaymentMinor: 100_000_000n,
    });
    expect(offer.options).toEqual([]);
    expect(offer.primary.installments).toBe(0);
  });

  it('keeps structural errors as errors, and fails when no tier is valid', () => {
    expect(() => calculateOffer(offerInput(37, 1_000_000_000n))).toThrow(PricingValidationError);
    expect(() => calculateOffer(offerInput(3, 10_000_000n))).toThrow(PricingValidationError);
  });

  it('also offers a non-tier maximum from older drafts', () => {
    const offer = calculateOffer(offerInput(10, 1_000_000_000n));
    expect(offer.options.map((option) => option.installments)).toEqual([3, 6, 10]);
  });
});
