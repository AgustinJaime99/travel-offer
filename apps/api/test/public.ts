import { APPLICANT_SESSION_COOKIE, PRIVACY_NOTICE_VERSION } from '@travel-rock/shared';
import request, { type Response } from 'supertest';
import { VerificationSender } from '../src/mail/verification-sender.js';
import type { TestApp } from './app.js';

/** Captures codes instead of emailing them; `failNext` simulates an SMTP outage. */
export class FakeVerificationSender extends VerificationSender {
  readonly sent: { to: string; code: string }[] = [];
  failNext = false;

  sendCode(to: string, code: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('SMTP unavailable'));
    }
    this.sent.push({ to, code });
    return Promise.resolve();
  }

  lastCodeFor(to: string): string {
    const message = this.sent.findLast((sent) => sent.to === to);
    if (!message) throw new Error(`No code sent to ${to}`);
    return message.code;
  }
}

let sequence = 0;
/** Unique per call: rate limits are keyed by contact and IP. */
export function uniqueEmail(prefix = 'familia'): string {
  sequence += 1;
  return `${prefix}${sequence}-${Date.now()}@example.com`;
}
export function uniqueIp(): string {
  sequence += 1;
  return `198.51.${Math.floor(sequence / 250) % 250}.${(sequence % 250) + 1}`;
}

export function publicCookieFrom(response: Response): string {
  const cookie = (response.headers['set-cookie'] as unknown as string[] | undefined)?.find(
    (value) => value.startsWith(`${APPLICANT_SESSION_COOKIE}=`),
  );
  if (!cookie) throw new Error('No applicant session cookie');
  return cookie.split(';')[0]!;
}

export async function requestCode(app: TestApp, email: string, ip = uniqueIp()): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/public/auth/otp/request')
    .set('X-Forwarded-For', ip)
    .send({ type: 'EMAIL', value: email })
    .expect(202);
  return (response.body as { challengeId: string }).challengeId;
}

/** Full sign-up/sign-in through the real OTP flow; returns the applicant cookie. */
export async function signIn(
  app: TestApp,
  sender: FakeVerificationSender,
  email = uniqueEmail(),
  fullName = 'Ana Pérez',
) {
  const challengeId = await requestCode(app, email);
  const response = await request(app.getHttpServer())
    .post('/api/public/auth/otp/verify')
    .set('X-Forwarded-For', uniqueIp())
    .send({
      challengeId,
      code: sender.lastCodeFor(email),
      fullName,
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    })
    .expect(200);
  return { cookie: publicCookieFrom(response), email };
}
