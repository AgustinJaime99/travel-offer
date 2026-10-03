import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CATALOG_EDITOR_ROLES,
  type CreateSchoolGroupRequest,
  createSchoolGroupRequestSchema,
  type GroupPlanPreferences,
  type Paginated,
  type SchoolGroup,
  type SchoolGroupListQuery,
  schoolGroupListQuerySchema,
  type UpdateSchoolGroupRequest,
  updateSchoolGroupRequestSchema,
} from '@travel-rock/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Roles } from '../staff-auth/decorators.js';
import { toSchoolGroupDto } from './school-group.mapper.js';
import { SchoolGroupsService } from './school-groups.service.js';

const groupIdPipe = new ZodValidationPipe(z.uuid());

/** Read: every staff role. Write and access codes: ADMIN and COMMERCIAL. */
@Controller('admin/school-groups')
export class SchoolGroupsController {
  constructor(private readonly groups: SchoolGroupsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(schoolGroupListQuerySchema)) query: SchoolGroupListQuery,
  ): Promise<Paginated<SchoolGroup>> {
    const page = await this.groups.list(query);
    return { ...page, items: page.items.map(toSchoolGroupDto) };
  }

  @Get(':id')
  async get(@Param('id', groupIdPipe) id: string): Promise<SchoolGroup> {
    return toSchoolGroupDto(await this.groups.get(id));
  }

  /** Every staff role: counts of families per payment option, no personal data. */
  @Get(':id/plan-preferences')
  planPreferences(@Param('id', groupIdPipe) id: string): Promise<GroupPlanPreferences> {
    return this.groups.planPreferences(id);
  }

  @Post()
  @Roles(...CATALOG_EDITOR_ROLES)
  async create(
    @Body(new ZodValidationPipe(createSchoolGroupRequestSchema)) body: CreateSchoolGroupRequest,
  ): Promise<SchoolGroup> {
    return toSchoolGroupDto(await this.groups.create(body));
  }

  @Patch(':id')
  @Roles(...CATALOG_EDITOR_ROLES)
  async update(
    @Param('id', groupIdPipe) id: string,
    @Body(new ZodValidationPipe(updateSchoolGroupRequestSchema)) body: UpdateSchoolGroupRequest,
  ): Promise<SchoolGroup> {
    return toSchoolGroupDto(await this.groups.update(id, body));
  }

  @Post(':id/access-code')
  @HttpCode(200)
  @Roles(...CATALOG_EDITOR_ROLES)
  async rotateAccessCode(
    @Param('id', groupIdPipe) id: string,
  ): Promise<{ accessCode: string; group: SchoolGroup }> {
    const { accessCode, group } = await this.groups.rotateAccessCode(id);
    return { accessCode, group: toSchoolGroupDto(group) };
  }
}
