import { z } from 'zod';
import { moneyMinorSchema } from './money.js';
import { provinceSchema } from './school.js';
import { requestStatusSchema, requestTypeSchema } from './school-request.js';

const count = z.number().int().min(0);

export const analyticsPeriods = ['30d', '90d', '12m'] as const;
export const analyticsPeriodSchema = z.enum(analyticsPeriods);
export type AnalyticsPeriod = z.infer<typeof analyticsPeriodSchema>;

export const analyticsPeriodLabels: Record<AnalyticsPeriod, string> = {
  '30d': 'Últimos 30 días',
  '90d': 'Últimos 90 días',
  '12m': 'Últimos 12 meses',
};

export const dashboardAnalyticsQuerySchema = z.object({
  /** Same filter as the summary: groups, proposals, enrollments and requests. */
  travelYear: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(2000).max(2100).optional(),
  ),
  period: z.preprocess(
    (value) => (value === '' ? undefined : value),
    analyticsPeriodSchema.default('30d'),
  ),
});
export type DashboardAnalyticsQuery = z.output<typeof dashboardAnalyticsQuerySchema>;

const priceStats = z.object({
  min: moneyMinorSchema,
  median: moneyMinorSchema,
  max: moneyMinorSchema,
});

/**
 * Aggregates only (no personal data). Activity metrics (enrollments, funnel, requests created) use
 * the selected period and the same-length period before it; the rest is the current state.
 */
export const dashboardAnalyticsSchema = z.object({
  travelYear: z.number().int().nullable(),
  period: analyticsPeriodSchema,
  /** Buckets in Argentina time (America/Argentina/Buenos_Aires): days, ISO weeks or months. */
  granularity: z.enum(['day', 'week', 'month']),
  range: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }),
  previousRange: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }),
  enrollments: z.object({
    current: count,
    previous: count,
    /** `bucket` is the local start date (YYYY-MM-DD); `previous` is the aligned bucket before. */
    series: z.array(
      z.object({
        bucket: z.iso.date(),
        previousBucket: z.iso.date(),
        current: count,
        previous: count,
      }),
    ),
  }),
  /** Enrollments created in the period → with the group's access code → that opened a proposal. */
  funnel: z.object({ enrolled: count, withAccess: count, viewedProposal: count }),
  previousFunnel: z.object({ enrolled: count, withAccess: count, viewedProposal: count }),
  byProvince: z.array(z.object({ province: provinceSchema, enrollments: count })),
  topSchools: z.array(
    z.object({
      schoolId: z.uuid(),
      name: z.string(),
      province: provinceSchema,
      city: z.string(),
      groups: count,
      enrollments: count,
    }),
  ),
  /** Published proposals whose validity ends within 30 days, soonest first. */
  expiringSoon: z.array(
    z.object({
      proposalId: z.uuid(),
      version: z.number().int().min(1),
      groupName: z.string(),
      travelYear: z.number().int(),
      schoolName: z.string(),
      validUntil: z.iso.datetime(),
    }),
  ),
  /** Every travel year (it is the chart's dimension, so the travel-year filter does not apply). */
  groupsByYear: z.array(z.object({ travelYear: z.number().int(), active: count, inactive: count })),
  /** Per-passenger prices of the proposals families can see now (published, inside validity). */
  prices: z.object({
    proposals: count,
    cash: priceStats.nullable(),
    totalPayable: priceStats.nullable(),
  }),
  requests: z.object({
    createdCurrent: count,
    createdPrevious: count,
    byStatus: z.array(z.object({ status: requestStatusSchema, count })),
    byType: z.array(z.object({ type: requestTypeSchema, count })),
    /** Open (pending or under review) requests grouped by requested school. */
    topDemand: z.array(
      z.object({
        schoolName: z.string(),
        province: provinceSchema,
        city: z.string(),
        requests: count,
      }),
    ),
  }),
  generatedAt: z.iso.datetime(),
});
export type DashboardAnalytics = z.infer<typeof dashboardAnalyticsSchema>;
