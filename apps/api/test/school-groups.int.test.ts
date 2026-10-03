import {
  accessCodeResponseSchema,
  type CreateSchoolGroupRequest,
  normalizeAccessCode,
  schoolGroupListSchema,
  schoolGroupSchema,
  schoolSchema,
  travelYearRange,
} from '@travel-rock/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { verifyPassword } from '../src/staff-auth/password.js';
import { createTestApp, type TestApp } from './app.js';
import { resetDatabase } from './db.js';
import { createStaff, errorOf, login } from './staff.js';

let app: TestApp;
let prisma: PrismaService;
let commercial: string;
let viewer: string;
let schoolId: string;
const http = () => request(app.getHttpServer());
const UNKNOWN_ID = '019a0000-0000-7000-8000-000000000000';
const { min: MIN_YEAR, max: MAX_YEAR } = travelYearRange();
const NEXT_YEAR = MIN_YEAR + 2;

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

async function createSchool(name: string, extra: object = {}) {
  const response = await http()
    .post('/api/admin/schools')
    .set('Cookie', commercial)
    .send({ name, province: 'CORDOBA', city: 'Villa María', ...extra })
    .expect(201);
  return schoolSchema.parse(response.body);
}

beforeEach(async () => {
  await resetDatabase(prisma);
  commercial = await login(app, (await createStaff(prisma, { role: 'COMMERCIAL' })).email);
  viewer = await login(app, (await createStaff(prisma, { role: 'VIEWER' })).email);
  schoolId = (await createSchool('Colegio San Martín')).id;
});

function postGroup(body: Partial<CreateSchoolGroupRequest> & object, cookie = commercial) {
  return http()
    .post('/api/admin/school-groups')
    .set('Cookie', cookie)
    .send({ schoolId, name: '5° A', travelYear: NEXT_YEAR, ...body });
}

async function createGroup(body: object = {}) {
  return schoolGroupSchema.parse((await postGroup(body).expect(201)).body);
}

async function list(query: string) {
  const response = await http()
    .get(`/api/admin/school-groups?${query}`)
    .set('Cookie', viewer)
    .expect(200);
  return schoolGroupListSchema.parse(response.body);
}

const names = (page: { items: { name: string; school: { name: string } }[] }) =>
  page.items.map((group) => `${group.school.name} / ${group.name}`);

describe('creating groups', () => {
  it('creates a group for an existing school', async () => {
    const group = await createGroup({ name: '  5°   A ', estimatedStudents: 32 });
    expect(group).toMatchObject({
      school: {
        id: schoolId,
        name: 'Colegio San Martín',
        city: 'Villa María',
        province: 'CORDOBA',
        active: true,
      },
      name: '5° A',
      travelYear: NEXT_YEAR,
      estimatedStudents: 32,
      status: 'ACTIVE',
      accessCode: { configured: false, rotatedAt: null },
    });
    const detail = await http()
      .get(`/api/admin/school-groups/${group.id}`)
      .set('Cookie', viewer)
      .expect(200);
    expect(detail.body).toEqual(group);
  });

  it('cannot reference a missing school', async () => {
    const response = await postGroup({ schoolId: UNKNOWN_ID }).expect(400);
    expect(errorOf(response).issues).toEqual([
      { path: 'schoolId', message: 'El colegio no existe.' },
    ]);
    await expect(
      prisma.$executeRaw`INSERT INTO "SchoolGroup" (id, "schoolId", name, "normalizedName", "travelYear", "updatedAt")
        VALUES (gen_random_uuid(), ${UNKNOWN_ID}::uuid, 'X', 'x', 2027, now())`,
    ).rejects.toThrow();
  });

  it('cannot be created for an inactive school', async () => {
    await http()
      .patch(`/api/admin/schools/${schoolId}`)
      .set('Cookie', commercial)
      .send({ active: false })
      .expect(200);
    expect(errorOf(await postGroup({}).expect(409)).code).toBe('SCHOOL_INACTIVE');
  });

  it('validates name, travel year range and estimated students', async () => {
    const response = await postGroup({
      name: ' ',
      travelYear: MAX_YEAR + 1,
      estimatedStudents: 0,
    }).expect(400);
    expect(
      errorOf(response)
        .issues?.map((issue) => issue.path)
        .sort(),
    ).toEqual(['estimatedStudents', 'name', 'travelYear']);
    await postGroup({ travelYear: MIN_YEAR - 1 }).expect(400);
    await postGroup({ travelYear: MIN_YEAR }).expect(201);
  });
});

describe('group identity (B9): unique per school, normalized name and travel year', () => {
  it('rejects the same name written differently for the same school and year', async () => {
    await createGroup({ name: '5° A' });
    const response = await postGroup({ name: '5 a' }).expect(409);
    expect(errorOf(response).code).toBe('GROUP_TAKEN');
  });

  it('allows the same name in another year or another school', async () => {
    await createGroup({ name: '5° A' });
    await createGroup({ name: '5° A', travelYear: NEXT_YEAR + 1 });
    const other = await createSchool('Instituto Sagrado Corazón');
    await createGroup({ name: '5° A', schoolId: other.id });
    expect((await list('')).total).toBe(3);
  });

  it('concurrent identical creations produce exactly one group', async () => {
    const responses = await Promise.all([postGroup({}), postGroup({}), postGroup({})]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409]);
    expect(await prisma.schoolGroup.count()).toBe(1);
  });

  it('renaming into an existing identity is rejected', async () => {
    await createGroup({ name: '5° A' });
    const b = await createGroup({ name: '5° B' });
    const response = await http()
      .patch(`/api/admin/school-groups/${b.id}`)
      .set('Cookie', commercial)
      .send({ name: '5 A' })
      .expect(409);
    expect(errorOf(response).code).toBe('GROUP_TAKEN');
  });
});

describe('listing and filtering', () => {
  beforeEach(async () => {
    const other = await createSchool('Instituto Sagrado Corazón');
    await createGroup({ name: '5° B' });
    await createGroup({ name: '5° A' });
    await createGroup({ name: '5° A', travelYear: NEXT_YEAR + 1 });
    await createGroup({ name: 'Promo Única', schoolId: other.id });
  });

  it('orders by school, travel year and name', async () => {
    expect(names(await list(''))).toEqual([
      'Colegio San Martín / 5° A',
      'Colegio San Martín / 5° B',
      'Colegio San Martín / 5° A',
      'Instituto Sagrado Corazón / Promo Única',
    ]);
  });

  it('filters by school (the school detail view), year and text', async () => {
    expect((await list(`schoolId=${schoolId}`)).total).toBe(3);
    expect(names(await list(`travelYear=${NEXT_YEAR + 1}`))).toEqual(['Colegio San Martín / 5° A']);
    expect(names(await list('q=unica'))).toEqual(['Instituto Sagrado Corazón / Promo Única']);
    expect((await list('q=SAGRADO')).total).toBe(1);
    expect((await list(`q=5+b&schoolId=${schoolId}`)).total).toBe(1);
  });

  it('hides inactive groups unless asked for', async () => {
    const [target] = (await list('q=unica')).items;
    await http()
      .patch(`/api/admin/school-groups/${target!.id}`)
      .set('Cookie', commercial)
      .send({ status: 'INACTIVE' })
      .expect(200);
    expect((await list('')).total).toBe(3);
    expect(names(await list('status=inactive'))).toEqual([
      'Instituto Sagrado Corazón / Promo Única',
    ]);
    expect((await list('status=all')).total).toBe(4);
  });

  it('paginates and validates filters', async () => {
    const page = await list('pageSize=3&page=2');
    expect(page).toMatchObject({ total: 4, page: 2 });
    expect(page.items).toHaveLength(1);
    await http().get('/api/admin/school-groups?schoolId=nope').set('Cookie', viewer).expect(400);
    await http().get('/api/admin/school-groups?status=deleted').set('Cookie', viewer).expect(400);
  });
});

describe('editing', () => {
  it('updates fields, clears estimated students and deactivates', async () => {
    const group = await createGroup({ estimatedStudents: 30 });
    const response = await http()
      .patch(`/api/admin/school-groups/${group.id}`)
      .set('Cookie', commercial)
      .send({
        name: '5° A Turno Tarde',
        travelYear: NEXT_YEAR + 1,
        estimatedStudents: '',
        status: 'INACTIVE',
      })
      .expect(200);
    expect(response.body).toMatchObject({
      name: '5° A Turno Tarde',
      travelYear: NEXT_YEAR + 1,
      estimatedStudents: null,
      status: 'INACTIVE',
    });
    const record = await prisma.schoolGroup.findUniqueOrThrow({ where: { id: group.id } });
    expect(record.normalizedName).toBe('5 a turno tarde');
  });

  it('cannot move a group to another school', async () => {
    const group = await createGroup();
    const other = await createSchool('Instituto Sagrado Corazón');
    await http()
      .patch(`/api/admin/school-groups/${group.id}`)
      .set('Cookie', commercial)
      .send({ schoolId: other.id })
      .expect(400);
    expect((await prisma.schoolGroup.findUniqueOrThrow({ where: { id: group.id } })).schoolId).toBe(
      schoolId,
    );
  });

  it('handles unknown ids, invalid ids and empty patches', async () => {
    const group = await createGroup();
    const patch = (id: string, body: object) =>
      http().patch(`/api/admin/school-groups/${id}`).set('Cookie', commercial).send(body);
    expect(errorOf(await patch(UNKNOWN_ID, { status: 'INACTIVE' }).expect(404)).code).toBe(
      'NOT_FOUND',
    );
    await patch('not-a-uuid', { status: 'INACTIVE' }).expect(400);
    await patch(group.id, {}).expect(400);
    await http().get(`/api/admin/school-groups/${UNKNOWN_ID}`).set('Cookie', viewer).expect(404);
  });

  it('a school with groups cannot be deleted at the database level', async () => {
    await createGroup();
    await expect(
      prisma.$executeRaw`DELETE FROM "School" WHERE id = ${schoolId}::uuid`,
    ).rejects.toThrow();
  });
});

describe('access codes (B7)', () => {
  async function rotate(groupId: string) {
    const response = await http()
      .post(`/api/admin/school-groups/${groupId}/access-code`)
      .set('Cookie', commercial)
      .expect(200);
    return accessCodeResponseSchema.parse(response.body);
  }

  it('returns the plaintext once and stores only an argon2id hash', async () => {
    const group = await createGroup();
    const { accessCode, group: updated } = await rotate(group.id);

    expect(accessCode).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(updated.accessCode.configured).toBe(true);
    expect(updated.accessCode.rotatedAt).not.toBeNull();

    const record = await prisma.schoolGroup.findUniqueOrThrow({ where: { id: group.id } });
    expect(record.accessCodeHash).toMatch(/^\$argon2id\$/);
    expect(record.accessCodeHash).not.toContain(normalizeAccessCode(accessCode));
    expect(await verifyPassword(record.accessCodeHash!, normalizeAccessCode(accessCode))).toBe(
      true,
    );

    const detail = await http()
      .get(`/api/admin/school-groups/${group.id}`)
      .set('Cookie', viewer)
      .expect(200);
    expect(JSON.stringify(detail.body)).not.toMatch(/argon2|accessCodeHash/);
    expect(JSON.stringify(detail.body)).not.toContain(normalizeAccessCode(accessCode));
  });

  it('rotation replaces the code: the previous one no longer verifies', async () => {
    const group = await createGroup();
    const first = await rotate(group.id);
    const second = await rotate(group.id);
    expect(second.accessCode).not.toBe(first.accessCode);
    const { accessCodeHash } = await prisma.schoolGroup.findUniqueOrThrow({
      where: { id: group.id },
    });
    expect(await verifyPassword(accessCodeHash!, normalizeAccessCode(first.accessCode))).toBe(
      false,
    );
    expect(await verifyPassword(accessCodeHash!, normalizeAccessCode(second.accessCode))).toBe(
      true,
    );
  });

  it('returns 404 for unknown groups', async () => {
    await http()
      .post(`/api/admin/school-groups/${UNKNOWN_ID}/access-code`)
      .set('Cookie', commercial)
      .expect(404);
  });
});

describe('permissions', () => {
  it('VIEWER can read but not create, edit or generate access codes', async () => {
    const group = await createGroup();
    await http().get('/api/admin/school-groups').set('Cookie', viewer).expect(200);
    await http().get(`/api/admin/school-groups/${group.id}`).set('Cookie', viewer).expect(200);
    const writes = [
      () => postGroup({ name: '5° Z' }, viewer),
      () =>
        http()
          .patch(`/api/admin/school-groups/${group.id}`)
          .set('Cookie', viewer)
          .send({ status: 'INACTIVE' }),
      () => http().post(`/api/admin/school-groups/${group.id}/access-code`).set('Cookie', viewer),
    ];
    for (const write of writes) {
      expect(errorOf(await write().expect(403)).code).toBe('FORBIDDEN');
    }
  });

  it('ADMIN can write', async () => {
    const admin = await login(app, (await createStaff(prisma, { role: 'ADMIN' })).email);
    await postGroup({ name: '5° C' }, admin).expect(201);
  });
});
