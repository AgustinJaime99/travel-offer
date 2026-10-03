import { Injectable } from '@nestjs/common';
import type { DashboardQuery, DashboardSummary } from '@travel-rock/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Plain counts for the staff home page; each one matches a filter of a list page. */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: DashboardQuery, now = new Date()): Promise<DashboardSummary> {
    const year = query.travelYear;
    const group: Prisma.SchoolGroupWhereInput = year === undefined ? {} : { travelYear: year };
    const proposal = (
      where: Prisma.CommercialProposalWhereInput,
    ): Prisma.CommercialProposalWhereInput => ({
      ...where,
      ...(year === undefined ? {} : { schoolGroup: { travelYear: year } }),
    });
    const enrollment = (where: Prisma.EnrollmentWhereInput): Prisma.EnrollmentWhereInput => ({
      ...where,
      status: 'SUBMITTED',
      ...(year === undefined ? {} : { schoolGroup: { travelYear: year } }),
    });
    const request = (where: Prisma.SchoolRequestWhereInput): Prisma.SchoolRequestWhereInput => ({
      ...where,
      ...(year === undefined ? {} : { travelYear: year }),
    });

    const [
      schoolsActive,
      schoolsInactive,
      groupsActive,
      groupsInactive,
      groupsWithCode,
      draft,
      publishedCurrent,
      publishedExpired,
      publishedScheduled,
      archived,
      enrollmentsTotal,
      enrollmentsWithAccess,
      pending,
      reviewing,
    ] = await Promise.all([
      this.prisma.school.count({ where: { active: true } }),
      this.prisma.school.count({ where: { active: false } }),
      this.prisma.schoolGroup.count({ where: { ...group, status: 'ACTIVE' } }),
      this.prisma.schoolGroup.count({ where: { ...group, status: 'INACTIVE' } }),
      this.prisma.schoolGroup.count({ where: { ...group, accessCodeHash: { not: null } } }),
      this.prisma.commercialProposal.count({ where: proposal({ status: 'DRAFT' }) }),
      this.prisma.commercialProposal.count({
        where: proposal({
          status: 'PUBLISHED',
          validUntil: { gt: now },
          OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        }),
      }),
      this.prisma.commercialProposal.count({
        where: proposal({ status: 'PUBLISHED', validUntil: { lte: now } }),
      }),
      this.prisma.commercialProposal.count({
        where: proposal({ status: 'PUBLISHED', validUntil: { gt: now }, validFrom: { gt: now } }),
      }),
      this.prisma.commercialProposal.count({ where: proposal({ status: 'ARCHIVED' }) }),
      this.prisma.enrollment.count({ where: enrollment({}) }),
      this.prisma.enrollment.count({ where: enrollment({ accessGrantedAt: { not: null } }) }),
      this.prisma.schoolRequest.count({ where: request({ status: 'PENDING' }) }),
      this.prisma.schoolRequest.count({ where: request({ status: 'REVIEWING' }) }),
    ]);

    return {
      travelYear: year ?? null,
      schools: { active: schoolsActive, inactive: schoolsInactive },
      groups: { active: groupsActive, inactive: groupsInactive, withAccessCode: groupsWithCode },
      proposals: { draft, publishedCurrent, publishedExpired, publishedScheduled, archived },
      enrollments: {
        total: enrollmentsTotal,
        withAccess: enrollmentsWithAccess,
        withoutAccess: enrollmentsTotal - enrollmentsWithAccess,
      },
      requests: { pending, reviewing },
      generatedAt: now.toISOString(),
    };
  }
}
