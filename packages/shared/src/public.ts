import { z } from 'zod';
import { contactInputSchema, contactTypeSchema } from './contact.js';
import { proposalPricingSnapshotSchema } from './proposal.js';
import { provinceSchema } from './school.js';
import { ACCESS_CODE_ALPHABET, ACCESS_CODE_LENGTH, normalizeAccessCode } from './school-group.js';
import { serviceCategorySchema } from './service.js';
import { collapseWhitespace, normalizeText } from './text.js';

export const APPLICANT_SESSION_COOKIE = 'tr_public';

// DRAFT texts: pending legal review (Ley 25.326, minors) before production — see DOMAIN.md → Production blockers.
export const PRIVACY_NOTICE_VERSION = 'privacy-2026-10-draft';
export const CONSENT_TEXT_VERSION = 'consent-2026-10-draft';
export const CONSENT_TEXT =
  'Soy mayor de edad y soy el adulto responsable del alumno (o el alumno, si es mayor de edad). ' +
  'Acepto que Travel Rock use estos datos para contactarme por el viaje de egresados de este grupo, ' +
  'según el aviso de privacidad. Registrar el interés no es una reserva, un contrato ni un compromiso de pago.';

export const OTP_CODE_LENGTH = 6;

export const otpRequestSchema = contactInputSchema;
export const otpChallengeResponseSchema = z.object({ challengeId: z.uuid() });

const personNameSchema = (label: string) =>
  z
    .string()
    .transform(collapseWhitespace)
    .pipe(
      z
        .string()
        .min(2, { error: `${label}: ingresá al menos 2 caracteres.`, abort: true })
        .max(80, { error: `${label}: hasta 80 caracteres.`, abort: true })
        .refine((value) => normalizeText(value).length > 0, { error: `${label}: ingresá letras.` }),
    );

export const applicantFullNameSchema = personNameSchema('Nombre y apellido');

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, { error: 'El código tiene 6 números.' });

export const otpVerifyRequestSchema = z.strictObject({
  challengeId: z.uuid({ error: 'Pedí un código nuevo.' }),
  code: otpCodeSchema,
  /** Required only the first time (account creation); ignored for returning applicants. */
  fullName: applicantFullNameSchema.optional(),
  /** Privacy notice accepted before giving the contact (recorded on creation). */
  privacyNoticeVersion: z.string().max(60).optional(),
});
export type OtpVerifyRequest = z.output<typeof otpVerifyRequestSchema>;

export const contactVerifyRequestSchema = z.strictObject({
  challengeId: z.uuid(),
  code: otpCodeSchema,
});

export const applicantSchema = z.object({
  fullName: z.string(),
  contacts: z.array(
    z.object({ id: z.uuid(), type: contactTypeSchema, value: z.string(), verified: z.boolean() }),
  ),
});
export type Applicant = z.infer<typeof applicantSchema>;

// --- Public catalog: only what an applicant needs to find their group ---------------------------

export const publicSchoolSearchQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  province: z.preprocess((value) => (value === '' ? undefined : value), provinceSchema.optional()),
  city: z.string().trim().max(100).optional(),
});

export const publicSchoolSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  city: z.string(),
  province: provinceSchema,
});
export type PublicSchool = z.infer<typeof publicSchoolSchema>;
export const publicSchoolListSchema = z.object({ items: z.array(publicSchoolSchema) });

export const publicGroupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  travelYear: z.number().int(),
});
export type PublicGroup = z.infer<typeof publicGroupSchema>;
export const publicGroupListSchema = z.object({ items: z.array(publicGroupSchema) });

// --- Enrollment: expression of interest only (no contract, no payment) --------------------------

export const relationships = ['GUARDIAN', 'ADULT_STUDENT'] as const;
export const relationshipSchema = z.enum(relationships, {
  error: 'Elegí quién completa el formulario.',
});
export const relationshipLabels = {
  GUARDIAN: 'Soy madre, padre o tutor/a del alumno',
  ADULT_STUDENT: 'Soy el alumno y soy mayor de edad',
} as const;

export const studentFirstNameSchema = personNameSchema('Nombre del alumno');
export const studentLastNameSchema = personNameSchema('Apellido del alumno');

/** Group access code as typed by a family: case and separators do not matter ("abcd efgh"). */
export const accessCodeInputSchema = z
  .string()
  .transform(normalizeAccessCode)
  .pipe(
    z.string().regex(new RegExp(`^[${ACCESS_CODE_ALPHABET}]{${ACCESS_CODE_LENGTH}}$`), {
      error: 'El código tiene 8 letras y números, por ejemplo ABCD-EFGH.',
    }),
  );

export const enrollmentRequestSchema = z.strictObject({
  /** Generated once per onboarding by the client: retries return the same enrollment. */
  idempotencyKey: z.uuid(),
  schoolId: z.uuid({ error: 'Elegí el colegio.' }),
  schoolGroupId: z.uuid({ error: 'Elegí el grupo.' }),
  studentFirstName: studentFirstNameSchema,
  studentLastName: studentLastNameSchema,
  relationship: relationshipSchema,
  consentTextVersion: z.literal(CONSENT_TEXT_VERSION, {
    error: 'El texto de consentimiento cambió: revisalo y aceptalo de nuevo.',
  }),
  consent: z.literal(true, { error: 'Tenés que aceptar para continuar.' }),
  /** Optional: the code the advisor gave the group. Empty means "I don't have it yet". */
  accessCode: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || normalizeAccessCode(value) === '' ? undefined : value,
    )
    .pipe(accessCodeInputSchema.optional()),
});
export type EnrollmentRequest = z.output<typeof enrollmentRequestSchema>;

/**
 * What a family can see for an enrollment (DOMAIN.md → matching). CODE_REQUIRED never reveals whether
 * an offer exists.
 */
export const offerStates = ['CODE_REQUIRED', 'PREPARING', 'AVAILABLE'] as const;
export const offerStateSchema = z.enum(offerStates);
export type OfferState = z.infer<typeof offerStateSchema>;

export const enrollmentSchema = z.object({
  id: z.uuid(),
  school: z.object({ name: z.string(), city: z.string(), province: provinceSchema }),
  group: z.object({ name: z.string(), travelYear: z.number().int() }),
  studentFirstName: z.string(),
  studentLastName: z.string(),
  relationship: relationshipSchema,
  status: z.enum(['SUBMITTED', 'WITHDRAWN']),
  accessGranted: z.boolean(),
  offerState: offerStateSchema,
  createdAt: z.iso.datetime(),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;

export const enrollmentListSchema = z.object({ items: z.array(enrollmentSchema) });

export const accessCodeRequestSchema = z.strictObject({ code: accessCodeInputSchema });

/** The frozen publication as a family sees it: no staff data, catalog prices or override flags. */
export const publicProposalSchema = z.object({
  school: z.object({ name: z.string(), city: z.string(), province: provinceSchema }),
  group: z.object({ name: z.string(), travelYear: z.number().int() }),
  validFrom: z.iso.datetime().nullable(),
  validUntil: z.iso.datetime(),
  publishedAt: z.iso.datetime(),
  items: z.array(
    z.object({
      serviceName: z.string(),
      serviceCategory: serviceCategorySchema,
      quantity: z.number().int(),
      unitPriceMinor: z.string(),
      discountMinor: z.string(),
      lineNetMinor: z.string(),
      /** A group cost: every amount of this item is already the passenger's share. */
      sharedCost: z.boolean().default(false),
    }),
  ),
  // Families see their own amounts only: no group totals and no passenger count.
  pricing: proposalPricingSnapshotSchema.omit({
    passengerCount: true,
    excludedInstallments: true,
    items: true,
    publishedById: true,
    publishedAt: true,
    calculatedAt: true,
  }),
});
export type PublicProposal = z.infer<typeof publicProposalSchema>;

export const enrollmentOfferSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('CODE_REQUIRED') }),
  z.object({ state: z.literal('PREPARING') }),
  z.object({
    state: z.literal('AVAILABLE'),
    proposal: publicProposalSchema,
    /** The option this family said it is interested in for this version (0 = contado), if any. */
    preferredInstallments: z.number().int().nullable().default(null),
  }),
]);

/** "Me interesa esta opción": an expression of interest, never an acceptance (2026-10-03). */
export const planPreferenceRequestSchema = z.strictObject({
  installments: z
    .number({ error: 'Elegí una opción.' })
    .int({ error: 'Elegí una opción.' })
    .min(0)
    .max(36),
});
export type PlanPreferenceRequest = z.output<typeof planPreferenceRequestSchema>;

export const planPreferenceSchema = z.object({ installments: z.number().int() });
export type EnrollmentOffer = z.infer<typeof enrollmentOfferSchema>;

export const enrollmentResponseSchema = z.object({
  enrollment: enrollmentSchema,
  /** True when this student was already registered in this group by this applicant. */
  alreadyRegistered: z.boolean(),
});
