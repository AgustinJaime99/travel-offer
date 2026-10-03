import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminSchoolRequest,
  canEditCatalog,
  normalizeText,
  OPEN_REQUEST_STATUSES,
  type Paginated,
  type SchoolRequestInput,
  type SchoolRequestListQuery,
  type StaffRole,
  type UpdateRequestReview,
} from '@travel-rock/shared';
import { ApiException } from '../common/api-exception.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { Prisma, type Province } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedApplicant } from '../public-identity/applicant-sessions.service.js';
import type { AuthenticatedStaff } from '../staff-auth/authenticated-staff.js';

const REQUESTS_PER_APPLICANT = { limit: 5, windowMs: 60 * 60_000 };

const requestInclude = {
  applicant: {
    select: {
      fullName: true,
      contacts: { where: { verifiedAt: { not: null } }, select: { valueNormalized: true } },
    },
  },
  resolvedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.SchoolRequestInclude;
type RequestRecord = Prisma.SchoolRequestGetPayload<{ include: typeof requestInclude }>;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const notFound = () => new ApiException(404, 'NOT_FOUND', 'Solicitud no encontrada.');

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class SchoolRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  /**
   * Records a missing-school/group report. Repeating an open request is a no-op, and the caller cannot
   * tell the difference: the answer is always the same neutral confirmation.
   */
  async submit(applicant: AuthenticatedApplicant, input: SchoolRequestInput): Promise<void> {
    const applicantId = applicant.applicant.id;
    if (
      !this.limiter.tryConsume([
        { key: `school-requests:${applicantId}`, ...REQUESTS_PER_APPLICANT },
      ])
    ) {
      throw new ApiException(429, 'RATE_LIMITED', 'Enviaste muchas solicitudes. Probá más tarde.');
    }

    let school: {
      id: string | null;
      name: string;
      province: Province;
      city: string;
    };
    let demandKey: string;
    if (input.type === 'GROUP_NOT_FOUND') {
      const existing = await this.prisma.school.findFirst({
        where: { id: input.schoolId, active: true },
        select: { id: true, name: true, province: true, city: true },
      });
      if (!existing) {
        throw new ApiException(400, 'VALIDATION_FAILED', 'Revisá los datos ingresados.', [
          { path: 'schoolId', message: 'El colegio no existe.' },
        ]);
      }
      school = existing;
      demandKey = `school:${existing.id}`;
    } else {
      school = { id: null, name: input.schoolName, province: input.province, city: input.city };
      demandKey = `name:${normalizeText(input.schoolName)}|${input.province}|${normalizeText(input.city)}`;
    }
    const dedupKey = sha256(
      [input.type, applicantId, demandKey, normalizeText(input.course), input.travelYear].join('|'),
    );

    try {
      await this.prisma.schoolRequest.create({
        data: {
          type: input.type,
          applicantId,
          schoolId: school.id,
          schoolName: school.name,
          normalizedSchoolName: normalizeText(school.name),
          province: school.province,
          city: school.city,
          course: input.course,
          travelYear: input.travelYear,
          dedupKey,
          demandKey,
        },
      });
    } catch (error) {
      // Same family, same open request: already recorded.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  async list(
    query: SchoolRequestListQuery,
    viewerRole: StaffRole,
  ): Promise<Paginated<AdminSchoolRequest>> {
    const where: Prisma.SchoolRequestWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.status === 'open') where.status = { in: [...OPEN_REQUEST_STATUSES] };
    else if (query.status !== 'all') where.status = query.status;
    // normalizeText output has no LIKE wildcards; matches "guemes" with "Güemes".
    if (query.q) where.normalizedSchoolName = { contains: normalizeText(query.q) };
    const [items, total] = await Promise.all([
      this.prisma.schoolRequest.findMany({
        where,
        include: requestInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.schoolRequest.count({ where }),
    ]);
    const demand = await this.openDemand(items.map((item) => item.demandKey));
    return {
      items: items.map((item) => this.toDto(item, demand, viewerRole)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string, viewerRole: StaffRole): Promise<AdminSchoolRequest> {
    const request = await this.prisma.schoolRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!request) throw notFound();
    return this.toDto(request, await this.openDemand([request.demandKey]), viewerRole);
  }

  async review(
    id: string,
    patch: UpdateRequestReview,
    actor: AuthenticatedStaff,
  ): Promise<AdminSchoolRequest> {
    const current = await this.prisma.schoolRequest.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) throw notFound();
    const data: Prisma.SchoolRequestUpdateInput = {};
    if (patch.staffNotes !== undefined) data.staffNotes = patch.staffNotes;
    // Only an actual status change re-attributes the request: editing the notes of a closed request
    // must not make the editor its closer.
    if (patch.status !== undefined && patch.status !== current.status) {
      data.status = patch.status;
      const closed = patch.status === 'RESOLVED' || patch.status === 'DISMISSED';
      data.resolvedBy = closed ? { connect: { id: actor.user.id } } : { disconnect: true };
    }
    try {
      await this.prisma.schoolRequest.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw notFound();
      if (isUniqueViolation(error)) {
        throw new ApiException(
          409,
          'REQUEST_DUPLICATE',
          'La familia ya tiene otra solicitud abierta igual a esta.',
        );
      }
      throw error;
    }
    return this.get(id, actor.user.role);
  }

  private async openDemand(demandKeys: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.schoolRequest.groupBy({
      by: ['demandKey'],
      where: {
        demandKey: { in: [...new Set(demandKeys)] },
        status: { in: [...OPEN_REQUEST_STATUSES] },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.demandKey, row._count._all]));
  }

  private toDto(
    request: RequestRecord,
    demand: Map<string, number>,
    viewerRole: StaffRole,
  ): AdminSchoolRequest {
    return {
      id: request.id,
      type: request.type,
      status: request.status,
      school: {
        id: request.schoolId,
        name: request.schoolName,
        city: request.city,
        province: request.province,
      },
      course: request.course,
      travelYear: request.travelYear,
      openRequestsForSchool: demand.get(request.demandKey) ?? 0,
      // Contact data is for the people who follow up (ADMIN, COMMERCIAL), not for read-only staff.
      contact: canEditCatalog(viewerRole)
        ? {
            fullName: request.applicant.fullName,
            emails: request.applicant.contacts.map((contact) => contact.valueNormalized),
          }
        : null,
      // Free text where follow-up details (possibly contact data) end up: same rule as contact.
      staffNotes: canEditCatalog(viewerRole) ? request.staffNotes : null,
      resolvedBy: request.resolvedBy,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }
}
