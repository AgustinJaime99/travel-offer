import { Injectable } from '@nestjs/common';
import type {
  DashboardAnalytics,
  DashboardAnalyticsQuery,
  Province,
  RequestStatus,
  RequestType,
} from '@travel-rock/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { analyticsRange, type Granularity } from './analytics-range.js';

const TOP_SCHOOLS = 8;
const TOP_DEMAND = 5;
const EXPIRING_DAYS = 30;
const EXPIRING_LIMIT = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

// Timestamps are stored as UTC "timestamp without time zone": parameters are converted to UTC
// explicitly (independent of the session time zone) and buckets follow Argentina time.
const utc = (instant: Date) => Prisma.sql`(${instant}::timestamptz AT TIME ZONE 'UTC')`;
const localCreatedAt = (column: Prisma.Sql) =>
  Prisma.sql`((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')`;

interface PriceRow {
  proposals: bigint;
  cashMin: bigint | null;
  cashMedian: bigint | null;
  cashMax: bigint | null;
  totalMin: bigint | null;
  totalMedian: bigint | null;
  totalMax: bigint | null;
}

/**
 * Aggregates for the staff analytics page: counts, distributions and price statistics. Never
 * returns personal data (no applicant or student fields are selected).
 */
@Injectable()
export class DashboardAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async analytics(query: DashboardAnalyticsQuery, now = new Date()): Promise<DashboardAnalytics> {
    const year = query.travelYear;
    const range = analyticsRange(query.period, now);
    const groupYear = year === undefined ? Prisma.empty : Prisma.sql`AND g."travelYear" = ${year}`;
    const enrollmentsIn = (from: Date, to: Date): Prisma.EnrollmentWhereInput => ({
      status: 'SUBMITTED',
      createdAt: { gte: from, lt: to },
      ...(year === undefined ? {} : { schoolGroup: { travelYear: year } }),
    });
    const requestsIn = (from: Date, to: Date): Prisma.SchoolRequestWhereInput => ({
      createdAt: { gte: from, lt: to },
      ...(year === undefined ? {} : { travelYear: year }),
    });
    const requestYear = year === undefined ? {} : { travelYear: year };
    // `to` is exclusive; include the request instant itself.
    const to = new Date(range.to.getTime() + 1);

    const [
      currentSeries,
      previousSeries,
      funnel,
      previousFunnel,
      byProvince,
      topSchools,
      expiringSoon,
      groupsByYear,
      prices,
      createdCurrent,
      createdPrevious,
      byStatus,
      byType,
      topDemand,
    ] = await Promise.all([
      this.enrollmentSeries(range.granularity, range.from, to, groupYear),
      this.enrollmentSeries(range.granularity, range.previousFrom, range.previousTo, groupYear),
      this.funnel(enrollmentsIn(range.from, to)),
      this.funnel(enrollmentsIn(range.previousFrom, range.previousTo)),
      this.prisma.$queryRaw<{ province: Province; enrollments: number }[]>`
        SELECT s.province, count(*)::int AS enrollments
        FROM "Enrollment" e
        JOIN "SchoolGroup" g ON g.id = e."schoolGroupId"
        JOIN "School" s ON s.id = g."schoolId"
        WHERE e.status = 'SUBMITTED' AND e."createdAt" >= ${utc(range.from)} AND e."createdAt" < ${utc(to)}
          ${groupYear}
        GROUP BY s.province
        ORDER BY enrollments DESC, s.province`,
      this.prisma.$queryRaw<
        {
          schoolId: string;
          name: string;
          province: Province;
          city: string;
          groups: number;
          enrollments: number;
        }[]
      >`
        SELECT s.id AS "schoolId", s.name, s.province, s.city,
          count(DISTINCT g.id)::int AS groups, count(*)::int AS enrollments
        FROM "Enrollment" e
        JOIN "SchoolGroup" g ON g.id = e."schoolGroupId"
        JOIN "School" s ON s.id = g."schoolId"
        WHERE e.status = 'SUBMITTED' AND e."createdAt" >= ${utc(range.from)} AND e."createdAt" < ${utc(to)}
          ${groupYear}
        GROUP BY s.id
        ORDER BY enrollments DESC, s."normalizedName", s.id
        LIMIT ${TOP_SCHOOLS}`,
      this.prisma.commercialProposal.findMany({
        where: {
          status: 'PUBLISHED',
          validUntil: { gt: now, lte: new Date(now.getTime() + EXPIRING_DAYS * DAY_MS) },
          OR: [{ validFrom: null }, { validFrom: { lte: now } }],
          ...(year === undefined ? {} : { schoolGroup: { travelYear: year } }),
        },
        select: {
          id: true,
          version: true,
          validUntil: true,
          schoolGroup: {
            select: { name: true, travelYear: true, school: { select: { name: true } } },
          },
        },
        orderBy: [{ validUntil: 'asc' }, { id: 'asc' }],
        take: EXPIRING_LIMIT,
      }),
      this.prisma.schoolGroup.groupBy({
        by: ['travelYear', 'status'],
        _count: { _all: true },
        orderBy: [{ travelYear: 'asc' }],
      }),
      this.prisma.$queryRaw<PriceRow[]>`
        SELECT count(*) AS proposals,
          min(p."cashPriceMinor") AS "cashMin",
          percentile_disc(0.5) WITHIN GROUP (ORDER BY p."cashPriceMinor") AS "cashMedian",
          max(p."cashPriceMinor") AS "cashMax",
          min(p."totalPayableMinor") AS "totalMin",
          percentile_disc(0.5) WITHIN GROUP (ORDER BY p."totalPayableMinor") AS "totalMedian",
          max(p."totalPayableMinor") AS "totalMax"
        FROM "CommercialProposal" p
        JOIN "SchoolGroup" g ON g.id = p."schoolGroupId"
        WHERE p.status = 'PUBLISHED' AND p."validUntil" > ${utc(now)}
          AND (p."validFrom" IS NULL OR p."validFrom" <= ${utc(now)})
          ${groupYear}`,
      this.prisma.schoolRequest.count({ where: requestsIn(range.from, to) }),
      this.prisma.schoolRequest.count({ where: requestsIn(range.previousFrom, range.previousTo) }),
      this.prisma.schoolRequest.groupBy({
        by: ['status'],
        where: requestYear,
        _count: { _all: true },
      }),
      this.prisma.schoolRequest.groupBy({
        by: ['type'],
        where: requestYear,
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<
        { schoolName: string; province: Province; city: string; requests: number }[]
      >`
        SELECT min("schoolName") AS "schoolName", min(province::text)::"Province" AS province,
          min(city) AS city, count(*)::int AS requests
        FROM "SchoolRequest"
        WHERE status IN ('PENDING', 'REVIEWING')
          ${year === undefined ? Prisma.empty : Prisma.sql`AND "travelYear" = ${year}`}
        GROUP BY "demandKey"
        ORDER BY requests DESC, min("schoolName")
        LIMIT ${TOP_DEMAND}`,
    ]);

    const years = new Map<number, { active: number; inactive: number }>();
    for (const row of groupsByYear) {
      const entry = years.get(row.travelYear) ?? { active: 0, inactive: 0 };
      entry[row.status === 'ACTIVE' ? 'active' : 'inactive'] += row._count._all;
      years.set(row.travelYear, entry);
    }
    const price = prices[0];
    const stats = (min: bigint | null, median: bigint | null, max: bigint | null) =>
      min === null || median === null || max === null
        ? null
        : { min: min.toString(), median: median.toString(), max: max.toString() };
    const statusCounts = new Map(byStatus.map((row) => [row.status, row._count._all]));
    const typeCounts = new Map(byType.map((row) => [row.type, row._count._all]));

    return {
      travelYear: year ?? null,
      period: query.period,
      granularity: range.granularity,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      previousRange: {
        from: range.previousFrom.toISOString(),
        to: range.previousTo.toISOString(),
      },
      enrollments: {
        current: sum(currentSeries),
        previous: sum(previousSeries),
        series: range.buckets.map((bucket, index) => {
          const previousBucket = range.previousBuckets[index]!;
          return {
            bucket,
            previousBucket,
            current: currentSeries.get(bucket) ?? 0,
            previous: previousSeries.get(previousBucket) ?? 0,
          };
        }),
      },
      funnel,
      previousFunnel,
      byProvince,
      topSchools,
      expiringSoon: expiringSoon.map((proposal) => ({
        proposalId: proposal.id,
        version: proposal.version,
        groupName: proposal.schoolGroup.name,
        travelYear: proposal.schoolGroup.travelYear,
        schoolName: proposal.schoolGroup.school.name,
        validUntil: proposal.validUntil!.toISOString(),
      })),
      groupsByYear: [...years].map(([travelYear, counts]) => ({ travelYear, ...counts })),
      prices: {
        proposals: Number(price?.proposals ?? 0),
        cash: stats(price?.cashMin ?? null, price?.cashMedian ?? null, price?.cashMax ?? null),
        totalPayable: stats(
          price?.totalMin ?? null,
          price?.totalMedian ?? null,
          price?.totalMax ?? null,
        ),
      },
      requests: {
        createdCurrent,
        createdPrevious,
        byStatus: (['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as RequestStatus[]).map(
          (status) => ({ status, count: statusCounts.get(status) ?? 0 }),
        ),
        byType: (['SCHOOL_NOT_FOUND', 'GROUP_NOT_FOUND'] as RequestType[]).map((type) => ({
          type,
          count: typeCounts.get(type) ?? 0,
        })),
        topDemand,
      },
      generatedAt: now.toISOString(),
    };
  }

  /** Enrollment counts per local bucket start (YYYY-MM-DD). */
  private async enrollmentSeries(
    granularity: Granularity,
    from: Date,
    to: Date,
    groupYear: Prisma.Sql,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<{ bucket: string; enrollments: number }[]>`
      SELECT to_char(date_trunc(${granularity}, ${localCreatedAt(Prisma.sql`e."createdAt"`)}), 'YYYY-MM-DD') AS bucket,
        count(*)::int AS enrollments
      FROM "Enrollment" e
      JOIN "SchoolGroup" g ON g.id = e."schoolGroupId"
      WHERE e.status = 'SUBMITTED' AND e."createdAt" >= ${utc(from)} AND e."createdAt" < ${utc(to)}
        ${groupYear}
      GROUP BY 1`;
    return new Map(rows.map((row) => [row.bucket, row.enrollments]));
  }

  private async funnel(where: Prisma.EnrollmentWhereInput) {
    const [enrolled, withAccess, viewedProposal] = await Promise.all([
      this.prisma.enrollment.count({ where }),
      this.prisma.enrollment.count({ where: { ...where, accessGrantedAt: { not: null } } }),
      this.prisma.enrollment.count({ where: { ...where, views: { some: {} } } }),
    ]);
    return { enrolled, withAccess, viewedProposal };
  }
}

function sum(series: Map<string, number>): number {
  let total = 0;
  for (const value of series.values()) total += value;
  return total;
}
