import {
  adminSchoolRequestListSchema,
  adminSchoolRequestSchema,
  SCHOOL_REQUEST_CONFIRMATION,
  schoolSchema,
  travelYearRange,
} from '@travel-rock/shared';
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
let commercial: string;
let viewer: string;
let family: { cookie: string; email: string };
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

beforeEach(async () => {
  await resetDatabase(prisma);
  clock += 2 * 60 * 60_000;
  commercial = await login(app, (await createStaff(prisma, { role: 'COMMERCIAL' })).email);
  viewer = await login(app, (await createStaff(prisma, { role: 'VIEWER' })).email);
  family = await signIn(app, sender, undefined, 'María Pérez');
});

const missingSchool = (overrides: object = {}) => ({
  type: 'SCHOOL_NOT_FOUND',
  schoolName: 'Colegio Nuevo del Sol',
  province: 'SALTA',
  city: 'Cafayate',
  course: '5° A',
  travelYear: YEAR,
  ...overrides,
});
const report = (body: object, cookie = family.cookie) =>
  http().post('/api/public/school-requests').set('Cookie', cookie).send(body);
const queue = async (query = '', cookie = commercial) =>
  adminSchoolRequestListSchema.parse(
    (await http().get(`/api/admin/school-requests?${query}`).set('Cookie', cookie).expect(200))
      .body,
  );

describe('families report a school they cannot find', () => {
  it('records the request with a neutral confirmation and creates no school', async () => {
    const response = await report(missingSchool()).expect(202);
    expect(response.body).toEqual({ message: SCHOOL_REQUEST_CONFIRMATION });
    expect(await prisma.school.count()).toBe(0);
    const { items } = await queue();
    expect(items).toEqual([
      expect.objectContaining({
        type: 'SCHOOL_NOT_FOUND',
        status: 'PENDING',
        school: { id: null, name: 'Colegio Nuevo del Sol', city: 'Cafayate', province: 'SALTA' },
        course: '5° A',
        travelYear: YEAR,
        openRequestsForSchool: 1,
        contact: { fullName: 'María Pérez', emails: [family.email] },
        resolvedBy: null,
      }),
    ]);
  });

  it('a repeated request from the same family is not duplicated, and the answer is identical', async () => {
    const first = await report(missingSchool()).expect(202);
    const again = await report(
      missingSchool({ schoolName: ' colegio NUEVO del sol ', city: 'cafayate', course: '5 a' }),
    ).expect(202);
    expect(again.body).toEqual(first.body);
    expect(await prisma.schoolRequest.count()).toBe(1);
  });

  it('requests of different families are kept and grouped as demand', async () => {
    await report(missingSchool()).expect(202);
    const other = await signIn(app, sender);
    await report(missingSchool({ course: '5° B' }), other.cookie).expect(202);
    await report(missingSchool({ schoolName: 'Otro Colegio' }), other.cookie).expect(202);
    const { items } = await queue('q=nuevo');
    expect(items.map((item) => item.openRequestsForSchool)).toEqual([2, 2]);
  });

  it('is limited per family, requires a verified session and validates input', async () => {
    for (let i = 0; i < 5; i++) await report(missingSchool({ course: `5° ${i}` })).expect(202);
    expect(errorOf(await report(missingSchool({ course: '6° X' })).expect(429)).code).toBe(
      'RATE_LIMITED',
    );
    await report(missingSchool()).set('Cookie', 'tr_public=forged').expect(401);
    await http()
      .post('/api/public/school-requests')
      .set('Cookie', commercial)
      .send(missingSchool())
      .expect(401);
    const other = await signIn(app, sender);
    await report(missingSchool({ province: 'ATLANTIS' }), other.cookie).expect(400);
    await report(missingSchool({ dni: '1' }), other.cookie).expect(400);
  });
});

describe('families report a group missing from an existing school', () => {
  it('links the school, snapshots its data and counts demand by school', async () => {
    const school = schoolSchema.parse(
      (
        await http()
          .post('/api/admin/schools')
          .set('Cookie', commercial)
          .send({ name: 'Colegio San Martín', province: 'CORDOBA', city: 'Villa María' })
          .expect(201)
      ).body,
    );
    await report({
      type: 'GROUP_NOT_FOUND',
      schoolId: school.id,
      course: '5° C',
      travelYear: YEAR,
    }).expect(202);
    const other = await signIn(app, sender);
    await report(
      { type: 'GROUP_NOT_FOUND', schoolId: school.id, course: '5° D', travelYear: YEAR },
      other.cookie,
    ).expect(202);
    const { items } = await queue('type=GROUP_NOT_FOUND');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      school: { id: school.id, name: 'Colegio San Martín', city: 'Villa María' },
      openRequestsForSchool: 2,
    });

    await http()
      .patch(`/api/admin/schools/${school.id}`)
      .set('Cookie', commercial)
      .send({ active: false })
      .expect(200);
    const inactive = await report({
      type: 'GROUP_NOT_FOUND',
      schoolId: school.id,
      course: '5° E',
      travelYear: YEAR,
    }).expect(400);
    expect(errorOf(inactive).issues).toEqual([
      { path: 'schoolId', message: 'El colegio no existe.' },
    ]);
  });

  it('the database enforces "a group request has a school, a school request does not"', async () => {
    const applicant = await prisma.applicant.findFirstOrThrow();
    await expect(
      prisma.$executeRaw`INSERT INTO "SchoolRequest" (id, type, "applicantId", "schoolName", province, city, course, "travelYear", "dedupKey", "demandKey", "updatedAt")
        VALUES (gen_random_uuid(), 'GROUP_NOT_FOUND', ${applicant.id}::uuid, 'X', 'SALTA', 'Salta', '5', 2027, 'k', 'd', now())`,
    ).rejects.toThrow();
  });
});

describe('staff triage', () => {
  it('reviews with notes, resolves (recording who) and reopens', async () => {
    await report(missingSchool()).expect(202);
    const [item] = (await queue()).items;
    const patch = (body: object, cookie = commercial) =>
      http().patch(`/api/admin/school-requests/${item!.id}`).set('Cookie', cookie).send(body);

    const reviewing = adminSchoolRequestSchema.parse(
      (await patch({ status: 'REVIEWING', staffNotes: 'Llamar al colegio' }).expect(200)).body,
    );
    expect(reviewing).toMatchObject({
      status: 'REVIEWING',
      staffNotes: 'Llamar al colegio',
      resolvedBy: null,
    });
    const resolved = adminSchoolRequestSchema.parse(
      (await patch({ status: 'RESOLVED' }).expect(200)).body,
    );
    expect(resolved.resolvedBy?.fullName).toMatch(/^Staff /);

    // Another staff member only edits the notes (the form also resends the same status): the request
    // keeps its closer.
    const other = await login(app, (await createStaff(prisma, { role: 'ADMIN' })).email);
    const annotated = adminSchoolRequestSchema.parse(
      (await patch({ status: 'RESOLVED', staffNotes: 'Cargado' }, other).expect(200)).body,
    );
    expect(annotated).toMatchObject({ staffNotes: 'Cargado', resolvedBy: resolved.resolvedBy });
    expect((await queue()).total).toBe(0);
    expect((await queue('status=RESOLVED')).total).toBe(1);

    // Once closed, the same family may report again; reopening the old one would duplicate it.
    await report(missingSchool()).expect(202);
    expect(errorOf(await patch({ status: 'PENDING' }).expect(409)).code).toBe('REQUEST_DUPLICATE');
    await patch({}).expect(400);
  });

  it('filters by type, status and text', async () => {
    await report(missingSchool()).expect(202);
    await report(missingSchool({ schoolName: 'Instituto Güemes', course: '6°' })).expect(202);
    expect((await queue('q=guemes')).items.map((item) => item.school.name)).toEqual([
      'Instituto Güemes',
    ]);
    expect((await queue('type=GROUP_NOT_FOUND')).total).toBe(0);
    expect((await queue('status=all')).total).toBe(2);
    await http()
      .get('/api/admin/school-requests?status=nope')
      .set('Cookie', commercial)
      .expect(400);
  });

  it('VIEWER reads the queue without contact data and cannot change it', async () => {
    await report(missingSchool()).expect(202);
    const { items } = await queue('', viewer);
    expect(items[0]?.contact).toBeNull();
    expect(JSON.stringify(items)).not.toContain(family.email);
    const detail = await http()
      .get(`/api/admin/school-requests/${items[0]!.id}`)
      .set('Cookie', viewer)
      .expect(200);
    expect(adminSchoolRequestSchema.parse(detail.body).contact).toBeNull();
    // Notes may hold follow-up details: hidden like the contact.
    await http()
      .patch(`/api/admin/school-requests/${items[0]!.id}`)
      .set('Cookie', commercial)
      .send({ staffNotes: 'Llamé al 11 5555-0000' })
      .expect(200);
    const again = await http()
      .get(`/api/admin/school-requests/${items[0]!.id}`)
      .set('Cookie', viewer)
      .expect(200);
    expect(adminSchoolRequestSchema.parse(again.body).staffNotes).toBeNull();
    expect((await queue('', viewer)).items[0]?.staffNotes).toBeNull();
    expect(
      errorOf(
        await http()
          .patch(`/api/admin/school-requests/${items[0]!.id}`)
          .set('Cookie', viewer)
          .send({ status: 'DISMISSED' })
          .expect(403),
      ).code,
    ).toBe('FORBIDDEN');
  });

  it('the staff queue is not reachable with a family session', async () => {
    await http().get('/api/admin/school-requests').set('Cookie', family.cookie).expect(401);
    await http()
      .get('/api/admin/school-requests/019a0000-0000-7000-8000-000000000000')
      .set('Cookie', commercial)
      .expect(404);
  });
});
