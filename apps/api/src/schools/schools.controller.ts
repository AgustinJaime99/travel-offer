import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CATALOG_EDITOR_ROLES,
  type CreateSchoolRequest,
  createSchoolRequestSchema,
  type Paginated,
  type School,
  type SchoolDuplicateCandidate,
  type SchoolDuplicateCheckQuery,
  schoolDuplicateCheckQuerySchema,
  type SchoolListQuery,
  schoolListQuerySchema,
  type UpdateSchoolRequest,
  updateSchoolRequestSchema,
} from '@travel-rock/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Roles } from '../staff-auth/decorators.js';
import { toSchoolDto } from './school.mapper.js';
import { SchoolsService } from './schools.service.js';

const schoolIdPipe = new ZodValidationPipe(z.uuid());

/** Read: every staff role. Write: ADMIN and COMMERCIAL. */
@Controller('admin/schools')
export class SchoolsController {
  constructor(private readonly schools: SchoolsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(schoolListQuerySchema)) query: SchoolListQuery,
  ): Promise<Paginated<School>> {
    const page = await this.schools.list(query);
    return { ...page, items: page.items.map(toSchoolDto) };
  }

  // Declared before ':id' so the literal path is not parsed as an id.
  @Get('duplicate-check')
  @Roles(...CATALOG_EDITOR_ROLES)
  async duplicateCheck(
    @Query(new ZodValidationPipe(schoolDuplicateCheckQuerySchema)) query: SchoolDuplicateCheckQuery,
  ): Promise<{ candidates: SchoolDuplicateCandidate[] }> {
    return { candidates: await this.schools.findDuplicateCandidates(query) };
  }

  @Get(':id')
  async get(@Param('id', schoolIdPipe) id: string): Promise<School> {
    return toSchoolDto(await this.schools.get(id));
  }

  @Post()
  @Roles(...CATALOG_EDITOR_ROLES)
  async create(
    @Body(new ZodValidationPipe(createSchoolRequestSchema)) body: CreateSchoolRequest,
  ): Promise<School> {
    return toSchoolDto(await this.schools.create(body));
  }

  @Patch(':id')
  @Roles(...CATALOG_EDITOR_ROLES)
  async update(
    @Param('id', schoolIdPipe) id: string,
    @Body(new ZodValidationPipe(updateSchoolRequestSchema)) body: UpdateSchoolRequest,
  ): Promise<School> {
    return toSchoolDto(await this.schools.update(id, body));
  }
}
