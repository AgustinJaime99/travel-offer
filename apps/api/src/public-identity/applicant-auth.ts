import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { APPLICANT_SESSION_COOKIE } from '@travel-rock/shared';
import type { CookieOptions, Request, Response } from 'express';
import { ApiException } from '../common/api-exception.js';
import {
  APPLICANT_SESSION_ABSOLUTE_MS,
  type AuthenticatedApplicant,
  ApplicantSessionsService,
} from './applicant-sessions.service.js';

const baseCookie: CookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };
export const applicantCookieOptions: CookieOptions = {
  ...baseCookie,
  maxAge: APPLICANT_SESSION_ABSOLUTE_MS,
};
export const clearApplicantCookieOptions: CookieOptions = baseCookie;

export interface ApplicantRequest extends Request {
  applicant?: AuthenticatedApplicant;
}

export function readApplicantToken(request: Request): string | undefined {
  const value = (request.cookies as Record<string, unknown> | undefined)?.[
    APPLICANT_SESSION_COOKIE
  ];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Requires an applicant session. Routes using it are @Public() for the staff guard. */
@Injectable()
export class ApplicantAuthGuard implements CanActivate {
  constructor(private readonly sessions: ApplicantSessionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<ApplicantRequest>();
    const token = readApplicantToken(request);
    const applicant = token ? await this.sessions.resolve(token) : null;
    if (!applicant) {
      if (token)
        http
          .getResponse<Response>()
          .clearCookie(APPLICANT_SESSION_COOKIE, clearApplicantCookieOptions);
      throw new ApiException(
        401,
        'UNAUTHENTICATED',
        'Tu sesión venció. Volvé a ingresar con tu email.',
      );
    }
    request.applicant = applicant;
    return true;
  }
}

export const CurrentApplicant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedApplicant => {
    const applicant = context.switchToHttp().getRequest<ApplicantRequest>().applicant;
    if (!applicant) throw new Error('CurrentApplicant used on a route without ApplicantAuthGuard');
    return applicant;
  },
);
