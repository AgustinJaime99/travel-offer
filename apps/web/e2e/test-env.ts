import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** Environment of the E2E API: the test database and its dedicated port. */
export const apiTestEnv: Record<string, string> = Object.fromEntries(
  Object.entries(
    parseEnv(readFileSync(new URL('../../api/.env.test', import.meta.url), 'utf8')),
  ).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

export const apiTestUrl = `http://127.0.0.1:${apiTestEnv['API_PORT'] ?? '3101'}`;

/** Test-only accounts created by global-setup.ts on the empty test database. */
export const E2E_USERS = {
  admin: {
    email: 'e2e-admin@travelrock.test',
    fullName: 'Admin E2E',
    password: 'contraseña del admin de e2e',
  },
  commercial: {
    email: 'e2e-catalogo@travelrock.test',
    fullName: 'Comercial Catálogo E2E',
    password: 'contraseña del comercial de e2e',
    role: 'COMMERCIAL',
  },
  viewer: {
    email: 'e2e-lectura@travelrock.test',
    fullName: 'Lectura E2E',
    password: 'contraseña de lectura de e2e',
    role: 'VIEWER',
  },
} as const;
