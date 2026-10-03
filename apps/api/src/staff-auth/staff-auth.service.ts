import { Inject, Injectable } from '@nestjs/common';
import type { ChangePasswordRequest, LoginRequest } from '@travel-rock/shared';
import { ApiException } from '../common/api-exception.js';
import type { StaffUser as StaffUserRecord } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedStaff } from './authenticated-staff.js';
import { LoginAttemptLimiter } from './login-attempt-limiter.js';
import { getDummyPasswordHash, hashPassword, verifyPassword } from './password.js';
import { StaffSessionsService } from './staff-sessions.service.js';

const rateLimited = () =>
  new ApiException(
    429,
    'RATE_LIMITED',
    'Demasiados intentos fallidos. Probá de nuevo en 15 minutos.',
  );

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: StaffSessionsService,
    @Inject(LoginAttemptLimiter) private readonly limiter: LoginAttemptLimiter,
  ) {}

  async login(
    credentials: LoginRequest,
    client: { ip: string; previousToken?: string | undefined },
  ): Promise<{ token: string; user: StaffUserRecord }> {
    const attempt = { email: credentials.email, ip: client.ip };
    if (!this.limiter.tryBegin(attempt)) throw rateLimited();

    const user = await this.prisma.staffUser.findUnique({ where: { email: credentials.email } });
    // Always run one verification so unknown emails take as long as wrong passwords.
    const passwordMatches = await verifyPassword(
      user?.passwordHash ?? (await getDummyPasswordHash()),
      credentials.password,
    );
    if (!user || !user.active || !passwordMatches) {
      throw new ApiException(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.');
    }

    this.limiter.succeeded(attempt);
    // A fresh token on every login prevents session fixation.
    if (client.previousToken) await this.sessions.revokeToken(client.previousToken);
    return { token: await this.sessions.create(user.id), user };
  }

  async changePassword(
    staff: AuthenticatedStaff,
    request: ChangePasswordRequest,
    client: { ip: string },
  ): Promise<void> {
    const attempt = { email: staff.user.email, ip: client.ip };
    if (!this.limiter.tryBegin(attempt)) throw rateLimited();

    if (!(await verifyPassword(staff.user.passwordHash, request.currentPassword))) {
      throw new ApiException(
        400,
        'INVALID_CURRENT_PASSWORD',
        'La contraseña actual no es correcta.',
      );
    }
    this.limiter.succeeded(attempt);
    if (request.newPassword.trim().toLowerCase() === staff.user.email) {
      throw new ApiException(400, 'PASSWORD_EQUALS_EMAIL', 'La contraseña no puede ser tu email.');
    }

    const passwordHash = await hashPassword(request.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.staffUser.update({
        where: { id: staff.user.id },
        data: { passwordHash, mustChangePassword: false },
      });
      // Other devices must log in again with the new password.
      await this.sessions.revokeAllForUser(staff.user.id, {
        exceptSessionId: staff.sessionId,
        db: tx,
      });
    });
  }
}
