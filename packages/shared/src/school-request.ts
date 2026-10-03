import { z } from 'zod';
import { paginatedSchema, paginationQuerySchema } from './pagination.js';
import { provinceSchema, schoolCitySchema, schoolNameSchema } from './school.js';
import { travelYearSchema } from './school-group.js';
import { collapseWhitespace, normalizeText } from './text.js';

export const requestTypes = ['SCHOOL_NOT_FOUND', 'GROUP_NOT_FOUND'] as const;
export const requestTypeSchema = z.enum(requestTypes);
export type RequestType = z.infer<typeof requestTypeSchema>;
export const requestTypeLabels: Record<RequestType, string> = {
  SCHOOL_NOT_FOUND: 'Colegio no encontrado',
  GROUP_NOT_FOUND: 'Grupo no encontrado',
};

export const requestStatuses = ['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const;
export const requestStatusSchema = z.enum(requestStatuses);
export type RequestStatus = z.infer<typeof requestStatusSchema>;
export const requestStatusLabels: Record<RequestStatus, string> = {
  PENDING: 'Pendiente',
  REVIEWING: 'En revisión',
  RESOLVED: 'Resuelta',
  DISMISSED: 'Descartada',
};
export const OPEN_REQUEST_STATUSES = [
  'PENDING',
  'REVIEWING',
] as const satisfies readonly RequestStatus[];

export const courseSchema = z
  .string()
  .transform(collapseWhitespace)
  .pipe(
    z
      .string()
      .min(1, { error: 'Indicá el curso o división (por ejemplo, "5° A").', abort: true })
      .max(80, { error: 'Curso: hasta 80 caracteres.', abort: true })
      .refine((value) => normalizeText(value).length > 0, {
        error: 'Curso: tiene que incluir letras o números.',
      }),
  );

/** A family reports a missing school or group. Never creates a School or SchoolGroup (B11). */
export const schoolRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('SCHOOL_NOT_FOUND'),
    schoolName: schoolNameSchema,
    province: provinceSchema,
    city: schoolCitySchema,
    course: courseSchema,
    travelYear: travelYearSchema,
  }),
  z.strictObject({
    type: z.literal('GROUP_NOT_FOUND'),
    schoolId: z.uuid({ error: 'Elegí el colegio.' }),
    course: courseSchema,
    travelYear: travelYearSchema,
  }),
]);
export type SchoolRequestInput = z.output<typeof schoolRequestSchema>;

/** Identical for new and repeated requests: nothing is revealed about existing requests. */
export const SCHOOL_REQUEST_CONFIRMATION =
  'Recibimos tu solicitud. Un asesor de Travel Rock la va a revisar y se va a contactar con vos.';
export const schoolRequestConfirmationSchema = z.object({
  message: z.literal(SCHOOL_REQUEST_CONFIRMATION),
});

// --- Staff queue -----------------------------------------------------------------------------

export const adminSchoolRequestSchema = z.object({
  id: z.uuid(),
  type: requestTypeSchema,
  status: requestStatusSchema,
  school: z.object({
    id: z.uuid().nullable(),
    name: z.string(),
    city: z.string(),
    province: provinceSchema,
  }),
  course: z.string(),
  travelYear: z.number().int(),
  /** Open requests (any family) for the same school: the demand signal. */
  openRequestsForSchool: z.number().int(),
  /** Only for ADMIN and COMMERCIAL, who follow up with the family. */
  contact: z.object({ fullName: z.string(), emails: z.array(z.string()) }).nullable(),
  staffNotes: z.string().nullable(),
  resolvedBy: z.object({ id: z.uuid(), fullName: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AdminSchoolRequest = z.infer<typeof adminSchoolRequestSchema>;
export const adminSchoolRequestListSchema = paginatedSchema(adminSchoolRequestSchema);

export const schoolRequestListQuerySchema = paginationQuerySchema.extend({
  type: z.preprocess((value) => (value === '' ? undefined : value), requestTypeSchema.optional()),
  status: z.enum([...requestStatuses, 'open', 'all']).default('open'),
  q: z
    .string()
    .max(100)
    .optional()
    .transform((value) => (value === undefined || normalizeText(value) === '' ? undefined : value)),
});
export type SchoolRequestListQuery = z.output<typeof schoolRequestListQuerySchema>;

export const updateRequestReviewSchema = z
  .strictObject({
    status: requestStatusSchema.optional(),
    staffNotes: z
      .string()
      .trim()
      .max(2000, { error: 'Notas: hasta 2000 caracteres.' })
      .transform((value) => (value === '' ? null : value))
      .nullable()
      .optional(),
  })
  .refine((value) => value.status !== undefined || value.staffNotes !== undefined, {
    error: 'No hay cambios para guardar.',
  });
export type UpdateRequestReview = z.output<typeof updateRequestReviewSchema>;
