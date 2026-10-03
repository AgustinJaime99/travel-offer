import { z } from 'zod';
import { moneyMinorSchema } from './money.js';
import { paginatedSchema, paginationQuerySchema } from './pagination.js';
import { collapseWhitespace, normalizeText } from './text.js';

/** Approved Phase 0 list. */
export const serviceCategoryLabels = {
  TRANSPORT: 'Transporte',
  LODGING: 'Alojamiento',
  MEALS: 'Comidas',
  EXCURSIONS: 'Excursiones',
  INSURANCE: 'Seguro',
  OTHER: 'Otro',
} as const;
export type ServiceCategory = keyof typeof serviceCategoryLabels;
export const serviceCategories = Object.keys(serviceCategoryLabels) as [
  ServiceCategory,
  ...ServiceCategory[],
];
export const serviceCategorySchema = z.enum(serviceCategories, { error: 'Elegí una categoría.' });

/**
 * PER_GROUP (owner, 2026-10-03): the price is for the whole group and each proposal divides it among
 * its passenger count, rounded up to the centavo (DOMAIN.md → Pricing contract, v2).
 */
export const pricingUnitLabels = { PER_PASSENGER: 'por pasajero', PER_GROUP: 'por grupo' } as const;
export type PricingUnit = keyof typeof pricingUnitLabels;
export const pricingUnitSchema = z.enum(['PER_PASSENGER', 'PER_GROUP'], {
  error: 'Elegí cómo se cobra el servicio.',
});

export const serviceNameSchema = z
  .string()
  .transform(collapseWhitespace)
  .pipe(
    z
      .string()
      .min(2, { error: 'Nombre: ingresá al menos 2 caracteres.', abort: true })
      .max(120, { error: 'Nombre: hasta 120 caracteres.', abort: true })
      .refine((value) => normalizeText(value).length > 0, {
        error: 'Nombre: tiene que incluir letras o números.',
      }),
  );

const descriptionSchema = z
  .string()
  .trim()
  .max(1000, { error: 'Descripción: hasta 1000 caracteres.' })
  .transform((value) => (value === '' ? null : value))
  .nullable();

export const createServiceRequestSchema = z.object({
  name: serviceNameSchema,
  description: descriptionSchema.optional(),
  category: serviceCategorySchema,
  /** Fixed once created: changing it would change the meaning of the price of existing drafts. */
  pricingUnit: pricingUnitSchema.default('PER_PASSENGER'),
  basePriceMinor: moneyMinorSchema,
});
export type CreateServiceRequest = z.output<typeof createServiceRequestSchema>;

export const updateServiceRequestSchema = z
  .strictObject({
    name: serviceNameSchema.optional(),
    description: descriptionSchema.optional(),
    category: serviceCategorySchema.optional(),
    basePriceMinor: moneyMinorSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'No hay cambios para guardar.',
  });
export type UpdateServiceRequest = z.output<typeof updateServiceRequestSchema>;

export const serviceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  category: serviceCategorySchema,
  pricingUnit: pricingUnitSchema,
  /** Default unit price for new proposal items, in centavos. Never a historical quote. */
  basePriceMinor: moneyMinorSchema,
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Service = z.infer<typeof serviceSchema>;

export const serviceStatusFilters = ['active', 'inactive', 'all'] as const;

export const serviceListQuerySchema = paginationQuerySchema.extend({
  q: z
    .string()
    .max(100)
    .optional()
    .transform((value) => (value === undefined || normalizeText(value) === '' ? undefined : value)),
  category: z.preprocess(
    (value) => (value === '' ? undefined : value),
    serviceCategorySchema.optional(),
  ),
  status: z.enum(serviceStatusFilters).default('active'),
});
export type ServiceListQuery = z.output<typeof serviceListQuerySchema>;

export const serviceListSchema = paginatedSchema(serviceSchema);
