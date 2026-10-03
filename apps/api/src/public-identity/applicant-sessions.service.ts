import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import type { Applicant } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateSessionToken, hashToken } from '../staff-auth/tokens.js';

// Approved in Phase 0 (ARCHITECTURE.md, applicant sessions).
export const APPLICANT_SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const APPLICANT_SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export interface AuthenticatedApplicant {
  sessionId: string;
  applicant: Applicant;
}

/** Applicant sessions: separate table, cookie and guard from staff sessions (T1). */
@Injectable()
export class ApplicantSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(applicantId: string, now = new Date()): Promise<string> {
    const token = generateSessionToken();
    await this.prisma.applicantSession.create({
      data: {
        tokenHash: hashToken(token, this.env.AUTH_HMAC_SECRET),
        applicantId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + APPLICANT_SESSION_ABSOLUTE_MS),
      },
    });
    return token;
  }

  async resolve(token: string, now = new Date()): Promise<AuthenticatedApplicant | null> {
    const session = await this.prisma.applicantSession.findUnique({
      where: { tokenHash: hashToken(token, this.env.AUTH_HMAC_SECRET) },
      include: { applicant: true },
    });
    if (!session) return null;
    const idle = now.getTime() - session.lastSeenAt.getTime();
    if (now >= session.expiresAt || idle >= APPLICANT_SESSION_IDLE_MS) {
      await this.prisma.applicantSession.deleteMany({ where: { id: session.id } });
      return null;
    }
    if (idle >= TOUCH_INTERVAL_MS) {
      await this.prisma.applicantSession.updateMany({
        where: { id: session.id },
        data: { lastSeenAt: now },
      });
    }
    return { sessionId: session.id, applicant: session.applicant };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.applicantSession.deleteMany({ where: { id: sessionId } });
  }
}
