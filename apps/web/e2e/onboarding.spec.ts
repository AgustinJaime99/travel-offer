import { expect, type Page, test } from '@playwright/test';
import { travelYearRange } from '@travel-rock/shared';
import { alertIn } from './helpers';
import { createSchoolWithGroup, latestCodeFor } from './public-helpers';

const SCHOOL = { name: 'Colegio Nacional Onboarding E2E', province: 'SALTA', city: 'Salta' };
const YEAR = travelYearRange().min + 2;

const step = (page: Page, name: string) =>
  expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

/** Decorative backdrop (NEXT_PUBLIC_ONBOARDING_3D=1 in the E2E build); hidden from assistive tech. */
const backdrop = (page: Page) => page.getByTestId('onboarding-backdrop');
const scene = (page: Page, id: string) => expect(backdrop(page)).toHaveAttribute('data-scene', id);

test('a family registers interest on a phone: verify email, find school and group, consent, submit', async ({
  page,
}, testInfo) => {
  // Mobile-first flow: the stateful journey runs once, on the phone profile.
  test.skip(testInfo.project.name !== 'mobile-chromium', 'onboarding journey runs on mobile');
  test.setTimeout(90_000);
  await createSchoolWithGroup(SCHOOL, '5° A');
  const email = `familia-${Date.now()}@example.com`;

  await test.step('welcome and privacy notice', async () => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Registrar el interés en el viaje' }).click();
    await expect(page).toHaveURL(/\/onboarding\?paso=bienvenida$/);
    await expect(page.getByText('Paso 1 de 7')).toBeVisible();
    await scene(page, 'preparacion');
    await expect(backdrop(page)).toHaveAttribute('aria-hidden', 'true');
    await page.getByRole('button', { name: 'Empezar' }).click();
    await expect(
      page.getByText('Para continuar tenés que aceptar el aviso de privacidad.'),
    ).toBeVisible();
    await page.getByLabel(/Leí y acepto el aviso de privacidad/).check();
    await page.getByRole('button', { name: 'Empezar' }).click();
  });

  await test.step('contact and email code (read from Mailpit)', async () => {
    await step(page, 'Tus datos de contacto');
    await page.getByRole('button', { name: 'Enviarme el código' }).click();
    await expect(page.getByText('Ingresá un email válido.')).toBeVisible();
    await page.getByLabel('Tu nombre y apellido').fill('María Pérez');
    await page.getByLabel('Tu email').fill(email);
    await page.getByRole('button', { name: 'Enviarme el código' }).click();
    await step(page, 'Revisá tu email');
    await page.getByLabel('Código').fill('000000');
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(alertIn(page)).toHaveText('El código es incorrecto o venció. Pedí uno nuevo.');
    // The test environment sets OTP_FIXED_CODE=123456 (the email is still sent to Mailpit).
    expect(await latestCodeFor(email)).toBe('123456');
    await page.getByLabel('Código').fill('123456');
    await page.getByRole('button', { name: 'Verificar' }).click();
    await step(page, 'Datos del alumno');
  });

  await test.step('a refresh keeps the progress', async () => {
    await page.reload();
    await step(page, 'Datos del alumno');
  });

  await test.step('student, location, school and group', async () => {
    await page.getByLabel('Soy madre, padre o tutor/a del alumno').check();
    await page.getByLabel('Nombre del alumno').fill('Juan');
    await page.getByLabel('Apellido del alumno').fill('Pérez');
    await page.getByRole('button', { name: 'Continuar' }).click();

    await step(page, '¿Dónde queda el colegio?');
    await scene(page, 'partida');
    await page.getByLabel('Provincia del colegio').selectOption('SALTA');
    await page.getByRole('button', { name: 'Continuar' }).click();

    await step(page, 'Buscá el colegio');
    await scene(page, 'ruta');
    await page.getByLabel('Nombre del colegio').fill('nacional onboarding');
    await page
      .getByRole('list', { name: 'Colegios encontrados' })
      .getByRole('button', { name: new RegExp(SCHOOL.name) })
      .click();

    await step(page, 'Elegí el grupo');
    await page
      .getByRole('list', { name: 'Grupos del colegio' })
      .getByRole('button', { name: `5° A · viaje ${YEAR}` })
      .click();
    await step(page, 'Revisá y confirmá');
    await scene(page, 'destino');
  });

  await test.step('browser back and forward move between steps', async () => {
    await page.goBack();
    await step(page, 'Elegí el grupo');
    await page.goForward();
    await step(page, 'Revisá y confirmá');
  });

  await test.step('explicit consent and submission', async () => {
    await expect(page.getByText('Juan Pérez')).toBeVisible();
    await expect(page.getByText(`5° A · viaje ${YEAR}`)).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Tenés que aceptar para continuar.')).toBeVisible();
    await page.getByLabel(/Registrar el interés no es una reserva/).check();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await step(page, '¡Listo!');
    await scene(page, 'llegada');
    await expect(page.getByRole('status')).toContainText('Registramos el interés de Juan Pérez');
    await expect(
      page.getByText('No es una reserva ni un compromiso de pago.', { exact: false }),
    ).toBeVisible();
  });

  await test.step('a sibling with the same account, without verifying again', async () => {
    await page.getByRole('button', { name: 'Registrar a otro alumno' }).click();
    await step(page, 'Datos del alumno');
    await expect(page.getByLabel('Nombre del alumno')).toHaveValue('');
  });

  await test.step('a returning family signs in with a new code', async () => {
    await page.context().clearCookies();
    await page.goto('/ingresar');
    await page.getByLabel('Tu email').fill(email);
    await page.getByRole('button', { name: 'Enviarme el código' }).click();
    await step(page, 'Revisá tu email');
    // Wait for the new email (the first code was already used).
    await expect.poll(() => latestCodeFor(email)).not.toBe('');
    await page.getByLabel('Código').fill(await latestCodeFor(email));
    await page.getByRole('button', { name: 'Verificar' }).click();
    await step(page, 'Mis viajes');
    await expect(page.getByText('Juan Pérez')).toBeVisible();
  });
});

test.describe('decorative backdrop', () => {
  test('keeps the title focused and the form usable; still frame with reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/onboarding');
    await step(page, 'Viaje de egresados');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(backdrop(page)).toHaveAttribute('data-mode', /^(static|fallback)$/);
    await expect(backdrop(page)).toHaveAttribute('aria-hidden', 'true');
    await page.getByLabel(/Leí y acepto el aviso de privacidad/).check();
    await page.getByRole('button', { name: 'Empezar' }).click();
    await step(page, 'Tus datos de contacto');
    await scene(page, 'preparacion');
  });

  test('falls back to a static illustration without WebGL', async ({ page }) => {
    await page.addInitScript(() => {
      const prototype = HTMLCanvasElement.prototype;
      const original = Reflect.get(prototype, 'getContext') as (...args: unknown[]) => unknown;
      Reflect.set(prototype, 'getContext', function (this: HTMLCanvasElement, ...args: unknown[]) {
        return String(args[0]).startsWith('webgl') ? null : original.apply(this, args);
      });
    });
    await page.goto('/onboarding');
    await step(page, 'Viaje de egresados');
    await expect(backdrop(page)).toHaveAttribute('data-mode', 'fallback');
    await expect(backdrop(page).locator('canvas')).toHaveCount(0);
    await expect(backdrop(page).locator('svg')).toBeVisible();
  });
});
