import { createStaffUserResponseSchema, staffUserListSchema } from '@travel-rock/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { verifyPassword } from '../src/staff-auth/password.js';
import { StaffUsersService } from '../src/staff-users/staff-users.service.js';
import { createTestApp, type TestApp } from './app.js';
import { resetDatabase } from './db.js';
import { createStaff, DEFAULT_PASSWORD, errorOf, login } from './staff.js';

let app: TestApp;
let prisma: PrismaService;
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
});

async function adminSession() {
  const admin = await createStaff(prisma, { role: 'ADMIN' });
  return { admin, cookie: await login(app, admin.email) };
}

describe('role matrix for /api/admin/users', () => {
  it.each(['COMMERCIAL', 'VIEWER'] as const)('%s cannot manage users', async (role) => {
    const target = await createStaff(prisma);
    const cookie = await login(app, (await createStaff(prisma, { role })).email);
    // Built lazily: supertest closes the ephemeral server after each request.
    const calls = [
      () => http().get('/api/admin/users'),
      () =>
        http()
          .post('/api/admin/users')
          .send({ email: 'x@travelrock.test', fullName: 'X Y', role: 'ADMIN' }),
      () => http().patch(`/api/admin/users/${target.id}`).send({ role: 'ADMIN' }),
      () => http().post(`/api/admin/users/${target.id}/temporary-password`),
    ];
    for (const call of calls) {
      const response = await call().set('Cookie', cookie).expect(403);
      expect(errorOf(response).code).toBe('FORBIDDEN');
    }
    expect(await prisma.staffUser.count()).toBe(2);
  });

  it('requires a session', async () => {
    await http().get('/api/admin/users').expect(401);
  });
});

describe('ADMIN user management', () => {
  it('lists users with pagination and without password hashes', async () => {
    const { cookie } = await adminSession();
    await createStaff(prisma);
    await createStaff(prisma);
    const response = await http()
      .get('/api/admin/users?page=2&pageSize=2')
      .set('Cookie', cookie)
      .expect(200);
    const page = staffUserListSchema.parse(response.body);
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(page.items).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|argon2/);
    await http().get('/api/admin/users?pageSize=101').set('Cookie', cookie).expect(400);
  });

  it('creates a user with a one-time temporary password that must be changed', async () => {
    const { cookie } = await adminSession();
    const response = await http()
      .post('/api/admin/users')
      .set('Cookie', cookie)
      .send({ email: ' Nuevo@TravelRock.test ', fullName: 'Nuevo Comercial', role: 'COMMERCIAL' })
      .expect(201);
    const { user, temporaryPassword } = createStaffUserResponseSchema.parse(response.body);
    expect(user).toMatchObject({
      email: 'nuevo@travelrock.test',
      role: 'COMMERCIAL',
      mustChangePassword: true,
    });
    expect(temporaryPassword).toMatch(/^[\w]{4}(-[\w]{4}){3}$/);

    const newCookie = await login(app, user.email, temporaryPassword);
    const blocked = await http().get('/api/admin/users').set('Cookie', newCookie).expect(403);
    expect(errorOf(blocked).code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('rejects duplicate emails regardless of case', async () => {
    const { admin, cookie } = await adminSession();
    const response = await http()
      .post('/api/admin/users')
      .set('Cookie', cookie)
      .send({ email: admin.email.toUpperCase(), fullName: 'Duplicado', role: 'VIEWER' })
      .expect(409);
    expect(errorOf(response).code).toBe('EMAIL_TAKEN');
  });

  it('rejects invalid input and ids', async () => {
    const { cookie } = await adminSession();
    const invalid = await http()
      .post('/api/admin/users')
      .set('Cookie', cookie)
      .send({ email: 'mal', fullName: 'A', role: 'ROOT' })
      .expect(400);
    expect(
      errorOf(invalid)
        .issues?.map((issue) => issue.path)
        .sort(),
    ).toEqual(['email', 'fullName', 'role']);
    await http()
      .patch('/api/admin/users/not-a-uuid')
      .set('Cookie', cookie)
      .send({ active: false })
      .expect(400);
    const missing = await http()
      .patch(`/api/admin/users/${UNKNOWN_ID}`)
      .set('Cookie', cookie)
      .send({ active: false })
      .expect(404);
    expect(errorOf(missing).code).toBe('NOT_FOUND');
  });

  it('deactivation revokes the user sessions immediately', async () => {
    const { cookie } = await adminSession();
    const target = await createStaff(prisma);
    const targetCookie = await login(app, target.email);
    await http().get('/api/admin/auth/me').set('Cookie', targetCookie).expect(200);

    await http()
      .patch(`/api/admin/users/${target.id}`)
      .set('Cookie', cookie)
      .send({ active: false })
      .expect(200);

    await http().get('/api/admin/auth/me').set('Cookie', targetCookie).expect(401);
    await http()
      .post('/api/admin/auth/login')
      .send({ email: target.email, password: DEFAULT_PASSWORD })
      .expect(401);
  });

  it('role changes apply to existing sessions on their next request', async () => {
    const { cookie } = await adminSession();
    const viewer = await createStaff(prisma, { role: 'VIEWER' });
    const viewerCookie = await login(app, viewer.email);
    await http().get('/api/admin/users').set('Cookie', viewerCookie).expect(403);

    await http()
      .patch(`/api/admin/users/${viewer.id}`)
      .set('Cookie', cookie)
      .send({ role: 'ADMIN' })
      .expect(200);
    await http().get('/api/admin/users').set('Cookie', viewerCookie).expect(200);

    await http()
      .patch(`/api/admin/users/${viewer.id}`)
      .set('Cookie', cookie)
      .send({ role: 'VIEWER' })
      .expect(200);
    await http().get('/api/admin/users').set('Cookie', viewerCookie).expect(403);
  });

  it('a temporary password reset revokes sessions and replaces the old password', async () => {
    const { cookie } = await adminSession();
    const target = await createStaff(prisma);
    const targetCookie = await login(app, target.email);

    const response = await http()
      .post(`/api/admin/users/${target.id}/temporary-password`)
      .set('Cookie', cookie)
      .expect(200);
    const { temporaryPassword } = response.body as { temporaryPassword: string };

    await http().get('/api/admin/auth/me').set('Cookie', targetCookie).expect(401);
    const updated = await prisma.staffUser.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.mustChangePassword).toBe(true);
    expect(await verifyPassword(updated.passwordHash, DEFAULT_PASSWORD)).toBe(false);
    await login(app, target.email, temporaryPassword);
  });

  it('an ADMIN cannot demote, deactivate or reset their own account, but can rename it', async () => {
    const { admin, cookie } = await adminSession();
    for (const body of [{ role: 'VIEWER' }, { active: false }]) {
      const response = await http()
        .patch(`/api/admin/users/${admin.id}`)
        .set('Cookie', cookie)
        .send(body)
        .expect(409);
      expect(errorOf(response).code).toBe('SELF_MODIFICATION');
    }
    await http()
      .post(`/api/admin/users/${admin.id}/temporary-password`)
      .set('Cookie', cookie)
      .expect(409);
    const renamed = await http()
      .patch(`/api/admin/users/${admin.id}`)
      .set('Cookie', cookie)
      .send({ fullName: 'Nombre Nuevo', role: 'ADMIN' })
      .expect(200);
    expect(renamed.body).toMatchObject({ fullName: 'Nombre Nuevo', role: 'ADMIN' });
  });
});

describe('last active ADMIN protection', () => {
  it('refuses to remove the last active ADMIN', async () => {
    const onlyAdmin = await createStaff(prisma, { role: 'ADMIN' });
    // An actor whose own ADMIN role was revoked mid-request: the database rule still holds.
    const staleActor = { sessionId: 'stale', user: await createStaff(prisma, { role: 'VIEWER' }) };
    await expect(
      app.get(StaffUsersService).update(onlyAdmin.id, { role: 'COMMERCIAL' }, staleActor),
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' });
  });

  it('two ADMINs demoting each other concurrently leave exactly one ADMIN', async () => {
    const a = await createStaff(prisma, { role: 'ADMIN' });
    const b = await createStaff(prisma, { role: 'ADMIN' });
    const [cookieA, cookieB] = await Promise.all([login(app, a.email), login(app, b.email)]);

    const responses = await Promise.all([
      http().patch(`/api/admin/users/${b.id}`).set('Cookie', cookieA).send({ role: 'VIEWER' }),
      http().patch(`/api/admin/users/${a.id}`).set('Cookie', cookieB).send({ role: 'VIEWER' }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(errorOf(responses.find((response) => response.status === 409)!).code).toBe('LAST_ADMIN');
    expect(await prisma.staffUser.count({ where: { role: 'ADMIN', active: true } })).toBe(1);
  });
});

describe('initial ADMIN bootstrap (CLI)', () => {
  it('creates the first ADMIN with a temporary password, then refuses', async () => {
    const users = app.get(StaffUsersService);
    const { user, temporaryPassword } = await users.createInitialAdmin({
      email: 'primera@travelrock.test',
      fullName: 'Primera Admin',
    });
    expect(user).toMatchObject({ role: 'ADMIN', mustChangePassword: true });
    await login(app, user.email, temporaryPassword);

    await expect(
      users.createInitialAdmin({ email: 'segunda@travelrock.test', fullName: 'Segunda Admin' }),
    ).rejects.toMatchObject({ code: 'ADMIN_EXISTS' });
  });
});
