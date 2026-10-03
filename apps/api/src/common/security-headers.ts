import type { NextFunction, Request, Response } from 'express';

/**
 * JSON-only API: nothing may be framed, sniffed or cached (responses can carry personal data).
 * The web app sets its own headers for HTML in next.config.ts.
 */
const HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

export function securityHeaders(_request: Request, response: Response, next: NextFunction): void {
  response.set(HEADERS);
  next();
}
