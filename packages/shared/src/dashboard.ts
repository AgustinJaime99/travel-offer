import { z } from 'zod';

const count = z.number().int().min(0);

export const dashboardQuerySchema = z.object({
  /** Applies to groups, proposals, enrollments and requests (schools have no travel year). */
  travelYear: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(2000).max(2100).optional(),
  ),
});
export type DashboardQuery = z.output<typeof dashboardQuerySchema>;

export const dashboardSummarySchema = z.object({
  travelYear: z.number().int().nullable(),
  schools: z.object({ active: count, inactive: count }),
  groups: z.object({ active: count, inactive: count, withAccessCode: count }),
  proposals: z.object({
    draft: count,
    /** Published and inside the validity window: what families with a code can see. */
    publishedCurrent: count,
    /** Published but past validUntil: no longer shown to families (B12). */
    publishedExpired: count,
    /** Published with a future validFrom. */
    publishedScheduled: count,
    archived: count,
  }),
  enrollments: z.object({ total: count, withAccess: count, withoutAccess: count }),
  requests: z.object({ pending: count, reviewing: count }),
  generatedAt: z.iso.datetime(),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
