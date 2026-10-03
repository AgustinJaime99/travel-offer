import { expect, type Page, test } from '@playwright/test';
import { travelYearRange } from '@travel-rock/shared';
import { alertIn, detail, fillSchool, login } from './helpers';
import { E2E_USERS } from './test-env';

const SCHOOL = { name: 'Escuela Normal Superior', province: 'Mendoza', city: 'Godoy Cruz' };
const YEAR = String(travelYearRange().min + 2);

async function fillGroup(page: Page, group: { name: string; students?: string }) {
  await page.getByLabel('Nombre del grupo').fill(group.name);
  await page.getByLabel('Año de viaje').selectOption(YEAR);
  if (group.students) await page.getByLabel('Alumnos estimados (opcional)').fill(group.students);
}

test('COMMERCIAL creates groups from the school and from the global list', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'stateful journey runs on desktop only');
  const { commercial } = E2E_USERS;
  await login(page, commercial.email, commercial.password);

  await test.step('a new school has no groups yet', async () => {
    await page.goto('/admin/schools/new');
    await fillSchool(page, SCHOOL);
    await page.getByRole('button', { name: 'Crear colegio' }).click();
    await expect(page.getByRole('heading', { name: SCHOOL.name })).toBeVisible();
    await expect(page.getByText('Este colegio todavía no tiene grupos.')).toBeVisible();
  });

  await test.step('"+ Crear grupo" preselects the school', async () => {
    await page.getByRole('link', { name: '+ Crear grupo' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo grupo' })).toBeVisible();
    await expect(
      page.getByText(`${SCHOOL.name} — ${SCHOOL.city}, ${SCHOOL.province}`),
    ).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await fillGroup(page, { name: '5° A', students: '30' });
    await page.getByRole('button', { name: 'Crear grupo' }).click();
    await expect(page.getByRole('heading', { name: '5° A' })).toBeVisible();
    await expect(page.getByRole('link', { name: SCHOOL.name })).toBeVisible();
    await expect(detail(page, 'Año de viaje')).toHaveText(YEAR);
    await expect(detail(page, 'Alumnos estimados')).toHaveText('30');
  });

  await test.step('the access code is shown once and can be rotated', async () => {
    await expect(page.getByText('Todavía no tiene código.')).toBeVisible();
    await page.getByRole('button', { name: 'Generar código', exact: true }).click();
    const first = (await page.getByTestId('access-code').textContent()) ?? '';
    expect(first).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);

    await page.reload();
    await expect(page.getByText(/^Configurado \(generado el /)).toBeVisible();
    await expect(page.getByTestId('access-code')).toHaveCount(0);
    await expect(page.getByText(first)).toHaveCount(0);

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Generar código nuevo' }).click();
    await expect(page.getByTestId('access-code')).not.toHaveText(first);
  });

  await test.step('the global path uses a searchable school selector', async () => {
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Grupos' })
      .click();
    await page.getByRole('link', { name: 'Nuevo grupo' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo grupo' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Colegio' }).fill('normal sup');
    await page
      .getByRole('list', { name: 'Colegios encontrados' })
      .getByRole('button', { name: new RegExp(SCHOOL.name) })
      .click();
    await fillGroup(page, { name: '5° B' });
    await page.getByRole('button', { name: 'Crear grupo' }).click();
    await expect(page.getByRole('heading', { name: '5° B' })).toBeVisible();
  });

  await test.step('the same name for the same school and year is rejected', async () => {
    await page.getByRole('link', { name: SCHOOL.name }).click();
    await page.getByRole('link', { name: '+ Crear grupo' }).click();
    await fillGroup(page, { name: '5 A' });
    await page.getByRole('button', { name: 'Crear grupo' }).click();
    await expect(
      page.getByText('Ya existe un grupo con ese nombre para ese colegio y año de viaje.'),
    ).toBeVisible();
  });

  await test.step('groups are listed in the school and found in the global list', async () => {
    await page.goto('/admin/schools');
    await page.getByRole('link', { name: SCHOOL.name }).click();
    const groups = page.getByRole('region', { name: 'Grupos' });
    await expect(groups.getByRole('link', { name: '5° A' })).toBeVisible();
    await expect(groups.getByRole('link', { name: '5° B' })).toBeVisible();

    await page.goto('/admin/groups');
    await page.getByLabel('Grupo o colegio').fill('normal');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('2 grupos')).toBeVisible();
  });
});

test('VIEWER can browse groups but not create them', async ({ page }) => {
  const { viewer } = E2E_USERS;
  await login(page, viewer.email, viewer.password);
  await page.goto('/admin/groups');
  await expect(page.getByRole('heading', { name: 'Grupos' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nuevo grupo' })).toHaveCount(0);
  await page.goto('/admin/groups/new');
  await expect(alertIn(page)).toHaveText('No tenés permisos para ver esta sección.');
});
