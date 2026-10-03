import { createHmac, randomBytes } from 'node:crypto';

/** 256-bit opaque session token, sent only in the HttpOnly cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only this keyed hash is stored, so a database leak does not expose usable tokens. */
export function hashToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
