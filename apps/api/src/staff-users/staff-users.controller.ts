import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type CreateStaffUserRequest,
  createStaffUserRequestSchema,
  type Paginated,
  type PaginationQuery,
  paginationQuerySchema,
  type StaffUser,
  type UpdateStaffUserRequest,
  updateStaffUserRequestSchema,
} from '@travel-rock/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { AuthenticatedStaff } from '../staff-auth/authenticated-staff.js';
import { CurrentStaff, Roles } from '../staff-auth/decorators.js';
import { toStaffUserDto } from './staff-user.mapper.js';
import { StaffUsersService } from './staff-users.service.js';

const userIdPipe = new ZodValidationPipe(z.uuid());

@Controller('admin/users')
@Roles('ADMIN')
export class StaffUsersController {
  constructor(private readonly users: StaffUsersService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<StaffUser>> {
    const page = await this.users.list(query);
    return { ...page, items: page.items.map(toStaffUserDto) };
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createStaffUserRequestSchema)) body: CreateStaffUserRequest,
  ): Promise<{ user: StaffUser; temporaryPassword: string }> {
    const { user, temporaryPassword } = await this.users.create(body);
    return { user: toStaffUserDto(user), temporaryPassword };
  }

  @Patch(':id')
  async update(
    @Param('id', userIdPipe) id: string,
    @Body(new ZodValidationPipe(updateStaffUserRequestSchema)) body: UpdateStaffUserRequest,
    @CurrentStaff() actor: AuthenticatedStaff,
  ): Promise<StaffUser> {
    return toStaffUserDto(await this.users.update(id, body, actor));
  }

  @Post(':id/temporary-password')
  @HttpCode(200)
  async resetTemporaryPassword(
    @Param('id', userIdPipe) id: string,
    @CurrentStaff() actor: AuthenticatedStaff,
  ): Promise<{ temporaryPassword: string }> {
    return { temporaryPassword: await this.users.resetTemporaryPassword(id, actor) };
  }
}
