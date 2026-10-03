import { Injectable } from '@nestjs/common';
import {
  type CreateSchoolGroupRequest,
  formatAccessCode,
  type GroupPlanPreferences,
  normalizeText,
  type Paginated,
  type SchoolGroupListQuery,
  type UpdateSchoolGroupRequest,
} from '@travel-rock/shared';
import { ApiException } from '../common/api-exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateAccessCode, hashAccessCode } from './access-code.js';
import { type SchoolGroupRecord, schoolGroupInclude } from './school-group.mapper.js';

const notFound = () => new ApiException(404, 'NOT_FOUND', 'Grupo no encontrado.');
const groupTaken = () =>
  new ApiException(
    409,
    'GROUP_TAKEN',
    'Ya existe un grupo con ese nombre para ese colegio y año de viaje.',
  );

function prismaCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
}

@Injectable()
export class SchoolGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `q` matches the group name or the school name (normalized, no LIKE wildcards possible). */
  async list(query: SchoolGroupListQuery): Promise<Paginated<SchoolGroupRecord>> {
    const where: Prisma.SchoolGroupWhereInput = {};
    if (query.status !== 'all') where.status = query.status === 'active' ? 'ACTIVE' : 'INACTIVE';
    if (query.schoolId) where.schoolId = query.schoolId;
    if (query.travelYear !== undefined) where.travelYear = query.travelYear;
    if (query.q) {
      const q = normalizeText(query.q);
      where.OR = [
        { normalizedName: { contains: q } },
        { school: { normalizedName: { contains: q } } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.schoolGroup.findMany({
        where,
        include: schoolGroupInclude,
        orderBy: [
          { school: { normalizedName: 'asc' } },
          { travelYear: 'asc' },
          { normalizedName: 'asc' },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.schoolGroup.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<SchoolGroupRecord> {
    const group = await this.prisma.schoolGroup.findUnique({
      where: { id },
      include: schoolGroupInclude,
    });
    if (!group) throw notFound();
    return group;
  }

  /** How many families prefer each option of the current publication (counts only, no names). */
  async planPreferences(id: string): Promise<GroupPlanPreferences> {
    await this.get(id);
    const [proposal, enrollments] = await Promise.all([
      this.prisma.commercialProposal.findFirst({
        where: { schoolGroupId: id, status: 'PUBLISHED' },
        select: { id: true, version: true },
      }),
      this.prisma.enrollment.count({ where: { schoolGroupId: id, status: 'SUBMITTED' } }),
    ]);
    if (!proposal) return { proposal: null, options: [], enrollments };
    const rows = await this.prisma.planPreference.groupBy({
      by: ['installments'],
      where: { proposalId: proposal.id, enrollment: { status: 'SUBMITTED' } },
      _count: { _all: true },
      orderBy: { installments: 'asc' },
    });
    return {
      proposal,
      options: rows.map((row) => ({ installments: row.installments, families: row._count._all })),
      enrollments,
    };
  }

  async create(input: CreateSchoolGroupRequest): Promise<SchoolGroupRecord> {
    const school = await this.prisma.school.findUnique({
      where: { id: input.schoolId },
      select: { active: true },
    });
    if (!school) {
      throw new ApiException(400, 'VALIDATION_FAILED', 'Revisá los datos ingresados.', [
        { path: 'schoolId', message: 'El colegio no existe.' },
      ]);
    }
    if (!school.active) {
      throw new ApiException(
        409,
        'SCHOOL_INACTIVE',
        'El colegio está inactivo. Reactivalo para crear grupos.',
      );
    }
    try {
      return await this.prisma.schoolGroup.create({
        data: {
          schoolId: input.schoolId,
          name: input.name,
          normalizedName: normalizeText(input.name),
          travelYear: input.travelYear,
          estimatedStudents: input.estimatedStudents ?? null,
        },
        include: schoolGroupInclude,
      });
    } catch (error) {
      if (prismaCode(error) === 'P2002') throw groupTaken();
      throw error;
    }
  }

  async update(id: string, patch: UpdateSchoolGroupRequest): Promise<SchoolGroupRecord> {
    const data: Prisma.SchoolGroupUpdateInput = {};
    if (patch.name !== undefined) {
      data.name = patch.name;
      data.normalizedName = normalizeText(patch.name);
    }
    if (patch.travelYear !== undefined) data.travelYear = patch.travelYear;
    if (patch.estimatedStudents !== undefined) data.estimatedStudents = patch.estimatedStudents;
    if (patch.status !== undefined) data.status = patch.status;
    try {
      return await this.prisma.schoolGroup.update({
        where: { id },
        data,
        include: schoolGroupInclude,
      });
    } catch (error) {
      if (prismaCode(error) === 'P2002') throw groupTaken();
      if (prismaCode(error) === 'P2025') throw notFound();
      throw error;
    }
  }

  /** New code; the previous one stops working for new entries (B7). Returns the only plaintext copy. */
  async rotateAccessCode(id: string): Promise<{ accessCode: string; group: SchoolGroupRecord }> {
    const code = generateAccessCode();
    try {
      const group = await this.prisma.schoolGroup.update({
        where: { id },
        data: { accessCodeHash: await hashAccessCode(code), accessCodeRotatedAt: new Date() },
        include: schoolGroupInclude,
      });
      return { accessCode: formatAccessCode(code), group };
    } catch (error) {
      if (prismaCode(error) === 'P2025') throw notFound();
      throw error;
    }
  }
}
