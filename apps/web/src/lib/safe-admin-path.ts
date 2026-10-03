const ADMIN_PATH = /^\/admin(\/[\w-]+)*\/?(\?[\w=&%.-]*)?$/;

/** Post-login destination: only internal admin paths, never the login page (prevents open redirects). */
export function safeAdminPath(next: string | undefined): string {
  if (!next || !ADMIN_PATH.test(next) || next.startsWith('/admin/login')) return '/admin';
  return next;
}

/** Login page that returns to `current` (an admin path) after signing in again. */
export function adminLoginHref(current: string): string {
  const next = safeAdminPath(current);
  return next === '/admin' ? '/admin/login' : `/admin/login?next=${encodeURIComponent(next)}`;
}

/** Client-only: the login page that returns to the admin page being viewed. */
export function currentAdminLoginHref(): string {
  return adminLoginHref(`${window.location.pathname}${window.location.search}`);
}
