import { healthResponseSchema } from '@travel-rock/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, type TestApp } from './app.js';

describe('GET /api/health', () => {
  describe('with the test database', () => {
    let app: TestApp;

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('reports the API and database as up', async () => {
      const response = await request(app.getHttpServer()).get('/api/health').expect(200);
      expect(healthResponseSchema.parse(response.body)).toEqual({ status: 'ok', database: 'up' });
    });

    it('sends hardened headers: no framing, sniffing or caching', async () => {
      const response = await request(app.getHttpServer()).get('/api/health').expect(200);
      expect(response.headers).toMatchObject({
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        'cache-control': 'no-store',
      });
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('has applied the pg_trgm extension migration', async () => {
      const rows = await app.get(PrismaService).$queryRaw<
        { extname: string }[]
      >`SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`;
      expect(rows).toEqual([{ extname: 'pg_trgm' }]);
    });
  });

  describe('when the database is unreachable', () => {
    let app: TestApp;

    beforeAll(async () => {
      app = await createTestApp({
        customize: (builder) =>
          builder.overrideProvider(PrismaService).useValue({
            $queryRaw: () => Promise.reject(new Error('connect ECONNREFUSED')),
            $disconnect: () => Promise.resolve(),
          }),
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('responds 503 with a degraded status', async () => {
      const response = await request(app.getHttpServer()).get('/api/health').expect(503);
      expect(healthResponseSchema.parse(response.body)).toEqual({
        status: 'degraded',
        database: 'down',
      });
    });
  });
});
