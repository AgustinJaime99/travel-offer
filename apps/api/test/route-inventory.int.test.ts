import { Controller, Get, Post, RequestMethod, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY } from '../src/staff-auth/decorators.js';
import { createTestApp, type TestApp } from './app.js';

/** A route added without any auth decorator, as a future developer might. */
@Controller('probe')
class UndecoratedProbeController {
  @Get()
  read() {
    return { leaked: true };
  }

  @Post()
  write() {
    return { leaked: true };
  }
}

interface Route {
  method: string;
  path: string;
  isPublic: boolean;
}

function listRoutes(app: TestApp): Route[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const routes: Route[] = [];
  for (const wrapper of discovery.getControllers()) {
    const controller = wrapper.metatype as Type;
    const prototype = Object.getPrototypeOf(wrapper.instance) as Record<string, () => unknown>;
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name]!;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const path = `/${base}/${String(Reflect.getMetadata(PATH_METADATA, handler) ?? '')}`
        .replace(/\/+/g, '/')
        .replace(/(.)\/$/, '$1');
      const isPublic =
        reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, controller]) === true;
      routes.push({ method: RequestMethod[method], path, isPublic });
    }
  }
  return routes;
}

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp({
    imports: [DiscoveryModule],
    controllers: [UndecoratedProbeController],
  });
});

afterAll(async () => {
  await app.close();
});

describe('route inventory (default deny)', () => {
  it('only the approved routes are public', () => {
    const publicRoutes = listRoutes(app)
      .filter((route) => route.isPublic)
      .map((route) => `${route.method} ${route.path}`)
      .sort();
    // Adding a public route must be a deliberate change to this list.
    expect(publicRoutes).toEqual([
      'DELETE /public/me/contacts/:id',
      'GET /health',
      'GET /public/enrollments',
      'GET /public/enrollments/:id/proposal',
      'GET /public/me',
      'GET /public/schools',
      'GET /public/schools/:id/groups',
      'POST /admin/auth/login',
      'POST /public/auth/logout',
      'POST /public/auth/otp/request',
      'POST /public/auth/otp/verify',
      'POST /public/enrollments',
      'POST /public/enrollments/:id/access-code',
      'POST /public/me/contacts',
      'POST /public/me/contacts/verify',
      'POST /public/school-requests',
      'PUT /public/enrollments/:id/preference',
    ]);
  });

  it('every other route, including an undecorated new one, rejects requests without a session', async () => {
    const protectedRoutes = listRoutes(app).filter((route) => !route.isPublic);
    expect(protectedRoutes.map((route) => route.path)).toContain('/probe');
    for (const route of protectedRoutes) {
      const path = `/api${route.path.replace(/:[^/]+/g, '019a0000-0000-7000-8000-000000000000')}`;
      const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
      const response = await request(app.getHttpServer())[method](path).send({});
      expect({ route: `${route.method} ${route.path}`, status: response.status }).toEqual({
        route: `${route.method} ${route.path}`,
        status: 401,
      });
    }
  });
});
