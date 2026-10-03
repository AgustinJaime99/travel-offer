import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STAFF_SESSION_COOKIE, type StaffRole } from '@travel-rock/shared';
import type { Response } from 'express';
import { ApiException } from '../common/api-exception.js';
import type { StaffRequest } from './authenticated-staff.js';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY, IS_PUBLIC_KEY, ROLES_KEY } from './decorators.js';
import { clearSessionCookieOptions, readSessionToken } from './session-cookie.js';
import { StaffSessionsService } from './staff-sessions.service.js';

/** Global default-deny guard (ADR-07): every route needs a staff session unless marked @Public(). */
@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: StaffSessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<StaffRequest>();
    const token = readSessionToken(request);
    const staff = token ? await this.sessions.resolve(token) : null;
    if (!staff) {
      if (token)
        http.getResponse<Response>().clearCookie(STAFF_SESSION_COOKIE, clearSessionCookieOptions);
      throw new ApiException(401, 'UNAUTHENTICATED', 'Tenés que iniciar sesión.');
    }
    request.staff = staff;

    const allowPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_CHANGE_KEY,
      targets,
    );
    if (staff.user.mustChangePassword && !allowPending) {
      throw new ApiException(403, 'PASSWORD_CHANGE_REQUIRED', 'Tenés que cambiar tu contraseña.');
    }

    const roles = this.reflector.getAllAndOverride<StaffRole[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(staff.user.role)) {
      throw new ApiException(403, 'FORBIDDEN', 'No tenés permisos para esta acción.');
    }
    return true;
  }
}
