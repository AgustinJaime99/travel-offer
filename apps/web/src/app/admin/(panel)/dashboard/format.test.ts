import { describe, expect, it } from 'vitest';
import { formatArsShort, formatBucket, formatDelta, formatShare } from './format';

describe('dashboard formatting', () => {
  it('labels buckets in Spanish, by granularity', () => {
    expect(formatBucket('2026-10-02', 'day')).toBe('2 oct');
    expect(formatBucket('2026-09-28', 'week')).toBe('sem. 28 sept');
    expect(formatBucket('2026-01-01', 'month')).toMatch(/^ene(ro)? (de )?2026$/);
  });

  it('formats shares and deltas', () => {
    expect(formatShare(1, 2)).toBe('50 %');
    expect(formatShare(0, 0)).toBe('—');
    expect(formatDelta(5, 2)).toBe('+3');
    expect(formatDelta(2, 5)).toBe('−3');
    expect(formatDelta(1, 1)).toBe('0');
  });

  it('shortens peso amounts exactly from centavos', () => {
    expect(formatArsShort('150000000')).toBe('$ 1,5 M');
    expect(formatArsShort('371892769')).toBe('$ 3,72 M');
    expect(formatArsShort('85000000')).toBe('$ 850 mil');
    expect(formatArsShort('99900')).toBe('$ 999');
  });
});
