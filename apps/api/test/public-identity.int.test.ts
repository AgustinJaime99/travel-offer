import { applicantSchema, PRIVACY_NOTICE_VERSION } from '@travel-rock/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/common/rate-limiter.js';
import { VerificationSender } from '../src/mail/verification-sender.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { APPLICANT_SESSION_IDLE_MS } from '../src/public-identity/applicant-sessions.service.js';
import { createTestApp, type TestApp } from './app.js';
import { resetDatabase } from './db.js';
import { FakeVerificationSender, requestCode, signIn, uniqueEmail, uniqueIp } from './public.js';
import { createStaff, errorOf, login } from './staff.js';

let app: TestApp;
let prisma: PrismaService;
let sender: FakeVerificationSender;
// Rate limits use a controllable clock: tests skip the resend cooldown by advancing it.
let clock = Date.now();
const passTime = (ms = 61_000) => (clock += ms);
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  sender = new FakeVerificationSender();
  app = await createTestApp({
    customize: (builder) =>
      builder
        .overrideProvider(VerificationSender)
        .useValue(sender)
        .overrideProvider(RateLimiter)
        .useValue(new RateLimiter(() => clock)),
  });
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  passTime(2 * 60 * 60_000); // fresh rate-limit windows for every test
});

const verify = (body: object, ip = uniqueIp()) =>
  http().post('/api/public/auth/otp/verify').set('X-Forwarded-For', ip).send(body);
const INVALID_CODE = {
  statusCode: 400,
  code: 'INVALID_CODE',
  message: 'El código es incorrecto o venció. Pedí uno nuevo.',
};

describe('requesting a code', () => {
  it('emails a 6-digit code and stores only its keyed hash', async () => {
    const email = uniqueEmail();
    const challengeId = await requestCode(app, email);
    const code = sender.lastCodeFor(email);
    expect(code).toMatch(/^\d{6}$/);
    const challenge = await prisma.otpChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    expect(challenge).toMatchObject({
      type: 'EMAIL',
      valueNormalized: email,
      attempts: 0,
      consumedAt: null,
      applicantId: null,
    });
    expect(challenge.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      Math.abs(challenge.expiresAt.getTime() - challenge.createdAt.getTime() - 10 * 60 * 1000),
    ).toBeLessThan(5000);
  });

  it('answers the same for registered and unknown emails (no enumeration)', async () => {
    const { email } = await signIn(app, sender);
    passTime();
    const known = await http()
      .post('/api/public/auth/otp/request')
      .set('X-Forwarded-For', uniqueIp())
      .send({ type: 'EMAIL', value: email });
    const unknown = await http()
      .post('/api/public/auth/otp/request')
      .set('X-Forwarded-For', uniqueIp())
      .send({ type: 'EMAIL', value: uniqueEmail() });
    expect([known.status, unknown.status]).toEqual([202, 202]);
    expect(Object.keys(known.body as object)).toEqual(Object.keys(unknown.body as object));
  });

  it('normalizes the email and rejects phones until a provider is approved', async () => {
    await http()
      .post('/api/public/auth/otp/request')
      .send({ type: 'EMAIL', value: '  Mixed.Case@Example.COM ' })
      .expect(202);
    expect(sender.sent.at(-1)?.to).toBe('mixed.case@example.com');
    await http()
      .post('/api/public/auth/otp/request')
      .send({ type: 'PHONE', value: '+5491112345678' })
      .expect(400);
  });

  it('enforces a resend cooldown, a per-contact and a per-IP limit', async () => {
    const email = uniqueEmail();
    await requestCode(app, email);
    const again = await http()
      .post('/api/public/auth/otp/request')
      .set('X-Forwarded-For', uniqueIp())
      .send({ type: 'EMAIL', value: email })
      .expect(429);
    expect(errorOf(again).code).toBe('RATE_LIMITED');
    passTime();
    await requestCode(app, email);
    passTime();
    await requestCode(app, email);
    passTime();
    // 4th code for the same email within 15 minutes.
    await http()
      .post('/api/public/auth/otp/request')
      .set('X-Forwarded-For', uniqueIp())
      .send({ type: 'EMAIL', value: email })
      .expect(429);

    const ip = uniqueIp();
    for (let i = 0; i < 10; i++) await requestCode(app, uniqueEmail(), ip);
    await http()
      .post('/api/public/auth/otp/request')
      .set('X-Forwarded-For', ip)
      .send({ type: 'EMAIL', value: uniqueEmail() })
      .expect(429);
  });

  it('reports an email outage without leaving a usable challenge', async () => {
    const email = uniqueEmail();
    sender.failNext = true;
    const response = await http()
      .post('/api/public/auth/otp/request')
      .set('X-Forwarded-For', uniqueIp())
      .send({ type: 'EMAIL', value: email })
      .expect(503);
    expect(errorOf(response).code).toBe('EMAIL_UNAVAILABLE');
    expect(await prisma.otpChallenge.count({ where: { consumedAt: null } })).toBe(0);
  });
});

describe('verifying a code (sign-up and sign-in)', () => {
  it('signs up: asks for the name without spending the code, then creates the applicant', async () => {
    const email = uniqueEmail();
    const challengeId = await requestCode(app, email);
    const code = sender.lastCodeFor(email);

    const incomplete = await verify({ challengeId, code }).expect(400);
    expect(errorOf(incomplete).issues?.map((issue) => issue.path)).toEqual([
      'fullName',
      'privacyNoticeVersion',
    ]);

    const response = await verify({
      challengeId,
      code,
      fullName: ' Ana  Pérez ',
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    }).expect(200);
    expect(applicantSchema.parse(response.body)).toMatchObject({
      fullName: 'Ana Pérez',
      contacts: [{ type: 'EMAIL', value: email, verified: true }],
    });
    const [cookie] = response.headers['set-cookie'] as unknown as string[];
    expect(cookie).toMatch(/^tr_public=[\w-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    const applicant = await prisma.applicant.findFirstOrThrow();
    expect(applicant).toMatchObject({ privacyNoticeVersion: PRIVACY_NOTICE_VERSION });
  });

  it('a returning applicant signs in with just the code', async () => {
    const { email } = await signIn(app, sender, uniqueEmail(), 'Ana Pérez');
    passTime();
    const challengeId = await requestCode(app, email);
    const response = await verify({ challengeId, code: sender.lastCodeFor(email) }).expect(200);
    expect(response.body).toMatchObject({ fullName: 'Ana Pérez' });
    expect(await prisma.applicant.count()).toBe(1);
  });

  it('wrong, expired, reused and unknown codes all get the same answer', async () => {
    const email = uniqueEmail();
    const challengeId = await requestCode(app, email);
    const code = sender.lastCodeFor(email);
    const wrong = code === '000000' ? '111111' : '000000';
    const body = { fullName: 'Ana Pérez', privacyNoticeVersion: PRIVACY_NOTICE_VERSION };

    expect((await verify({ ...body, challengeId, code: wrong }).expect(400)).body).toEqual(
      INVALID_CODE,
    );
    expect(
      (
        await verify({ ...body, challengeId: '019a0000-0000-7000-8000-000000000000', code }).expect(
          400,
        )
      ).body,
    ).toEqual(INVALID_CODE);
    await verify({ ...body, challengeId, code }).expect(200);
    expect((await verify({ ...body, challengeId, code }).expect(400)).body).toEqual(INVALID_CODE);

    const expiring = uniqueEmail();
    const expiringId = await requestCode(app, expiring);
    await prisma.otpChallenge.update({
      where: { id: expiringId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(
      (
        await verify({
          ...body,
          challengeId: expiringId,
          code: sender.lastCodeFor(expiring),
        }).expect(400)
      ).body,
    ).toEqual(INVALID_CODE);
  });

  it('a challenge dies after 5 wrong attempts, even for the right code', async () => {
    const email = uniqueEmail();
    const challengeId = await requestCode(app, email);
    const code = sender.lastCodeFor(email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await verify({ challengeId, code: wrong }).expect(400);
    await verify({
      challengeId,
      code,
      fullName: 'Ana Pérez',
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    }).expect(400);
    expect(
      (await prisma.otpChallenge.findUniqueOrThrow({ where: { id: challengeId } })).attempts,
    ).toBe(5);
  });

  it('reserves the attempt before comparing: even the right code counts one', async () => {
    const email = uniqueEmail();
    const challengeId = await requestCode(app, email);
    await verify({
      challengeId,
      code: sender.lastCodeFor(email),
      fullName: 'Ana Pérez',
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    }).expect(200);
    expect(
      (await prisma.otpChallenge.findUniqueOrThrow({ where: { id: challengeId } })).attempts,
    ).toBe(1);
  });

  it('concurrent guesses cannot exceed the 5 attempts of a challenge', async () => {
    const email = uniqueEmail();
    const challengeId = await requestCode(app, email);
    const code = sender.lastCodeFor(email);
    const wrong = code === '000000' ? '111111' : '000000';
    const ip = uniqueIp();
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => verify({ challengeId, code: wrong }, ip)),
    );
    expect(responses.every((response) => response.status === 400)).toBe(true);
    expect(
      (await prisma.otpChallenge.findUniqueOrThrow({ where: { id: challengeId } })).attempts,
    ).toBe(5);
    await verify(
      { challengeId, code, fullName: 'Ana Pérez', privacyNoticeVersion: PRIVACY_NOTICE_VERSION },
      ip,
    ).expect(400);
  });

  it('limits verification attempts per IP', async () => {
    const ip = uniqueIp();
    const body = { challengeId: '019a0000-0000-7000-8000-000000000000', code: '123456' };
    for (let i = 0; i < 30; i++) await verify(body, ip).expect(400);
    expect(errorOf(await verify(body, ip).expect(429)).code).toBe('RATE_LIMITED');
  });

  it('a code is single-use under concurrency', async () => {
    const email = uniqueEmail();
    const challengeId = await requestCode(app, email);
    const body = {
      challengeId,
      code: sender.lastCodeFor(email),
      fullName: 'Ana Pérez',
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    };
    const responses = await Promise.all(Array.from({ length: 5 }, () => verify(body)));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400, 400, 400, 400]);
    expect(await prisma.applicant.count()).toBe(1);
  });

  it('two simultaneous sign-ups of the same email end in one applicant', async () => {
    const email = uniqueEmail();
    const first = await requestCode(app, email);
    const firstCode = sender.lastCodeFor(email);
    passTime();
    const second = await requestCode(app, email);
    const secondCode = sender.lastCodeFor(email);
    const body = { fullName: 'Ana Pérez', privacyNoticeVersion: PRIVACY_NOTICE_VERSION };
    const responses = await Promise.all([
      verify({ ...body, challengeId: first, code: firstCode }),
      verify({ ...body, challengeId: second, code: secondCode }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await prisma.applicant.count()).toBe(1);
    expect(await prisma.applicantContact.count({ where: { valueNormalized: email } })).toBe(1);
  });
});

describe('sessions', () => {
  it('GET /me requires an applicant session; staff and applicant sessions are not interchangeable', async () => {
    await http().get('/api/public/me').expect(401);
    const { cookie } = await signIn(app, sender);
    await http().get('/api/public/me').set('Cookie', cookie).expect(200);
    await http().get('/api/admin/auth/me').set('Cookie', cookie).expect(401);
    const staffCookie = await login(app, (await createStaff(prisma, { role: 'ADMIN' })).email);
    await http().get('/api/public/me').set('Cookie', staffCookie).expect(401);
  });

  it('expires after 7 days idle, and logout revokes it', async () => {
    const first = await signIn(app, sender);
    await prisma.applicantSession.updateMany({
      data: { lastSeenAt: new Date(Date.now() - APPLICANT_SESSION_IDLE_MS) },
    });
    await http().get('/api/public/me').set('Cookie', first.cookie).expect(401);

    const second = await signIn(app, sender);
    await http().post('/api/public/auth/logout').set('Cookie', second.cookie).expect(204);
    await http().get('/api/public/me').set('Cookie', second.cookie).expect(401);
  });
});

describe('contacts: change email, always keep one verified', () => {
  async function addEmail(cookie: string, email: string) {
    const added = await http()
      .post('/api/public/me/contacts')
      .set('Cookie', cookie)
      .set('X-Forwarded-For', uniqueIp())
      .send({ type: 'EMAIL', value: email })
      .expect(202);
    return {
      challengeId: (added.body as { challengeId: string }).challengeId,
      code: sender.lastCodeFor(email),
    };
  }

  it('adds a verified email, removes the old one, refuses to remove the last', async () => {
    const { cookie, email } = await signIn(app, sender);
    const newEmail = uniqueEmail('nuevo');
    const challenge = await addEmail(cookie, newEmail);
    const added = applicantSchema.parse(
      (
        await http()
          .post('/api/public/me/contacts/verify')
          .set('Cookie', cookie)
          .send(challenge)
          .expect(201)
      ).body,
    );
    expect(added.contacts.map((contact) => contact.value)).toEqual([email, newEmail]);

    const old = added.contacts[0]!;
    const remaining = applicantSchema.parse(
      (await http().delete(`/api/public/me/contacts/${old.id}`).set('Cookie', cookie).expect(200))
        .body,
    );
    expect(remaining.contacts.map((contact) => contact.value)).toEqual([newEmail]);
    const last = await http()
      .delete(`/api/public/me/contacts/${remaining.contacts[0]!.id}`)
      .set('Cookie', cookie)
      .expect(409);
    expect(errorOf(last).code).toBe('LAST_CONTACT');

    // The new email now signs in to the same account.
    passTime();
    const challengeId = await requestCode(app, newEmail);
    expect(
      (await verify({ challengeId, code: sender.lastCodeFor(newEmail) }).expect(200)).body,
    ).toMatchObject({ fullName: 'Ana Pérez' });
  });

  it('rejects an email verified by someone else, and keeps sign-in and add-contact codes apart', async () => {
    const someone = await signIn(app, sender);
    const me = await signIn(app, sender);
    passTime();
    const taken = await addEmail(me.cookie, someone.email);
    expect(
      errorOf(
        await http()
          .post('/api/public/me/contacts/verify')
          .set('Cookie', me.cookie)
          .send(taken)
          .expect(409),
      ).code,
    ).toBe('CONTACT_TAKEN');

    const addChallenge = await addEmail(me.cookie, uniqueEmail());
    await verify({
      ...addChallenge,
      fullName: 'X Y',
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    }).expect(400);

    const signInEmail = uniqueEmail();
    const signInChallenge = await requestCode(app, signInEmail);
    await http()
      .post('/api/public/me/contacts/verify')
      .set('Cookie', me.cookie)
      .send({ challengeId: signInChallenge, code: sender.lastCodeFor(signInEmail) })
      .expect(400);
  });

  it('cannot remove contacts of another applicant', async () => {
    const someone = await signIn(app, sender);
    const me = await signIn(app, sender);
    const [contact] = await prisma.applicantContact.findMany({
      where: { valueNormalized: someone.email },
    });
    await http()
      .delete(`/api/public/me/contacts/${contact!.id}`)
      .set('Cookie', me.cookie)
      .expect(404);
  });
});
