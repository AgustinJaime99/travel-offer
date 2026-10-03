import { describe, expect, it } from 'vitest';
import { arDayToEndIso, arDayToStartIso, isoToArDay } from './format';

describe('Argentine calendar days', () => {
  it('anchors days to UTC−3', () => {
    expect(arDayToStartIso('2027-03-31')).toBe('2027-03-31T03:00:00.000Z');
    expect(arDayToEndIso('2027-03-31')).toBe('2027-04-01T02:59:59.999Z');
  });

  it('round-trips through the date input value', () => {
    for (const day of ['2027-01-01', '2027-03-31', '2027-12-31']) {
      expect(isoToArDay(arDayToEndIso(day))).toBe(day);
      expect(isoToArDay(arDayToStartIso(day))).toBe(day);
    }
  });
});
