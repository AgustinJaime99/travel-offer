import { z } from 'zod';
import { moneyMinorSchema } from './money.js';
import { paginatedSchema, paginationQuerySchema } from './pagination.js';
import { pricingResultSchema } from './pricing.js';
import { groupStatusSchema } from './school-group.js';
import { pricingUnitSchema, serviceCategorySchema } from './service.js';

export const proposalStatuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const proposalStatusSchema = z.enum(proposalStatuses);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;
export const proposalStatusLabels: Record<ProposalStatus, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicada',
  ARCHIVED: 'Archivada',
};

const intSchema = z
  .number({ error: 'Tiene que ser un número entero.' })
  .int({ error: 'Tiene que ser un número entero.' });
const dateTimeSchema = z.iso.datetime({ offset: true, error: 'Fecha y hora inválidas.' });

export const createProposalRequestSchema = z.strictObject({
  schoolGroupId: z.uuid({ error: 'Elegí un grupo.' }),
});

export const proposalItemInputSchema = z.strictObject({
  serviceId: z.uuid({ error: 'Elegí un servicio.' }),
  quantity: intSchema,
  /** Omitted: the catalog price captured when the service was added. Different: a price override (B6). */
  unitPriceMinor: moneyMinorSchema.optional(),
  discountMinor: moneyMinorSchema.default('0'),
});

/** Replaces the whole draft (items, financing inputs, validity). Totals are never accepted. */
export const updateProposalDraftRequestSchema = z
  .strictObject({
    items: z.array(proposalItemInputSchema).max(100, { error: 'Hasta 100 servicios.' }),
    commercialDiscountMinor: moneyMinorSchema.default('0'),
    downPaymentMinor: moneyMinorSchema.default('0'),
    installments: intSchema,
    tnaBps: intSchema,
    /** Required when the draft has per-group services: the cost is divided among them. */
    passengerCount: intSchema.nullable().default(null),
    validFrom: dateTimeSchema.nullable().default(null),
    validUntil: dateTimeSchema.nullable().default(null),
    /** The draft's `updatedAt` the editor last saw: a stale value is rejected (409 PROPOSAL_CHANGED). */
    expectedUpdatedAt: dateTimeSchema.optional(),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (seen.has(item.serviceId)) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'serviceId'],
          message: 'Cada servicio puede aparecer una sola vez.',
        });
      }
      seen.add(item.serviceId);
    });
    if (
      value.validFrom &&
      value.validUntil &&
      Date.parse(value.validFrom) > Date.parse(value.validUntil)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: 'La fecha de vencimiento tiene que ser posterior al inicio.',
      });
    }
  });
export type UpdateProposalDraftRequest = z.output<typeof updateProposalDraftRequestSchema>;

/** Publishes exactly the draft the editor last saw, when `expectedUpdatedAt` is given. */
export const publishProposalRequestSchema = z
  .strictObject({ expectedUpdatedAt: dateTimeSchema.optional() })
  .default({}); // no body at all is allowed
export type PublishProposalRequest = z.output<typeof publishProposalRequestSchema>;

/** Frozen copy of a service inside a proposal version. */
export const proposalItemSnapshotSchema = z.object({
  serviceId: z.uuid(),
  serviceName: z.string(),
  serviceCategory: serviceCategorySchema,
  pricingUnit: pricingUnitSchema,
  catalogUnitPriceMinor: moneyMinorSchema,
  unitPriceMinor: moneyMinorSchema,
  quantity: z.number().int(),
  discountMinor: moneyMinorSchema,
  lineGrossMinor: moneyMinorSchema,
  lineNetMinor: moneyMinorSchema,
  /** The passenger's share; absent in v1 snapshots, where it equals lineNetMinor. */
  perPassengerMinor: moneyMinorSchema.optional(),
});

/** What one passenger pays for a snapshot item (v1 snapshots have per-passenger lines only). */
export function itemPerPassengerMinor(item: {
  lineNetMinor: string;
  perPassengerMinor?: string | undefined;
}): string {
  return item.perPassengerMinor ?? item.lineNetMinor;
}

/** DOMAIN.md → Pricing snapshot contents. Recalculated on every draft save; frozen at publication. */
export const proposalPricingSnapshotSchema = pricingResultSchema.omit({ lines: true }).extend({
  items: z.array(proposalItemSnapshotSchema),
  calculatedAt: dateTimeSchema,
  publishedAt: dateTimeSchema.nullable(),
  publishedById: z.uuid().nullable(),
});
export type ProposalPricingSnapshot = z.infer<typeof proposalPricingSnapshotSchema>;

const staffRefSchema = z.object({ id: z.uuid(), fullName: z.string() });

export const proposalSummarySchema = z.object({
  id: z.uuid(),
  version: z.number().int(),
  status: proposalStatusSchema,
  schoolGroup: z.object({
    id: z.uuid(),
    name: z.string(),
    travelYear: z.number().int(),
    status: groupStatusSchema,
    school: z.object({ id: z.uuid(), name: z.string(), active: z.boolean() }),
  }),
  clonedFromId: z.uuid().nullable(),
  validFrom: dateTimeSchema.nullable(),
  validUntil: dateTimeSchema.nullable(),
  cashPriceMinor: moneyMinorSchema,
  totalPayableMinor: moneyMinorSchema,
  createdBy: staffRefSchema,
  publishedBy: staffRefSchema.nullable(),
  publishedAt: dateTimeSchema.nullable(),
  archivedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type ProposalSummary = z.infer<typeof proposalSummarySchema>;

export const proposalSchema = proposalSummarySchema.extend({
  items: z.array(
    z.object({
      id: z.uuid(),
      position: z.number().int(),
      serviceId: z.uuid(),
      serviceName: z.string(),
      serviceCategory: serviceCategorySchema,
      pricingUnit: pricingUnitSchema,
      catalogUnitPriceMinor: moneyMinorSchema,
      unitPriceMinor: moneyMinorSchema,
      priceOverridden: z.boolean(),
      quantity: z.number().int(),
      discountMinor: moneyMinorSchema,
    }),
  ),
  paymentPlan: z.object({
    commercialDiscountMinor: moneyMinorSchema,
    downPaymentMinor: moneyMinorSchema,
    installments: z.number().int(),
    tnaBps: z.number().int(),
    passengerCount: z.number().int().nullable(),
  }),
  pricing: proposalPricingSnapshotSchema,
});
export type Proposal = z.infer<typeof proposalSchema>;

export const proposalListQuerySchema = paginationQuerySchema.extend({
  schoolGroupId: z.preprocess((value) => (value === '' ? undefined : value), z.uuid().optional()),
  status: z.enum([...proposalStatuses, 'all']).default('all'),
});
export type ProposalListQuery = z.output<typeof proposalListQuerySchema>;

export const proposalListSchema = paginatedSchema(proposalSummarySchema);
