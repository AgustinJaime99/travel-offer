import { devices, expect, type Page, test } from '@playwright/test';
import { travelYearRange } from '@travel-rock/shared';
import { login } from './helpers';
import { createSchoolWithGroup, latestCodeFor } from './public-helpers';
import { E2E_USERS } from './test-env';

const YEAR = String(travelYearRange().min + 2);

/** Verifies a new family and walks the onboarding up to the school search. */
async function toSchoolSearch(page: Page, email: string, province: string, city = '') {
  await page.goto('/onboarding');
  await page.getByLabel(/Leí y acepto el aviso de privacidad/).check();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.getByLabel('Tu nombre y apellido').fill('Carla Ruiz');
  await page.getByLabel('Tu email').fill(email);
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.getByLabel('Código')).toBeVisible();
  await page.getByLabel('Código').fill(await latestCodeFor(email));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await page.getByLabel('Soy madre, padre o tutor/a del alumno').check();
  await page.getByLabel('Nombre del alumno').fill('Tomás');
  await page.getByLabel('Apellido del alumno').fill('Ruiz');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Provincia del colegio').selectOption(province);
  if (city) await page.getByLabel('Localidad (opcional)').fill(city);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Buscá el colegio' })).toBeVisible();
}

const confirmation = (page: Page) =>
  expect(page.getByRole('status')).toHaveText(
    'Recibimos tu solicitud. Un asesor de Travel Rock la va a revisar y se va a contactar con vos.',
  );

test.skip(({ isMobile }) => !isMobile, 'stateful public journeys run on mobile');

test('a missing school reaches the staff queue, with contact and demand, and is followed up', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const email = `familia-solicitud-${Date.now()}@example.com`;
  await test.step('the family reports the school it cannot find', async () => {
    await toSchoolSearch(page, email, 'CATAMARCA', 'Belén');
    await page.getByLabel('Nombre del colegio').fill('escuela inexistente');
    await expect(page.getByText(/No encontramos colegios con ese nombre/)).toBeVisible();
    await page.getByRole('button', { name: 'No encuentro mi colegio' }).click();
    await expect(page.getByLabel('Localidad')).toHaveValue('Belén');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('Nombre: ingresá al menos 2 caracteres.')).toBeVisible();
    await page.getByLabel('Nombre del colegio').fill('Escuela Solicitada E2E');
    await page.getByLabel('Curso o división').fill('5° A');
    await page.getByLabel('Año del viaje').selectOption(YEAR);
    await page.getByRole('button', { name: 'Enviar' }).click();
    await confirmation(page);
  });

  await test.step('staff sees it in the queue and follows up', async () => {
    const staffContext = await browser.newContext({ ...devices['Desktop Chrome'] });
    const staff = await staffContext.newPage();
    const { commercial } = E2E_USERS;
    await login(staff, commercial.email, commercial.password);
    await staff
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Solicitudes' })
      .click();
    const row = staff.getByRole('row', { name: /Escuela Solicitada E2E/ });
    await expect(row).toContainText('Colegio no encontrado');
    await expect(row).toContainText(`5° A · ${YEAR}`);
    await expect(row).toContainText('Pendiente');
    await row.getByRole('link').click();
    await expect(staff.getByText(`Carla Ruiz · ${email}`)).toBeVisible();
    await staff.getByLabel('Estado').selectOption('REVIEWING');
    await staff.getByLabel('Notas internas').fill('Contactar al colegio para cargarlo.');
    await staff.getByRole('button', { name: 'Guardar' }).click();
    await expect(staff.getByRole('status')).toHaveText('Cambios guardados.');
    await expect(
      staff.locator('dt', { hasText: /^Estado$/ }).locator('xpath=following-sibling::dd[1]'),
    ).toHaveText('En revisión');
    await staffContext.close();
  });
});

test('a missing group in an existing school is reported with the school linked', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const school = 'Colegio Con Grupo Faltante E2E';
  await createSchoolWithGroup({ name: school, province: 'CHUBUT', city: 'Trelew' }, '5° A');
  await toSchoolSearch(page, `familia-grupo-${Date.now()}@example.com`, 'CHUBUT');
  await page.getByLabel('Nombre del colegio').fill('grupo faltante');
  await page
    .getByRole('list', { name: 'Colegios encontrados' })
    .getByRole('button', { name: new RegExp(school) })
    .click();
  await expect(page.getByRole('list', { name: 'Grupos del colegio' })).toBeVisible();
  await page.getByRole('button', { name: 'No encuentro mi grupo' }).click();
  await expect(
    page.getByRole('heading', { name: `Contanos cuál es tu grupo en ${school}` }),
  ).toBeVisible();
  await page.getByLabel('Curso o división').fill('5° B');
  await page.getByLabel('Año del viaje').selectOption(YEAR);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await confirmation(page);
});
