import {
  CONSENT_TEXT_VERSION,
  enrollmentResponseSchema,
  publicGroupListSchema,
  publicSchoolListSchema,
  schoolGroupSchema,
  schoolSchema,
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
import { createStaff, errorOf, login } from './staff.js';

let app: TestApp;
let prisma: PrismaService;
let sender: FakeVerificationSender;
let staff: string;
let family: string;
let schoolId: string;
let groupId: string;
let clock = Date.now();
const http = () => request(app.getHttpServer());
const YEAR = travelYearRange().min + 2;

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

async function adminPost<T>(path: string, body: object, schema: { parse: (value: unknown) => T }) {
  return schema.parse((await http().post(path).set('Cookie', staff).send(body).expect(201)).body);
}

beforeEach(async () => {
  await resetDatabase(prisma);
  clock += 2 * 60 * 60_000;
  staff = await login(app, (await createStaff(prisma, { role: 'COMMERCIAL' })).email);
  schoolId = (
    await adminPost(
      '/api/admin/schools',
      { name: 'Colegio San Martín', province: 'CORDOBA', city: 'Villa María', cue: '1401234' },
      schoolSchema,
    )
  ).id;
  groupId = (
    await adminPost(
      '/api/admin/school-groups',
      { schoolId, name: '5° A', travelYear: YEAR },
      schoolGroupSchema,
    )
  ).id;
  family = (await signIn(app, sender)).cookie;
});

const enrollment = (overrides: object = {}) => ({
  idempotencyKey: randomUUID(),
  schoolId,
  schoolGroupId: groupId,
  studentFirstName: 'Juan',
  studentLastName: 'Pérez',
  relationship: 'GUARDIAN',
  consentTextVersion: CONSENT_TEXT_VERSION,
  consent: true,
  ...overrides,
});
const submit = (body: object, cookie = family) =>
  http().post('/api/public/enrollments').set('Cookie', cookie).send(body);

describe('public catalog (verified applicants only)', () => {
  it('requires an applicant session', async () => {
    await http().get('/api/public/schools?q=san').expect(401);
    await http().get('/api/public/schools?q=san').set('Cookie', staff).expect(401);
    await http().get(`/api/public/schools/${schoolId}/groups`).expect(401);
  });

  it('finds active schools with only public fields, from 3 letters', async () => {
    await adminPost(
      '/api/admin/schools',
      { name: 'Colegio San Martín Inactivo', province: 'SALTA', city: 'Salta' },
      schoolSchema,
    ).then((inactive) =>
      http()
        .patch(`/api/admin/schools/${inactive.id}`)
        .set('Cookie', staff)
        .send({ active: false })
        .expect(200),
    );
    const response = await http()
      .get('/api/public/schools?q=san+martin')
      .set('Cookie', family)
      .expect(200);
    expect(publicSchoolListSchema.parse(response.body).items).toEqual([
      { id: schoolId, name: 'Colegio San Martín', city: 'Villa María', province: 'CORDOBA' },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('1401234');
    await http().get('/api/public/schools?q=sa').set('Cookie', family).expect(400);
    expect(
      (
        await http()
          .get('/api/public/schools?q=san&province=SALTA')
          .set('Cookie', family)
          .expect(200)
      ).body,
    ).toEqual({ items: [] });
  });

  it('lists only active groups of an active school', async () => {
    const hidden = await adminPost(
      '/api/admin/school-groups',
      { schoolId, name: '5° B', travelYear: YEAR },
      schoolGroupSchema,
    );
    await http()
      .patch(`/api/admin/school-groups/${hidden.id}`)
      .set('Cookie', staff)
      .send({ status: 'INACTIVE' })
      .expect(200);
    const groups = publicGroupListSchema.parse(
      (await http().get(`/api/public/schools/${schoolId}/groups`).set('Cookie', family).expect(200))
        .body,
    );
    expect(groups.items).toEqual([{ id: groupId, name: '5° A', travelYear: YEAR }]);

    await http()
      .patch(`/api/admin/schools/${schoolId}`)
      .set('Cookie', staff)
      .send({ active: false })
      .expect(200);
    await http().get(`/api/public/schools/${schoolId}/groups`).set('Cookie', family).expect(404);
  });
});

describe('POST /api/public/enrollments', () => {
  it('registers interest with the consent version', async () => {
    const body = enrollment();
    const response = await submit(body).expect(201);
    expect(enrollmentResponseSchema.parse(response.body)).toMatchObject({
      alreadyRegistered: false,
      enrollment: {
        school: { name: 'Colegio San Martín', city: 'Villa María', province: 'CORDOBA' },
        group: { name: '5° A', travelYear: YEAR },
        studentFirstName: 'Juan',
        studentLastName: 'Pérez',
        relationship: 'GUARDIAN',
        status: 'SUBMITTED',
      },
    });
    const stored = await prisma.enrollment.findFirstOrThrow();
    expect(stored).toMatchObject({
      consentTextVersion: CONSENT_TEXT_VERSION,
      studentNormalizedName: 'juan perez',
      accessGrantedAt: null,
    });
    expect(stored.consentedAt).toBeInstanceOf(Date);
  });

  it('is idempotent: retries with the same key return the same enrollment', async () => {
    const body = enrollment();
    const first = enrollmentResponseSchema.parse((await submit(body).expect(201)).body);
    const retry = enrollmentResponseSchema.parse((await submit(body).expect(200)).body);
    expect(retry).toEqual({ ...first, alreadyRegistered: false });

    const concurrent = enrollment({ studentFirstName: 'Lucía' }); // another student, same retry key 5×
    const responses = await Promise.all(Array.from({ length: 5 }, () => submit(concurrent)));
    expect(responses.every((response) => response.status === 200 || response.status === 201)).toBe(
      true,
    );
    expect(
      new Set(
        responses.map(
          (response) => (response.body as { enrollment: { id: string } }).enrollment.id,
        ),
      ).size,
    ).toBe(1);
    expect(await prisma.enrollment.count()).toBe(2);
  });

  it('never registers the same student twice in a group, but allows siblings', async () => {
    await submit(enrollment()).expect(201);
    const again = enrollmentResponseSchema.parse(
      (
        await submit(enrollment({ studentFirstName: ' JUAN ', studentLastName: 'perez' })).expect(
          200,
        )
      ).body,
    );
    expect(again.alreadyRegistered).toBe(true);
    await submit(enrollment({ studentFirstName: 'Lucía' })).expect(201);
    expect(await prisma.enrollment.count()).toBe(2);
  });

  it('validates the school/group association and availability on the server', async () => {
    const other = await adminPost(
      '/api/admin/schools',
      { name: 'Instituto Sagrado Corazón', province: 'CORDOBA', city: 'Córdoba' },
      schoolSchema,
    );
    const mismatch = await submit(enrollment({ schoolId: other.id })).expect(400);
    expect(errorOf(mismatch).issues).toEqual([
      { path: 'schoolGroupId', message: 'El grupo no corresponde al colegio elegido.' },
    ]);
    await submit(enrollment({ schoolGroupId: randomUUID() })).expect(400);

    await http()
      .patch(`/api/admin/school-groups/${groupId}`)
      .set('Cookie', staff)
      .send({ status: 'INACTIVE' })
      .expect(200);
    expect(errorOf(await submit(enrollment()).expect(400)).issues?.[0]?.message).toBe(
      'Ese grupo no está disponible. Elegí otro.',
    );
  });

  it('requires explicit consent to the current text and collects nothing extra', async () => {
    await submit(enrollment({ consent: false })).expect(400);
    await submit(enrollment({ consentTextVersion: 'consent-old' })).expect(400);
    await submit(enrollment({ dni: '12345678' })).expect(400);
    await submit(enrollment({ studentFirstName: '' })).expect(400);
    expect(await prisma.enrollment.count()).toBe(0);
  });

  it('requires an applicant session and keeps idempotency keys per applicant', async () => {
    await submit(enrollment(), 'tr_public=forged').expect(401);
    const body = enrollment();
    await submit(body).expect(201);
    const someoneElse = (await signIn(app, sender)).cookie;
    expect(errorOf(await submit(body, someoneElse).expect(400)).issues?.[0]?.path).toBe(
      'idempotencyKey',
    );
  });
});
