import { expect, type Page, test } from '@playwright/test';
import { travelYearRange } from '@travel-rock/shared';
import { fillSchool, login, logout } from './helpers';
import { E2E_USERS } from './test-env';

const SCHOOL = { name: 'Instituto Patagonia E2E', province: 'Río Negro', city: 'Viedma' };
const SERVICES = [
  { name: 'Transporte E2E', category: 'Transporte', price: '1.100.000' },
  { name: 'Alojamiento E2E', category: 'Alojamiento', price: '1.500.000' },
  { name: 'Excursiones E2E', category: 'Excursiones', price: '500.000' },
];
const VALID_UNTIL = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

const preview = (page: Page) => page.getByRole('complementary', { name: 'Vista previa' });
const breakdownValue = (page: Page, label: string) =>
  page
    .locator('dt', { hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]');

test('acceptance: empty catalog → school → group → services → proposal → publish → new version', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'stateful journey runs on desktop only');
  test.setTimeout(90_000);
  const { commercial, viewer } = E2E_USERS;
  await login(page, commercial.email, commercial.password);

  await test.step('school and group', async () => {
    await page.goto('/admin/schools/new');
    await fillSchool(page, SCHOOL);
    await page.getByRole('button', { name: 'Crear colegio' }).click();
    await page.getByRole('link', { name: '+ Crear grupo' }).click();
    await page.getByLabel('Nombre del grupo').fill('5° A');
    await page.getByLabel('Año de viaje').selectOption(String(travelYearRange().min + 2));
    await page.getByRole('button', { name: 'Crear grupo' }).click();
    await expect(page.getByRole('heading', { name: '5° A' })).toBeVisible();
  });
  const groupUrl = page.url();

  await test.step('services', async () => {
    for (const service of SERVICES) {
      await page.goto('/admin/services/new');
      await expect(page.getByRole('heading', { name: 'Nuevo servicio' })).toBeVisible();
      await page.getByLabel('Nombre', { exact: true }).fill(service.name);
      await page.getByLabel('Categoría', { exact: true }).selectOption({ label: service.category });
      await page.getByLabel('Precio base por pasajero (ARS)').fill(service.price);
      await page.getByRole('button', { name: 'Crear servicio' }).click();
      await expect(page.getByRole('heading', { name: service.name })).toBeVisible();
    }
  });

  await test.step('create the proposal from the group and configure it with a live server preview', async () => {
    await page.goto(groupUrl);
    await expect(page.getByText('Este grupo todavía no tiene propuestas.')).toBeVisible();
    await page.getByRole('button', { name: 'Crear propuesta' }).click();
    await expect(page.getByRole('heading', { name: /versión 1 \(Borrador\)/ })).toBeVisible();

    for (const service of SERVICES) {
      await page.getByLabel('Agregar servicio').fill(service.name.toLowerCase());
      await page
        .getByRole('list', { name: 'Servicios encontrados' })
        .getByRole('button', { name: new RegExp(service.name) })
        .click();
      await expect(page.getByRole('button', { name: `Quitar ${service.name}` })).toBeVisible();
    }
    await page.getByLabel('Descuento comercial (ARS)').fill('100.000');
    await page.getByLabel('Anticipo (ARS)').fill('600.000');
    await page.getByLabel('Cantidad de cuotas').selectOption('18');
    await page.getByLabel('TNA (%)').fill('35');
    await page.getByLabel('Válida hasta').fill(VALID_UNTIL);

    // DOMAIN.md full worked example, calculated by the API.
    await expect(breakdownValue(page, 'Total a pagar')).toHaveText('$ 3.718.927,69');
    await expect(breakdownValue(page, 'TEA')).toHaveText('41,20 %');
    await expect(breakdownValue(page, 'Cuotas')).toHaveText(
      '17 cuotas de $ 173.273,76 y 1 de $ 173.273,77',
    );
    await expect(preview(page).getByText('Precio de contado')).toBeVisible();
  });

  await test.step('a quantity above 1 per student must be unlocked and is flagged', async () => {
    await page.getByRole('button', { name: 'Cambiar cantidad de Excursiones E2E' }).click();
    await page.getByLabel('Cantidad de Excursiones E2E').fill('2');
    await expect(
      page.getByText('Ojo: cada alumno paga 2 veces este precio.', { exact: false }),
    ).toBeVisible();
    await page.getByLabel('Cantidad de Excursiones E2E').fill('1');
    await expect(breakdownValue(page, 'Total a pagar')).toHaveText('$ 3.718.927,69');
  });

  await test.step('price overrides and contract errors are shown by field', async () => {
    const price = page.getByLabel('Precio por pasajero de Transporte E2E');
    await price.fill('1.090.000');
    await expect(page.getByText('Modificado (catálogo: $ 1.100.000,00)')).toBeVisible();
    await expect(breakdownValue(page, 'Precio de contado')).toHaveText('$ 2.990.000,00');
    await price.fill('1.100.000');
    await page.getByLabel('Descuento de Excursiones E2E').fill('600.000');
    await expect(
      page.getByText('El descuento no puede superar el importe de la línea.'),
    ).toBeVisible();
    await page.getByLabel('Descuento de Excursiones E2E').fill('');
    await expect(breakdownValue(page, 'Total a pagar')).toHaveText('$ 3.718.927,69');
  });

  await test.step('save and publish', async () => {
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Borrador guardado.' })).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByRole('heading', { name: /versión 1 \(Publicada\)/ })).toBeVisible();
    await expect(page.getByText(/Publicada el .* por Comercial Catálogo E2E/)).toBeVisible();
    await expect(breakdownValue(page, 'Total a pagar')).toHaveText('$ 3.718.927,69');
  });
  const v1Url = page.url();

  let v2Total = '';
  await test.step('a new version, published, archives the first one', async () => {
    await page.getByRole('button', { name: 'Crear nueva versión' }).click();
    await expect(page.getByRole('heading', { name: /versión 2 \(Borrador\)/ })).toBeVisible();
    // Per-passenger quantities stay at 1 unless explicitly changed.
    await expect(
      page.getByRole('button', { name: 'Cambiar cantidad de Alojamiento E2E' }),
    ).toBeVisible();
    await page.getByLabel('Cantidad de cuotas').selectOption('12');
    await expect(breakdownValue(page, 'Cantidad de cuotas')).toHaveText('12');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByRole('heading', { name: /versión 2 \(Publicada\)/ })).toBeVisible();
    v2Total = (await breakdownValue(page, 'Total a pagar').textContent()) ?? '';

    await page.goto(groupUrl);
    const versions = page.getByRole('region', { name: 'Propuestas' });
    await expect(versions.getByRole('row', { name: /Versión 2 Publicada/ })).toBeVisible();
    await expect(versions.getByRole('row', { name: /Versión 1 Archivada/ })).toBeVisible();
  });

  await test.step('catalog price changes do not alter published prices', async () => {
    await page.goto('/admin/services?q=transporte+e2e');
    await page.getByRole('link', { name: 'Transporte E2E' }).click();
    await page.getByRole('link', { name: 'Editar' }).click();
    await page.getByLabel('Precio base por pasajero (ARS)').fill('999.999');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.goto(groupUrl);
    await page
      .getByRole('region', { name: 'Propuestas' })
      .getByRole('link', { name: 'Versión 2' })
      .click();
    await expect(breakdownValue(page, 'Total a pagar')).toHaveText(v2Total);
    await page.goto(v1Url);
    await expect(breakdownValue(page, 'Total a pagar')).toHaveText('$ 3.718.927,69');
  });

  await test.step('VIEWER sees the proposal read-only', async () => {
    await logout(page);
    await login(page, viewer.email, viewer.password);
    await page.goto(v1Url);
    await expect(page.getByRole('heading', { name: /versión 1 \(Archivada\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear nueva versión' })).toHaveCount(0);
    await page.goto(groupUrl);
    await expect(page.getByRole('button', { name: 'Crear propuesta' })).toHaveCount(0);
  });
});
