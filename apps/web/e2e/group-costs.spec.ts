import { expect, test } from '@playwright/test';
import { travelYearRange } from '@travel-rock/shared';
import { login } from './helpers';
import { staffCookie, staffPost } from './public-helpers';
import { E2E_USERS } from './test-env';

const VALID_UNTIL = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

test('a group cost is divided among the passengers and shown per student', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'stateful journey runs on desktop only');
  test.setTimeout(60_000);
  const tag = Date.now().toString(36);

  await test.step('a per-group service is created from the service form', async () => {
    await login(page, E2E_USERS.commercial.email, E2E_USERS.commercial.password);
    await page.goto('/admin/services/new');
    await page.getByLabel('Nombre', { exact: true }).fill(`Micro charter ${tag}`);
    await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Transporte' });
    await page.getByLabel('Por grupo').check();
    await page.getByLabel('Precio del grupo completo (ARS)').fill('30000000');
    await page.getByRole('button', { name: 'Crear servicio' }).click();
    await expect(page.getByRole('heading', { name: `Micro charter ${tag}` })).toBeVisible();
  });

  const cookie = await staffCookie();
  const school = await staffPost(cookie, '/schools', {
    name: `Colegio Costos ${tag}`,
    province: 'SALTA',
    city: 'Salta',
  });
  const group = await staffPost(cookie, '/school-groups', {
    schoolId: school.id,
    name: '5° A',
    travelYear: travelYearRange().min + 2,
    estimatedStudents: 30,
  });
  await staffPost(cookie, '/services', {
    name: `Hotel ${tag}`,
    category: 'LODGING',
    basePriceMinor: '150000000',
  });

  await test.step('the builder pre-fills the passengers and shows the share per student', async () => {
    await page.goto(`/admin/groups/${group.id}`);
    await page.getByRole('button', { name: 'Crear propuesta' }).click();
    await expect(page.getByRole('heading', { name: /versión 1 \(Borrador\)/ })).toBeVisible();
    for (const name of [`Micro charter ${tag}`, `Hotel ${tag}`]) {
      await page.getByLabel('Agregar servicio').fill(name.toLowerCase());
      await page
        .getByRole('list', { name: 'Servicios encontrados' })
        .getByRole('button', { name: new RegExp(name) })
        .click();
      await expect(page.getByRole('button', { name: `Quitar ${name}` })).toBeVisible();
    }
    await expect(page.getByLabel('Pasajeros para dividir los costos del grupo')).toHaveValue('30');
    await page.getByLabel('Cantidad de cuotas').selectOption('6');
    await page.getByLabel('TNA (%)').fill('0');
    await page.getByLabel('Válida hasta').fill(VALID_UNTIL);
    // Shares come from the server preview, once the plan is complete.
    await expect(page.getByText('Por alumno: $ 1.000.000,00')).toBeVisible();
    await expect(
      page
        .getByRole('complementary', { name: 'Vista previa' })
        .locator('dt', { hasText: /^Precio de contado$/ })
        .locator('xpath=following-sibling::dd[1]'),
    ).toHaveText('$ 2.500.000,00');

    // Changing the divisor changes every share.
    await page.getByLabel('Pasajeros para dividir los costos del grupo').fill('7');
    await expect(page.getByText('Por alumno: $ 4.285.714,29')).toBeVisible();
    await page.getByLabel('Pasajeros para dividir los costos del grupo').fill('30');
  });

  await test.step('published: the version keeps the division', async () => {
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Borrador guardado.' })).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByRole('heading', { name: /versión 1 \(Publicada\)/ })).toBeVisible();
    await expect(
      page.getByText('Los costos del grupo se dividen entre 30 pasajeros', { exact: false }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('row', { name: new RegExp(`Micro charter ${tag}`) })
        .getByRole('cell')
        .last(),
    ).toHaveText('$ 1.000.000,00');
  });
});
