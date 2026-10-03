import type { NextFunction, Request, Response } from 'express';
import type { ApiError } from '@travel-rock/shared';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type HeaderValue = string | string[] | undefined;

/**
 * CSRF defense for cookie-authenticated, state-changing requests (ADR-07), on top of SameSite=Lax.
 * - An Origin header must be in the allowlist.
 * - Without Origin, a Fetch Metadata header must say same-origin or user-initiated.
 * - Without either it is not a browser request, and CSRF requires a browser.
 */
export function isStateChangeAllowed(
  method: string,
  headers: { origin?: HeaderValue; 'sec-fetch-site'?: HeaderValue },
  allowedOrigins: readonly string[],
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  const origin = headers.origin;
  if (origin !== undefined) {
    return typeof origin === 'string' && allowedOrigins.includes(origin);
  }
  const fetchSite = headers['sec-fetch-site'];
  if (fetchSite !== undefined) {
    return fetchSite === 'same-origin' || fetchSite === 'none';
  }
  return true;
}

export function originCheck(allowedOrigins: readonly string[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (isStateChangeAllowed(request.method, request.headers, allowedOrigins)) {
      next();
      return;
    }
    const body: ApiError = {
      statusCode: 403,
      code: 'ORIGIN_NOT_ALLOWED',
      message: 'Origen de la solicitud no permitido.',
    };
    response.status(403).json(body);
  };
}
