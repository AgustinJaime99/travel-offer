import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import {
  normalizeText,
  type PublicGroup,
  type PublicSchool,
  publicSchoolSearchQuerySchema,
} from '@travel-rock/shared';
import { z } from 'zod';
import { ApiException } from '../common/api-exception.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApplicantAuthGuard, CurrentApplicant } from '../public-identity/applicant-auth.js';
import type { AuthenticatedApplicant } from '../public-identity/applicant-sessions.service.js';
import { SchoolsService } from '../schools/schools.service.js';
import { Public } from '../staff-auth/decorators.js';

const SEARCH_PER_SESSION = { limit: 60, windowMs: 60_000 };
const MIN_QUERY = 3;

/**
 * The limited directory a verified applicant needs to find their group: active schools and groups,
 * names and places only (no CUE, no counts, no access-code state).
 */
@Public()
@UseGuards(ApplicantAuthGuard)
@Controller('public/schools')
export class PublicCatalogController {
  constructor(
    private readonly schools: SchoolsService,
    private readonly prisma: PrismaService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  @Get()
  async search(
    @Query(new ZodValidationPipe(publicSchoolSearchQuerySchema))
    query: z.output<typeof publicSchoolSearchQuerySchema>,
    @CurrentApplicant() applicant: AuthenticatedApplicant,
  ): Promise<{ items: PublicSchool[] }> {
    this.throttle(applicant);
    if (normalizeText(query.q ?? '').length < MIN_QUERY) {
      throw new ApiException(400, 'VALIDATION_FAILED', 'Revisá la búsqueda.', [
        { path: 'q', message: `Escribí al menos ${MIN_QUERY} letras del nombre del colegio.` },
      ]);
    }
    const page = await this.schools.list({
      q: query.q,
      city: query.city || undefined,
      province: query.province,
      status: 'active',
      page: 1,
      pageSize: 10,
    });
    return {
      items: page.items.map((school) => ({
        id: school.id,
        name: school.name,
        city: school.city,
        province: school.province,
      })),
    };
  }

  @Get(':id/groups')
  async groups(
    @Param('id', new ZodValidationPipe(z.uuid())) schoolId: string,
    @CurrentApplicant() applicant: AuthenticatedApplicant,
  ): Promise<{ items: PublicGroup[] }> {
    this.throttle(applicant);
    const school = await this.prisma.school.findFirst({
      where: { id: schoolId, active: true },
      select: { id: true },
    });
    if (!school) throw new ApiException(404, 'NOT_FOUND', 'Colegio no encontrado.');
    const groups = await this.prisma.schoolGroup.findMany({
      where: { schoolId, status: 'ACTIVE' },
      select: { id: true, name: true, travelYear: true },
      orderBy: [{ travelYear: 'asc' }, { normalizedName: 'asc' }],
    });
    return { items: groups };
  }

  private throttle(applicant: AuthenticatedApplicant): void {
    if (
      !this.limiter.tryConsume([
        { key: `public-search:${applicant.applicant.id}`, ...SEARCH_PER_SESSION },
      ])
    ) {
      throw new ApiException(429, 'RATE_LIMITED', 'Demasiadas búsquedas. Esperá un momento.');
    }
  }
}
