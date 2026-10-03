import { Injectable } from '@nestjs/common';
import {
  type CreateSchoolRequest,
  normalizeText,
  type Paginated,
  type SchoolDuplicateCandidate,
  type SchoolDuplicateCheckQuery,
  type SchoolListQuery,
  type UpdateSchoolRequest,
} from '@travel-rock/shared';
import { ApiException } from '../common/api-exception.js';
import { Prisma, type School as SchoolRecord } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Calibrated on sample names (Phase 3): flags "Colegio San Martín" vs "Colegio Gral. San Martín" (0.79)
// but not vs "Instituto San Martín" (0.38). Containment catches "Escuela N° 5" vs "Escuela N° 5 D. F. Sarmiento".
const DUPLICATE_NAME_SIMILARITY = 0.6;
const DUPLICATE_NAME_CONTAINMENT = 0.9;
const DUPLICATE_CITY_SIMILARITY = 0.6;
const MAX_DUPLICATE_CANDIDATES = 5;

const notFound = () => new ApiException(404, 'NOT_FOUND', 'Colegio no encontrado.');
const cueTaken = () => new ApiException(409, 'CUE_TAKEN', 'Ya existe un colegio con ese CUE.');

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Accent-insensitive search. Text filters match by containment or trigram word similarity
   * (typos such as "san martn"). normalizeText output has no LIKE wildcards, so no escaping is needed.
   */
  async list(query: SchoolListQuery): Promise<Paginated<SchoolRecord>> {
    const q = query.q === undefined ? undefined : normalizeText(query.q);
    const city = query.city === undefined ? undefined : normalizeText(query.city);

    const conditions: Prisma.Sql[] = [];
    if (query.status !== 'all') conditions.push(Prisma.sql`active = ${query.status === 'active'}`);
    if (query.province) conditions.push(Prisma.sql`province = ${query.province}::"Province"`);
    if (city) {
      conditions.push(
        Prisma.sql`("normalizedCity" LIKE ${`%${city}%`} OR ${city} <% "normalizedCity")`,
      );
    }
    if (q) {
      const digits = q.replace(/ /g, '');
      conditions.push(
        Prisma.sql`("normalizedName" LIKE ${`%${q}%`} OR ${q} <% "normalizedName" OR (${/^\d+$/.test(digits)} AND cue LIKE ${`${digits}%`}))`,
      );
    }
    const where =
      conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
    const relevance = q
      ? Prisma.sql`CASE WHEN "normalizedName" LIKE ${`${q}%`} THEN 0 WHEN "normalizedName" LIKE ${`%${q}%`} THEN 1 ELSE 2 END, word_similarity(${q}, "normalizedName") DESC,`
      : Prisma.empty;

    const [countRows, idRows] = await Promise.all([
      this.prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM "School" ${where}`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "School" ${where}
        ORDER BY ${relevance} "normalizedName", id
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
    ]);
    const ids = idRows.map((row) => row.id);
    const schools = await this.prisma.school.findMany({ where: { id: { in: ids } } });
    const byId = new Map(schools.map((school) => [school.id, school]));
    return {
      items: ids.flatMap((id) => byId.get(id) ?? []),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(countRows[0]?.total ?? 0),
    };
  }

  async get(id: string): Promise<SchoolRecord> {
    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) throw notFound();
    return school;
  }

  /** Soft warning only (B10): possible duplicates by CUE (first 7 digits) or similar name in a similar city. */
  async findDuplicateCandidates(
    query: SchoolDuplicateCheckQuery,
  ): Promise<SchoolDuplicateCandidate[]> {
    const name = normalizeText(query.name);
    const city = normalizeText(query.city);
    const cuePrefix = query.cue ? query.cue.slice(0, 7) : null;
    return this.prisma.$queryRaw<SchoolDuplicateCandidate[]>`
      SELECT id, name, province::text AS province, city, cue, active,
        CASE WHEN ${cuePrefix}::text IS NOT NULL AND left(cue, 7) = ${cuePrefix}::text
          THEN 'SAME_CUE' ELSE 'SIMILAR_NAME' END AS reason
      FROM "School"
      WHERE (${query.excludeId ?? null}::uuid IS NULL OR id <> ${query.excludeId ?? null}::uuid)
        AND (
          (${cuePrefix}::text IS NOT NULL AND left(cue, 7) = ${cuePrefix}::text)
          OR (
            province = ${query.province}::"Province"
            AND similarity("normalizedCity", ${city}) >= ${DUPLICATE_CITY_SIMILARITY}
            AND (
              similarity("normalizedName", ${name}) >= ${DUPLICATE_NAME_SIMILARITY}
              OR word_similarity(${name}, "normalizedName") >= ${DUPLICATE_NAME_CONTAINMENT}
              OR word_similarity("normalizedName", ${name}) >= ${DUPLICATE_NAME_CONTAINMENT}
            )
          )
        )
      ORDER BY reason, similarity("normalizedName", ${name}) DESC, id
      LIMIT ${MAX_DUPLICATE_CANDIDATES}`;
  }

  async create(input: CreateSchoolRequest): Promise<SchoolRecord> {
    try {
      return await this.prisma.school.create({
        data: {
          name: input.name,
          normalizedName: normalizeText(input.name),
          province: input.province,
          city: input.city,
          normalizedCity: normalizeText(input.city),
          address: input.address ?? null,
          cue: input.cue ?? null,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw cueTaken();
      throw error;
    }
  }

  async update(id: string, patch: UpdateSchoolRequest): Promise<SchoolRecord> {
    const data: Prisma.SchoolUpdateInput = {};
    if (patch.name !== undefined) {
      data.name = patch.name;
      data.normalizedName = normalizeText(patch.name);
    }
    if (patch.city !== undefined) {
      data.city = patch.city;
      data.normalizedCity = normalizeText(patch.city);
    }
    if (patch.province !== undefined) data.province = patch.province;
    if (patch.address !== undefined) data.address = patch.address;
    if (patch.cue !== undefined) data.cue = patch.cue;
    if (patch.active !== undefined) data.active = patch.active;
    try {
      return await this.prisma.school.update({ where: { id }, data });
    } catch (error) {
      if (isUniqueViolation(error)) throw cueTaken();
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw notFound();
      }
      throw error;
    }
  }
}
