import { describe, expect, it } from 'vitest';
import {
  calculatePricing,
  MAX_INSTALLMENTS,
  MAX_TNA_BPS,
  MIN_FINANCED_PER_INSTALLMENT_MINOR,
  MIN_INSTALLMENT_MINOR,
  type PricingInput,
  type PricingRules,
  PricingValidationError,
} from './pricing-engine.js';

/** The invariants are about the formula; the commercial minimum installment is checked separately. */
const FORMULA_ONLY: PricingRules = { minInstallmentMinor: 0n };

/** Seeded PRNG (mulberry32): the property run is reproducible from the seed. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  /** Log-uniform amounts from 1 centavo up to ~10^12, to cover small and large prices. */
  const amount = () => BigInt(Math.floor(10 ** (next() * 12)));
  return { int, amount, next };
}

function randomInput(rng: ReturnType<typeof random>): PricingInput {
  const lines = Array.from({ length: rng.int(1, 6) }, () => {
    const quantity = rng.int(1, 5);
    const unitPriceMinor = rng.amount();
    const gross = BigInt(quantity) * unitPriceMinor;
    const discountMinor = rng.next() < 0.3 ? (gross * BigInt(rng.int(0, 100))) / 100n : 0n;
    return { quantity, unitPriceMinor, discountMinor, pricingUnit: 'PER_PASSENGER' as const };
  });
  const subtotal = lines.reduce(
    (sum, l) => sum + BigInt(l.quantity) * l.unitPriceMinor - l.discountMinor,
    0n,
  );
  const commercialDiscountMinor =
    rng.next() < 0.3 ? (subtotal * BigInt(rng.int(0, 30))) / 100n : 0n;
  const cash = subtotal - commercialDiscountMinor;
  let downPaymentMinor = rng.next() < 0.5 ? (cash * BigInt(rng.int(0, 100))) / 100n : 0n;
  // Below $ 1,00 per installment the input is invalid by contract: make it a cash sale instead.
  if (cash - downPaymentMinor < MIN_FINANCED_PER_INSTALLMENT_MINOR) downPaymentMinor = cash;
  const financed = cash - downPaymentMinor;
  const maxInstallments = Math.min(
    MAX_INSTALLMENTS,
    Number(financed / MIN_FINANCED_PER_INSTALLMENT_MINOR),
  );
  return {
    lines,
    commercialDiscountMinor,
    downPaymentMinor,
    installments: financed === 0n ? 0 : rng.int(1, maxInstallments),
    tnaBps: rng.next() < 0.2 ? 0 : rng.int(1, MAX_TNA_BPS),
  };
}

const CASES = 3000;
// Fixed by default for reproducibility; set PRICING_SEED to explore other inputs.
const SEED = Number(process.env['PRICING_SEED'] ?? 20261002);

describe(`pricing invariants over ${CASES} random inputs (seed ${SEED})`, () => {
  const rng = random(SEED);
  const results = Array.from({ length: CASES }, () => {
    const input = randomInput(rng);
    return { input, result: calculatePricing(input, FORMULA_ONLY) };
  });

  it('down payment + Σ installments = total payable, and the schedule amortizes to 0', () => {
    for (const { result } of results) {
      const sum = result.schedule.reduce((total, row) => total + row.paymentMinor, 0n);
      expect(result.downPaymentMinor + sum).toBe(result.totalPayableMinor);
      expect(result.schedule.reduce((total, row) => total + row.principalMinor, 0n)).toBe(
        result.financedPrincipalMinor,
      );
      if (result.schedule.length > 0) expect(result.schedule.at(-1)!.balanceMinor).toBe(0n);
      for (const row of result.schedule) {
        expect(row.balanceMinor >= 0n && row.principalMinor >= 0n && row.interestMinor >= 0n).toBe(
          true,
        );
      }
    }
  });

  it('the amounts chain exactly: subtotal → cash price → financed', () => {
    for (const { input, result } of results) {
      expect(result.cashPriceMinor).toBe(result.subtotalMinor - input.commercialDiscountMinor);
      expect(result.financedPrincipalMinor).toBe(result.cashPriceMinor - input.downPaymentMinor);
      expect(result.totalInterestMinor).toBe(
        result.totalInstallmentsMinor - result.financedPrincipalMinor,
      );
    }
  });

  it('interest-free installments differ by at most 1 centavo, larger ones first', () => {
    for (const { result } of results.filter(
      ({ result }) => result.tnaBps === 0 && result.installments > 0,
    )) {
      const payments = result.schedule.map((row) => row.paymentMinor);
      expect(payments[0]! - payments.at(-1)!).toBeLessThanOrEqual(1n);
      expect([...payments].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))).toEqual(payments);
      expect(result.totalInterestMinor).toBe(0n);
    }
  });

  it('French installments are fixed except the last, which absorbs the compounded rounding', () => {
    for (const { result } of results.filter(({ result }) => result.tnaBps > 0)) {
      const [first, ...rest] = result.schedule.map((row) => row.paymentMinor);
      for (const payment of rest.slice(0, -1)) expect(payment).toBe(first);
      const last = result.schedule.at(-1)!.paymentMinor;
      const gap = Number(last > first! ? last - first! : first! - last);
      // Each month adds at most ±1 centavo of rounding (installment + interest), compounded at the
      // monthly rate until the end: Σ (1 + r)^j = ((1 + r)^n − 1) / r.
      const r = result.tnaBps / 120_000;
      expect(gap).toBeLessThanOrEqual(Math.ceil(((1 + r) ** result.installments - 1) / r));
    }
  });

  it('agrees with the textbook floating-point annuity formula to within 1 centavo (test-only oracle)', () => {
    for (const { result } of results.filter(
      ({ result }) => result.tnaBps > 0 && result.financedPrincipalMinor < 10n ** 12n,
    )) {
      const r = result.tnaBps / 120_000;
      const p = Number(result.financedPrincipalMinor);
      const expected = (p * r) / (1 - (1 + r) ** -result.installments);
      expect(Math.abs(Number(result.schedule[0]!.paymentMinor) - expected)).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic', () => {
    for (const { input, result } of results.slice(0, 200)) {
      expect(calculatePricing(input, FORMULA_ONLY)).toEqual(result);
    }
  });
});

describe(`commercial minimum installment over ${CASES} random inputs (seed ${SEED})`, () => {
  it('a plan is accepted exactly when every installment reaches the minimum', () => {
    const rng = random(SEED + 1);
    let accepted = 0;
    let rejected = 0;
    for (let i = 0; i < CASES; i++) {
      const input = randomInput(rng);
      const formula = calculatePricing(input, FORMULA_ONLY);
      const reaches = formula.schedule.every((row) => row.paymentMinor >= MIN_INSTALLMENT_MINOR);
      try {
        expect(calculatePricing(input)).toEqual(formula);
        expect(reaches).toBe(true);
        accepted += 1;
      } catch (error) {
        if (!(error instanceof PricingValidationError)) throw error;
        expect(reaches).toBe(false);
        expect(error.issues.map((issue) => issue.path)).toEqual(['installments']);
        rejected += 1;
      }
    }
    // The generator covers both sides of the rule.
    expect(accepted).toBeGreaterThan(100);
    expect(rejected).toBeGreaterThan(100);
  });
});
