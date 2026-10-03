import { expect, type Page } from '@playwright/test';

/** Page alerts only: Next.js adds its own role="alert" route announcer outside <main>. */
export const alertIn = (page: Page) => page.getByRole('main').getByRole('alert');

/** Submits the login form without waiting for the outcome (for expected failures). */
export async function attemptLogin(page: Page, email: string, password: string) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Logs in and waits until the app has left the login page (session cookie set). */
export async function login(page: Page, email: string, password: string) {
  await attemptLogin(page, email, password);
  await expect(page).not.toHaveURL(/\/admin\/login/);
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
}

/** Fills the school form; waits for its page because the list page has similarly labeled filters. */
export async function fillSchool(
  page: Page,
  school: { name: string; province: string; city: string; cue?: string },
) {
  await expect(page.getByRole('heading', { name: 'Nuevo colegio' })).toBeVisible();
  await page.getByLabel('Nombre', { exact: true }).fill(school.name);
  await page.getByLabel('Provincia', { exact: true }).selectOption({ label: school.province });
  await page.getByLabel('Localidad', { exact: true }).fill(school.city);
  if (school.cue) await page.getByLabel('CUE (opcional)').fill(school.cue);
}

/** Value of a <dt>/<dd> pair in a detail page. */
export const detail = (page: Page, label: string) =>
  page.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');
