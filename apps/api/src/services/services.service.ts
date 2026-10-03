import { Injectable } from '@nestjs/common';
import {
  type CreateServiceRequest,
  normalizeText,
  type Paginated,
  type ServiceListQuery,
  type UpdateServiceRequest,
} from '@travel-rock/shared';
import { ApiException } from '../common/api-exception.js';
import { Prisma, type Service as ServiceRecord } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const notFound = () => new ApiException(404, 'NOT_FOUND', 'Servicio no encontrado.');
const nameTaken = () =>
  new ApiException(409, 'SERVICE_NAME_TAKEN', 'Ya existe un servicio con ese nombre.');

function prismaCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
}

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** `q` matches the normalized name (no LIKE wildcards possible after normalizeText). */
  async list(query: ServiceListQuery): Promise<Paginated<ServiceRecord>> {
    const where: Prisma.ServiceWhereInput = {};
    if (query.status !== 'all') where.active = query.status === 'active';
    if (query.category) where.category = query.category;
    if (query.q) where.normalizedName = { contains: normalizeText(query.q) };
    const [items, total] = await Promise.all([
      this.prisma.service.findMany({
        where,
        orderBy: [{ category: 'asc' }, { normalizedName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.service.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<ServiceRecord> {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw notFound();
    return service;
  }

  async create(input: CreateServiceRequest): Promise<ServiceRecord> {
    try {
      return await this.prisma.service.create({
        data: {
          name: input.name,
          normalizedName: normalizeText(input.name),
          description: input.description ?? null,
          category: input.category,
          pricingUnit: input.pricingUnit,
          basePriceMinor: BigInt(input.basePriceMinor),
        },
      });
    } catch (error) {
      if (prismaCode(error) === 'P2002') throw nameTaken();
      throw error;
    }
  }

  /** Price changes only affect future proposal items; published items keep their own snapshot. */
  async update(id: string, patch: UpdateServiceRequest): Promise<ServiceRecord> {
    const data: Prisma.ServiceUpdateInput = {};
    if (patch.name !== undefined) {
      data.name = patch.name;
      data.normalizedName = normalizeText(patch.name);
    }
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.category !== undefined) data.category = patch.category;
    if (patch.basePriceMinor !== undefined) data.basePriceMinor = BigInt(patch.basePriceMinor);
    if (patch.active !== undefined) data.active = patch.active;
    try {
      return await this.prisma.service.update({ where: { id }, data });
    } catch (error) {
      if (prismaCode(error) === 'P2002') throw nameTaken();
      if (prismaCode(error) === 'P2025') throw notFound();
      throw error;
    }
  }
}
