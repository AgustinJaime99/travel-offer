import type { CookieOptions, Request } from 'express';
import { STAFF_SESSION_COOKIE } from '@travel-rock/shared';
import { SESSION_ABSOLUTE_TIMEOUT_MS } from './session-policy.js';

// Secure is safe in development too: browsers treat http://localhost as a secure context.
const baseOptions: CookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };

export const sessionCookieOptions: CookieOptions = {
  ...baseOptions,
  maxAge: SESSION_ABSOLUTE_TIMEOUT_MS,
};
export const clearSessionCookieOptions: CookieOptions = baseOptions;

export function readSessionToken(request: Request): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[STAFF_SESSION_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
