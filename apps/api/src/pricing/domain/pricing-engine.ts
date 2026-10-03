// Pure pricing domain (formula "french-tna12-v2", DOMAIN.md → Pricing contract).
// bigint only: no floating point, no framework or database imports.

/**
 * v2 = v1 plus per-group lines divided among the passengers (owner, 2026-10-03). Per-passenger-only
 * inputs give exactly the v1 amounts; published v1 snapshots stay as they were.
 */
export const FORMULA_VERSION = 'french-tna12-v2';
export const MAX_AMOUNT_MINOR = 10n ** 14n;
export const MAX_QUANTITY = 999;
/** Passengers a per-group cost is divided among. */
export const MAX_PASSENGERS = 999;
export const MAX_INSTALLMENTS = 36;
export const MAX_TNA_BPS = 6600;
/**
 * Each installment must finance at least $ 1,00 (financed ≥ installments × 100 centavos). Below that the
 * rounded French installment can exhaust the balance early (e.g. 3 centavos in 6 installments); with this
 * floor the invariants were checked exhaustively near the boundary (Phase 6).
 */
export const MIN_FINANCED_PER_INSTALLMENT_MINOR = 100n;
/**
 * Commercial rule (owner, 2026-10-02): every installment the family pays — principal plus interest,
 * including the rounding of the last French installment — is at least $ 100.000,00. Not part of the
 * formula: callers that only check the math (formula vectors, property tests) can relax it.
 */
export const MIN_INSTALLMENT_MINOR = 10_000_000n;
export const MIN_INSTALLMENT_LABEL = '$ 100.000,00';

export interface PricingRules {
  minInstallmentMinor: bigint;
}
export const COMMERCIAL_RULES: PricingRules = { minInstallmentMinor: MIN_INSTALLMENT_MINOR };

export const ROUNDING_POLICY =
  'Per-group lines: line net divided by the passenger count, rounded up to the centavo (the shares always cover the group cost); ' +
  'half-up to the centavo on every other division; interest-free: extra centavos on the first installments; ' +
  'French system: fixed installment rounded, interest per month rounded, last installment absorbs the difference.';

/** 12 months × 10 000 bps: the monthly rate is tnaBps / 120 000 (monthly rate = TNA / 12). */
const MONTHLY_RATE_DENOMINATOR = 120_000n;
const BPS = 10_000n;

/** PER_GROUP: the line's amounts are for the whole group and are divided among `passengerCount`. */
export type PricingUnit = 'PER_PASSENGER' | 'PER_GROUP';

export interface PricingLineInput {
  quantity: number;
  unitPriceMinor: bigint;
  discountMinor: bigint;
  pricingUnit: PricingUnit;
}

export interface PricingInput {
  lines: readonly PricingLineInput[];
  commercialDiscountMinor: bigint;
  downPaymentMinor: bigint;
  installments: number;
  tnaBps: number;
  /** Required when any line is PER_GROUP (1 to MAX_PASSENGERS). */
  passengerCount?: number | null;
}

export interface InstallmentRow {
  number: number;
  paymentMinor: bigint;
  interestMinor: bigint;
  principalMinor: bigint;
  /** Remaining financed balance after this installment. */
  balanceMinor: bigint;
}

export interface PricingResult {
  formulaVersion: typeof FORMULA_VERSION;
  currency: 'ARS';
  /** Every total below is per passenger. */
  pricingUnit: 'PER_PASSENGER';
  passengerCount: number | null;
  /** Gross and net in the line's own unit (group amounts for PER_GROUP); the passenger's share. */
  lines: {
    pricingUnit: PricingUnit;
    lineGrossMinor: bigint;
    lineNetMinor: bigint;
    perPassengerMinor: bigint;
  }[];
  subtotalMinor: bigint;
  commercialDiscountMinor: bigint;
  cashPriceMinor: bigint;
  downPaymentMinor: bigint;
  financedPrincipalMinor: bigint;
  installments: number;
  /** 0 for cash sales: the rate is ignored when nothing is financed. */
  tnaBps: number;
  teaBps: number;
  cftBps: number;
  /** CFT = TEA only while there are no fees, insurance or taxes on interest (F-b). */
  cftIncludesCosts: false;
  schedule: InstallmentRow[];
  /** Consecutive equal installments, e.g. 17 × 72.197,40 then 1 × 72.197,41. */
  scheduleSummary: { count: number; paymentMinor: bigint }[];
  totalInstallmentsMinor: bigint;
  totalInterestMinor: bigint;
  totalPayableMinor: bigint;
}

export interface PricingIssue {
  path: string;
  message: string;
}

export class PricingValidationError extends Error {
  constructor(readonly issues: PricingIssue[]) {
    super(`Invalid pricing input: ${issues.map((issue) => issue.path).join(', ')}`);
  }
}

/** ceil(a / b) for a ≥ 0, b > 0. */
export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new RangeError('ceilDiv expects a ≥ 0 and b > 0');
  return (numerator + denominator - 1n) / denominator;
}

/** floor((2a + b) / (2b)) for a ≥ 0, b > 0. */
export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n)
    throw new RangeError('roundHalfUp expects a ≥ 0 and b > 0');
  return (2n * numerator + denominator) / (2n * denominator);
}

/** Effective annual rate of monthly compounding at TNA/12, in bps (0.01 %), rounded half-up. */
export function teaBpsFor(tnaBps: number): number {
  const ratePlusOne = MONTHLY_RATE_DENOMINATOR + BigInt(tnaBps);
  const base = MONTHLY_RATE_DENOMINATOR ** 12n;
  return Number(roundHalfUp((ratePlusOne ** 12n - base) * BPS, base));
}

function interestFreeSchedule(principal: bigint, installments: number): InstallmentRow[] {
  const n = BigInt(installments);
  const base = principal / n;
  const remainder = principal % n;
  let balance = principal;
  return Array.from({ length: installments }, (_, index) => {
    const payment = base + (BigInt(index) < remainder ? 1n : 0n);
    balance -= payment;
    return {
      number: index + 1,
      paymentMinor: payment,
      interestMinor: 0n,
      principalMinor: payment,
      balanceMinor: balance,
    };
  });
}

function frenchSchedule(principal: bigint, installments: number, tnaBps: number): InstallmentRow[] {
  const rate = BigInt(tnaBps);
  const growth = (MONTHLY_RATE_DENOMINATOR + rate) ** BigInt(installments);
  const base = MONTHLY_RATE_DENOMINATOR ** BigInt(installments);
  const installment = roundHalfUp(
    principal * rate * growth,
    MONTHLY_RATE_DENOMINATOR * (growth - base),
  );

  const rows: InstallmentRow[] = [];
  let balance = principal;
  for (let k = 1; k <= installments; k++) {
    const interest = roundHalfUp(balance * rate, MONTHLY_RATE_DENOMINATOR);
    const payment = k < installments ? installment : balance + interest;
    const principalPart = payment - interest;
    balance -= principalPart;
    if (balance < 0n || principalPart < 0n) {
      // Unreachable for inputs within the limits (property-tested); fail loudly rather than publish it.
      throw new Error('French schedule invariant violated');
    }
    rows.push({
      number: k,
      paymentMinor: payment,
      interestMinor: interest,
      principalMinor: principalPart,
      balanceMinor: balance,
    });
  }
  if (balance !== 0n) throw new Error('French schedule did not amortize to zero');
  return rows;
}

function summarize(schedule: InstallmentRow[]): { count: number; paymentMinor: bigint }[] {
  const runs: { count: number; paymentMinor: bigint }[] = [];
  for (const row of schedule) {
    const last = runs.at(-1);
    if (last && last.paymentMinor === row.paymentMinor) last.count += 1;
    else runs.push({ count: 1, paymentMinor: row.paymentMinor });
  }
  return runs;
}

function isAmount(value: bigint): boolean {
  return value >= 0n && value <= MAX_AMOUNT_MINOR;
}

const amountMessage = 'Tiene que ser un monto entre 0 y 1.000.000.000.000,00.';

function scheduleFor(financedPrincipalMinor: bigint, installments: number, tnaBps: number) {
  if (financedPrincipalMinor === 0n) return [];
  return tnaBps === 0
    ? interestFreeSchedule(financedPrincipalMinor, installments)
    : frenchSchedule(financedPrincipalMinor, installments, tnaBps);
}

const smallestPayment = (schedule: InstallmentRow[]) =>
  schedule.reduce(
    (min, row) => (row.paymentMinor < min ? row.paymentMinor : min),
    schedule[0]!.paymentMinor,
  );

/** Largest installment count whose every installment reaches the minimum (0 if not even one does). */
function maxInstallmentsFor(
  financedPrincipalMinor: bigint,
  tnaBps: number,
  minimum: bigint,
): number {
  for (let n = MAX_INSTALLMENTS; n >= 1; n--) {
    if (financedPrincipalMinor < BigInt(n) * MIN_FINANCED_PER_INSTALLMENT_MINOR) continue;
    if (smallestPayment(scheduleFor(financedPrincipalMinor, n, tnaBps)) >= minimum) return n;
  }
  return 0;
}

/** Deterministic, exact calculation. Throws PricingValidationError listing every invalid input. */
export function calculatePricing(
  input: PricingInput,
  rules: PricingRules = COMMERCIAL_RULES,
): PricingResult {
  const issues: PricingIssue[] = [];
  const passengerCount = input.passengerCount ?? null;
  const hasGroupLines = input.lines.some((line) => line.pricingUnit === 'PER_GROUP');
  const validPassengers =
    passengerCount !== null &&
    Number.isInteger(passengerCount) &&
    passengerCount >= 1 &&
    passengerCount <= MAX_PASSENGERS;
  if ((hasGroupLines || passengerCount !== null) && !validPassengers) {
    issues.push({
      path: 'passengerCount',
      message: `Indicá entre cuántos pasajeros se divide el costo del grupo (de 1 a ${MAX_PASSENGERS}).`,
    });
  }

  const lines = input.lines.map((line, index) => {
    const path = `items.${index}`;
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
      issues.push({
        path: `${path}.quantity`,
        message: `La cantidad tiene que ser un entero entre 1 y ${MAX_QUANTITY}.`,
      });
    }
    if (line.pricingUnit !== 'PER_PASSENGER' && line.pricingUnit !== 'PER_GROUP') {
      issues.push({
        path: `${path}.pricingUnit`,
        message: 'El precio tiene que ser por pasajero o por grupo.',
      });
    }
    if (!isAmount(line.unitPriceMinor))
      issues.push({ path: `${path}.unitPriceMinor`, message: amountMessage });
    if (!isAmount(line.discountMinor))
      issues.push({ path: `${path}.discountMinor`, message: amountMessage });

    const lineGrossMinor =
      BigInt(Number.isInteger(line.quantity) ? line.quantity : 0) * line.unitPriceMinor;
    if (lineGrossMinor > MAX_AMOUNT_MINOR) {
      issues.push({
        path: `${path}.quantity`,
        message: 'El importe de la línea es demasiado grande.',
      });
    } else if (isAmount(line.discountMinor) && line.discountMinor > lineGrossMinor) {
      issues.push({
        path: `${path}.discountMinor`,
        message: 'El descuento no puede superar el importe de la línea.',
      });
    }
    const lineNetMinor = lineGrossMinor - line.discountMinor;
    const perPassengerMinor =
      line.pricingUnit === 'PER_GROUP'
        ? validPassengers && lineNetMinor >= 0n
          ? ceilDiv(lineNetMinor, BigInt(passengerCount))
          : 0n
        : lineNetMinor;
    return { pricingUnit: line.pricingUnit, lineGrossMinor, lineNetMinor, perPassengerMinor };
  });
  if (!isAmount(input.commercialDiscountMinor))
    issues.push({ path: 'commercialDiscountMinor', message: amountMessage });
  if (!isAmount(input.downPaymentMinor))
    issues.push({ path: 'downPaymentMinor', message: amountMessage });
  if (
    !Number.isInteger(input.installments) ||
    input.installments < 0 ||
    input.installments > MAX_INSTALLMENTS
  ) {
    issues.push({
      path: 'installments',
      message: `La cantidad de cuotas tiene que estar entre 1 y ${MAX_INSTALLMENTS}.`,
    });
  }
  if (!Number.isInteger(input.tnaBps) || input.tnaBps < 0 || input.tnaBps > MAX_TNA_BPS) {
    issues.push({ path: 'tnaBps', message: 'La TNA tiene que estar entre 0 % y 66 %.' });
  }
  if (issues.length > 0) throw new PricingValidationError(issues);

  const subtotalMinor = lines.reduce((sum, line) => sum + line.perPassengerMinor, 0n);
  if (subtotalMinor > MAX_AMOUNT_MINOR) {
    throw new PricingValidationError([
      { path: 'items', message: 'El subtotal es demasiado grande.' },
    ]);
  }
  if (input.commercialDiscountMinor > subtotalMinor) {
    throw new PricingValidationError([
      {
        path: 'commercialDiscountMinor',
        message: 'El descuento comercial no puede superar el subtotal.',
      },
    ]);
  }
  const cashPriceMinor = subtotalMinor - input.commercialDiscountMinor;
  if (input.downPaymentMinor > cashPriceMinor) {
    throw new PricingValidationError([
      { path: 'downPaymentMinor', message: 'El anticipo no puede superar el precio de contado.' },
    ]);
  }
  const financedPrincipalMinor = cashPriceMinor - input.downPaymentMinor;

  if (financedPrincipalMinor === 0n && input.installments !== 0) {
    throw new PricingValidationError([
      {
        path: 'installments',
        message: 'Sin monto financiado (pago de contado) no corresponden cuotas.',
      },
    ]);
  }
  if (financedPrincipalMinor > 0n && input.installments === 0) {
    throw new PricingValidationError([
      {
        path: 'installments',
        message: `Elegí entre 1 y ${MAX_INSTALLMENTS} cuotas para el monto financiado.`,
      },
    ]);
  }
  if (financedPrincipalMinor < BigInt(input.installments) * MIN_FINANCED_PER_INSTALLMENT_MINOR) {
    throw new PricingValidationError([
      {
        path: 'installments',
        message: 'Cada cuota tiene que financiar al menos $ 1,00: usá menos cuotas.',
      },
    ]);
  }

  const tnaBps = financedPrincipalMinor === 0n ? 0 : input.tnaBps;
  const schedule = scheduleFor(financedPrincipalMinor, input.installments, tnaBps);
  if (schedule.length > 0 && smallestPayment(schedule) < rules.minInstallmentMinor) {
    const max = maxInstallmentsFor(financedPrincipalMinor, tnaBps, rules.minInstallmentMinor);
    throw new PricingValidationError([
      {
        path: 'installments',
        message:
          max === 0
            ? `Cada cuota tiene que ser de al menos ${MIN_INSTALLMENT_LABEL} y el monto financiado no alcanza: aumentá el anticipo o vendelo de contado.`
            : `Cada cuota tiene que ser de al menos ${MIN_INSTALLMENT_LABEL}: con este monto financiado, hasta ${max} ${max === 1 ? 'cuota' : 'cuotas'}.`,
      },
    ]);
  }
  const totalInstallmentsMinor = schedule.reduce((sum, row) => sum + row.paymentMinor, 0n);
  const totalPayableMinor = input.downPaymentMinor + totalInstallmentsMinor;
  if (totalPayableMinor > MAX_AMOUNT_MINOR) {
    throw new PricingValidationError([
      { path: 'items', message: 'El total a pagar es demasiado grande.' },
    ]);
  }
  const teaBps = teaBpsFor(tnaBps);

  return {
    formulaVersion: FORMULA_VERSION,
    currency: 'ARS',
    pricingUnit: 'PER_PASSENGER',
    passengerCount,
    lines,
    subtotalMinor,
    commercialDiscountMinor: input.commercialDiscountMinor,
    cashPriceMinor,
    downPaymentMinor: input.downPaymentMinor,
    financedPrincipalMinor,
    installments: input.installments,
    tnaBps,
    teaBps,
    cftBps: teaBps,
    cftIncludesCosts: false,
    schedule,
    scheduleSummary: summarize(schedule),
    totalInstallmentsMinor,
    totalInterestMinor: totalInstallmentsMinor - financedPrincipalMinor,
    totalPayableMinor,
  };
}

/**
 * Installment tiers offered to families (owner, 2026-10-03): staff pick the maximum and the offer
 * includes every tier up to it ("if there are 24 installments there are also 18, 12, 6 and 3").
 */
export const INSTALLMENT_TIERS = [3, 6, 12, 18, 24] as const;

export interface InstallmentOption {
  installments: number;
  tnaBps: number;
  teaBps: number;
  cftBps: number;
  financedPrincipalMinor: bigint;
  schedule: InstallmentRow[];
  scheduleSummary: { count: number; paymentMinor: bigint }[];
  totalInstallmentsMinor: bigint;
  totalInterestMinor: bigint;
  totalPayableMinor: bigint;
}

export interface OfferResult {
  /** The largest valid option (or the cash sale): what the proposal's totals and breakdown show. */
  primary: PricingResult;
  /** Valid installment options, fewest installments first (empty for a cash-only proposal). */
  options: InstallmentOption[];
  /** Tiers up to the maximum that break a commercial rule (e.g. the minimum installment). */
  excluded: { installments: number; message: string }[];
}

const toOption = (result: PricingResult): InstallmentOption => ({
  installments: result.installments,
  tnaBps: result.tnaBps,
  teaBps: result.teaBps,
  cftBps: result.cftBps,
  financedPrincipalMinor: result.financedPrincipalMinor,
  schedule: result.schedule,
  scheduleSummary: result.scheduleSummary,
  totalInstallmentsMinor: result.totalInstallmentsMinor,
  totalInterestMinor: result.totalInterestMinor,
  totalPayableMinor: result.totalPayableMinor,
});

/**
 * Cash price plus every installment tier up to `input.installments` (a non-tier maximum, from older
 * drafts, is offered as well). The same down payment and TNA apply to every option. Structural
 * errors (limits, discounts, cash sale with installments…) are reported as before; a tier is only
 * excluded when it breaks a commercial rule, and when every tier does, the maximum's error is thrown.
 */
export function calculateOffer(
  input: PricingInput,
  rules: PricingRules = COMMERCIAL_RULES,
): OfferResult {
  // The formula alone first: structural errors are never silently turned into exclusions.
  calculatePricing(input, { ...rules, minInstallmentMinor: 0n });
  if (input.installments === 0) {
    return { primary: calculatePricing(input, rules), options: [], excluded: [] };
  }
  const counts = [
    ...new Set([
      ...INSTALLMENT_TIERS.filter((tier) => tier <= input.installments),
      input.installments,
    ]),
  ].sort((a, b) => a - b);
  const results: PricingResult[] = [];
  const excluded: OfferResult['excluded'] = [];
  for (const installments of counts) {
    try {
      results.push(calculatePricing({ ...input, installments }, rules));
    } catch (error) {
      if (!(error instanceof PricingValidationError)) throw error;
      excluded.push({
        installments,
        message: error.issues.map((issue) => issue.message).join(' '),
      });
    }
  }
  const primary = results.at(-1);
  if (!primary) return { primary: calculatePricing(input, rules), options: [], excluded };
  return { primary, options: results.map(toOption), excluded };
}
