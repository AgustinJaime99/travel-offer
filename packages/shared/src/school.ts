import { z } from 'zod';
import { paginatedSchema, paginationQuerySchema } from './pagination.js';
import type { StaffRole } from './staff.js';
import { collapseWhitespace, normalizeText } from './text.js';

/** Roles that may create and edit the commercial catalog (schools, groups, services). */
export const CATALOG_EDITOR_ROLES = ['ADMIN', 'COMMERCIAL'] as const satisfies readonly StaffRole[];

export function canEditCatalog(role: StaffRole): boolean {
  return (CATALOG_EDITOR_ROLES as readonly StaffRole[]).includes(role);
}

/** The 24 Argentine jurisdictions (23 provinces + CABA), decision B10. */
export const provinceLabels = {
  BUENOS_AIRES: 'Buenos Aires',
  CABA: 'Ciudad Autónoma de Buenos Aires',
  CATAMARCA: 'Catamarca',
  CHACO: 'Chaco',
  CHUBUT: 'Chubut',
  CORDOBA: 'Córdoba',
  CORRIENTES: 'Corrientes',
  ENTRE_RIOS: 'Entre Ríos',
  FORMOSA: 'Formosa',
  JUJUY: 'Jujuy',
  LA_PAMPA: 'La Pampa',
  LA_RIOJA: 'La Rioja',
  MENDOZA: 'Mendoza',
  MISIONES: 'Misiones',
  NEUQUEN: 'Neuquén',
  RIO_NEGRO: 'Río Negro',
  SALTA: 'Salta',
  SAN_JUAN: 'San Juan',
  SAN_LUIS: 'San Luis',
  SANTA_CRUZ: 'Santa Cruz',
  SANTA_FE: 'Santa Fe',
  SANTIAGO_DEL_ESTERO: 'Santiago del Estero',
  TIERRA_DEL_FUEGO: 'Tierra del Fuego, Antártida e Islas del Atlántico Sur',
  TUCUMAN: 'Tucumán',
} as const;

export type Province = keyof typeof provinceLabels;
export const provinces = Object.keys(provinceLabels) as [Province, ...Province[]];
export const provinceSchema = z.enum(provinces, { error: 'Elegí una provincia.' });

function displayText(label: string, min: number, max: number) {
  return z
    .string()
    .transform(collapseWhitespace)
    .pipe(
      z
        .string()
        // abort: one message per field, the most relevant first.
        .min(min, { error: `${label}: ingresá al menos ${min} caracteres.`, abort: true })
        .max(max, { error: `${label}: hasta ${max} caracteres.`, abort: true })
        .refine((value) => normalizeText(value).length > 0, {
          error: `${label}: tiene que incluir letras o números.`,
        }),
    );
}

export const schoolNameSchema = displayText('Nombre', 2, 160);
export const schoolCitySchema = displayText('Localidad', 2, 100);

/** Optional text: empty input means "no value" (null). */
const optionalAddressSchema = z
  .string()
  .transform(collapseWhitespace)
  .pipe(z.string().max(200, { error: 'Dirección: hasta 200 caracteres.' }))
  .transform((value) => (value === '' ? null : value))
  .nullable();

/**
 * CUE (Clave Única de Establecimiento): 7 digits, or 9 with the 2-digit annex.
 * Separators are ignored; only digits are stored. Empty means no CUE.
 */
export const cueSchema = z
  .string()
  .transform((value) => value.replace(/[\s.-]/g, ''))
  .pipe(
    z.string().regex(/^(\d{7}|\d{9})?$/, { error: 'El CUE tiene 7 dígitos, o 9 con el anexo.' }),
  )
  .transform((value) => (value === '' ? null : value))
  .nullable();

export const createSchoolRequestSchema = z.object({
  name: schoolNameSchema,
  province: provinceSchema,
  city: schoolCitySchema,
  address: optionalAddressSchema.optional(),
  cue: cueSchema.optional(),
});
export type CreateSchoolRequest = z.output<typeof createSchoolRequestSchema>;

export const updateSchoolRequestSchema = z
  .object({
    name: schoolNameSchema.optional(),
    province: provinceSchema.optional(),
    city: schoolCitySchema.optional(),
    address: optionalAddressSchema.optional(),
    cue: cueSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'No hay cambios para guardar.',
  });
export type UpdateSchoolRequest = z.output<typeof updateSchoolRequestSchema>;

export const schoolSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  province: provinceSchema,
  city: z.string(),
  address: z.string().nullable(),
  cue: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type School = z.infer<typeof schoolSchema>;

export const schoolStatusFilters = ['active', 'inactive', 'all'] as const;

const optionalSearchText = z
  .string()
  .max(100)
  .optional()
  .transform((value) => (value === undefined || normalizeText(value) === '' ? undefined : value));

export const schoolListQuerySchema = paginationQuerySchema.extend({
  q: optionalSearchText,
  city: optionalSearchText,
  province: z.preprocess((value) => (value === '' ? undefined : value), provinceSchema.optional()),
  status: z.enum(schoolStatusFilters).default('active'),
});
export type SchoolListQuery = z.output<typeof schoolListQuerySchema>;

export const schoolListSchema = paginatedSchema(schoolSchema);

export const schoolDuplicateCheckQuerySchema = z.object({
  name: schoolNameSchema,
  province: provinceSchema,
  city: schoolCitySchema,
  cue: cueSchema.optional(),
  excludeId: z.uuid().optional(),
});
export type SchoolDuplicateCheckQuery = z.output<typeof schoolDuplicateCheckQuerySchema>;

export const schoolDuplicateCandidateSchema = schoolSchema
  .pick({ id: true, name: true, province: true, city: true, cue: true, active: true })
  .extend({ reason: z.enum(['SAME_CUE', 'SIMILAR_NAME']) });
export type SchoolDuplicateCandidate = z.infer<typeof schoolDuplicateCandidateSchema>;

export const schoolDuplicateCheckResponseSchema = z.object({
  candidates: z.array(schoolDuplicateCandidateSchema),
});
