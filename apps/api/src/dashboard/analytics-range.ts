import type { AnalyticsPeriod } from '@travel-rock/shared';

/** Argentina has no DST: local time is UTC−03:00 all year (same rule as the web's format.ts). */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Granularity = 'day' | 'week' | 'month';

export interface AnalyticsRange {
  granularity: Granularity;
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  /** Local start dates (YYYY-MM-DD) of the period's buckets and of the aligned previous ones. */
  buckets: string[];
  previousBuckets: string[];
}

// "Local" values are Argentina wall-clock times stored as UTC milliseconds.
const toInstant = (local: number) => new Date(local + AR_OFFSET_MS);
const toKey = (local: number) => new Date(local).toISOString().slice(0, 10);

/**
 * The selected period ends now and starts at a bucket boundary in Argentina time: the last 30 days,
 * the last 13 ISO weeks (Monday start) or the last 12 calendar months. The previous period is the
 * same number of whole buckets right before it.
 */
export function analyticsRange(period: AnalyticsPeriod, now: Date): AnalyticsRange {
  const local = new Date(now.getTime() - AR_OFFSET_MS);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());

  let granularity: Granularity;
  let starts: number[];
  let previousStarts: number[];
  if (period === '12m') {
    granularity = 'month';
    const month = (offset: number) =>
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset, 1);
    starts = Array.from({ length: 12 }, (_, index) => month(index - 11));
    previousStarts = Array.from({ length: 12 }, (_, index) => month(index - 23));
  } else {
    const weekly = period === '90d';
    granularity = weekly ? 'week' : 'day';
    const count = weekly ? 13 : 30;
    const step = weekly ? 7 * DAY_MS : DAY_MS;
    const mondayOffset = (new Date(today).getUTCDay() + 6) % 7;
    const last = weekly ? today - mondayOffset * DAY_MS : today;
    starts = Array.from({ length: count }, (_, index) => last - (count - 1 - index) * step);
    previousStarts = starts.map((start) => start - count * step);
  }

  return {
    granularity,
    from: toInstant(starts[0]!),
    to: now,
    previousFrom: toInstant(previousStarts[0]!),
    previousTo: toInstant(starts[0]!),
    buckets: starts.map(toKey),
    previousBuckets: previousStarts.map(toKey),
  };
}
