import { dashboardSummarySchema, proposalSchema } from '@travel-rock/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_STAFF, type DemoSeedResult, seedDemo } from '../src/demo/seed-demo.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, type TestApp } from './app.js';
import { resetDatabase } from './db.js';
import { login } from './staff.js';

let app: TestApp;
let prisma: PrismaService;
let demo: DemoSeedResult;

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  demo = await seedDemo(app);
});

afterAll(async () => {
  await app.close();
});

describe('demo seed (Phase 15)', () => {
  it('creates the three demo scenarios through the real services', async () => {
    const admin = await login(app, DEMO_STAFF[0]!.email, DEMO_STAFF[0]!.password);
    const summary = dashboardSummarySchema.parse(
      (
        await request(app.getHttpServer())
          .get('/api/admin/dashboard/summary')
          .set('Cookie', admin)
          .expect(200)
      ).body,
    );
    expect(summary).toMatchObject({
      schools: { active: 2, inactive: 0 },
      groups: { active: 2, inactive: 0, withAccessCode: 2 },
      proposals: { draft: 0, publishedCurrent: 1, publishedExpired: 0 },
      requests: { pending: 1, reviewing: 0 },
    });

    const offer = proposalSchema.parse(
      (
        await request(app.getHttpServer())
          .get(`/api/admin/proposals/${demo.offer.proposalId}`)
          .set('Cookie', admin)
          .expect(200)
      ).body,
    );
    // DOMAIN.md full worked example.
    expect(offer).toMatchObject({
      status: 'PUBLISHED',
      cashPriceMinor: '300000000',
      totalPayableMinor: '371892769',
    });
    expect(demo.offer.accessCode).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(demo.preparing.accessCode).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  });

  it('every demo account logs in with its documented password and role', async () => {
    for (const user of DEMO_STAFF) {
      // Log in first: supertest closes its server between requests.
      const cookie = await login(app, user.email, user.password);
      const me = await request(app.getHttpServer())
        .get('/api/admin/auth/me')
        .set('Cookie', cookie)
        .expect(200);
      expect(me.body).toMatchObject({
        email: user.email,
        role: user.role,
        mustChangePassword: false,
      });
    }
  });

  it('refuses to run on a database that already has data', async () => {
    await expect(seedDemo(app)).rejects.toThrow(/needs a database without staff/);
    expect(await prisma.school.count()).toBe(2);
  });
});
