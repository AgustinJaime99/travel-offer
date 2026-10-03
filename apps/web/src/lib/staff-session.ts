import { STAFF_SESSION_COOKIE, type StaffUser, staffUserSchema } from '@travel-rock/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { z } from 'zod';

const apiInternalUrl = process.env['API_INTERNAL_URL'] ?? 'http://127.0.0.1:3001';

async function sessionCookieHeader(): Promise<string | null> {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  return token ? `${STAFF_SESSION_COOKIE}=${token}` : null;
}

/** Server-side session check against the API, deduplicated per request. Null when not logged in. */
export const getCurrentStaff = cache(async (): Promise<StaffUser | null> => {
  const cookie = await sessionCookieHeader();
  if (!cookie) return null;
  const response = await fetch(`${apiInternalUrl}/api/admin/auth/me`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Session check failed with status ${response.status}`);
  return staffUserSchema.parse(await response.json());
});

/**
 * Server-side GET to the API with the visitor's session. Returns null for 404, sends expired sessions
 * to the login page and throws for other failures (including a 403 after a mid-session role change),
 * which admin/error.tsx renders; the API remains the authorization boundary.
 */
export async function serverApiGet<T extends z.ZodType>(
  path: string,
  schema: T,
): Promise<z.infer<T> | null> {
  const cookie = await sessionCookieHeader();
  if (!cookie) redirect('/admin/login');
  const response = await fetch(`${apiInternalUrl}${path}`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/admin/login');
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`GET ${path.split('?')[0]} failed with status ${response.status}`);
  return schema.parse(await response.json());
}
