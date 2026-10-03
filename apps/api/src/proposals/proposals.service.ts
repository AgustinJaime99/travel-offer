import { Injectable } from '@nestjs/common';
import {
  type ApiError,
  installmentTiers,
  type Paginated,
  type ProposalListQuery,
  type UpdateProposalDraftRequest,
} from '@travel-rock/shared';
import { ApiException } from '../common/api-exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedStaff } from '../staff-auth/authenticated-staff.js';
import {
  type ProposalDetailRecord,
  proposalDetailInclude,
  type ProposalSummaryRecord,
  proposalSummaryInclude,
} from './proposal.mapper.js';
import {
  buildPricingSnapshot,
  type ProposalPricingInputs,
  PricingValidationError,
} from './proposal-snapshot.js';

type Tx = Prisma.TransactionClient;

const notFound = () => new ApiException(404, 'NOT_FOUND', 'Propuesta no encontrada.');
const draftExists = () =>
  new ApiException(
    409,
    'DRAFT_EXISTS',
    'El grupo ya tiene un borrador. Editalo o descartalo antes de crear otro.',
  );
const changed = () =>
  new ApiException(
    409,
    'PROPOSAL_CHANGED',
    'Alguien más modificó este borrador. Recargá la página para ver los cambios.',
  );
/** Optimistic concurrency: the caller saw this exact version of the draft (when it says so). */
function assertUnchanged(draft: { updatedAt: Date }, expectedUpdatedAt: string | undefined) {
  if (
    expectedUpdatedAt !== undefined &&
    draft.updatedAt.getTime() !== Date.parse(expectedUpdatedAt)
  )
    throw changed();
}
const readOnly = (status: string) =>
  new ApiException(
    409,
    'PROPOSAL_READ_ONLY',
    status === 'ARCHIVED'
      ? 'La propuesta está archivada y no se puede modificar.'
      : 'La propuesta está publicada: para cambiarla creá una nueva versión.',
  );
const invalid = (issues: ApiError['issues']) =>
  new ApiException(400, 'VALIDATION_FAILED', 'Revisá los datos de la propuesta.', issues);

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Pricing contract violations become field issues; snapshots are only ever built from valid inputs. */
/** Contado (0) or one of the tiers: the family is offered every tier up to it (owner, 2026-10-03). */
function tierIssue(installments: number): NonNullable<ApiError['issues']> {
  return installments === 0 || (installmentTiers as readonly number[]).includes(installments)
    ? []
    : [
        {
          path: 'installments',
          message: `Elegí solo contado o hasta ${installmentTiers.join(', ').replace(/, (\d+)$/, ' o $1')} cuotas.`,
        },
      ];
}

function snapshotOrInvalid(...args: Parameters<typeof buildPricingSnapshot>) {
  try {
    return buildPricingSnapshot(...args);
  } catch (error) {
    if (error instanceof PricingValidationError) throw invalid(error.issues);
    throw error;
  }
}

@Injectable()
export class ProposalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProposalListQuery): Promise<Paginated<ProposalSummaryRecord>> {
    const where: Prisma.CommercialProposalWhereInput = {};
    if (query.schoolGroupId) where.schoolGroupId = query.schoolGroupId;
    if (query.status !== 'all') where.status = query.status;
    const [items, total] = await Promise.all([
      this.prisma.commercialProposal.findMany({
        where,
        include: proposalSummaryInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.commercialProposal.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<ProposalDetailRecord> {
    const proposal = await this.prisma.commercialProposal.findUnique({
      where: { id },
      include: proposalDetailInclude,
    });
    if (!proposal) throw notFound();
    return proposal;
  }

  /** New empty draft (next version number) for a group without a draft. */
  async createDraft(
    schoolGroupId: string,
    actor: AuthenticatedStaff,
  ): Promise<ProposalDetailRecord> {
    const id = await this.inGroupTransaction(
      schoolGroupId,
      async (tx) => {
        await this.ensureNoDraft(tx, schoolGroupId);
        const inputs: ProposalPricingInputs = {
          items: [],
          commercialDiscountMinor: 0n,
          downPaymentMinor: 0n,
          installments: 0,
          tnaBps: 0,
          passengerCount: null,
        };
        return this.insertDraft(tx, {
          schoolGroupId,
          inputs,
          actor,
          clonedFromId: null,
          validFrom: null,
          validUntil: null,
        });
      },
      {
        onMissingGroup: () => invalid([{ path: 'schoolGroupId', message: 'El grupo no existe.' }]),
        onUniqueViolation: draftExists,
      },
    );
    return this.get(id);
  }

  /** Copies items (with their snapshots — nothing is refreshed from the catalog), plan inputs and validity. */
  async cloneToNewVersion(
    sourceId: string,
    actor: AuthenticatedStaff,
  ): Promise<ProposalDetailRecord> {
    const source = await this.get(sourceId);
    const id = await this.inGroupTransaction(
      source.schoolGroupId,
      async (tx) => {
        await this.ensureNoDraft(tx, source.schoolGroupId);
        const plan = source.paymentPlan!;
        return this.insertDraft(tx, {
          schoolGroupId: source.schoolGroupId,
          inputs: {
            items: source.items,
            commercialDiscountMinor: plan.commercialDiscountMinor,
            downPaymentMinor: plan.downPaymentMinor,
            installments: plan.installments,
            tnaBps: plan.tnaBps,
            passengerCount: plan.passengerCount,
          },
          actor,
          clonedFromId: source.id,
          validFrom: source.validFrom,
          validUntil: source.validUntil,
        });
      },
      { onUniqueViolation: draftExists },
    );
    return this.get(id);
  }

  /**
   * Replaces items, plan inputs and validity of a draft atomically, recalculating the snapshot.
   * Items already in the draft keep their snapshot (also when cloned from a previous version); new
   * services are snapshotted from the catalog and must be active.
   */
  async replaceDraft(id: string, input: UpdateProposalDraftRequest): Promise<ProposalDetailRecord> {
    const groupId = await this.groupOf(id);
    await this.inGroupTransaction(groupId, async (tx) => {
      const draft = await tx.commercialProposal.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });
      if (draft.status !== 'DRAFT') throw readOnly(draft.status);
      assertUnchanged(draft, input.expectedUpdatedAt);

      const existing = new Map(draft.items.map((item) => [item.serviceId, item]));
      const newIds = input.items
        .map((item) => item.serviceId)
        .filter((serviceId) => !existing.has(serviceId));
      const services = new Map(
        (await tx.service.findMany({ where: { id: { in: newIds } } })).map((service) => [
          service.id,
          service,
        ]),
      );

      const issues: NonNullable<ApiError['issues']> = [];
      const items: ProposalPricingInputs['items'] = [];
      input.items.forEach((item, index) => {
        const kept = existing.get(item.serviceId);
        const service = services.get(item.serviceId);
        if (!kept && !service) {
          issues.push({ path: `items.${index}.serviceId`, message: 'El servicio no existe.' });
          return;
        }
        if (!kept && service && !service.active) {
          issues.push({ path: `items.${index}.serviceId`, message: 'El servicio está inactivo.' });
          return;
        }
        const snapshot = kept ?? {
          serviceNameSnapshot: service!.name,
          serviceCategorySnapshot: service!.category,
          pricingUnitSnapshot: service!.pricingUnit,
          catalogUnitPriceMinor: service!.basePriceMinor,
        };
        items.push({
          serviceId: item.serviceId,
          serviceNameSnapshot: snapshot.serviceNameSnapshot,
          serviceCategorySnapshot: snapshot.serviceCategorySnapshot,
          pricingUnitSnapshot: snapshot.pricingUnitSnapshot,
          catalogUnitPriceMinor: snapshot.catalogUnitPriceMinor,
          unitPriceMinor:
            item.unitPriceMinor === undefined
              ? snapshot.catalogUnitPriceMinor
              : BigInt(item.unitPriceMinor),
          quantity: item.quantity,
          discountMinor: BigInt(item.discountMinor),
        });
      });
      issues.push(...tierIssue(input.installments));
      if (issues.length > 0) throw invalid(issues);

      const inputs: ProposalPricingInputs = {
        items,
        commercialDiscountMinor: BigInt(input.commercialDiscountMinor),
        downPaymentMinor: BigInt(input.downPaymentMinor),
        installments: input.installments,
        tnaBps: input.tnaBps,
        passengerCount: input.passengerCount,
      };
      const priced = snapshotOrInvalid(inputs, { calculatedAt: new Date() });

      await tx.proposalItem.deleteMany({ where: { proposalId: id } });
      await tx.proposalItem.createMany({
        data: items.map((item, position) => ({ ...item, proposalId: id, position })),
      });
      await tx.paymentPlan.update({
        where: { proposalId: id },
        data: {
          commercialDiscountMinor: inputs.commercialDiscountMinor,
          downPaymentMinor: inputs.downPaymentMinor,
          installments: inputs.installments,
          tnaBps: priced.snapshot.tnaBps,
          passengerCount: inputs.passengerCount,
          pricingSnapshot: priced.snapshot,
        },
      });
      await tx.commercialProposal.update({
        where: { id },
        data: {
          validFrom: input.validFrom ? new Date(input.validFrom) : null,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
          cashPriceMinor: priced.cashPriceMinor,
          totalPayableMinor: priced.totalPayableMinor,
        },
      });
    });
    return this.get(id);
  }

  /**
   * One transaction (DOMAIN.md → Publish): lock the group, re-check the draft, recalculate pricing from
   * the stored inputs, freeze the snapshot, archive the current publication, publish this version.
   */
  async publish(
    id: string,
    actor: AuthenticatedStaff,
    expectedUpdatedAt?: string,
  ): Promise<ProposalDetailRecord> {
    const groupId = await this.groupOf(id);
    await this.inGroupTransaction(groupId, async (tx, group) => {
      const draft = await tx.commercialProposal.findUniqueOrThrow({
        where: { id },
        include: { items: { orderBy: { position: 'asc' } }, paymentPlan: true },
      });
      if (draft.status !== 'DRAFT') throw readOnly(draft.status);
      assertUnchanged(draft, expectedUpdatedAt);
      if (group.status !== 'ACTIVE') {
        throw new ApiException(
          409,
          'GROUP_INACTIVE',
          'El grupo está inactivo. Reactivalo para publicar.',
        );
      }
      if (!group.schoolActive) {
        throw new ApiException(
          409,
          'SCHOOL_INACTIVE',
          'El colegio está inactivo. Reactivalo para publicar.',
        );
      }
      const now = new Date();
      const issues: NonNullable<ApiError['issues']> = [];
      if (draft.items.length === 0)
        issues.push({ path: 'items', message: 'Agregá al menos un servicio.' });
      if (!draft.validUntil) {
        issues.push({ path: 'validUntil', message: 'Indicá hasta cuándo es válida la propuesta.' });
      } else if (draft.validUntil <= now) {
        issues.push({
          path: 'validUntil',
          message: 'La fecha de vencimiento tiene que ser futura.',
        });
      }
      issues.push(...tierIssue(draft.paymentPlan!.installments));
      if (issues.length > 0) throw invalid(issues);

      const plan = draft.paymentPlan!;
      const priced = snapshotOrInvalid(
        {
          items: draft.items,
          commercialDiscountMinor: plan.commercialDiscountMinor,
          downPaymentMinor: plan.downPaymentMinor,
          installments: plan.installments,
          tnaBps: plan.tnaBps,
          passengerCount: plan.passengerCount,
        },
        { calculatedAt: now, publishedAt: now, publishedById: actor.user.id },
      );

      // While still a DRAFT: the immutability triggers reject any change afterwards.
      await tx.paymentPlan.update({
        where: { proposalId: id },
        data: { pricingSnapshot: priced.snapshot },
      });
      await tx.commercialProposal.updateMany({
        where: { schoolGroupId: groupId, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED', archivedAt: now },
      });
      await tx.commercialProposal.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: now,
          publishedById: actor.user.id,
          cashPriceMinor: priced.cashPriceMinor,
          totalPayableMinor: priced.totalPayableMinor,
        },
      });
    });
    return this.get(id);
  }

  /** DRAFT → ARCHIVED (discard) or PUBLISHED → ARCHIVED (withdraw: the group goes back to "preparing"). */
  async archive(id: string): Promise<ProposalDetailRecord> {
    const groupId = await this.groupOf(id);
    await this.inGroupTransaction(groupId, async (tx) => {
      const proposal = await tx.commercialProposal.findUniqueOrThrow({ where: { id } });
      if (proposal.status === 'ARCHIVED') throw readOnly(proposal.status);
      await tx.commercialProposal.update({
        where: { id },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });
    });
    return this.get(id);
  }

  private async groupOf(id: string): Promise<string> {
    const proposal = await this.prisma.commercialProposal.findUnique({
      where: { id },
      select: { schoolGroupId: true },
    });
    if (!proposal) throw notFound();
    return proposal.schoolGroupId;
  }

  /**
   * Every write on a group's proposals runs inside a transaction holding the group row lock, so drafts,
   * clones and publications of one group are serialized. The partial unique indexes are the backstop.
   */
  private async inGroupTransaction<T>(
    schoolGroupId: string,
    work: (tx: Tx, group: { status: string; schoolActive: boolean }) => Promise<T>,
    options: { onMissingGroup?: () => Error; onUniqueViolation?: () => Error } = {},
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const [group] = await tx.$queryRaw<{ status: string; schoolActive: boolean }[]>`
          SELECT g.status::text AS status, s.active AS "schoolActive"
          FROM "SchoolGroup" g JOIN "School" s ON s.id = g."schoolId"
          WHERE g.id = ${schoolGroupId}::uuid
          FOR UPDATE OF g`;
        if (!group) throw (options.onMissingGroup ?? notFound)();
        return work(tx, group);
      });
    } catch (error) {
      if (options.onUniqueViolation && isUniqueViolation(error)) throw options.onUniqueViolation();
      throw error;
    }
  }

  private async ensureNoDraft(tx: Tx, schoolGroupId: string): Promise<void> {
    const draft = await tx.commercialProposal.findFirst({
      where: { schoolGroupId, status: 'DRAFT' },
      select: { id: true },
    });
    if (draft) throw draftExists();
  }

  private async insertDraft(
    tx: Tx,
    data: {
      schoolGroupId: string;
      inputs: ProposalPricingInputs;
      actor: AuthenticatedStaff;
      clonedFromId: string | null;
      validFrom: Date | null;
      validUntil: Date | null;
    },
  ): Promise<string> {
    const last = await tx.commercialProposal.aggregate({
      where: { schoolGroupId: data.schoolGroupId },
      _max: { version: true },
    });
    const priced = snapshotOrInvalid(data.inputs, { calculatedAt: new Date() });
    const proposal = await tx.commercialProposal.create({
      data: {
        schoolGroupId: data.schoolGroupId,
        version: (last._max.version ?? 0) + 1,
        clonedFromId: data.clonedFromId,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        createdById: data.actor.user.id,
        cashPriceMinor: priced.cashPriceMinor,
        totalPayableMinor: priced.totalPayableMinor,
        paymentPlan: {
          create: {
            commercialDiscountMinor: data.inputs.commercialDiscountMinor,
            downPaymentMinor: data.inputs.downPaymentMinor,
            installments: data.inputs.installments,
            tnaBps: data.inputs.tnaBps,
            passengerCount: data.inputs.passengerCount,
            pricingSnapshot: priced.snapshot,
          },
        },
      },
    });
    if (data.inputs.items.length > 0) {
      await tx.proposalItem.createMany({
        data: data.inputs.items.map((item, position) => ({
          proposalId: proposal.id,
          position,
          serviceId: item.serviceId,
          serviceNameSnapshot: item.serviceNameSnapshot,
          serviceCategorySnapshot: item.serviceCategorySnapshot,
          pricingUnitSnapshot: item.pricingUnitSnapshot,
          catalogUnitPriceMinor: item.catalogUnitPriceMinor,
          unitPriceMinor: item.unitPriceMinor,
          quantity: item.quantity,
          discountMinor: item.discountMinor,
        })),
      });
    }
    return proposal.id;
  }
}
