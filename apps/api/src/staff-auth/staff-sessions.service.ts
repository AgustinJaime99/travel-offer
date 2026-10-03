import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedStaff } from './authenticated-staff.js';
import {
  isSessionActive,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  shouldTouchSession,
} from './session-policy.js';
import { generateSessionToken, hashToken } from './tokens.js';

type Db = Prisma.TransactionClient;

@Injectable()
export class StaffSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Returns the plaintext token; only its hash is stored. */
  async create(staffUserId: string, now = new Date()): Promise<string> {
    const token = generateSessionToken();
    await this.prisma.staffSession.create({
      data: {
        tokenHash: this.hash(token),
        staffUserId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      },
    });
    return token;
  }

  /** Resolves a cookie token to an active session of an active user, or null. Expired sessions are deleted. */
  async resolve(token: string, now = new Date()): Promise<AuthenticatedStaff | null> {
    const session = await this.prisma.staffSession.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { staffUser: true },
    });
    if (!session) return null;
    if (!isSessionActive(session, now) || !session.staffUser.active) {
      await this.prisma.staffSession.deleteMany({ where: { id: session.id } });
      return null;
    }
    if (shouldTouchSession(session, now)) {
      await this.prisma.staffSession.updateMany({
        where: { id: session.id },
        data: { lastSeenAt: now },
      });
    }
    return { sessionId: session.id, user: session.staffUser };
  }

  async revokeToken(token: string): Promise<void> {
    await this.prisma.staffSession.deleteMany({ where: { tokenHash: this.hash(token) } });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.staffSession.deleteMany({ where: { id: sessionId } });
  }

  /** Immediate revocation (deactivation, password reset). Optionally keeps the caller's own session. */
  async revokeAllForUser(
    staffUserId: string,
    options: { exceptSessionId?: string; db?: Db } = {},
  ): Promise<void> {
    const db = options.db ?? this.prisma;
    await db.staffSession.deleteMany({
      where: {
        staffUserId,
        ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}),
      },
    });
  }

  private hash(token: string): string {
    return hashToken(token, this.env.AUTH_HMAC_SECRET);
  }
}
