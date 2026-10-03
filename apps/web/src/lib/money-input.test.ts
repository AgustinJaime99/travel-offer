import { describe, expect, it } from 'vitest';
import { normalizeArsInput } from './money-input';

describe('normalizeArsInput', () => {
  it('formats typed amounts in Argentine pesos with two decimals', () => {
    expect(normalizeArsInput('10000')).toBe('10.000,00');
    expect(normalizeArsInput('650000')).toBe('650.000,00');
    expect(normalizeArsInput('1250000,5')).toBe('1.250.000,50');
    expect(normalizeArsInput('1.250.000,50')).toBe('1.250.000,50');
    expect(normalizeArsInput('$ 999')).toBe('999,00');
    expect(normalizeArsInput('0')).toBe('0,00');
  });

  it('leaves empty or invalid input as typed, for the validation message', () => {
    for (const value of ['', 'abc', '10.5', '1,234', '12,345']) {
      expect(normalizeArsInput(value)).toBe(value);
    }
  });
});
