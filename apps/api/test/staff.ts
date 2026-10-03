import {
  type ApiError,
  apiErrorSchema,
  STAFF_SESSION_COOKIE,
  type StaffRole,
} from '@travel-rock/shared';
import request, { type Response } from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { hashPassword } from '../src/staff-auth/password.js';
import type { TestApp } from './app.js';

export const TEST_ORIGIN = 'http://localhost:3100';
export const DEFAULT_PASSWORD = 'una contraseña de prueba larga';

let sequence = 0;

export async function createStaff(
  prisma: PrismaService,
  options: {
    role?: StaffRole;
    email?: string;
    active?: boolean;
    mustChangePassword?: boolean;
    password?: string;
  } = {},
) {
  sequence += 1;
  return prisma.staffUser.create({
    data: {
      email: options.email ?? `staff${sequence}@travelrock.test`,
      fullName: `Staff ${sequence}`,
      role: options.role ?? 'COMMERCIAL',
      active: options.active ?? true,
      mustChangePassword: options.mustChangePassword ?? false,
      passwordHash: await hashPassword(options.password ?? DEFAULT_PASSWORD),
    },
  });
}

export function sessionCookieFrom(response: Response): string {
  const setCookie = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = setCookie?.find((value) => value.startsWith(`${STAFF_SESSION_COOKIE}=`));
  if (!cookie) throw new Error('No session cookie in response');
  return cookie.split(';')[0]!;
}

/** Logs in and returns the Cookie header value for later requests. */
export async function login(
  app: TestApp,
  email: string,
  password = DEFAULT_PASSWORD,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .send({ email, password })
    .expect(200);
  return sessionCookieFrom(response);
}

/** Parses an error response body, so assertions are typed and the error contract is checked too. */
export function errorOf(response: Response): ApiError {
  return apiErrorSchema.parse(response.body);
}
