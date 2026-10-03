import { pricingResultSchema } from '@travel-rock/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, type TestApp } from './app.js';
import { resetDatabase } from './db.js';
import { createStaff, errorOf, login } from './staff.js';

let app: TestApp;
let prisma: PrismaService;
let commercial: string;
const http = () => request(app.getHttpServer());

/** DOMAIN.md full worked example. */
const workedExample = {
  items: [
    { quantity: 1, unitPriceMinor: '110000000' },
    { quantity: 1, unitPriceMinor: '150000000' },
    { quantity: 1, unitPriceMinor: '50000000' },
  ],
  commercialDiscountMinor: '10000000',
  downPaymentMinor: '60000000',
  installments: 18,
  tnaBps: 3500,
};

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
});

const preview = (body: object, cookie = commercial) =>
  http().post('/api/admin/pricing/preview').set('Cookie', cookie).send(body);

describe('POST /api/admin/pricing/preview', () => {
  it('returns the full calculation of the worked example as centavo strings', async () => {
    const response = await preview(workedExample).expect(200);
    const result = pricingResultSchema.parse(response.body);
    expect(result).toMatchObject({
      formulaVersion: 'french-tna12-v2',
      currency: 'ARS',
      pricingUnit: 'PER_PASSENGER',
      subtotalMinor: '310000000',
      cashPriceMinor: '300000000',
      financedPrincipalMinor: '240000000',
      teaBps: 4120,
      cftBps: 4120,
      cftIncludesCosts: false,
      totalInterestMinor: '71892769',
      totalInstallmentsMinor: '311892769',
      totalPayableMinor: '371892769',
      scheduleSummary: [
        { count: 17, paymentMinor: '17327376' },
        { count: 1, paymentMinor: '17327377' },
      ],
    });
    expect(result.schedule).toHaveLength(18);
    expect(result.schedule[0]).toEqual({
      number: 1,
      paymentMinor: '17327376',
      interestMinor: '7000000',
      principalMinor: '10327376',
      balanceMinor: '229672624',
    });
    expect(result.schedule.at(-1)?.balanceMinor).toBe('0');
  });

  it('offers every tier up to the maximum and leaves out the ones below the minimum installment', async () => {
    // $ 1.000.000 financed at 35 %: 3 and 6 installments reach $ 100.000; 12 and 18 do not.
    const response = await preview({
      items: [{ quantity: 1, unitPriceMinor: '100000000' }],
      installments: 18,
      tnaBps: 3500,
    }).expect(200);
    const result = pricingResultSchema.parse(response.body);
    expect(result.installments).toBe(6);
    expect(result.installmentOptions.map((option) => option.installments)).toEqual([3, 6]);
    expect(result.excludedInstallments).toEqual([
      {
        installments: 12,
        message:
          'Cada cuota tiene que ser de al menos $ 100.000,00: con este monto financiado, hasta 11 cuotas.',
      },
      {
        installments: 18,
        message:
          'Cada cuota tiene que ser de al menos $ 100.000,00: con este monto financiado, hasta 11 cuotas.',
      },
    ]);
  });

  it('rejects a plan when not even the smallest tier reaches the minimum installment', async () => {
    const response = await preview({
      items: [{ quantity: 1, unitPriceMinor: '20000000' }],
      installments: 3,
      tnaBps: 0,
    }).expect(400);
    expect(errorOf(response).issues).toEqual([
      {
        path: 'installments',
        message:
          'Cada cuota tiene que ser de al menos $ 100.000,00: con este monto financiado, hasta 2 cuotas.',
      },
    ]);
  });

  it('reports business-rule violations as field issues', async () => {
    const response = await preview({
      ...workedExample,
      items: [{ quantity: 2, unitPriceMinor: '1000', discountMinor: '2001' }],
      installments: 18,
    }).expect(400);
    expect(errorOf(response)).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Revisá los datos de la propuesta.',
      issues: [
        {
          path: 'items.0.discountMinor',
          message: 'El descuento no puede superar el importe de la línea.',
        },
      ],
    });
  });

  it.each([
    [{ tnaBps: 6601 }, 'tnaBps'],
    [{ installments: 37 }, 'installments'],
    [{ installments: 0 }, 'installments'],
    [{ downPaymentMinor: '300000001' }, 'downPaymentMinor'],
    [{ commercialDiscountMinor: '310000001' }, 'commercialDiscountMinor'],
    [{ items: [{ quantity: 1000, unitPriceMinor: '100' }] }, 'items.0.quantity'],
  ])('rejects %o', async (patch, path) => {
    const response = await preview({ ...workedExample, ...patch }).expect(400);
    expect(errorOf(response).issues?.map((issue) => issue.path)).toContain(path);
  });

  it('never accepts client-provided totals or malformed amounts', async () => {
    await preview({ ...workedExample, totalPayableMinor: '1' }).expect(400);
    await preview({ ...workedExample, downPaymentMinor: 20000000 }).expect(400);
    await preview({ ...workedExample, downPaymentMinor: '200.000,00' }).expect(400);
  });

  it('handles cash sales', async () => {
    const response = await preview({
      ...workedExample,
      downPaymentMinor: '300000000',
      installments: 0,
    }).expect(200);
    expect(response.body).toMatchObject({
      financedPrincipalMinor: '0',
      tnaBps: 0,
      teaBps: 0,
      schedule: [],
    });
  });

  it('is restricted to ADMIN and COMMERCIAL', async () => {
    const viewer = await login(app, (await createStaff(prisma, { role: 'VIEWER' })).email);
    expect(errorOf(await preview(workedExample, viewer).expect(403)).code).toBe('FORBIDDEN');
    await http().post('/api/admin/pricing/preview').send(workedExample).expect(401);
    const admin = await login(app, (await createStaff(prisma, { role: 'ADMIN' })).email);
    await preview(workedExample, admin).expect(200);
  });
});
