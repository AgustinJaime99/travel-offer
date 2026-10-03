import { expect, type Page, test } from '@playwright/test';
import { alertIn, detail, login } from './helpers';
import { E2E_USERS } from './test-env';

async function fillService(page: Page, service: { name: string; category: string; price: string }) {
  await page.getByLabel('Nombre', { exact: true }).fill(service.name);
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: service.category });
  await page.getByLabel('Precio base por pasajero (ARS)').fill(service.price);
}

test('COMMERCIAL builds the service catalog from empty', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'stateful journey runs on desktop only');
  const { commercial } = E2E_USERS;
  await login(page, commercial.email, commercial.password);

  await test.step('create a service with a price in Argentine format', async () => {
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Servicios' })
      .click();
    // Other specs add catalog data in parallel on the shared test DB: never assume it is empty.
    await expect(page.getByRole('heading', { level: 1, name: 'Servicios' })).toBeVisible();
    await page.getByRole('link', { name: 'Nuevo servicio' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo servicio' })).toBeVisible();
    await fillService(page, { name: 'Bus semicama', category: 'Transporte', price: '1.250.000,5' });
    await page.getByRole('button', { name: 'Crear servicio' }).click();
    await expect(page.getByRole('heading', { name: 'Bus semicama' })).toBeVisible();
    await expect(detail(page, 'Precio base')).toHaveText('$ 1.250.000,50 por pasajero');
  });

  await test.step('invalid prices and duplicate names are rejected with field messages', async () => {
    await page.goto('/admin/services/new');
    await fillService(page, { name: 'BUS SEMICAMA', category: 'Otro', price: '12.50' });
    await page.getByRole('button', { name: 'Crear servicio' }).click();
    await expect(
      page.getByText('Ingresá un precio válido, por ejemplo 1.250.000,50.'),
    ).toBeVisible();
    await page.getByLabel('Precio base por pasajero (ARS)').fill('12,50');
    await page.getByRole('button', { name: 'Crear servicio' }).click();
    await expect(page.getByText('Ya existe un servicio con ese nombre.')).toBeVisible();
  });

  await test.step('edit the price and deactivate', async () => {
    await page.goto('/admin/services');
    await page.getByRole('link', { name: 'Bus semicama' }).click();
    await page.getByRole('link', { name: 'Editar' }).click();
    await expect(page.getByLabel('Precio base por pasajero (ARS)')).toHaveValue('1.250.000,50');
    await page.getByLabel('Precio base por pasajero (ARS)').fill('1.300.000');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(detail(page, 'Precio base')).toHaveText('$ 1.300.000,00 por pasajero');

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Desactivar' }).click();
    await expect(detail(page, 'Estado')).toHaveText('Inactivo');
  });

  await test.step('inactive services are not offered by default', async () => {
    await page.goto('/admin/services');
    await expect(page.getByRole('link', { name: 'Bus semicama' })).toHaveCount(0);
    await page.getByLabel('Estado').selectOption({ label: 'Inactivos' });
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('link', { name: 'Bus semicama' })).toBeVisible();
  });
});

test('VIEWER can browse services but not create them', async ({ page }) => {
  const { viewer } = E2E_USERS;
  await login(page, viewer.email, viewer.password);
  await page.goto('/admin/services');
  await expect(page.getByRole('heading', { name: 'Servicios' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nuevo servicio' })).toHaveCount(0);
  await page.goto('/admin/services/new');
  await expect(alertIn(page)).toHaveText('No tenés permisos para ver esta sección.');
});
