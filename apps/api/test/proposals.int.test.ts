import {
  type Proposal,
  proposalListSchema,
  proposalSchema,
  schoolGroupSchema,
  schoolSchema,
  serviceSchema,
  travelYearRange,
} from '@travel-rock/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, type TestApp } from './app.js';
import { resetDatabase } from './db.js';
import { createStaff, errorOf, login } from './staff.js';

let app: TestApp;
let prisma: PrismaService;
let commercial: string;
let viewer: string;
let commercialId: string;
let groupId: string;
let schoolId: string;
let services: { transport: string; lodging: string; excursions: string };
const http = () => request(app.getHttpServer());
const UNKNOWN_ID = '019a0000-0000-7000-8000-000000000000';
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

async function post<T>(
  path: string,
  body: object,
  schema: { parse: (value: unknown) => T },
  cookie = commercial,
) {
  const response = await http().post(path).set('Cookie', cookie).send(body).expect(201);
  return schema.parse(response.body);
}

async function createService(name: string, category: string, basePriceMinor: string) {
  return (await post('/api/admin/services', { name, category, basePriceMinor }, serviceSchema)).id;
}

beforeEach(async () => {
  await resetDatabase(prisma);
  const staff = await createStaff(prisma, { role: 'COMMERCIAL' });
  commercialId = staff.id;
  commercial = await login(app, staff.email);
  viewer = await login(app, (await createStaff(prisma, { role: 'VIEWER' })).email);
  schoolId = (
    await post(
      '/api/admin/schools',
      { name: 'Colegio San Martín', province: 'CORDOBA', city: 'Villa María' },
      schoolSchema,
    )
  ).id;
  groupId = (
    await post(
      '/api/admin/school-groups',
      { schoolId, name: '5° A', travelYear: travelYearRange().min + 2 },
      schoolGroupSchema,
    )
  ).id;
  services = {
    transport: await createService('Bus semicama', 'TRANSPORT', '110000000'),
    lodging: await createService('Hotel 3 estrellas', 'LODGING', '150000000'),
    excursions: await createService('Excursiones', 'EXCURSIONS', '50000000'),
  };
});

const createDraft = async (cookie = commercial) =>
  proposalSchema.parse(
    (
      await http()
        .post('/api/admin/proposals')
        .set('Cookie', cookie)
        .send({ schoolGroupId: groupId })
        .expect(201)
    ).body,
  );

/** DOMAIN.md worked example as a draft: 3 services, 5.000.000 discount, 20.000.000 down payment, 18 × 35 %. */
const workedExample = () => ({
  items: [
    { serviceId: services.transport, quantity: 1 },
    { serviceId: services.lodging, quantity: 1 },
    { serviceId: services.excursions, quantity: 1 },
  ],
  commercialDiscountMinor: '10000000',
  downPaymentMinor: '60000000',
  installments: 18,
  tnaBps: 3500,
  validUntil: inDays(60),
});

const put = (id: string, body: object, cookie = commercial) =>
  http().put(`/api/admin/proposals/${id}`).set('Cookie', cookie).send(body);
const publish = (id: string, cookie = commercial, body: object = {}) =>
  http().post(`/api/admin/proposals/${id}/publish`).set('Cookie', cookie).send(body);
const clone = (id: string, cookie = commercial) =>
  http().post(`/api/admin/proposals/${id}/versions`).set('Cookie', cookie);
const archive = (id: string) =>
  http().post(`/api/admin/proposals/${id}/archive`).set('Cookie', commercial);
const get = async (id: string) =>
  proposalSchema.parse(
    (await http().get(`/api/admin/proposals/${id}`).set('Cookie', viewer).expect(200)).body,
  );

async function publishedWorkedExample(): Promise<Proposal> {
  const draft = await createDraft();
  await put(draft.id, workedExample()).expect(200);
  return proposalSchema.parse((await publish(draft.id).expect(200)).body);
}

describe('drafts', () => {
  it('creates an empty v1 draft priced at zero', async () => {
    const draft = await createDraft();
    expect(draft).toMatchObject({
      version: 1,
      status: 'DRAFT',
      schoolGroup: {
        id: groupId,
        name: '5° A',
        school: { id: schoolId, name: 'Colegio San Martín' },
      },
      clonedFromId: null,
      createdBy: { id: commercialId },
      publishedBy: null,
      items: [],
      paymentPlan: {
        commercialDiscountMinor: '0',
        downPaymentMinor: '0',
        installments: 0,
        tnaBps: 0,
      },
      cashPriceMinor: '0',
      totalPayableMinor: '0',
    });
    expect(draft.pricing).toMatchObject({
      formulaVersion: 'french-tna12-v2',
      items: [],
      totalPayableMinor: '0',
      publishedAt: null,
    });
  });

  it('allows one draft per group and needs an existing group', async () => {
    await createDraft();
    const second = await http()
      .post('/api/admin/proposals')
      .set('Cookie', commercial)
      .send({ schoolGroupId: groupId })
      .expect(409);
    expect(errorOf(second).code).toBe('DRAFT_EXISTS');
    const missing = await http()
      .post('/api/admin/proposals')
      .set('Cookie', commercial)
      .send({ schoolGroupId: UNKNOWN_ID })
      .expect(400);
    expect(errorOf(missing).issues).toEqual([
      { path: 'schoolGroupId', message: 'El grupo no existe.' },
    ]);
  });

  it('PUT replaces the draft and stores a server-calculated snapshot of the worked example', async () => {
    const draft = await createDraft();
    const saved = proposalSchema.parse((await put(draft.id, workedExample()).expect(200)).body);
    expect(
      saved.items.map((item) => [
        item.position,
        item.serviceName,
        item.unitPriceMinor,
        item.priceOverridden,
      ]),
    ).toEqual([
      [0, 'Bus semicama', '110000000', false],
      [1, 'Hotel 3 estrellas', '150000000', false],
      [2, 'Excursiones', '50000000', false],
    ]);
    expect(saved).toMatchObject({ cashPriceMinor: '300000000', totalPayableMinor: '371892769' });
    expect(saved.pricing).toMatchObject({
      subtotalMinor: '310000000',
      financedPrincipalMinor: '240000000',
      teaBps: 4120,
      totalInterestMinor: '71892769',
      scheduleSummary: [
        { count: 17, paymentMinor: '17327376' },
        { count: 1, paymentMinor: '17327377' },
      ],
      publishedAt: null,
    });
    expect(saved.pricing.items[1]).toMatchObject({
      serviceName: 'Hotel 3 estrellas',
      lineNetMinor: '150000000',
    });

    const shrunk = proposalSchema.parse(
      (
        await put(draft.id, {
          items: [{ serviceId: services.transport, quantity: 2 }],
          installments: 3,
          tnaBps: 0,
        }).expect(200)
      ).body,
    );
    expect(shrunk.items).toHaveLength(1);
    expect(shrunk).toMatchObject({
      cashPriceMinor: '220000000',
      totalPayableMinor: '220000000',
      validUntil: null,
    });
  });

  it('supports price overrides and marks them', async () => {
    const draft = await createDraft();
    const saved = proposalSchema.parse(
      (
        await put(draft.id, {
          items: [{ serviceId: services.transport, quantity: 1, unitPriceMinor: '40000000' }],
          installments: 3,
          tnaBps: 0,
        }).expect(200)
      ).body,
    );
    expect(saved.items[0]).toMatchObject({
      catalogUnitPriceMinor: '110000000',
      unitPriceMinor: '40000000',
      priceOverridden: true,
    });
  });

  it('rejects unknown, inactive and repeated services, contract violations and client totals', async () => {
    const draft = await createDraft();
    const base = { installments: 3, tnaBps: 0 };
    const issues = async (body: object) =>
      errorOf(await put(draft.id, { ...base, ...body }).expect(400)).issues;

    expect(await issues({ items: [{ serviceId: UNKNOWN_ID, quantity: 1 }] })).toEqual([
      { path: 'items.0.serviceId', message: 'El servicio no existe.' },
    ]);
    await http()
      .patch(`/api/admin/services/${services.lodging}`)
      .set('Cookie', commercial)
      .send({ active: false })
      .expect(200);
    expect(await issues({ items: [{ serviceId: services.lodging, quantity: 1 }] })).toEqual([
      { path: 'items.0.serviceId', message: 'El servicio está inactivo.' },
    ]);
    expect(
      (
        await issues({
          items: [
            { serviceId: services.transport, quantity: 1 },
            { serviceId: services.transport, quantity: 2 },
          ],
        })
      )?.[0]?.path,
    ).toBe('items.1.serviceId');
    expect(
      (
        await issues({
          items: [{ serviceId: services.transport, quantity: 1, discountMinor: '110000001' }],
        })
      )?.[0]?.path,
    ).toBe('items.0.discountMinor');
    await put(draft.id, { ...base, items: [], totalPayableMinor: '1' }).expect(400);
    expect((await get(draft.id)).items).toEqual([]);
  });
});

describe('publication', () => {
  it('requires at least one service and a future validity', async () => {
    const draft = await createDraft();
    const response = await publish(draft.id).expect(400);
    expect(errorOf(response).issues?.map((issue) => issue.path)).toEqual(['items', 'validUntil']);
    await put(draft.id, { ...workedExample(), validUntil: inDays(-1) }).expect(200);
    expect(errorOf(await publish(draft.id).expect(400)).issues).toEqual([
      { path: 'validUntil', message: 'La fecha de vencimiento tiene que ser futura.' },
    ]);
  });

  it('freezes the snapshot with the publisher and makes the version read-only', async () => {
    const published = await publishedWorkedExample();
    expect(published).toMatchObject({
      status: 'PUBLISHED',
      publishedBy: { id: commercialId },
      totalPayableMinor: '371892769',
    });
    expect(published.publishedAt).not.toBeNull();
    expect(published.pricing).toMatchObject({
      publishedById: commercialId,
      publishedAt: published.publishedAt,
    });

    expect(errorOf(await put(published.id, workedExample()).expect(409)).code).toBe(
      'PROPOSAL_READ_ONLY',
    );
    expect(errorOf(await publish(published.id).expect(409)).code).toBe('PROPOSAL_READ_ONLY');
  });

  it('is refused for inactive groups and schools', async () => {
    const draft = await createDraft();
    await put(draft.id, workedExample()).expect(200);
    await http()
      .patch(`/api/admin/school-groups/${groupId}`)
      .set('Cookie', commercial)
      .send({ status: 'INACTIVE' })
      .expect(200);
    expect(errorOf(await publish(draft.id).expect(409)).code).toBe('GROUP_INACTIVE');
    await http()
      .patch(`/api/admin/school-groups/${groupId}`)
      .set('Cookie', commercial)
      .send({ status: 'ACTIVE' })
      .expect(200);
    await http()
      .patch(`/api/admin/schools/${schoolId}`)
      .set('Cookie', commercial)
      .send({ active: false })
      .expect(200);
    expect(errorOf(await publish(draft.id).expect(409)).code).toBe('SCHOOL_INACTIVE');
  });
});

describe('versions', () => {
  it('clones into the next version, and publishing it archives the previous publication', async () => {
    const v1 = await publishedWorkedExample();
    const v2 = proposalSchema.parse((await clone(v1.id).expect(201)).body);
    expect(v2).toMatchObject({
      version: 2,
      status: 'DRAFT',
      clonedFromId: v1.id,
      validUntil: v1.validUntil,
    });
    expect(v2.items.map((item) => [item.serviceId, item.unitPriceMinor])).toEqual(
      v1.items.map((item) => [item.serviceId, item.unitPriceMinor]),
    );
    expect(errorOf(await clone(v1.id).expect(409)).code).toBe('DRAFT_EXISTS');

    await put(v2.id, { ...workedExample(), installments: 12 }).expect(200);
    await publish(v2.id).expect(200);
    expect((await get(v1.id)).status).toBe('ARCHIVED');
    expect((await get(v2.id)).status).toBe('PUBLISHED');
    expect(
      await prisma.commercialProposal.count({
        where: { schoolGroupId: groupId, status: 'PUBLISHED' },
      }),
    ).toBe(1);
  });

  it('withdraws a publication and discards drafts; numbering continues', async () => {
    const v1 = await publishedWorkedExample();
    const withdrawn = proposalSchema.parse((await archive(v1.id).expect(200)).body);
    expect(withdrawn).toMatchObject({ status: 'ARCHIVED', totalPayableMinor: '371892769' });
    expect(withdrawn.archivedAt).not.toBeNull();
    expect(await prisma.commercialProposal.count({ where: { status: 'PUBLISHED' } })).toBe(0);
    expect(errorOf(await archive(v1.id).expect(409)).code).toBe('PROPOSAL_READ_ONLY');

    const v2 = await createDraft();
    expect(v2.version).toBe(2);
    await archive(v2.id).expect(200);
    expect((await createDraft()).version).toBe(3);
  });

  it('lists versions by group and status', async () => {
    const v1 = await publishedWorkedExample();
    await clone(v1.id).expect(201);
    const all = proposalListSchema.parse(
      (
        await http()
          .get(`/api/admin/proposals?schoolGroupId=${groupId}`)
          .set('Cookie', viewer)
          .expect(200)
      ).body,
    );
    expect(all.items.map((proposal) => [proposal.version, proposal.status]).sort()).toEqual([
      [1, 'PUBLISHED'],
      [2, 'DRAFT'],
    ]);
    const published = proposalListSchema.parse(
      (await http().get('/api/admin/proposals?status=PUBLISHED').set('Cookie', viewer).expect(200))
        .body,
    );
    expect(published.items.map((proposal) => proposal.id)).toEqual([v1.id]);
  });
});

describe('catalog changes never alter historical prices', () => {
  it('published snapshots and cloned items keep their prices when the catalog changes', async () => {
    const v1 = await publishedWorkedExample();
    await http()
      .patch(`/api/admin/services/${services.transport}`)
      .set('Cookie', commercial)
      .send({ name: 'Bus cama', basePriceMinor: '99000000', active: false })
      .expect(200);

    const after = await get(v1.id);
    expect(after.pricing).toEqual(v1.pricing);
    expect(after.items[0]).toMatchObject({
      serviceName: 'Bus semicama',
      unitPriceMinor: '110000000',
    });
    expect(after.totalPayableMinor).toBe('371892769');

    // The clone keeps the old snapshot, even though the service is now inactive and repriced.
    const v2 = proposalSchema.parse((await clone(v1.id).expect(201)).body);
    expect(v2.items[0]).toMatchObject({
      serviceName: 'Bus semicama',
      catalogUnitPriceMinor: '110000000',
      unitPriceMinor: '110000000',
    });
    const resaved = proposalSchema.parse((await put(v2.id, workedExample()).expect(200)).body);
    expect(resaved.totalPayableMinor).toBe('371892769');
  });
});

describe('immutability at the database level (direct SQL)', () => {
  it('rejects any change to a published version, its items and its plan', async () => {
    const v1 = await publishedWorkedExample();
    const id = v1.id;
    const attempts = [
      prisma.$executeRaw`UPDATE "ProposalItem" SET "unitPriceMinor" = 1 WHERE "proposalId" = ${id}::uuid`,
      prisma.$executeRaw`DELETE FROM "ProposalItem" WHERE "proposalId" = ${id}::uuid`,
      prisma.$executeRaw`INSERT INTO "ProposalItem" (id, "proposalId", "serviceId", position, "serviceNameSnapshot", "serviceCategorySnapshot", "pricingUnitSnapshot", "catalogUnitPriceMinor", "unitPriceMinor", quantity)
        VALUES (gen_random_uuid(), ${id}::uuid, ${services.lodging}::uuid, 9, 'X', 'OTHER', 'PER_PASSENGER', 1, 1, 1)`,
      prisma.$executeRaw`UPDATE "PaymentPlan" SET "tnaBps" = 0 WHERE "proposalId" = ${id}::uuid`,
      prisma.$executeRaw`UPDATE "PaymentPlan" SET "pricingSnapshot" = '{}' WHERE "proposalId" = ${id}::uuid`,
      prisma.$executeRaw`UPDATE "CommercialProposal" SET "validUntil" = now() + interval '1 year' WHERE id = ${id}::uuid`,
      prisma.$executeRaw`UPDATE "CommercialProposal" SET "totalPayableMinor" = 1 WHERE id = ${id}::uuid`,
      prisma.$executeRaw`UPDATE "CommercialProposal" SET status = 'DRAFT', "publishedAt" = NULL, "publishedById" = NULL WHERE id = ${id}::uuid`,
      prisma.$executeRaw`UPDATE "CommercialProposal" SET status = 'ARCHIVED', "archivedAt" = now(), "totalPayableMinor" = 1 WHERE id = ${id}::uuid`,
      prisma.$executeRaw`DELETE FROM "CommercialProposal" WHERE id = ${id}::uuid`,
    ];
    for (const attempt of attempts) {
      await expect(attempt).rejects.toThrow(/cannot be (modified|deleted)|is not allowed/);
    }
    expect(await get(id)).toEqual(v1);

    // The only allowed transition: PUBLISHED → ARCHIVED, after which nothing changes.
    await prisma.$executeRaw`UPDATE "CommercialProposal" SET status = 'ARCHIVED', "archivedAt" = now() WHERE id = ${id}::uuid`;
    await expect(
      prisma.$executeRaw`UPDATE "CommercialProposal" SET status = 'PUBLISHED', "archivedAt" = NULL WHERE id = ${id}::uuid`,
    ).rejects.toThrow(/cannot be modified/);
  });

  it('partial unique indexes forbid a second publication or draft per group', async () => {
    const v1 = await publishedWorkedExample();
    const insert = (status: string) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO "CommercialProposal" (id, "schoolGroupId", version, status, "createdById", "publishedById", "publishedAt", "validUntil", "cashPriceMinor", "totalPayableMinor", "updatedAt")
       VALUES (gen_random_uuid(), $1::uuid, 99, $2::"ProposalStatus", $3::uuid, $4::uuid, $5::timestamp, now() + interval '1 day', 0, 0, now())`,
        groupId,
        status,
        commercialId,
        status === 'PUBLISHED' ? commercialId : null,
        status === 'PUBLISHED' ? new Date() : null,
      );
    await expect(insert('PUBLISHED')).rejects.toThrow(/one_published_per_group/);
    await clone(v1.id).expect(201);
    await expect(insert('DRAFT')).rejects.toThrow(/one_draft_per_group/);
  });
});

describe('concurrency', () => {
  it('concurrent publication of the same draft succeeds exactly once', async () => {
    const draft = await createDraft();
    await put(draft.id, workedExample()).expect(200);
    const responses = await Promise.all(Array.from({ length: 5 }, () => publish(draft.id)));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409, 409, 409, 409]);
    expect(await prisma.commercialProposal.count({ where: { status: 'PUBLISHED' } })).toBe(1);
  });

  it('concurrent draft creations and clones produce exactly one draft', async () => {
    const created = await Promise.all(
      Array.from({ length: 5 }, () =>
        http()
          .post('/api/admin/proposals')
          .set('Cookie', commercial)
          .send({ schoolGroupId: groupId }),
      ),
    );
    expect(created.map((response) => response.status).sort()).toEqual([201, 409, 409, 409, 409]);

    const [draft] = await prisma.commercialProposal.findMany({ where: { status: 'DRAFT' } });
    await put(draft!.id, workedExample()).expect(200);
    await publish(draft!.id).expect(200);
    const clones = await Promise.all(Array.from({ length: 5 }, () => clone(draft!.id)));
    expect(clones.map((response) => response.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await prisma.commercialProposal.count({ where: { status: 'DRAFT' } })).toBe(1);
    expect(
      (await prisma.commercialProposal.findMany({ orderBy: { version: 'asc' } })).map(
        (p) => p.version,
      ),
    ).toEqual([1, 2]);
  });

  it('a draft edited while being published stays consistent', async () => {
    const draft = await createDraft();
    await put(draft.id, workedExample()).expect(200);
    const [published, edited] = await Promise.all([
      publish(draft.id),
      put(draft.id, { ...workedExample(), installments: 6 }),
    ]);
    expect(published.status).toBe(200);
    expect([200, 409]).toContain(edited.status);
    const final = await get(draft.id);
    expect(final.status).toBe('PUBLISHED');
    expect(final.pricing.installments).toBe(final.paymentPlan.installments);
    expect(final.totalPayableMinor).toBe(final.pricing.totalPayableMinor);
  });
});

describe('optimistic concurrency (expectedUpdatedAt)', () => {
  it('saving or publishing a draft someone else changed meanwhile is rejected', async () => {
    const draft = await createDraft();
    const seen = proposalSchema.parse(
      (await put(draft.id, workedExample()).expect(200)).body,
    ).updatedAt;
    // Another staff member saves different financing.
    await put(draft.id, { ...workedExample(), installments: 6 }).expect(200);

    const stalePublish = await publish(draft.id, commercial, { expectedUpdatedAt: seen }).expect(
      409,
    );
    expect(errorOf(stalePublish).code).toBe('PROPOSAL_CHANGED');
    const staleSave = await put(draft.id, { ...workedExample(), expectedUpdatedAt: seen }).expect(
      409,
    );
    expect(errorOf(staleSave).code).toBe('PROPOSAL_CHANGED');
    expect((await get(draft.id)).status).toBe('DRAFT');
    expect((await get(draft.id)).paymentPlan.installments).toBe(6);
  });

  it('the version the editor saw is saved and published', async () => {
    const draft = await createDraft();
    const saved = proposalSchema.parse(
      (await put(draft.id, { ...workedExample(), expectedUpdatedAt: draft.updatedAt }).expect(200))
        .body,
    );
    const published = proposalSchema.parse(
      (await publish(draft.id, commercial, { expectedUpdatedAt: saved.updatedAt }).expect(200))
        .body,
    );
    expect(published.status).toBe('PUBLISHED');
    expect(published.totalPayableMinor).toBe('371892769');
  });

  it('rejects an invalid expectedUpdatedAt and unknown body fields', async () => {
    const draft = await createDraft();
    await publish(draft.id, commercial, { expectedUpdatedAt: 'ayer' }).expect(400);
    await publish(draft.id, commercial, { totalPayableMinor: '1' }).expect(400);
  });
});

describe('permissions', () => {
  it('VIEWER can read proposals but not change them', async () => {
    const published = await publishedWorkedExample();
    await get(published.id);
    const writes = [
      () =>
        http().post('/api/admin/proposals').set('Cookie', viewer).send({ schoolGroupId: groupId }),
      () => put(published.id, workedExample(), viewer),
      () => clone(published.id, viewer),
      () => publish(published.id, viewer),
      () => http().post(`/api/admin/proposals/${published.id}/archive`).set('Cookie', viewer),
    ];
    for (const write of writes) {
      expect(errorOf(await write().expect(403)).code).toBe('FORBIDDEN');
    }
  });

  it('unknown and invalid ids', async () => {
    await http().get(`/api/admin/proposals/${UNKNOWN_ID}`).set('Cookie', viewer).expect(404);
    await http().get('/api/admin/proposals/nope').set('Cookie', viewer).expect(400);
    await publish(UNKNOWN_ID).expect(404);
  });
});

describe('installment tiers (2026-10-03)', () => {
  it('accepts only contado or a tier as the maximum and freezes every option when publishing', async () => {
    const draft = await createDraft();
    expect(
      errorOf(await put(draft.id, { ...workedExample(), installments: 10 }).expect(400)).issues,
    ).toEqual([
      { path: 'installments', message: 'Elegí solo contado o hasta 3, 6, 12, 18 o 24 cuotas.' },
    ]);
    await put(draft.id, workedExample()).expect(200);
    const published = proposalSchema.parse((await publish(draft.id).expect(200)).body);
    expect(published.pricing.installments).toBe(18);
    expect(published.pricing.installmentOptions.map((option) => option.installments)).toEqual([
      3, 6, 12, 18,
    ]);
    expect(published.pricing.excludedInstallments).toEqual([]);
    const eighteen = published.pricing.installmentOptions.at(-1)!;
    expect(eighteen.totalPayableMinor).toBe(published.totalPayableMinor);
  });
});

describe('per-group services divided among passengers (v2)', () => {
  const groupService = async () =>
    (
      await post(
        '/api/admin/services',
        {
          name: 'Micro charter',
          category: 'TRANSPORT',
          pricingUnit: 'PER_GROUP',
          basePriceMinor: '3000000000',
        },
        serviceSchema,
      )
    ).id;
  const body = (charter: string, passengerCount: number | null) => ({
    items: [
      { serviceId: charter, quantity: 1 },
      { serviceId: services.lodging, quantity: 1 },
    ],
    downPaymentMinor: '250000000',
    installments: 0,
    tnaBps: 0,
    passengerCount,
    validUntil: inDays(60),
  });

  it('requires the passenger count, divides the group cost and keeps it through publish and clone', async () => {
    const charter = await groupService();
    const draft = await createDraft();
    const missing = await put(draft.id, body(charter, null)).expect(400);
    expect(errorOf(missing).issues?.map((issue) => issue.path)).toEqual(['passengerCount']);

    const saved = proposalSchema.parse((await put(draft.id, body(charter, 30)).expect(200)).body);
    expect(saved.items[0]).toMatchObject({
      pricingUnit: 'PER_GROUP',
      unitPriceMinor: '3000000000',
    });
    expect(saved.paymentPlan.passengerCount).toBe(30);
    expect(saved.pricing).toMatchObject({
      formulaVersion: 'french-tna12-v2',
      passengerCount: 30,
      subtotalMinor: '250000000',
      cashPriceMinor: '250000000',
    });
    expect(saved.pricing.items[0]).toMatchObject({
      lineNetMinor: '3000000000',
      perPassengerMinor: '100000000',
    });

    const published = proposalSchema.parse((await publish(draft.id).expect(200)).body);
    expect(published.pricing.passengerCount).toBe(30);
    const next = proposalSchema.parse((await clone(draft.id).expect(201)).body);
    expect(next.paymentPlan.passengerCount).toBe(30);
    expect(next.cashPriceMinor).toBe('250000000');
  });

  it('rounds each share up and rejects an out-of-range count at the database level', async () => {
    const charter = await groupService();
    const draft = await createDraft();
    // 30.000.000 / 7 = 4.285.714,2857… → 4.285.714,29; cash sale: down payment = cash price.
    const saved = proposalSchema.parse(
      (await put(draft.id, { ...body(charter, 7), downPaymentMinor: '578571429' }).expect(200))
        .body,
    );
    expect(saved.pricing.items[0]?.perPassengerMinor).toBe('428571429');
    expect(saved.cashPriceMinor).toBe('578571429');
    await expect(
      prisma.$executeRaw`UPDATE "PaymentPlan" SET "passengerCount" = 0 WHERE "proposalId" = ${draft.id}::uuid`,
    ).rejects.toThrow(/PaymentPlan_passengerCount_check/);
  });
});
