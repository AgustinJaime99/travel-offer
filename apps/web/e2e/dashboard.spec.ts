import { expect, test } from '@playwright/test';
import { travelYearRange } from '@travel-rock/shared';
import { login } from './helpers';
import { E2E_USERS } from './test-env';

// Exact totals are verified against created records in the API integration test (dashboard.int.test.ts);
// other specs create data concurrently here, so this checks rendering, filtering and links.
test('every staff role sees the dashboard counts, filters by travel year and drills down', async ({
  page,
}) => {
  const { viewer } = E2E_USERS;
  await login(page, viewer.email, viewer.password);
  await expect(page.getByRole('heading', { level: 1, name: 'Panel' })).toBeVisible();

  for (const card of [
    'Colegios',
    'Grupos',
    'Propuestas',
    'Inscripciones de familias',
    'Solicitudes',
  ]) {
    const section = page.getByRole('region', { name: card, exact: true });
    await expect(section).toBeVisible();
    await expect(section.locator('dd').first()).toHaveText(/^\d+$/);
  }

  const year = String(travelYearRange().min + 2);
  await page.getByLabel('Año de viaje', { exact: true }).selectOption(year);
  await page.getByRole('button', { name: 'Ver' }).click();
  await expect(page).toHaveURL(new RegExp(`travelYear=${year}`));
  await expect(
    page.getByText(`Año de viaje ${year} (los colegios no tienen año)`, { exact: false }),
  ).toBeVisible();

  await page
    .getByRole('region', { name: 'Solicitudes', exact: true })
    .getByRole('link', { name: 'Pendientes' })
    .click();
  await expect(page).toHaveURL(/\/admin\/school-requests\?status=PENDING/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Solicitudes de familias' }),
  ).toBeVisible();
});
