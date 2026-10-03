import {
  type CreateSchoolRequest,
  schoolDuplicateCheckResponseSchema,
  schoolListSchema,
  schoolSchema,
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
const http = () => request(app.getHttpServer());
const UNKNOWN_ID = '019a0000-0000-7000-8000-000000000000';

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  commercial = await login(app, (await createStaff(prisma, { role: 'COMMERCIAL' })).email);
  viewer = await login(app, (await createStaff(prisma, { role: 'VIEWER' })).email);
});

async function createSchool(input: Partial<CreateSchoolRequest> & { name: string }) {
  const response = await http()
    .post('/api/admin/schools')
    .set('Cookie', commercial)
    .send({ province: 'CORDOBA', city: 'Villa María', ...input })
    .expect(201);
  return schoolSchema.parse(response.body);
}

async function search(query: string, cookie = viewer) {
  const response = await http()
    .get(`/api/admin/schools?${query}`)
    .set('Cookie', cookie)
    .expect(200);
  return schoolListSchema.parse(response.body);
}

const names = (page: { items: { name: string }[] }) => page.items.map((school) => school.name);

describe('creating schools from an empty catalog', () => {
  it('creates a school and finds it in the list', async () => {
    expect((await search('')).total).toBe(0);
    const school = await createSchool({
      name: '  Colegio   San Martín ',
      address: 'Av. Siempre Viva 742',
      cue: '14-01234-00',
    });
    expect(school).toMatchObject({
      name: 'Colegio San Martín',
      province: 'CORDOBA',
      city: 'Villa María',
      address: 'Av. Siempre Viva 742',
      cue: '140123400',
      active: true,
    });
    const page = await search('q=san+martin');
    expect(page.total).toBe(1);
    expect(page.items[0]?.id).toBe(school.id);

    const detail = await http()
      .get(`/api/admin/schools/${school.id}`)
      .set('Cookie', viewer)
      .expect(200);
    expect(detail.body).toEqual(page.items[0]);
  });

  it('stores normalized search columns', async () => {
    const school = await createSchool({ name: 'Instituto "Güemes" N° 5', city: 'Río Cuarto' });
    const record = await prisma.school.findUniqueOrThrow({ where: { id: school.id } });
    expect(record).toMatchObject({
      normalizedName: 'instituto guemes n 5',
      normalizedCity: 'rio cuarto',
    });
  });

  it('rejects invalid input with field issues', async () => {
    const response = await http()
      .post('/api/admin/schools')
      .set('Cookie', commercial)
      .send({ name: '!', province: 'ATLANTIS', city: '', cue: '12' })
      .expect(400);
    expect(
      errorOf(response)
        .issues?.map((issue) => issue.path)
        .sort(),
    ).toEqual(['city', 'cue', 'name', 'province']);
  });

  it('rejects a CUE that is already taken', async () => {
    await createSchool({ name: 'Colegio Uno', cue: '1401234' });
    const response = await http()
      .post('/api/admin/schools')
      .set('Cookie', commercial)
      .send({ name: 'Colegio Dos', province: 'SALTA', city: 'Salta', cue: '140-1234' })
      .expect(409);
    expect(errorOf(response).code).toBe('CUE_TAKEN');
  });

  it('allows same-named schools (distinct campuses)', async () => {
    await createSchool({ name: 'Colegio San Martín' });
    await createSchool({ name: 'Colegio San Martín' });
    expect((await search('q=san+martin')).total).toBe(2);
  });
});

describe('search', () => {
  beforeEach(async () => {
    await createSchool({ name: 'Colegio San Martín', province: 'CORDOBA', city: 'Villa María' });
    await createSchool({ name: 'Instituto Sagrado Corazón', province: 'CORDOBA', city: 'Córdoba' });
    await createSchool({
      name: 'Escuela San Martín de Tours',
      province: 'CABA',
      city: 'Palermo',
      cue: '0201234',
    });
    await createSchool({
      name: 'Colegio Nacional de Buenos Aires',
      province: 'CABA',
      city: 'San Nicolás',
    });
  });

  it('ignores accents and case, and ranks names starting with the query first', async () => {
    expect(names(await search('q=SAN+MART%C3%8DN'))).toEqual([
      'Colegio San Martín',
      'Escuela San Martín de Tours',
    ]);
    expect(names(await search('q=escuela+san'))).toEqual(['Escuela San Martín de Tours']);
  });

  it('tolerates typos and partial words', async () => {
    expect(names(await search('q=sagrdo+corazon'))).toEqual(['Instituto Sagrado Corazón']);
    expect(names(await search('q=nacio'))).toEqual(['Colegio Nacional de Buenos Aires']);
  });

  it('filters by province and city, combinable with the name', async () => {
    expect(names(await search('province=CABA'))).toEqual([
      'Colegio Nacional de Buenos Aires',
      'Escuela San Martín de Tours',
    ]);
    expect(names(await search('city=cordoba'))).toEqual(['Instituto Sagrado Corazón']);
    expect(names(await search('q=san+martin&province=CABA'))).toEqual([
      'Escuela San Martín de Tours',
    ]);
    expect(names(await search('q=san+martin&city=villa+maria'))).toEqual(['Colegio San Martín']);
  });

  it('finds schools by CUE prefix', async () => {
    expect(names(await search('q=0201'))).toEqual(['Escuela San Martín de Tours']);
  });

  it('treats LIKE wildcards in the query as plain text', async () => {
    expect((await search('q=%25')).total).toBe(4); // normalizes to empty: no text filter
    expect((await search('q=%25san%25_')).total).toBe(2);
  });

  it('paginates', async () => {
    const first = await search('pageSize=3');
    const second = await search('pageSize=3&page=2');
    expect(first).toMatchObject({ total: 4, page: 1 });
    expect(first.items).toHaveLength(3);
    expect(second.items).toHaveLength(1);
    expect(new Set([...names(first), ...names(second)]).size).toBe(4);
  });

  it('hides inactive schools unless asked for', async () => {
    const [target] = (await search('q=sagrado')).items;
    await http()
      .patch(`/api/admin/schools/${target!.id}`)
      .set('Cookie', commercial)
      .send({ active: false })
      .expect(200);
    expect((await search('')).total).toBe(3);
    expect(names(await search('status=inactive'))).toEqual(['Instituto Sagrado Corazón']);
    expect((await search('status=all')).total).toBe(4);
  });

  it('rejects invalid filters', async () => {
    await http().get('/api/admin/schools?province=ATLANTIS').set('Cookie', viewer).expect(400);
    await http().get('/api/admin/schools?status=deleted').set('Cookie', viewer).expect(400);
  });
});

describe('duplicate check (soft warning)', () => {
  async function candidates(query: string) {
    const response = await http()
      .get(`/api/admin/schools/duplicate-check?${query}`)
      .set('Cookie', commercial)
      .expect(200);
    return schoolDuplicateCheckResponseSchema.parse(response.body).candidates;
  }

  it('flags similar names in a similar city of the same province', async () => {
    const existing = await createSchool({
      name: 'Colegio General San Martín',
      city: 'Villa María',
    });
    await createSchool({ name: 'Instituto San Martín', city: 'Villa María' });
    await createSchool({ name: 'Colegio San Martín', province: 'SALTA', city: 'Villa María' });

    const found = await candidates(
      'name=Colegio+Gral.+San+Martin&province=CORDOBA&city=Villa+Mar%C3%ADa',
    );
    expect(found).toEqual([
      {
        id: existing.id,
        name: 'Colegio General San Martín',
        province: 'CORDOBA',
        city: 'Villa María',
        cue: null,
        active: true,
        reason: 'SIMILAR_NAME',
      },
    ]);
  });

  it('flags names contained in each other and tolerates city typos', async () => {
    await createSchool({ name: 'Escuela N° 5 Domingo F. Sarmiento', city: 'Villa María' });
    expect(await candidates('name=Escuela+N+5&province=CORDOBA&city=Villa+Mara')).toHaveLength(1);
  });

  it('flags the same CUE regardless of annex, province or name', async () => {
    await createSchool({ name: 'Colegio Uno', province: 'SALTA', city: 'Salta', cue: '660123400' });
    const found = await candidates('name=Otro+Nombre&province=JUJUY&city=Jujuy&cue=6601234');
    expect(found.map((candidate) => candidate.reason)).toEqual(['SAME_CUE']);
  });

  it('excludes the school being edited and returns nothing for distinct schools', async () => {
    const school = await createSchool({ name: 'Colegio San Martín' });
    expect(
      await candidates(
        `name=Colegio+San+Martin&province=CORDOBA&city=Villa+Maria&excludeId=${school.id}`,
      ),
    ).toEqual([]);
    expect(await candidates('name=Colegio+del+Sol&province=CORDOBA&city=Villa+Maria')).toEqual([]);
  });
});

describe('editing', () => {
  it('updates fields, clears optional ones and keeps search columns in sync', async () => {
    const school = await createSchool({
      name: 'Colegio Viejo',
      address: 'Calle 1',
      cue: '1401234',
    });
    const response = await http()
      .patch(`/api/admin/schools/${school.id}`)
      .set('Cookie', commercial)
      .send({ name: 'Colegio Nuevo', province: 'SANTA_FE', city: 'Rosario', address: '', cue: '' })
      .expect(200);
    expect(response.body).toMatchObject({
      name: 'Colegio Nuevo',
      province: 'SANTA_FE',
      city: 'Rosario',
      address: null,
      cue: null,
    });
    expect(names(await search('q=nuevo&city=rosario'))).toEqual(['Colegio Nuevo']);
    expect((await search('q=viejo')).total).toBe(0);
  });

  it('deactivates and reactivates without deleting', async () => {
    const school = await createSchool({ name: 'Colegio Temporal' });
    for (const active of [false, true]) {
      const response = await http()
        .patch(`/api/admin/schools/${school.id}`)
        .set('Cookie', commercial)
        .send({ active })
        .expect(200);
      expect(response.body).toMatchObject({ active });
    }
    expect(await prisma.school.count()).toBe(1);
  });

  it('handles unknown ids, invalid ids, empty patches and CUE conflicts', async () => {
    await createSchool({ name: 'Colegio Uno', cue: '1401234' });
    const other = await createSchool({ name: 'Colegio Dos' });
    const patch = (id: string, body: object) =>
      http().patch(`/api/admin/schools/${id}`).set('Cookie', commercial).send(body);

    expect(errorOf(await patch(UNKNOWN_ID, { active: false }).expect(404)).code).toBe('NOT_FOUND');
    await patch('not-a-uuid', { active: false }).expect(400);
    await patch(other.id, {}).expect(400);
    expect(errorOf(await patch(other.id, { cue: '1401234' }).expect(409)).code).toBe('CUE_TAKEN');
    await http().get(`/api/admin/schools/${UNKNOWN_ID}`).set('Cookie', viewer).expect(404);
  });
});

describe('permissions', () => {
  it('VIEWER can read but not write', async () => {
    const school = await createSchool({ name: 'Colegio San Martín' });
    await http().get('/api/admin/schools').set('Cookie', viewer).expect(200);
    await http().get(`/api/admin/schools/${school.id}`).set('Cookie', viewer).expect(200);
    const writes = [
      () =>
        http().post('/api/admin/schools').send({ name: 'X Y', province: 'SALTA', city: 'Salta' }),
      () => http().patch(`/api/admin/schools/${school.id}`).send({ active: false }),
      () => http().get('/api/admin/schools/duplicate-check?name=X+Y&province=SALTA&city=Salta'),
    ];
    for (const write of writes) {
      expect(errorOf(await write().set('Cookie', viewer).expect(403)).code).toBe('FORBIDDEN');
    }
  });

  it('ADMIN can write', async () => {
    const admin = await login(app, (await createStaff(prisma, { role: 'ADMIN' })).email);
    await http()
      .post('/api/admin/schools')
      .set('Cookie', admin)
      .send({ name: 'Colegio Admin', province: 'SALTA', city: 'Salta' })
      .expect(201);
  });
});
