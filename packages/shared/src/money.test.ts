import { describe, expect, it } from 'vitest';
import {
  formatArs,
  MAX_AMOUNT_MINOR,
  minorToArsInput,
  moneyMinorSchema,
  parseArsToMinor,
} from './money.js';

describe('parseArsToMinor', () => {
  it.each([
    ['1250000', 125000000n],
    ['1.250.000', 125000000n],
    ['1.250.000,5', 125000050n],
    ['1250000,50', 125000050n],
    ['$ 1.250.000,50', 125000050n],
    ['  740.000,00 ', 74000000n],
    ['0', 0n],
    ['0,01', 1n],
    ['999', 99900n],
  ])('%s → %s', (input, expected) => {
    expect(parseArsToMinor(input)).toBe(expected);
  });

  it.each([
    '',
    'abc',
    '1,5,0',
    '1.5',
    '1.25.000',
    '12.50',
    '1,234',
    '-100',
    '1 000',
    '1e6',
    '0x10',
  ])('rejects %s', (input) => {
    expect(parseArsToMinor(input)).toBeNull();
  });

  it('rejects amounts above the limit', () => {
    expect(parseArsToMinor('1.000.000.000.000')).toBe(MAX_AMOUNT_MINOR);
    expect(parseArsToMinor('1.000.000.000.000,01')).toBeNull();
  });
});

describe('formatArs', () => {
  it.each([
    [125000050n, '$ 1.250.000,50'],
    ['0', '$ 0,00'],
    ['1', '$ 0,01'],
    ['7200000', '$ 72.000,00'],
    [-29916667n, '-$ 299.166,67'],
    [MAX_AMOUNT_MINOR, '$ 1.000.000.000.000,00'],
  ])('%s → %s', (input, expected) => {
    expect(formatArs(input)).toBe(expected);
  });

  it('round-trips through the input format', () => {
    for (const minor of [0n, 1n, 99n, 100n, 125000050n, 123456789012345n % MAX_AMOUNT_MINOR]) {
      expect(parseArsToMinor(minorToArsInput(minor))).toBe(minor);
    }
  });
});

describe('moneyMinorSchema', () => {
  it('accepts canonical centavo strings only', () => {
    expect(moneyMinorSchema.safeParse('125000050').success).toBe(true);
    expect(moneyMinorSchema.safeParse('0').success).toBe(true);
    for (const bad of ['', '007', '-1', '1.5', '1e3', ' 1', String(MAX_AMOUNT_MINOR + 1n)]) {
      expect(moneyMinorSchema.safeParse(bad).success).toBe(false);
    }
  });
});
