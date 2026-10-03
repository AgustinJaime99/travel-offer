import { expect, type Page, test } from '@playwright/test';
import { alertIn, attemptLogin, login, logout } from './helpers';
import { E2E_USERS } from './test-env';

const NEW_COMMERCIAL = { email: 'e2e-comercial@travelrock.test', fullName: 'Comercial E2E' };
const NEW_COMMERCIAL_PASSWORD = 'contraseña del comercial nuevo de e2e';

async function chooseNewPassword(page: Page, current: string, next: string) {
  await expect(page.getByRole('heading', { name: 'Elegí una contraseña nueva' })).toBeVisible();
  await page.getByLabel('Contraseña actual').fill(current);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill(next);
  await page.getByLabel('Repetí la contraseña nueva').fill(next);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('admin pages redirect to login without a session', async ({ page }) => {
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fusers$/);
  await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
});

test('wrong credentials show a generic error', async ({ page }) => {
  await attemptLogin(page, 'nadie@travelrock.test', 'una contraseña cualquiera');
  await expect(alertIn(page)).toHaveText('Email o contraseña incorrectos.');
});

test('staff journey: user creation, forced password change, roles and deactivation', async ({
  page,
}, testInfo) => {
  // One shared database: stateful journeys run once, on desktop.
  test.skip(testInfo.project.name !== 'desktop-chromium', 'stateful journey runs on desktop only');
  const { admin } = E2E_USERS;

  let temporaryPassword = '';
  await test.step('ADMIN (bootstrapped with the CLI) creates a COMMERCIAL user', async () => {
    await login(page, admin.email, admin.password);
    await expect(page.getByText(`Hola, ${admin.fullName}.`)).toBeVisible();
    await page.getByRole('link', { name: 'Usuarios' }).click();
    const form = page.getByRole('form', { name: 'Nuevo usuario' });
    await form.getByLabel('Nombre completo').fill(NEW_COMMERCIAL.fullName);
    await form.getByLabel('Email').fill(NEW_COMMERCIAL.email);
    await form.getByLabel('Rol').selectOption('COMMERCIAL');
    await form.getByRole('button', { name: 'Crear usuario' }).click();
    temporaryPassword = (await page.getByTestId('temporary-password').textContent()) ?? '';
    expect(temporaryPassword).toMatch(/^\w{4}(-\w{4}){3}$/);
    await expect(page.getByRole('cell', { name: NEW_COMMERCIAL.email })).toBeVisible();
    await logout(page);
  });

  await test.step('the new user must change the temporary password and cannot manage users', async () => {
    await login(page, NEW_COMMERCIAL.email, temporaryPassword);
    await chooseNewPassword(page, temporaryPassword, NEW_COMMERCIAL_PASSWORD);
    await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
    await page.goto('/admin/users');
    await expect(alertIn(page)).toHaveText('No tenés permisos para ver esta sección.');
    await logout(page);
  });

  await test.step('ADMIN deactivates the user, who can no longer log in', async () => {
    await login(page, admin.email, admin.password);
    await page.getByRole('link', { name: 'Usuarios' }).click();
    const row = page.getByRole('row', { name: new RegExp(NEW_COMMERCIAL.email) });
    page.once('dialog', (dialog) => void dialog.accept());
    await row.getByRole('button', { name: 'Desactivar' }).click();
    await expect(row.getByRole('cell', { name: 'Inactivo' })).toBeVisible();
    await logout(page);

    await attemptLogin(page, NEW_COMMERCIAL.email, NEW_COMMERCIAL_PASSWORD);
    await expect(alertIn(page)).toHaveText('Email o contraseña incorrectos.');
  });
});
