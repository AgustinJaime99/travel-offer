import {
  accessCodeResponseSchema,
  CONSENT_TEXT_VERSION,
  dashboardAnalyticsSchema,
  dashboardSummarySchema,
  proposalSchema,
  schoolGroupSchema,
  schoolSchema,
  serviceSchema,
  travelYearRange,
} from '@travel-rock/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/common/rate-limiter.js';
import { VerificationSender } from '../src/mail/verification-sender.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, type TestApp } from './app.js';
import { resetDatabase } from './db.js';
import { FakeVerificationSender, signIn } from './public.js';
import { createStaff, login } from './staff.js';

let app: TestApp;
let prisma: PrismaService;
let sender: FakeVerificationSender;
let staff: string;
let clock = Date.now();
const http = () => request(app.getHttpServer());
const Y = travelYearRange().min + 2;
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

beforeAll(async () => {
  sender = new FakeVerificationSender();
  app = await createTestApp({
    customize: (builder) =>
      builder
        .overrideProvider(VerificationSender)
        .useValue(sender)
        .overrideProvider(RateLimiter)
        .useValue(new RateLimiter(() => clock)),
  });
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

async function post<T>(
  path: string,
  body: object,
  schema: { parse: (value: unknown) => T },
  status = 201,
  cookie = staff,
) {
  return schema.parse(
    (await http().post(path).set('Cookie', cookie).send(body).expect(status)).body,
  );
}

let serviceId = '';
async function publish(
  groupId: string,
  validity: { validFrom?: string; validUntil?: string } = {},
) {
  const draft = await post('/api/admin/proposals', { schoolGroupId: groupId }, proposalSchema);
  await http()
    .put(`/api/admin/proposals/${draft.id}`)
    .set('Cookie', staff)
    .send({
      items: [{ serviceId, quantity: 1 }],
      installments: 3,
      tnaBps: 0,
      validFrom: validity.validFrom ?? null,
      validUntil: validity.validUntil ?? inDays(60),
    })
    .expect(200);
  await http().post(`/api/admin/proposals/${draft.id}/publish`).set('Cookie', staff).expect(200);
  return draft.id;
}

async function summary(query = '', cookie = staff) {
  return dashboardSummarySchema.parse(
    (await http().get(`/api/admin/dashboard/summary${query}`).set('Cookie', cookie).expect(200))
      .body,
  );
}

beforeEach(async () => {
  await resetDatabase(prisma);
  clock += 2 * 60 * 60_000;
  staff = await login(app, (await createStaff(prisma, { role: 'COMMERCIAL' })).email);
});

describe('GET /api/admin/dashboard/summary', () => {
  it('is all zeros on an empty commercial database', async () => {
    const empty = await summary();
    expect(empty).toMatchObject({
      travelYear: null,
      schools: { active: 0, inactive: 0 },
      groups: { active: 0, inactive: 0, withAccessCode: 0 },
      proposals: {
        draft: 0,
        publishedCurrent: 0,
        publishedExpired: 0,
        publishedScheduled: 0,
        archived: 0,
      },
      enrollments: { total: 0, withAccess: 0, withoutAccess: 0 },
      requests: { pending: 0, reviewing: 0 },
    });
  });

  it('matches the created records exactly, with and without the travel-year filter', async () => {
    // Schools: two active, one inactive.
    const school = await post(
      '/api/admin/schools',
      { name: 'Colegio Uno', province: 'SALTA', city: 'Salta' },
      schoolSchema,
    );
    const other = await post(
      '/api/admin/schools',
      { name: 'Colegio Dos', province: 'SALTA', city: 'Salta' },
      schoolSchema,
    );
    const closed = await post(
      '/api/admin/schools',
      { name: 'Colegio Cerrado', province: 'SALTA', city: 'Salta' },
      schoolSchema,
    );
    await http()
      .patch(`/api/admin/schools/${closed.id}`)
      .set('Cookie', staff)
      .send({ active: false })
      .expect(200);

    // Groups: G1, G2 (year Y), G3 (year Y + 1), G4 inactive (year Y). Only G1 has an access code.
    const group = (schoolId: string, name: string, travelYear: number) =>
      post('/api/admin/school-groups', { schoolId, name, travelYear }, schoolGroupSchema);
    const g1 = await group(school.id, '5° A', Y);
    const g2 = await group(school.id, '5° B', Y);
    const g3 = await group(other.id, '5° A', Y + 1);
    const g4 = await group(other.id, '5° C', Y);
    await http()
      .patch(`/api/admin/school-groups/${g4.id}`)
      .set('Cookie', staff)
      .send({ status: 'INACTIVE' })
      .expect(200);
    const { accessCode } = await post(
      `/api/admin/school-groups/${g1.id}/access-code`,
      {},
      accessCodeResponseSchema,
      200,
    );

    // Proposals: G1 current + a draft (clone); G2 v1 archived by v2, which then expires; G3 scheduled.
    serviceId = (
      await post(
        '/api/admin/services',
        { name: 'Paquete', category: 'OTHER', basePriceMinor: '30000000' },
        serviceSchema,
      )
    ).id;
    const g1v1 = await publish(g1.id);
    await http().post(`/api/admin/proposals/${g1v1}/versions`).set('Cookie', staff).expect(201);
    await publish(g2.id);
    const g2v2 = await publish(g2.id);
    await prisma.$executeRaw`ALTER TABLE "CommercialProposal" DISABLE TRIGGER "CommercialProposal_immutable_update"`;
    await prisma.$executeRaw`UPDATE "CommercialProposal" SET "validUntil" = now() - interval '1 minute' WHERE id = ${g2v2}::uuid`;
    await prisma.$executeRaw`ALTER TABLE "CommercialProposal" ENABLE TRIGGER "CommercialProposal_immutable_update"`;
    await publish(g3.id, { validFrom: inDays(10), validUntil: inDays(60) });

    // Enrollments: two in G1 (one with the code), one in G3 without code.
    const family = (await signIn(app, sender)).cookie;
    const enroll = (
      schoolId: string,
      schoolGroupId: string,
      studentFirstName: string,
      code?: string,
    ) =>
      http()
        .post('/api/public/enrollments')
        .set('Cookie', family)
        .send({
          idempotencyKey: randomUUID(),
          schoolId,
          schoolGroupId,
          studentFirstName,
          studentLastName: 'Pérez',
          relationship: 'GUARDIAN',
          consentTextVersion: CONSENT_TEXT_VERSION,
          consent: true,
          ...(code ? { accessCode: code } : {}),
        })
        .expect(201);
    await enroll(school.id, g1.id, 'Ana', accessCode);
    await enroll(school.id, g1.id, 'Juan');
    await enroll(other.id, g3.id, 'Lucía');

    // Requests: one pending (year Y), one under review (year Y + 1).
    const report = (travelYear: number, schoolName: string) =>
      http()
        .post('/api/public/school-requests')
        .set('Cookie', family)
        .send({
          type: 'SCHOOL_NOT_FOUND',
          schoolName,
          province: 'JUJUY',
          city: 'Tilcara',
          course: '5°',
          travelYear,
        })
        .expect(202);
    await report(Y, 'Colegio Nuevo Uno');
    await report(Y + 1, 'Colegio Nuevo Dos');
    const reviewing = await prisma.schoolRequest.findFirstOrThrow({ where: { travelYear: Y + 1 } });
    await http()
      .patch(`/api/admin/school-requests/${reviewing.id}`)
      .set('Cookie', staff)
      .send({ status: 'REVIEWING' })
      .expect(200);

    expect(await summary()).toMatchObject({
      travelYear: null,
      schools: { active: 2, inactive: 1 },
      groups: { active: 3, inactive: 1, withAccessCode: 1 },
      proposals: {
        draft: 1,
        publishedCurrent: 1,
        publishedExpired: 1,
        publishedScheduled: 1,
        archived: 1,
      },
      enrollments: { total: 3, withAccess: 1, withoutAccess: 2 },
      requests: { pending: 1, reviewing: 1 },
    });
    expect(await summary(`?travelYear=${Y}`)).toMatchObject({
      travelYear: Y,
      schools: { active: 2, inactive: 1 },
      groups: { active: 2, inactive: 1, withAccessCode: 1 },
      proposals: {
        draft: 1,
        publishedCurrent: 1,
        publishedExpired: 1,
        publishedScheduled: 0,
        archived: 1,
      },
      enrollments: { total: 2, withAccess: 1, withoutAccess: 1 },
      requests: { pending: 1, reviewing: 0 },
    });
    expect(await summary(`?travelYear=${Y + 1}`)).toMatchObject({
      groups: { active: 1, inactive: 0, withAccessCode: 0 },
      proposals: {
        draft: 0,
        publishedCurrent: 0,
        publishedExpired: 0,
        publishedScheduled: 1,
        archived: 0,
      },
      enrollments: { total: 1, withAccess: 0, withoutAccess: 1 },
      requests: { pending: 0, reviewing: 1 },
    });
  });

  it('is readable by every staff role and by nobody else', async () => {
    for (const role of ['ADMIN', 'VIEWER'] as const) {
      await summary('', await login(app, (await createStaff(prisma, { role })).email));
    }
    await http().get('/api/admin/dashboard/summary').expect(401);
    const family = (await signIn(app, sender)).cookie;
    await http().get('/api/admin/dashboard/summary').set('Cookie', family).expect(401);
    await http()
      .get('/api/admin/dashboard/summary?travelYear=nope')
      .set('Cookie', staff)
      .expect(400);
  });
});

describe('GET /api/admin/dashboard/analytics', () => {
  async function analytics(query = '', cookie = staff) {
    return dashboardAnalyticsSchema.parse(
      (await http().get(`/api/admin/dashboard/analytics${query}`).set('Cookie', cookie).expect(200))
        .body,
    );
  }

  it('is empty but complete on an empty database, for every period', async () => {
    const empty = await analytics();
    expect(empty).toMatchObject({
      travelYear: null,
      period: '30d',
      granularity: 'day',
      enrollments: { current: 0, previous: 0 },
      funnel: { enrolled: 0, withAccess: 0, viewedProposal: 0 },
      byProvince: [],
      topSchools: [],
      expiringSoon: [],
      groupsByYear: [],
      prices: { proposals: 0, cash: null, totalPayable: null },
      requests: { createdCurrent: 0, createdPrevious: 0, topDemand: [] },
    });
    expect(empty.enrollments.series).toHaveLength(30);
    expect(empty.requests.byStatus.map((row) => row.count)).toEqual([0, 0, 0, 0]);
    expect((await analytics('?period=90d')).enrollments.series).toHaveLength(13);
    expect((await analytics('?period=12m')).granularity).toBe('month');
  });

  it('aggregates activity by period and travel year, without personal data', async () => {
    const salta = await post(
      '/api/admin/schools',
      { name: 'Colegio Norte', province: 'SALTA', city: 'Salta' },
      schoolSchema,
    );
    const jujuy = await post(
      '/api/admin/schools',
      { name: 'Colegio Puna', province: 'JUJUY', city: 'Tilcara' },
      schoolSchema,
    );
    const group = (schoolId: string, name: string, travelYear: number) =>
      post('/api/admin/school-groups', { schoolId, name, travelYear }, schoolGroupSchema);
    const g1 = await group(salta.id, '5° A', Y);
    const g2 = await group(jujuy.id, '5° B', Y + 1);
    const { accessCode } = await post(
      `/api/admin/school-groups/${g1.id}/access-code`,
      {},
      accessCodeResponseSchema,
      200,
    );
    serviceId = (
      await post(
        '/api/admin/services',
        { name: 'Paquete', category: 'OTHER', basePriceMinor: '150000000' },
        serviceSchema,
      )
    ).id;
    const current = await publish(g1.id, { validUntil: inDays(60) });
    await publish(g2.id, { validUntil: inDays(10) });

    const family = (await signIn(app, sender)).cookie;
    const enroll = (schoolId: string, schoolGroupId: string, name: string, code?: string) =>
      http()
        .post('/api/public/enrollments')
        .set('Cookie', family)
        .send({
          idempotencyKey: randomUUID(),
          schoolId,
          schoolGroupId,
          studentFirstName: name,
          studentLastName: 'Pérez',
          relationship: 'GUARDIAN',
          consentTextVersion: CONSENT_TEXT_VERSION,
          consent: true,
          ...(code ? { accessCode: code } : {}),
        })
        .expect(201);
    const withCode = (await enroll(salta.id, g1.id, 'Ana', accessCode)).body as {
      enrollment: { id: string };
    };
    await enroll(salta.id, g1.id, 'Juan');
    await enroll(jujuy.id, g2.id, 'Lucía');
    await prisma.proposalView.create({
      data: { enrollmentId: withCode.enrollment.id, proposalId: current },
    });
    // Lucía registered 40 days ago: previous 30-day period.
    await prisma.enrollment.updateMany({
      where: { studentFirstName: 'Lucía' },
      data: { createdAt: new Date(Date.now() - 40 * 86_400_000) },
    });

    // Two families ask for the same missing school; one of them is under review.
    const report = async (cookie: string, schoolName: string) =>
      http()
        .post('/api/public/school-requests')
        .set('Cookie', cookie)
        .send({
          type: 'SCHOOL_NOT_FOUND',
          schoolName,
          province: 'JUJUY',
          city: 'Humahuaca',
          course: '5°',
          travelYear: Y,
        })
        .expect(202);
    clock += 2 * 60 * 60_000;
    const other = (await signIn(app, sender)).cookie;
    await report(family, 'Colegio Quebrada');
    await report(other, 'Colegio Quebrada');
    await report(other, 'Colegio Altiplano');
    const reviewing = await prisma.schoolRequest.findFirstOrThrow({
      where: { schoolName: 'Colegio Altiplano' },
    });
    await http()
      .patch(`/api/admin/school-requests/${reviewing.id}`)
      .set('Cookie', staff)
      .send({ status: 'REVIEWING' })
      .expect(200);

    const all = await analytics();
    expect(all.enrollments).toMatchObject({ current: 2, previous: 1 });
    expect(all.enrollments.series.at(-1)?.current).toBe(2);
    expect(all.enrollments.series.reduce((total, row) => total + row.previous, 0)).toBe(1);
    expect(all.funnel).toEqual({ enrolled: 2, withAccess: 1, viewedProposal: 1 });
    expect(all.previousFunnel).toEqual({ enrolled: 1, withAccess: 0, viewedProposal: 0 });
    expect(all.byProvince).toEqual([{ province: 'SALTA', enrollments: 2 }]);
    expect(all.topSchools).toEqual([
      {
        schoolId: salta.id,
        name: 'Colegio Norte',
        province: 'SALTA',
        city: 'Salta',
        groups: 1,
        enrollments: 2,
      },
    ]);
    expect(all.expiringSoon).toMatchObject([
      { groupName: '5° B', schoolName: 'Colegio Puna', travelYear: Y + 1, version: 1 },
    ]);
    expect(all.groupsByYear).toEqual([
      { travelYear: Y, active: 1, inactive: 0 },
      { travelYear: Y + 1, active: 1, inactive: 0 },
    ]);
    const published = await prisma.commercialProposal.findUniqueOrThrow({ where: { id: current } });
    const cash = published.cashPriceMinor.toString();
    expect(all.prices.proposals).toBe(2);
    expect(all.prices.cash).toEqual({ min: cash, median: cash, max: cash });
    expect(all.requests).toMatchObject({
      createdCurrent: 3,
      createdPrevious: 0,
      byStatus: [
        { status: 'PENDING', count: 2 },
        { status: 'REVIEWING', count: 1 },
        { status: 'RESOLVED', count: 0 },
        { status: 'DISMISSED', count: 0 },
      ],
      byType: [
        { type: 'SCHOOL_NOT_FOUND', count: 3 },
        { type: 'GROUP_NOT_FOUND', count: 0 },
      ],
    });
    expect(all.requests.topDemand[0]).toEqual({
      schoolName: 'Colegio Quebrada',
      province: 'JUJUY',
      city: 'Humahuaca',
      requests: 2,
    });
    // Aggregates only: no applicant or student data anywhere in the response.
    expect(JSON.stringify(all)).not.toMatch(/Ana|Juan|Lucía|Pérez|@example/);

    const nextYear = await analytics(`?travelYear=${Y + 1}`);
    expect(nextYear.enrollments).toMatchObject({ current: 0, previous: 1 });
    expect(nextYear.prices.proposals).toBe(1);
    expect(nextYear.requests.createdCurrent).toBe(0);
    expect(nextYear.groupsByYear).toHaveLength(2);
    expect((await analytics('?period=12m')).enrollments.current).toBe(3);
  });

  it('is readable by every staff role and validates its query', async () => {
    await analytics('', await login(app, (await createStaff(prisma, { role: 'VIEWER' })).email));
    await http().get('/api/admin/dashboard/analytics').expect(401);
    const family = (await signIn(app, sender)).cookie;
    await http().get('/api/admin/dashboard/analytics').set('Cookie', family).expect(401);
    await http().get('/api/admin/dashboard/analytics?period=7d').set('Cookie', staff).expect(400);
  });
});
