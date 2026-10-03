import { type CreateServiceRequest, serviceListSchema, serviceSchema } from '@travel-rock/shared';
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

function postService(body: Partial<CreateServiceRequest> & object, cookie = commercial) {
  return http()
    .post('/api/admin/services')
    .set('Cookie', cookie)
    .send({ name: 'Bus semicama', category: 'TRANSPORT', basePriceMinor: '45000000', ...body });
}

async function createService(body: object = {}) {
  return serviceSchema.parse((await postService(body).expect(201)).body);
}

async function list(query: string) {
  const response = await http()
    .get(`/api/admin/services?${query}`)
    .set('Cookie', viewer)
    .expect(200);
  return serviceListSchema.parse(response.body);
}

const names = (page: { items: { name: string }[] }) => page.items.map((service) => service.name);

describe('creating services from an empty catalog', () => {
  it('creates a per-passenger service with an exact centavo price', async () => {
    expect((await list('')).total).toBe(0);
    const service = await createService({
      name: '  Bus   semicama ',
      description: 'Ida y vuelta a Bariloche',
      basePriceMinor: '45000050',
    });
    expect(service).toMatchObject({
      name: 'Bus semicama',
      description: 'Ida y vuelta a Bariloche',
      category: 'TRANSPORT',
      pricingUnit: 'PER_PASSENGER',
      basePriceMinor: '45000050',
      active: true,
    });
    const record = await prisma.service.findUniqueOrThrow({ where: { id: service.id } });
    expect(record.basePriceMinor).toBe(45000050n);
    expect(names(await list(''))).toEqual(['Bus semicama']);
  });

  it('creates a per-group service whose unit cannot be changed afterwards', async () => {
    const service = await createService({ pricingUnit: 'PER_GROUP', basePriceMinor: '3000000000' });
    expect(service).toMatchObject({ pricingUnit: 'PER_GROUP', basePriceMinor: '3000000000' });
    await http()
      .patch(`/api/admin/services/${service.id}`)
      .set('Cookie', commercial)
      .send({ pricingUnit: 'PER_PASSENGER' })
      .expect(400);
  });

  it('keeps amounts beyond the JS safe-integer range exact', async () => {
    const service = await createService({ basePriceMinor: '99999999999999' });
    expect(service.basePriceMinor).toBe('99999999999999');
    const detail = await http()
      .get(`/api/admin/services/${service.id}`)
      .set('Cookie', viewer)
      .expect(200);
    expect(detail.body).toMatchObject({ basePriceMinor: '99999999999999' });
  });

  it('allows a zero price (included at no charge)', async () => {
    expect((await createService({ basePriceMinor: '0' })).basePriceMinor).toBe('0');
  });

  it('rejects invalid prices, categories and names', async () => {
    const response = await postService({
      name: '!',
      category: 'SPA' as never,
      basePriceMinor: '-100',
    }).expect(400);
    expect(
      errorOf(response)
        .issues?.map((issue) => issue.path)
        .sort(),
    ).toEqual(['basePriceMinor', 'category', 'name']);
    for (const basePriceMinor of ['1.5', '100000000000001', '1e5', 1000]) {
      await postService({ basePriceMinor: basePriceMinor as string }).expect(400);
    }
  });

  it('rejects a name already used, ignoring accents and case', async () => {
    await createService({ name: 'Excursión Cerro Catedral', category: 'EXCURSIONS' });
    const response = await postService({
      name: 'excursion cerro CATEDRAL',
      category: 'OTHER',
    }).expect(409);
    expect(errorOf(response).code).toBe('SERVICE_NAME_TAKEN');
  });
});

describe('search and selection of services', () => {
  beforeEach(async () => {
    await createService({ name: 'Bus semicama', category: 'TRANSPORT' });
    await createService({
      name: 'Hotel 3 estrellas',
      category: 'LODGING',
      basePriceMinor: '60000000',
    });
    await createService({
      name: 'Excursión Cerro Catedral',
      category: 'EXCURSIONS',
      basePriceMinor: '8000000',
    });
    await createService({
      name: 'Seguro de viaje',
      category: 'INSURANCE',
      basePriceMinor: '1500000',
    });
  });

  it('orders by category, then name', async () => {
    expect(names(await list(''))).toEqual([
      'Bus semicama',
      'Hotel 3 estrellas',
      'Excursión Cerro Catedral',
      'Seguro de viaje',
    ]);
  });

  it('filters by text (accent-insensitive) and category', async () => {
    expect(names(await list('q=excursion'))).toEqual(['Excursión Cerro Catedral']);
    expect(names(await list('q=CATEDRAL'))).toEqual(['Excursión Cerro Catedral']);
    expect(names(await list('category=LODGING'))).toEqual(['Hotel 3 estrellas']);
    expect((await list('q=bus&category=LODGING')).total).toBe(0);
  });

  it('only active services are offered by default', async () => {
    const [bus] = (await list('q=bus')).items;
    await http()
      .patch(`/api/admin/services/${bus!.id}`)
      .set('Cookie', commercial)
      .send({ active: false })
      .expect(200);
    expect(names(await list(''))).not.toContain('Bus semicama');
    expect(names(await list('status=inactive'))).toEqual(['Bus semicama']);
    expect((await list('status=all')).total).toBe(4);
  });

  it('paginates and validates filters', async () => {
    const page = await list('pageSize=3&page=2');
    expect(page).toMatchObject({ total: 4, page: 2 });
    expect(page.items).toHaveLength(1);
    await http().get('/api/admin/services?category=SPA').set('Cookie', viewer).expect(400);
  });
});

describe('editing and deactivating', () => {
  it('updates fields and keeps the normalized name in sync', async () => {
    const service = await createService({ description: 'Viejo' });
    const response = await http()
      .patch(`/api/admin/services/${service.id}`)
      .set('Cookie', commercial)
      .send({ name: 'Bus cama', description: '', category: 'OTHER', basePriceMinor: '50000000' })
      .expect(200);
    expect(response.body).toMatchObject({
      name: 'Bus cama',
      description: null,
      category: 'OTHER',
      basePriceMinor: '50000000',
    });
    expect(names(await list('q=cama'))).toEqual(['Bus cama']);
    expect((await list('q=semicama')).total).toBe(0);
  });

  it('deactivation keeps the service readable (historical references stay valid)', async () => {
    const service = await createService();
    await http()
      .patch(`/api/admin/services/${service.id}`)
      .set('Cookie', commercial)
      .send({ active: false })
      .expect(200);
    const detail = await http()
      .get(`/api/admin/services/${service.id}`)
      .set('Cookie', viewer)
      .expect(200);
    expect(detail.body).toMatchObject({
      id: service.id,
      active: false,
      basePriceMinor: '45000000',
    });
    expect(await prisma.service.count()).toBe(1);
    await http()
      .patch(`/api/admin/services/${service.id}`)
      .set('Cookie', commercial)
      .send({ active: true })
      .expect(200);
  });

  it('rejects unknown ids, invalid ids, empty patches, unit changes and name conflicts', async () => {
    const service = await createService();
    await createService({ name: 'Hotel 3 estrellas', category: 'LODGING' });
    const patch = (id: string, body: object) =>
      http().patch(`/api/admin/services/${id}`).set('Cookie', commercial).send(body);
    expect(errorOf(await patch(UNKNOWN_ID, { active: false }).expect(404)).code).toBe('NOT_FOUND');
    await patch('not-a-uuid', { active: false }).expect(400);
    await patch(service.id, {}).expect(400);
    await patch(service.id, { pricingUnit: 'PER_GROUP' }).expect(400);
    expect(errorOf(await patch(service.id, { name: 'HOTEL 3 estrellas' }).expect(409)).code).toBe(
      'SERVICE_NAME_TAKEN',
    );
    await http().get(`/api/admin/services/${UNKNOWN_ID}`).set('Cookie', viewer).expect(404);
  });

  it('the database rejects negative or oversized prices', async () => {
    for (const price of [-1n, 10n ** 14n + 1n]) {
      await expect(
        prisma.$executeRaw`INSERT INTO "Service" (id, name, "normalizedName", category, "basePriceMinor", "updatedAt")
          VALUES (gen_random_uuid(), 'X', ${`x ${price}`.replace('-', 'm')}, 'OTHER', ${price}, now())`,
      ).rejects.toThrow();
    }
  });
});

describe('permissions', () => {
  it('VIEWER can read but not write', async () => {
    const service = await createService();
    await http().get(`/api/admin/services/${service.id}`).set('Cookie', viewer).expect(200);
    const writes = [
      () => postService({ name: 'Otro servicio' }, viewer),
      () =>
        http()
          .patch(`/api/admin/services/${service.id}`)
          .set('Cookie', viewer)
          .send({ active: false }),
    ];
    for (const write of writes) {
      expect(errorOf(await write().expect(403)).code).toBe('FORBIDDEN');
    }
  });

  it('ADMIN can write', async () => {
    const admin = await login(app, (await createStaff(prisma, { role: 'ADMIN' })).email);
    await postService({ name: 'Servicio admin' }, admin).expect(201);
  });
});
