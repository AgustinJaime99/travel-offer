import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CATALOG_EDITOR_ROLES,
  type CreateServiceRequest,
  createServiceRequestSchema,
  type Paginated,
  type Service,
  type ServiceListQuery,
  serviceListQuerySchema,
  type UpdateServiceRequest,
  updateServiceRequestSchema,
} from '@travel-rock/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Roles } from '../staff-auth/decorators.js';
import { toServiceDto } from './service.mapper.js';
import { ServicesService } from './services.service.js';

const serviceIdPipe = new ZodValidationPipe(z.uuid());

/** Read: every staff role. Write: ADMIN and COMMERCIAL. Services are deactivated, never deleted. */
@Controller('admin/services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(serviceListQuerySchema)) query: ServiceListQuery,
  ): Promise<Paginated<Service>> {
    const page = await this.services.list(query);
    return { ...page, items: page.items.map(toServiceDto) };
  }

  @Get(':id')
  async get(@Param('id', serviceIdPipe) id: string): Promise<Service> {
    return toServiceDto(await this.services.get(id));
  }

  @Post()
  @Roles(...CATALOG_EDITOR_ROLES)
  async create(
    @Body(new ZodValidationPipe(createServiceRequestSchema)) body: CreateServiceRequest,
  ): Promise<Service> {
    return toServiceDto(await this.services.create(body));
  }

  @Patch(':id')
  @Roles(...CATALOG_EDITOR_ROLES)
  async update(
    @Param('id', serviceIdPipe) id: string,
    @Body(new ZodValidationPipe(updateServiceRequestSchema)) body: UpdateServiceRequest,
  ): Promise<Service> {
    return toServiceDto(await this.services.update(id, body));
  }
}
