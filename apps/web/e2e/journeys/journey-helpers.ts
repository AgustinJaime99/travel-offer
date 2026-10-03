import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { type Browser, devices, expect, type Locator, type Page } from '@playwright/test';
import { travelYearRange } from '@travel-rock/shared';
import { fillSchool } from '../helpers';
import { latestCodeFor } from '../public-helpers';
import { apiTestEnv } from '../test-env';

const apiDir = fileURLToPath(new URL('../../../api', import.meta.url));

export const heading = (page: Page, name: string | RegExp) =>
  expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

/** Value of a <dt>/<dd> pair whose label is exactly `label`. */
export const valueOf = (scope: Page | Locator, label: string) =>
  scope
    .locator('dt', { hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]');

/** A phone, as families use the onboarding; its own cookies, separate from the staff session. */
export async function familyPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return context.newPage();
}

export const familyEmail = (label: string) => `familia-${label}-${Date.now()}@example.com`;

/** Privacy notice, contact and email code (from Mailpit): the family has a verified session. */
export async function verifyFamily(page: Page, email: string) {
  await page.goto('/onboarding');
  await page.getByLabel(/Leí y acepto el aviso de privacidad/).check();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.getByLabel('Tu nombre y apellido').fill('Familia Recorrido');
  await page.getByLabel('Tu email').fill(email);
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await heading(page, 'Revisá tu email');
  await page.getByLabel('Código').fill(await latestCodeFor(email));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await heading(page, 'Datos del alumno');
}

/** From the student step to the school search of `province` (value of the select, e.g. "JUJUY"). */
export async function toSchoolSearch(page: Page, province: string) {
  await page.getByLabel('Soy madre, padre o tutor/a del alumno').check();
  await page.getByLabel('Nombre del alumno').fill('Sofía');
  await page.getByLabel('Apellido del alumno').fill('Recorrido');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Provincia del colegio').selectOption(province);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await heading(page, 'Buscá el colegio');
}

/** Searches the school, picks the group and reaches the consent step. */
export async function chooseSchoolAndGroup(
  page: Page,
  { search, school }: { search: string; school: string },
  group: string,
) {
  await page.getByLabel('Nombre del colegio').fill(search);
  await page
    .getByRole('list', { name: 'Colegios encontrados' })
    .getByRole('button', { name: new RegExp(school) })
    .click();
  await page
    .getByRole('list', { name: 'Grupos del colegio' })
    .getByRole('button', { name: new RegExp(`^${group} · viaje`) })
    .click();
  await heading(page, 'Revisá y confirmá');
}

export async function confirmInterest(page: Page, accessCode?: string) {
  if (accessCode) await page.getByLabel('Código del grupo (opcional)').fill(accessCode);
  await page.getByLabel(/Registrar el interés no es una reserva/).check();
  await page.getByRole('button', { name: 'Confirmar' }).click();
}

/** Simulates the passage of time on the test database (apps/api/scripts/expire-test-proposal.mjs). */
export function expireProposal(proposalId: string) {
  execFileSync('node', ['scripts/expire-test-proposal.mjs', proposalId], {
    cwd: apiDir,
    env: { ...process.env, ...apiTestEnv },
    stdio: 'inherit',
  });
}

/** The id at the end of an admin detail URL (/admin/groups/<id>). */
export const idFromUrl = (page: Page) => new URL(page.url()).pathname.split('/').pop()!;

export const TRAVEL_YEAR = String(travelYearRange().min + 2);

/** Staff UI: new school, its first group and (optionally) the group access code, shown once. */
export async function createSchoolAndGroup(
  page: Page,
  school: { name: string; province: string; city: string },
  group: string,
  { accessCode = true } = {},
): Promise<{ groupUrl: string; accessCode: string | null }> {
  await page.goto('/admin/schools/new');
  await fillSchool(page, school);
  await page.getByRole('button', { name: 'Crear colegio' }).click();
  await heading(page, school.name);
  await page.getByRole('link', { name: '+ Crear grupo' }).click();
  await heading(page, 'Nuevo grupo');
  await page.getByLabel('Nombre del grupo').fill(group);
  await page.getByLabel('Año de viaje').selectOption(TRAVEL_YEAR);
  await page.getByRole('button', { name: 'Crear grupo' }).click();
  await heading(page, group);
  const groupUrl = page.url();
  if (!accessCode) return { groupUrl, accessCode: null };
  await page.getByRole('button', { name: 'Generar código', exact: true }).click();
  const code = (await page.getByTestId('access-code').textContent()) ?? '';
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  return { groupUrl, accessCode: code };
}

/** Staff UI: a catalog service with its base price per passenger (Argentine format). */
export async function createService(
  page: Page,
  service: { name: string; category: string; price: string },
) {
  await page.goto('/admin/services/new');
  await heading(page, 'Nuevo servicio');
  await page.getByLabel('Nombre', { exact: true }).fill(service.name);
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: service.category });
  await page.getByLabel('Precio base por pasajero (ARS)').fill(service.price);
  await page.getByRole('button', { name: 'Crear servicio' }).click();
  await heading(page, service.name);
}

/** Staff UI: adds catalog services to the open draft from the service picker. */
export async function addServices(page: Page, names: string[]) {
  for (const name of names) {
    await page.getByLabel('Agregar servicio').fill(name.toLowerCase());
    await page
      .getByRole('list', { name: 'Servicios encontrados' })
      .getByRole('button', { name: new RegExp(name) })
      .click();
    await expect(page.getByRole('button', { name: `Quitar ${name}` })).toBeVisible();
  }
}

/** A date input value `days` from today. */
export const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Accepts the confirmation dialog and publishes the open draft. */
export async function publish(page: Page) {
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Publicar' }).click();
}
