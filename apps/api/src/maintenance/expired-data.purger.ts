import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { APPLICANT_SESSION_IDLE_MS } from '../public-identity/applicant-sessions.service.js';
import { SESSION_IDLE_TIMEOUT_MS } from '../staff-auth/session-policy.js';

const PURGE_INTERVAL_MS = 60 * 60 * 1000;
/** Expired codes are kept one day (support, abuse review), then their contact value is deleted. */
export const OTP_RETENTION_AFTER_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes data that has no use once expired: OTP challenges (they hold the email of people who may
 * never have signed up) and staff/applicant sessions that are past their idle or absolute expiry.
 * Runs hourly in-process; with several API instances each one runs it, which is harmless.
 */
@Injectable()
export class ExpiredDataPurger implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ExpiredDataPurger.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.run(), PURGE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async purge(now = new Date()): Promise<{ otpChallenges: number; sessions: number }> {
    const ago = (ms: number) => new Date(now.getTime() - ms);
    const [otp, staff, applicants] = await this.prisma.$transaction([
      this.prisma.otpChallenge.deleteMany({
        where: { expiresAt: { lt: ago(OTP_RETENTION_AFTER_EXPIRY_MS) } },
      }),
      this.prisma.staffSession.deleteMany({
        where: {
          OR: [{ expiresAt: { lte: now } }, { lastSeenAt: { lte: ago(SESSION_IDLE_TIMEOUT_MS) } }],
        },
      }),
      this.prisma.applicantSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lte: now } },
            { lastSeenAt: { lte: ago(APPLICANT_SESSION_IDLE_MS) } },
          ],
        },
      }),
    ]);
    return { otpChallenges: otp.count, sessions: staff.count + applicants.count };
  }

  private async run(): Promise<void> {
    try {
      await this.purge();
    } catch (error) {
      this.logger.error(`Purge failed: ${error instanceof Error ? error.name : 'unknown'}`);
    }
  }
}
