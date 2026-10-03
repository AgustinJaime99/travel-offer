import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STAFF_SESSION_COOKIE } from '@travel-rock/shared';
import { apiTestEnv, apiTestUrl, E2E_USERS } from './test-env';

const apiDir = fileURLToPath(new URL('../../api', import.meta.url));

export async function api(path: string, body: unknown, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['cookie'] = cookie;
  const response = await fetch(`${apiTestUrl}/api/admin${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`E2E setup: POST ${path} failed with ${response.status}`);
  return response;
}

/** Logs in with a temporary password and replaces it, as a new staff member would. */
export async function activate(
  email: string,
  temporaryPassword: string,
  password: string,
): Promise<string> {
  const login = await api('/auth/login', { email, password: temporaryPassword });
  const cookie = login.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${STAFF_SESSION_COOKIE}=`))
    ?.split(';')[0];
  if (!cookie) throw new Error('E2E setup: no session cookie');
  await api(
    '/auth/change-password',
    { currentPassword: temporaryPassword, newPassword: password },
    cookie,
  );
  return cookie;
}

/** Empties the test database (the script refuses any database not named *_test). */
export function resetTestDatabase(): void {
  const env = { ...process.env, ...apiTestEnv };
  execFileSync('node', ['scripts/reset-test-db.mjs'], { cwd: apiDir, env, stdio: 'inherit' });
}

/** Creates the first ADMIN with the real CLI and replaces its temporary password; returns its session. */
export async function createInitialAdmin(): Promise<string> {
  const env = { ...process.env, ...apiTestEnv };
  const { admin } = E2E_USERS;
  const output = execFileSync(
    'node',
    ['dist/cli/create-admin.js', '--email', admin.email, '--name', admin.fullName],
    { cwd: apiDir, env, encoding: 'utf8' },
  );
  const adminTemporaryPassword = /Temporary password[^:]*: (\S+)/.exec(output)?.[1];
  if (!adminTemporaryPassword)
    throw new Error('E2E setup: create-admin printed no temporary password');
  return activate(admin.email, adminTemporaryPassword, admin.password);
}

/**
 * Runs after the web servers start (Playwright plugins first): empties the test database, creates
 * the first ADMIN with the real CLI, then the other test accounts through the API.
 */
export default async function globalSetup(): Promise<void> {
  resetTestDatabase();
  const adminCookie = await createInitialAdmin();
  const { commercial, viewer } = E2E_USERS;
  for (const user of [commercial, viewer]) {
    const created = await api(
      '/users',
      { email: user.email, fullName: user.fullName, role: user.role },
      adminCookie,
    );
    const { temporaryPassword } = (await created.json()) as { temporaryPassword: string };
    await activate(user.email, temporaryPassword, user.password);
  }
}
