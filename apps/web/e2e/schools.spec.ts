import { expect, test } from '@playwright/test';
import { alertIn, detail, fillSchool, login } from './helpers';
import { E2E_USERS } from './test-env';

test('COMMERCIAL builds the school catalog from empty', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'stateful journey runs on desktop only');
  const { commercial } = E2E_USERS;
  await login(page, commercial.email, commercial.password);

  await test.step('create a school', async () => {
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Colegios' })
      .click();
    // Other specs add catalog data in parallel on the shared test DB: never assume it is empty.
    await expect(page.getByRole('heading', { level: 1, name: 'Colegios' })).toBeVisible();
    await page.getByRole('link', { name: 'Nuevo colegio' }).click();
    await fillSchool(page, {
      name: 'Colegio San Martín',
      province: 'Córdoba',
      city: 'Villa María',
      cue: '14-01234-00',
    });
    await page.getByRole('button', { name: 'Crear colegio' }).click();
    await expect(page.getByRole('heading', { name: 'Colegio San Martín' })).toBeVisible();
    await expect(detail(page, 'CUE')).toHaveText('140123400');
  });

  await test.step('search without accents finds it', async () => {
    await page.getByRole('link', { name: '← Colegios' }).click();
    await page.getByLabel('Nombre o CUE').fill('san martin');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(/q=san\+martin/);
    await expect(page.getByRole('link', { name: 'Colegio San Martín' })).toBeVisible();
  });

  await test.step('a similar school triggers the duplicate warning, then can be saved anyway', async () => {
    await page.getByRole('link', { name: 'Nuevo colegio' }).click();
    await fillSchool(page, {
      name: 'Colegio Gral. San Martín',
      province: 'Córdoba',
      city: 'Villa Maria',
    });
    await page.getByRole('button', { name: 'Crear colegio' }).click();
    const warning = alertIn(page);
    await expect(warning).toContainText('Puede que este colegio ya esté cargado');
    await expect(warning.getByRole('link', { name: 'Colegio San Martín' })).toBeVisible();
    await page.getByRole('button', { name: 'Guardar de todas formas' }).click();
    await expect(page.getByRole('heading', { name: 'Colegio Gral. San Martín' })).toBeVisible();
  });

  await test.step('edit and deactivate', async () => {
    await page.getByRole('link', { name: 'Editar' }).click();
    await page.getByLabel('Dirección (opcional)').fill('Bv. España 123');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(detail(page, 'Dirección')).toHaveText('Bv. España 123');

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Desactivar' }).click();
    await expect(detail(page, 'Estado')).toHaveText('Inactivo');
  });

  await test.step('inactive schools only appear when filtering for them', async () => {
    await page.getByRole('link', { name: '← Colegios' }).click();
    await expect(page.getByRole('link', { name: 'Colegio San Martín', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Colegio Gral. San Martín' })).toHaveCount(0);
    await page.getByLabel('Estado').selectOption({ label: 'Inactivos' });
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('link', { name: 'Colegio Gral. San Martín' })).toBeVisible();
  });
});

test('VIEWER can browse schools but not create or edit them', async ({ page }) => {
  const { viewer } = E2E_USERS;
  await login(page, viewer.email, viewer.password);
  await page.goto('/admin/schools');
  await expect(page.getByRole('heading', { name: 'Colegios' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nuevo colegio' })).toHaveCount(0);
  await page.goto('/admin/schools/new');
  await expect(alertIn(page)).toHaveText('No tenés permisos para ver esta sección.');
});
