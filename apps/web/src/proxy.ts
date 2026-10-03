import { STAFF_SESSION_COOKIE } from '@travel-rock/shared';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * UX only: sends visitors without a session cookie to the login page.
 * The API is the security boundary; admin pages also verify the session server-side.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === '/admin/login' || request.cookies.has(STAFF_SESSION_COOKIE)) {
    return NextResponse.next();
  }
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/admin/login';
  loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*'],
};
