import { staffUserSchema } from '@travel-rock/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SESSION_IDLE_TIMEOUT_MS } from '../src/staff-auth/session-policy.js';
import { verifyPassword } from '../src/staff-auth/password.js';
import { createTestApp, type TestApp } from './app.js';
import { resetDatabase } from './db.js';
import {
  createStaff,
  DEFAULT_PASSWORD,
  errorOf,
  login,
  sessionCookieFrom,
  TEST_ORIGIN,
} from './staff.js';

let app: TestApp;
let prisma: PrismaService;
const http = () => request(app.getHttpServer());

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

describe('POST /api/admin/auth/login', () => {
  it('returns the user and sets a hardened session cookie', async () => {
    const staff = await createStaff(prisma, { role: 'VIEWER' });
    const response = await http()
      .post('/api/admin/auth/login')
      .send({ email: staff.email, password: DEFAULT_PASSWORD })
      .expect(200);

    expect(staffUserSchema.parse(response.body)).toMatchObject({ id: staff.id, role: 'VIEWER' });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|argon2/);
    const [cookie] = response.headers['set-cookie'] as unknown as string[];
    expect(cookie).toMatch(/^tr_staff=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=43200');
  });

  it('accepts the email in any case', async () => {
    const staff = await createStaff(prisma);
    await login(app, staff.email.toUpperCase());
  });

  it('stores only a hash of the session token', async () => {
    const staff = await createStaff(prisma);
    const cookie = await login(app, staff.email);
    const token = cookie.split('=')[1]!;
    const [session] = await prisma.staffSession.findMany();
    expect(session?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(session?.tokenHash).not.toBe(token);
  });

  it('gives the same answer for unknown emails, wrong passwords and inactive users', async () => {
    const active = await createStaff(prisma);
    const inactive = await createStaff(prisma, { active: false });
    const attempts = [
      { email: 'nadie@travelrock.test', password: DEFAULT_PASSWORD },
      { email: active.email, password: 'otra contraseña larga' },
      { email: inactive.email, password: DEFAULT_PASSWORD },
    ];
    for (const attempt of attempts) {
      const response = await http().post('/api/admin/auth/login').send(attempt).expect(401);
      expect(response.body).toEqual({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Email o contraseña incorrectos.',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('validates the body without echoing the password', async () => {
    const response = await http()
      .post('/api/admin/auth/login')
      .send({ email: 'no-es-email', password: 'secreto-que-no-debe-aparecer' })
      .expect(400);
    expect(errorOf(response).code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(response.body)).not.toContain('secreto-que-no-debe-aparecer');
  });

  it('blocks after 5 failures for the same email and IP, even with the right password', async () => {
    const staff = await createStaff(prisma);
    const attempt = (password: string, ip: string) =>
      http()
        .post('/api/admin/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: staff.email, password });

    for (let i = 0; i < 5; i++) await attempt('contraseña equivocada', '203.0.113.10').expect(401);
    const blocked = await attempt(DEFAULT_PASSWORD, '203.0.113.10').expect(429);
    expect(errorOf(blocked).code).toBe('RATE_LIMITED');
    // Another client IP (as reported by the trusted proxy) is not blocked by this counter.
    await attempt(DEFAULT_PASSWORD, '203.0.113.11').expect(200);
  });

  it('a concurrent burst of wrong passwords gets at most 5 password checks', async () => {
    const staff = await createStaff(prisma);
    const responses = await Promise.all(
      Array.from({ length: 15 }, () =>
        http()
          .post('/api/admin/auth/login')
          .set('X-Forwarded-For', '203.0.113.20')
          .send({ email: staff.email, password: 'contraseña equivocada' }),
      ),
    );
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status === 401)).toHaveLength(5);
    expect(statuses.filter((status) => status === 429)).toHaveLength(10);
  });

  it('replaces a session presented at login (no session fixation)', async () => {
    const staff = await createStaff(prisma);
    const first = await login(app, staff.email);
    const second = await http()
      .post('/api/admin/auth/login')
      .set('Cookie', first)
      .send({ email: staff.email, password: DEFAULT_PASSWORD })
      .expect(200);
    expect(sessionCookieFrom(second)).not.toBe(first);
    await http().get('/api/admin/auth/me').set('Cookie', first).expect(401);
    expect(await prisma.staffSession.count()).toBe(1);
  });

  it('rejects state-changing requests from a foreign Origin', async () => {
    const staff = await createStaff(prisma);
    const body = { email: staff.email, password: DEFAULT_PASSWORD };
    const foreign = await http()
      .post('/api/admin/auth/login')
      .set('Origin', 'https://evil.example')
      .send(body)
      .expect(403);
    expect(errorOf(foreign).code).toBe('ORIGIN_NOT_ALLOWED');
    await http().post('/api/admin/auth/login').set('Origin', TEST_ORIGIN).send(body).expect(200);
  });
});

describe('sessions', () => {
  it('GET /me requires a valid session', async () => {
    await http().get('/api/admin/auth/me').expect(401);
    await http().get('/api/admin/auth/me').set('Cookie', 'tr_staff=forged-token').expect(401);
  });

  it('GET /me returns the current user', async () => {
    const staff = await createStaff(prisma, { role: 'ADMIN' });
    const cookie = await login(app, staff.email);
    const response = await http().get('/api/admin/auth/me').set('Cookie', cookie).expect(200);
    expect(response.body).toMatchObject({ id: staff.id, email: staff.email, role: 'ADMIN' });
  });

  it('expires after 2 hours idle and deletes the session row', async () => {
    const staff = await createStaff(prisma);
    const cookie = await login(app, staff.email);
    await prisma.staffSession.updateMany({
      data: { lastSeenAt: new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS) },
    });
    const response = await http().get('/api/admin/auth/me').set('Cookie', cookie).expect(401);
    expect(response.headers['set-cookie']?.[0]).toMatch(/^tr_staff=;/);
    expect(await prisma.staffSession.count()).toBe(0);
  });

  it('expires at the absolute limit even if recently used', async () => {
    const staff = await createStaff(prisma);
    const cookie = await login(app, staff.email);
    await prisma.staffSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
    await http().get('/api/admin/auth/me').set('Cookie', cookie).expect(401);
  });

  it('logout deletes the session and clears the cookie', async () => {
    const staff = await createStaff(prisma);
    const cookie = await login(app, staff.email);
    const response = await http().post('/api/admin/auth/logout').set('Cookie', cookie).expect(204);
    expect(response.headers['set-cookie']?.[0]).toMatch(/^tr_staff=;/);
    await http().get('/api/admin/auth/me').set('Cookie', cookie).expect(401);
    expect(await prisma.staffSession.count()).toBe(0);
  });
});

describe('temporary passwords and POST /api/admin/auth/change-password', () => {
  it('only allows me, logout and change-password while a change is pending', async () => {
    const staff = await createStaff(prisma, { role: 'ADMIN', mustChangePassword: true });
    const cookie = await login(app, staff.email);

    const blocked = await http().get('/api/admin/users').set('Cookie', cookie).expect(403);
    expect(errorOf(blocked).code).toBe('PASSWORD_CHANGE_REQUIRED');
    await http().get('/api/admin/auth/me').set('Cookie', cookie).expect(200);

    await http()
      .post('/api/admin/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'mi nueva contraseña segura' })
      .expect(204);
    await http().get('/api/admin/users').set('Cookie', cookie).expect(200);
  });

  it('changes the password, keeps this session and revokes the others', async () => {
    const staff = await createStaff(prisma);
    const current = await login(app, staff.email);
    const otherDevice = await login(app, staff.email);

    await http()
      .post('/api/admin/auth/change-password')
      .set('Cookie', current)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'mi nueva contraseña segura' })
      .expect(204);

    await http().get('/api/admin/auth/me').set('Cookie', current).expect(200);
    await http().get('/api/admin/auth/me').set('Cookie', otherDevice).expect(401);
    const updated = await prisma.staffUser.findUniqueOrThrow({ where: { id: staff.id } });
    expect(await verifyPassword(updated.passwordHash, 'mi nueva contraseña segura')).toBe(true);
    await login(app, staff.email, 'mi nueva contraseña segura');
  });

  it('rejects a wrong current password, the email as password and short passwords', async () => {
    const staff = await createStaff(prisma);
    const cookie = await login(app, staff.email);
    const change = (body: object) =>
      http().post('/api/admin/auth/change-password').set('Cookie', cookie).send(body);

    const wrong = await change({
      currentPassword: 'no es la actual',
      newPassword: 'mi nueva contraseña segura',
    }).expect(400);
    expect(errorOf(wrong).code).toBe('INVALID_CURRENT_PASSWORD');

    const asEmail = await change({
      currentPassword: DEFAULT_PASSWORD,
      newPassword: staff.email,
    }).expect(400);
    expect(errorOf(asEmail).code).toBe('PASSWORD_EQUALS_EMAIL');

    const short = await change({ currentPassword: DEFAULT_PASSWORD, newPassword: 'corta' }).expect(
      400,
    );
    expect(errorOf(short).code).toBe('VALIDATION_FAILED');
    expect(errorOf(short).issues).toEqual([
      { path: 'newPassword', message: 'La contraseña debe tener al menos 12 caracteres.' },
    ]);
  });
});
