import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ExpiredDataPurger,
  OTP_RETENTION_AFTER_EXPIRY_MS,
} from '../src/maintenance/expired-data.purger.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { APPLICANT_SESSION_IDLE_MS } from '../src/public-identity/applicant-sessions.service.js';
import { SESSION_IDLE_TIMEOUT_MS } from '../src/staff-auth/session-policy.js';
import { createTestApp, type TestApp } from './app.js';
import { resetDatabase } from './db.js';
import { createStaff } from './staff.js';

let app: TestApp;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
});

afterAll(async () => {
  await app.close();
});

const now = new Date('2026-10-02T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const later = (ms: number) => new Date(now.getTime() + ms);
let token = 0;
const tokenHash = () => `hash-${++token}`;

describe('ExpiredDataPurger', () => {
  it('deletes old OTP challenges and expired or idle sessions, and keeps live data', async () => {
    const otp = (expiresAt: Date) =>
      prisma.otpChallenge.create({
        data: { type: 'EMAIL', valueNormalized: 'ana@example.com', codeHash: 'x', expiresAt },
      });
    const oldOtp = await otp(ago(OTP_RETENTION_AFTER_EXPIRY_MS + 1000));
    const recentlyExpiredOtp = await otp(ago(60_000));
    const liveOtp = await otp(later(60_000));

    const staff = await createStaff(prisma);
    const staffSession = (lastSeenAt: Date, expiresAt: Date) =>
      prisma.staffSession.create({
        data: { tokenHash: tokenHash(), staffUserId: staff.id, lastSeenAt, expiresAt },
      });
    const staffExpired = await staffSession(ago(1000), ago(1));
    const staffIdle = await staffSession(ago(SESSION_IDLE_TIMEOUT_MS), later(60_000));
    const staffLive = await staffSession(ago(1000), later(60_000));

    const applicant = await prisma.applicant.create({
      data: { fullName: 'Ana', privacyNoticeVersion: 'v', privacyAcceptedAt: now },
    });
    const applicantSession = (lastSeenAt: Date, expiresAt: Date) =>
      prisma.applicantSession.create({
        data: { tokenHash: tokenHash(), applicantId: applicant.id, lastSeenAt, expiresAt },
      });
    const applicantIdle = await applicantSession(ago(APPLICANT_SESSION_IDLE_MS), later(60_000));
    const applicantLive = await applicantSession(ago(1000), later(60_000));

    expect(await app.get(ExpiredDataPurger).purge(now)).toEqual({
      otpChallenges: 1,
      sessions: 3,
    });

    const otpIds = (await prisma.otpChallenge.findMany()).map(({ id }) => id).sort();
    expect(otpIds).toEqual([recentlyExpiredOtp.id, liveOtp.id].sort());
    expect(otpIds).not.toContain(oldOtp.id);
    const staffIds = (await prisma.staffSession.findMany()).map(({ id }) => id);
    expect(staffIds).toEqual([staffLive.id]);
    expect(staffIds).not.toContain(staffExpired.id);
    expect(staffIds).not.toContain(staffIdle.id);
    const applicantIds = (await prisma.applicantSession.findMany()).map(({ id }) => id);
    expect(applicantIds).toEqual([applicantLive.id]);
    expect(applicantIds).not.toContain(applicantIdle.id);
  });
});
