import {
  accessCodeResponseSchema,
  CONSENT_TEXT_VERSION,
  enrollmentListSchema,
  enrollmentOfferSchema,
  groupPlanPreferencesSchema,
  enrollmentResponseSchema,
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
import { FakeVerificationSender, signIn, uniqueIp } from './public.js';
import { createStaff, errorOf, login } from './staff.js';

let app: TestApp;
let prisma: PrismaService;
let sender: FakeVerificationSender;
let staff: string;
let family: string;
let clock = Date.now();
const http = () => request(app.getHttpServer());
const YEAR = travelYearRange().min + 2;
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

async function adminPost<T>(
  path: string,
  body: object,
  schema: { parse: (value: unknown) => T },
  status = 201,
) {
  return schema.parse(
    (await http().post(path).set('Cookie', staff).send(body).expect(status)).body,
  );
}

/** A school with one group and its access code (plaintext, as shown once to staff). */
async function groupWithCode(name = 'Colegio San Martín') {
  const school = await adminPost(
    '/api/admin/schools',
    { name, province: 'CORDOBA', city: 'Villa María' },
    schoolSchema,
  );
  const group = await adminPost(
    '/api/admin/school-groups',
    { schoolId: school.id, name: '5° A', travelYear: YEAR },
    schoolGroupSchema,
  );
  const { accessCode } = await adminPost(
    `/api/admin/school-groups/${group.id}/access-code`,
    {},
    accessCodeResponseSchema,
    200,
  );
  return { schoolId: school.id, groupId: group.id, accessCode };
}

/** DOMAIN.md worked example, published for the group (or left as a draft). */
async function proposalFor(
  groupId: string,
  options: { publish?: boolean; validFrom?: string | null; validUntil?: string } = {},
) {
  const service = async (name: string, price: string) =>
    (
      await adminPost(
        '/api/admin/services',
        { name: `${name} ${randomUUID().slice(0, 6)}`, category: 'OTHER', basePriceMinor: price },
        serviceSchema,
      )
    ).id;
  // Create the services before building the request: supertest closes its server between requests.
  const items = [
    { serviceId: await service('Transporte', '110000000'), quantity: 1 },
    { serviceId: await service('Alojamiento', '150000000'), quantity: 1 },
    { serviceId: await service('Excursiones', '50000000'), quantity: 1 },
  ];
  const draft = await adminPost('/api/admin/proposals', { schoolGroupId: groupId }, proposalSchema);
  await http()
    .put(`/api/admin/proposals/${draft.id}`)
    .set('Cookie', staff)
    .send({
      items,
      commercialDiscountMinor: '10000000',
      downPaymentMinor: '60000000',
      installments: 18,
      tnaBps: 3500,
      validFrom: options.validFrom ?? null,
      validUntil: options.validUntil ?? inDays(60),
    })
    .expect(200);
  if (options.publish === false) return draft.id;
  await http().post(`/api/admin/proposals/${draft.id}/publish`).set('Cookie', staff).expect(200);
  return draft.id;
}

function enroll(
  target: { schoolId: string; groupId: string },
  extra: object = {},
  cookie = family,
) {
  return http()
    .post('/api/public/enrollments')
    .set('Cookie', cookie)
    .set('X-Forwarded-For', uniqueIp())
    .send({
      idempotencyKey: randomUUID(),
      schoolId: target.schoolId,
      schoolGroupId: target.groupId,
      studentFirstName: 'Juan',
      studentLastName: `Pérez ${randomUUID().slice(0, 4)}`,
      relationship: 'GUARDIAN',
      consentTextVersion: CONSENT_TEXT_VERSION,
      consent: true,
      ...extra,
    });
}

const enrollmentId = (response: request.Response) =>
  enrollmentResponseSchema.parse(response.body).enrollment.id;
const offer = async (id: string, cookie = family) =>
  enrollmentOfferSchema.parse(
    (await http().get(`/api/public/enrollments/${id}/proposal`).set('Cookie', cookie).expect(200))
      .body,
  );
const enterCode = (id: string, code: string, cookie = family) =>
  http()
    .post(`/api/public/enrollments/${id}/access-code`)
    .set('Cookie', cookie)
    .set('X-Forwarded-For', uniqueIp())
    .send({ code });

beforeEach(async () => {
  await resetDatabase(prisma);
  clock += 2 * 60 * 60_000;
  staff = await login(app, (await createStaff(prisma, { role: 'COMMERCIAL' })).email);
  family = (await signIn(app, sender)).cookie;
});

describe('CODE_REQUIRED never reveals whether an offer exists', () => {
  it('answers the same with and without a publication', async () => {
    const withOffer = await groupWithCode('Colegio Con Oferta');
    await proposalFor(withOffer.groupId);
    const withoutOffer = await groupWithCode('Colegio Sin Oferta');
    const a = enrollmentId(await enroll(withOffer).expect(201));
    const b = enrollmentId(await enroll(withoutOffer).expect(201));
    expect(await offer(a)).toEqual({ state: 'CODE_REQUIRED' });
    expect(await offer(b)).toEqual({ state: 'CODE_REQUIRED' });
    const list = enrollmentListSchema.parse(
      (await http().get('/api/public/enrollments').set('Cookie', family).expect(200)).body,
    );
    expect(list.items.map((item) => item.offerState)).toEqual(['CODE_REQUIRED', 'CODE_REQUIRED']);
  });
});

describe('entering the access code', () => {
  it('grants access with the right code, ignoring case and separators', async () => {
    const target = await groupWithCode();
    await proposalFor(target.groupId);
    const id = enrollmentId(await enroll(target).expect(201));
    const granted = (
      await enterCode(id, ` ${target.accessCode.toLowerCase().replace('-', ' ')} `).expect(200)
    ).body as { offerState: string; accessGranted: boolean };
    expect(granted).toMatchObject({ accessGranted: true, offerState: 'AVAILABLE' });
  });

  it('gives the same answer for a wrong code and for a group without code', async () => {
    const target = await groupWithCode();
    const id = enrollmentId(await enroll(target).expect(201));
    const wrong = errorOf(await enterCode(id, 'ZZZZ-ZZZZ').expect(400));

    const school = await adminPost(
      '/api/admin/schools',
      { name: 'Colegio Sin Código', province: 'SALTA', city: 'Salta' },
      schoolSchema,
    );
    const group = await adminPost(
      '/api/admin/school-groups',
      { schoolId: school.id, name: '5° B', travelYear: YEAR },
      schoolGroupSchema,
    );
    const noCodeId = enrollmentId(
      await enroll({ schoolId: school.id, groupId: group.id }).expect(201),
    );
    clock += 16 * 60_000;
    const noCode = errorOf(await enterCode(noCodeId, target.accessCode).expect(400));
    expect(noCode).toEqual(wrong);
    expect(wrong.code).toBe('INVALID_ACCESS_CODE');
  });

  it('a code of another group does not open this one', async () => {
    const mine = await groupWithCode('Colegio Mío');
    const other = await groupWithCode('Colegio Ajeno');
    const id = enrollmentId(await enroll(mine).expect(201));
    await enterCode(id, other.accessCode).expect(400);
    expect(await offer(id)).toEqual({ state: 'CODE_REQUIRED' });
  });

  it('is rate-limited to 5 attempts per 15 minutes per applicant', async () => {
    const target = await groupWithCode();
    const id = enrollmentId(await enroll(target).expect(201));
    for (let i = 0; i < 5; i++) await enterCode(id, 'ZZZZ-ZZZZ').expect(400);
    expect(errorOf(await enterCode(id, target.accessCode).expect(429)).code).toBe('RATE_LIMITED');
    clock += 15 * 60_000;
    await enterCode(id, target.accessCode).expect(200);
  });

  it('can be given at submission; a wrong code creates nothing', async () => {
    const target = await groupWithCode();
    await proposalFor(target.groupId);
    const wrong = await enroll(target, { accessCode: 'ZZZZ-ZZZZ' }).expect(400);
    expect(errorOf(wrong).issues).toEqual([
      {
        path: 'accessCode',
        message: 'El código no es válido para este grupo. Revisalo con tu asesor.',
      },
    ]);
    expect(await prisma.enrollment.count()).toBe(0);
    const created = enrollmentResponseSchema.parse(
      (await enroll(target, { accessCode: target.accessCode }).expect(201)).body,
    );
    expect(created.enrollment).toMatchObject({ accessGranted: true, offerState: 'AVAILABLE' });
  });

  it('two simultaneous submissions of the same student keep the valid code of either', async () => {
    const target = await groupWithCode();
    for (let round = 0; round < 5; round++) {
      const student = { studentLastName: `Gómez ${round}` };
      const [first, second] = await Promise.all([
        enroll(target, student),
        enroll(target, { ...student, accessCode: target.accessCode }),
      ]);
      expect([first.status, second.status].sort()).toEqual([200, 201]);
      const stored = await prisma.enrollment.findMany({
        where: { studentLastName: `Gómez ${round}` },
      });
      expect(stored).toHaveLength(1);
      expect(stored[0]!.accessGrantedAt).not.toBeNull();
    }
  });

  it('access survives a later code rotation; the old code no longer opens new enrollments', async () => {
    const target = await groupWithCode();
    const id = enrollmentId(await enroll(target, { accessCode: target.accessCode }).expect(201));
    await adminPost(
      `/api/admin/school-groups/${target.groupId}/access-code`,
      {},
      accessCodeResponseSchema,
      200,
    );
    expect(await offer(id)).toEqual({ state: 'PREPARING' });
    await enroll(target, { accessCode: target.accessCode }).expect(400);
  });
});

describe('PREPARING: access granted but no eligible publication', () => {
  it.each([
    ['no proposal at all', () => Promise.resolve()],
    [
      'only a draft',
      async (groupId: string) => void (await proposalFor(groupId, { publish: false })),
    ],
    [
      'a publication not valid yet',
      async (groupId: string) => void (await proposalFor(groupId, { validFrom: inDays(10) })),
    ],
  ])('%s', async (_label, prepare) => {
    const target = await groupWithCode();
    await prepare(target.groupId);
    const id = enrollmentId(await enroll(target, { accessCode: target.accessCode }).expect(201));
    expect(await offer(id)).toEqual({ state: 'PREPARING' });
  });

  it('an expired publication', async () => {
    const target = await groupWithCode();
    const proposalId = await proposalFor(target.groupId);
    const id = enrollmentId(await enroll(target, { accessCode: target.accessCode }).expect(201));
    expect((await offer(id)).state).toBe('AVAILABLE');
    // Expiry by the passage of time (validUntil cannot be edited on a published version).
    await prisma.$executeRaw`ALTER TABLE "CommercialProposal" DISABLE TRIGGER "CommercialProposal_immutable_update"`;
    await prisma.$executeRaw`UPDATE "CommercialProposal" SET "validUntil" = now() - interval '1 minute' WHERE id = ${proposalId}::uuid`;
    await prisma.$executeRaw`ALTER TABLE "CommercialProposal" ENABLE TRIGGER "CommercialProposal_immutable_update"`;
    expect(await offer(id)).toEqual({ state: 'PREPARING' });
  });

  it('a withdrawn publication, or an inactive group or school', async () => {
    const target = await groupWithCode();
    const proposalId = await proposalFor(target.groupId);
    const id = enrollmentId(await enroll(target, { accessCode: target.accessCode }).expect(201));
    await http()
      .patch(`/api/admin/school-groups/${target.groupId}`)
      .set('Cookie', staff)
      .send({ status: 'INACTIVE' })
      .expect(200);
    expect(await offer(id)).toEqual({ state: 'PREPARING' });
    await http()
      .patch(`/api/admin/school-groups/${target.groupId}`)
      .set('Cookie', staff)
      .send({ status: 'ACTIVE' })
      .expect(200);
    await http()
      .patch(`/api/admin/schools/${target.schoolId}`)
      .set('Cookie', staff)
      .send({ active: false })
      .expect(200);
    expect(await offer(id)).toEqual({ state: 'PREPARING' });
    await http()
      .patch(`/api/admin/schools/${target.schoolId}`)
      .set('Cookie', staff)
      .send({ active: true })
      .expect(200);
    expect((await offer(id)).state).toBe('AVAILABLE');
    await http()
      .post(`/api/admin/proposals/${proposalId}/archive`)
      .set('Cookie', staff)
      .expect(200);
    expect(await offer(id)).toEqual({ state: 'PREPARING' });
  });
});

describe('AVAILABLE: the safe public view', () => {
  it('shows the frozen snapshot with every disclosure and no internal data', async () => {
    const target = await groupWithCode();
    await proposalFor(target.groupId);
    const id = enrollmentId(await enroll(target, { accessCode: target.accessCode }).expect(201));
    const response = await http()
      .get(`/api/public/enrollments/${id}/proposal`)
      .set('Cookie', family)
      .expect(200);
    const result = enrollmentOfferSchema.parse(response.body);
    if (result.state !== 'AVAILABLE') throw new Error('expected AVAILABLE');
    expect(result.proposal).toMatchObject({
      school: { name: 'Colegio San Martín' },
      group: { name: '5° A', travelYear: YEAR },
      pricing: {
        cashPriceMinor: '300000000',
        downPaymentMinor: '60000000',
        financedPrincipalMinor: '240000000',
        installments: 18,
        tnaBps: 3500,
        teaBps: 4120,
        cftBps: 4120,
        totalInterestMinor: '71892769',
        totalInstallmentsMinor: '311892769',
        totalPayableMinor: '371892769',
        scheduleSummary: [
          { count: 17, paymentMinor: '17327376' },
          { count: 1, paymentMinor: '17327377' },
        ],
      },
    });
    expect(result.proposal.items).toHaveLength(3);
    expect(result.proposal.pricing.schedule).toHaveLength(18);
    const json = JSON.stringify(response.body);
    for (const internal of [
      'publishedById',
      'createdBy',
      'catalogUnitPriceMinor',
      'priceOverridden',
      'accessCode',
      'serviceId',
      'version',
    ]) {
      expect(json).not.toContain(internal);
    }
  });

  it("shows a group cost only as the passenger's share", async () => {
    const target = await groupWithCode();
    const charter = await adminPost(
      '/api/admin/services',
      {
        name: `Micro charter ${randomUUID().slice(0, 6)}`,
        category: 'TRANSPORT',
        pricingUnit: 'PER_GROUP',
        basePriceMinor: '3000000000',
      },
      serviceSchema,
    );
    const draft = await adminPost(
      '/api/admin/proposals',
      { schoolGroupId: target.groupId },
      proposalSchema,
    );
    await http()
      .put(`/api/admin/proposals/${draft.id}`)
      .set('Cookie', staff)
      .send({
        items: [{ serviceId: charter.id, quantity: 1 }],
        downPaymentMinor: '100000000',
        installments: 0,
        tnaBps: 0,
        passengerCount: 30,
        validUntil: inDays(60),
      })
      .expect(200);
    await http().post(`/api/admin/proposals/${draft.id}/publish`).set('Cookie', staff).expect(200);
    const id = enrollmentId(await enroll(target, { accessCode: target.accessCode }).expect(201));
    const response = await http()
      .get(`/api/public/enrollments/${id}/proposal`)
      .set('Cookie', family)
      .expect(200);
    const result = enrollmentOfferSchema.parse(response.body);
    if (result.state !== 'AVAILABLE') throw new Error('expected AVAILABLE');
    expect(result.proposal.items).toEqual([
      expect.objectContaining({
        quantity: 1,
        unitPriceMinor: '100000000',
        discountMinor: '0',
        lineNetMinor: '100000000',
        sharedCost: true,
      }),
    ]);
    expect(result.proposal.pricing.cashPriceMinor).toBe('100000000');
    const json = JSON.stringify(response.body);
    expect(json).not.toContain('3000000000');
    expect(json).not.toContain('passengerCount');
  });

  it('always shows the current version and records every version shown', async () => {
    const target = await groupWithCode();
    const v1 = await proposalFor(target.groupId);
    const id = enrollmentId(await enroll(target, { accessCode: target.accessCode }).expect(201));
    await offer(id);
    await offer(id);
    const v2 = proposalSchema.parse(
      (await http().post(`/api/admin/proposals/${v1}/versions`).set('Cookie', staff).expect(201))
        .body,
    );
    const plan = v2.paymentPlan;
    await http()
      .put(`/api/admin/proposals/${v2.id}`)
      .set('Cookie', staff)
      .send({
        items: v2.items.map((item) => ({ serviceId: item.serviceId, quantity: item.quantity })),
        commercialDiscountMinor: plan.commercialDiscountMinor,
        downPaymentMinor: plan.downPaymentMinor,
        installments: 12,
        tnaBps: plan.tnaBps,
        validUntil: inDays(90),
      })
      .expect(200);
    await http().post(`/api/admin/proposals/${v2.id}/publish`).set('Cookie', staff).expect(200);
    const current = await offer(id);
    expect(current.state === 'AVAILABLE' && current.proposal.pricing.installments).toBe(12);
    const views = await prisma.proposalView.findMany({ where: { enrollmentId: id } });
    expect(views.map((view) => view.proposalId).sort()).toEqual([v1, v2.id].sort());
  });
});

describe('isolation', () => {
  it("another applicant's enrollment is not found, and staff sessions do not work here", async () => {
    const target = await groupWithCode();
    await proposalFor(target.groupId);
    const id = enrollmentId(await enroll(target, { accessCode: target.accessCode }).expect(201));
    const stranger = (await signIn(app, sender)).cookie;
    expect(
      errorOf(
        await http()
          .get(`/api/public/enrollments/${id}/proposal`)
          .set('Cookie', stranger)
          .expect(404),
      ).code,
    ).toBe('NOT_FOUND');
    await enterCode(id, target.accessCode, stranger).expect(404);
    await http()
      .get(`/api/public/enrollments/${randomUUID()}/proposal`)
      .set('Cookie', family)
      .expect(404);
    await http().get(`/api/public/enrollments/${id}/proposal`).set('Cookie', staff).expect(401);
    const strangersList = enrollmentListSchema.parse(
      (await http().get('/api/public/enrollments').set('Cookie', stranger).expect(200)).body,
    );
    expect(strangersList.items).toEqual([]);
  });

  it('knowing school and group ids grants nothing: a group of another school cannot be joined', async () => {
    const mine = await groupWithCode('Colegio Mío');
    const other = await groupWithCode('Colegio Ajeno');
    await enroll(
      { schoolId: mine.schoolId, groupId: other.groupId },
      { accessCode: other.accessCode },
    ).expect(400);
  });
});

describe('installment options and the family preference (2026-10-03)', () => {
  const preference = (id: string, installments: number, cookie = family) =>
    http()
      .put(`/api/public/enrollments/${id}/preference`)
      .set('Cookie', cookie)
      .send({ installments });
  const groupPreferences = async (groupId: string) =>
    groupPlanPreferencesSchema.parse(
      (
        await http()
          .get(`/api/admin/school-groups/${groupId}/plan-preferences`)
          .set('Cookie', staff)
          .expect(200)
      ).body,
    );

  it('shows every tier up to the maximum and records the option the family prefers', async () => {
    const target = await groupWithCode();
    await proposalFor(target.groupId);
    const id = enrollmentId(await enroll(target, { accessCode: target.accessCode }).expect(201));
    const shown = await offer(id);
    if (shown.state !== 'AVAILABLE') throw new Error('expected AVAILABLE');
    expect(shown.preferredInstallments).toBeNull();
    // Worked example: maximum 18 → 3, 6, 12 and 18 installments, same TNA.
    expect(shown.proposal.pricing.installmentOptions.map((option) => option.installments)).toEqual([
      3, 6, 12, 18,
    ]);
    expect(shown.proposal.pricing.installmentOptions.every((o) => o.tnaBps === 3500)).toBe(true);
    expect(JSON.stringify(shown)).not.toContain('excludedInstallments');

    expect((await preference(id, 12).expect(200)).body).toEqual({ installments: 12 });
    const again = await offer(id);
    expect(again.state === 'AVAILABLE' && again.preferredInstallments).toBe(12);
    await preference(id, 0).expect(200); // contado
    expect(errorOf(await preference(id, 10).expect(400)).issues).toEqual([
      { path: 'installments', message: 'Elegí una de las opciones de la propuesta.' },
    ]);

    // Staff see counts per option, never who.
    const other = (await signIn(app, sender)).cookie;
    const second = enrollmentId(
      await enroll(target, { accessCode: target.accessCode }, other).expect(201),
    );
    await offer(second, other);
    await preference(second, 12, other).expect(200);
    const counts = await groupPreferences(target.groupId);
    expect(counts.options).toEqual([
      { installments: 0, families: 1 },
      { installments: 12, families: 1 },
    ]);
    expect(counts.enrollments).toBe(2);
    expect(JSON.stringify(counts)).not.toMatch(/Juan|Pérez/);
    await http()
      .get(`/api/admin/school-groups/${target.groupId}/plan-preferences`)
      .set('Cookie', family)
      .expect(401);

    // A new version starts without preferences.
    await proposalFor(target.groupId);
    const next = await offer(id);
    expect(next.state === 'AVAILABLE' && next.preferredInstallments).toBeNull();
    expect((await groupPreferences(target.groupId)).options).toEqual([]);
  });

  it("needs the offer to be available and the enrollment to be the family's own", async () => {
    const target = await groupWithCode();
    await proposalFor(target.groupId);
    const withoutCode = enrollmentId(await enroll(target).expect(201));
    expect(errorOf(await preference(withoutCode, 0).expect(409)).code).toBe('OFFER_NOT_AVAILABLE');
    const stranger = (await signIn(app, sender)).cookie;
    await preference(withoutCode, 0, stranger).expect(404);
    await preference(withoutCode, 0, '').expect(401);
  });
});
