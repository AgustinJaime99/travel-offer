import { describe, expect, it } from 'vitest';
import { analyticsRange } from './analytics-range.js';

// 2026-10-02 01:30 UTC is still Thursday 2026-10-01 22:30 in Argentina.
const now = new Date('2026-10-02T01:30:00.000Z');

describe('analyticsRange', () => {
  it('30 days: daily buckets in Argentina time, ending today', () => {
    const range = analyticsRange('30d', now);
    expect(range.granularity).toBe('day');
    expect(range.buckets).toHaveLength(30);
    expect(range.buckets[0]).toBe('2026-09-02');
    expect(range.buckets.at(-1)).toBe('2026-10-01');
    expect(range.from.toISOString()).toBe('2026-09-02T03:00:00.000Z');
    expect(range.to).toBe(now);
    expect(range.previousBuckets[0]).toBe('2026-08-03');
    expect(range.previousBuckets.at(-1)).toBe('2026-09-01');
    expect(range.previousFrom.toISOString()).toBe('2026-08-03T03:00:00.000Z');
    expect(range.previousTo).toEqual(range.from);
  });

  it('90 days: 13 ISO weeks starting on Monday', () => {
    const range = analyticsRange('90d', now);
    expect(range.granularity).toBe('week');
    expect(range.buckets).toHaveLength(13);
    expect(range.buckets.at(-1)).toBe('2026-09-28'); // Monday of the current week
    expect(range.buckets[0]).toBe('2026-07-06');
    for (const key of [...range.buckets, ...range.previousBuckets]) {
      expect(new Date(`${key}T00:00:00Z`).getUTCDay()).toBe(1);
    }
    expect(range.previousBuckets.at(-1)).toBe('2026-06-29');
  });

  it('12 months: calendar months, crossing years', () => {
    const range = analyticsRange('12m', now);
    expect(range.granularity).toBe('month');
    expect(range.buckets[0]).toBe('2025-11-01');
    expect(range.buckets.at(-1)).toBe('2026-10-01');
    expect(range.previousBuckets[0]).toBe('2024-11-01');
    expect(range.previousBuckets.at(-1)).toBe('2025-10-01');
    expect(range.from.toISOString()).toBe('2025-11-01T03:00:00.000Z');
    expect(range.previousTo).toEqual(range.from);
  });
});
