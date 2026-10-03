import { z } from 'zod';
import { paginatedSchema, paginationQuerySchema } from './pagination.js';
import { provinceSchema } from './school.js';
import { collapseWhitespace, normalizeText } from './text.js';

/** Calendar year in which the trip takes place (B9). Accepted: last year to five years ahead. */
export function travelYearRange(now = new Date()): { min: number; max: number } {
  const year = now.getFullYear();
  return { min: year - 1, max: year + 5 };
}

export const travelYearSchema = z.coerce
  .number({ error: 'Elegí el año de viaje.' })
  .int({ error: 'Elegí el año de viaje.' })
  .refine(
    (year) => {
      const { min, max } = travelYearRange();
      return year >= min && year <= max;
    },
    {
      error: () =>
        `El año de viaje tiene que estar entre ${travelYearRange().min} y ${travelYearRange().max}.`,
    },
  );

export const groupNameSchema = z
  .string()
  .transform(collapseWhitespace)
  .pipe(
    z
      .string()
      .min(1, { error: 'Ingresá el nombre del grupo (por ejemplo, "5° A").', abort: true })
      .max(80, { error: 'Nombre: hasta 80 caracteres.', abort: true })
      .refine((value) => normalizeText(value).length > 0, {
        error: 'Nombre: tiene que incluir letras o números.',
      }),
  );

/** Informational only, never a pricing multiplier (B1). Empty means unknown (null). */
export const estimatedStudentsSchema = z.preprocess(
  (value) =>
    value === '' || value === undefined ? null : typeof value === 'string' ? Number(value) : value,
  z
    .number({ error: 'Ingresá un número entero.' })
    .int({ error: 'Ingresá un número entero.' })
    .min(1, { error: 'Tiene que ser al menos 1.' })
    .max(2000, { error: 'Hasta 2000.' })
    .nullable(),
);

export const groupStatuses = ['ACTIVE', 'INACTIVE'] as const;
export const groupStatusSchema = z.enum(groupStatuses);
export type GroupStatus = z.infer<typeof groupStatusSchema>;

export const createSchoolGroupRequestSchema = z.object({
  schoolId: z.uuid({ error: 'Elegí un colegio.' }),
  name: groupNameSchema,
  travelYear: travelYearSchema,
  estimatedStudents: estimatedStudentsSchema.optional(),
});
export type CreateSchoolGroupRequest = z.output<typeof createSchoolGroupRequestSchema>;

/** The school of a group cannot change: proposals and enrollments belong to the group. */
export const updateSchoolGroupRequestSchema = z
  .strictObject({
    name: groupNameSchema.optional(),
    travelYear: travelYearSchema.optional(),
    estimatedStudents: estimatedStudentsSchema.optional(),
    status: groupStatusSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'No hay cambios para guardar.',
  });
export type UpdateSchoolGroupRequest = z.output<typeof updateSchoolGroupRequestSchema>;

export const schoolGroupSchema = z.object({
  id: z.uuid(),
  school: z.object({
    id: z.uuid(),
    name: z.string(),
    city: z.string(),
    province: provinceSchema,
    active: z.boolean(),
  }),
  name: z.string(),
  travelYear: z.number().int(),
  estimatedStudents: z.number().int().nullable(),
  status: groupStatusSchema,
  /** Never the code or its hash: only whether one exists and when it was generated. */
  accessCode: z.object({ configured: z.boolean(), rotatedAt: z.iso.datetime().nullable() }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SchoolGroup = z.infer<typeof schoolGroupSchema>;

export const groupStatusFilters = ['active', 'inactive', 'all'] as const;

export const schoolGroupListQuerySchema = paginationQuerySchema.extend({
  q: z
    .string()
    .max(100)
    .optional()
    .transform((value) => (value === undefined || normalizeText(value) === '' ? undefined : value)),
  schoolId: z.preprocess((value) => (value === '' ? undefined : value), z.uuid().optional()),
  travelYear: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(2000).max(2100).optional(),
  ),
  status: z.enum(groupStatusFilters).default('active'),
});
export type SchoolGroupListQuery = z.output<typeof schoolGroupListQuerySchema>;

export const schoolGroupListSchema = paginatedSchema(schoolGroupSchema);

// Group access codes (B7): no look-alike characters (0/O, 1/I/L).
export const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ACCESS_CODE_LENGTH = 8;

/** Canonical form used for hashing and comparison: uppercase, no separators ("abcd-efgh" → "ABCDEFGH"). */
export function normalizeAccessCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

/** Display form: "ABCDEFGH" → "ABCD-EFGH". */
export function formatAccessCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Returned once on generation; the plaintext is never stored. */
export const accessCodeResponseSchema = z.object({
  accessCode: z.string(),
  group: schoolGroupSchema,
});

/** Families interested in each option of the group's current publication (counts only). */
export const groupPlanPreferencesSchema = z.object({
  proposal: z.object({ id: z.uuid(), version: z.number().int() }).nullable(),
  options: z.array(z.object({ installments: z.number().int(), families: z.number().int().min(0) })),
  enrollments: z.number().int().min(0),
});
export type GroupPlanPreferences = z.infer<typeof groupPlanPreferencesSchema>;
