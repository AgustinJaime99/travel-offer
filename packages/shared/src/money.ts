import { z } from 'zod';

/** ARS amounts are integer centavos (T2). Upper bound from the pricing contract (DOMAIN.md). */
export const MAX_AMOUNT_MINOR = 10n ** 14n;

/** Transport form of a money amount: decimal string of centavos, e.g. "125000050" = $ 1.250.000,50. */
export const moneyMinorSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,14})$/, { error: 'Monto inválido.', abort: true })
  .refine((value) => BigInt(value) <= MAX_AMOUNT_MINOR, { error: 'El monto es demasiado grande.' });

/**
 * Parses an amount typed in Argentine format into centavos, exactly (no floating point).
 * Accepts "1250000", "1.250.000", "1.250.000,5", "1250000,50", "$ 1.250.000,50".
 * "." is only a thousands separator (groups of 3); "," starts at most 2 decimals. Returns null if invalid.
 */
export function parseArsToMinor(input: string): bigint | null {
  const value = input.trim().replace(/^\$\s*/, '');
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const pesos = BigInt(match[1]!.replace(/\./g, ''));
  const cents = BigInt((match[2] ?? '').padEnd(2, '0'));
  const minor = pesos * 100n + cents;
  return minor <= MAX_AMOUNT_MINOR ? minor : null;
}

const pesosFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** "125000050" → "$ 1.250.000,50". Exact for any bigint amount. */
export function formatArs(minor: bigint | string): string {
  const amount = typeof minor === 'string' ? BigInt(minor) : minor;
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const cents = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}$ ${pesosFormat.format(absolute / 100n)},${cents}`;
}

/** Editable form of an amount: "125000050" → "1.250.000,50" (round-trips through parseArsToMinor). */
export function minorToArsInput(minor: bigint | string): string {
  return formatArs(minor).replace(/^\$ /, '');
}
