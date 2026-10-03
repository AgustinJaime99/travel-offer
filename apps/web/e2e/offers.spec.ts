import { expect, type Page, test } from '@playwright/test';
import { alertIn } from './helpers';
import { createSchoolWithGroup, latestCodeFor } from './public-helpers';

/** Fast path through the onboarding UI (the full journey is covered in onboarding.spec.ts). */
async function registerInterest(page: Page, school: string, accessCode?: string) {
  const email = `familia-${school.replace(/\W/g, '').toLowerCase()}-${Date.now()}@example.com`;
  await page.goto('/onboarding');
  await page.getByLabel(/Leí y acepto el aviso de privacidad/).check();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.getByLabel('Tu nombre y apellido').fill('Familia E2E');
  await page.getByLabel('Tu email').fill(email);
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.getByLabel('Código')).toBeVisible();
  await page.getByLabel('Código').fill(await latestCodeFor(email));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await page.getByLabel('Soy madre, padre o tutor/a del alumno').check();
  await page.getByLabel('Nombre del alumno').fill('Lucía');
  await page.getByLabel('Apellido del alumno').fill('Gómez');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Provincia del colegio').selectOption('JUJUY');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Nombre del colegio').fill(school);
  await page
    .getByRole('list', { name: 'Colegios encontrados' })
    .getByRole('button', { name: new RegExp(school) })
    .click();
  await page.getByRole('list', { name: 'Grupos del colegio' }).getByRole('button').first().click();
  if (accessCode) await page.getByLabel('Código del grupo (opcional)').fill(accessCode);
  await page.getByLabel(/Registrar el interés no es una reserva/).check();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '¡Listo!' })).toBeVisible();
}

const breakdownValue = (page: Page, label: string) =>
  page
    .locator('dt', { hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]');

async function expectWorkedExample(page: Page) {
  await expect(breakdownValue(page, 'Precio de contado')).toHaveText('$ 3.000.000,00');
  await expect(breakdownValue(page, 'Anticipo')).toHaveText('$ 600.000,00');
  await expect(breakdownValue(page, 'Monto financiado')).toHaveText('$ 2.400.000,00');
  await expect(breakdownValue(page, 'TNA')).toHaveText('35,00 %');
  await expect(breakdownValue(page, 'TEA')).toHaveText('41,20 %');
  await expect(breakdownValue(page, 'CFT')).toHaveText('41,20 %');
  await expect(breakdownValue(page, 'Cuotas')).toHaveText(
    '17 cuotas de $ 173.273,76 y 1 de $ 173.273,77',
  );
  await expect(breakdownValue(page, 'Total a pagar')).toHaveText('$ 3.718.927,69');
  await expect(page.getByText(/Válida hasta el/)).toBeVisible();
}

test.describe('the family sees the group offer only with its access code', () => {
  test.skip(({ isMobile }) => !isMobile, 'stateful public journeys run on mobile');

  test('code given at registration: the offer is available right away', async ({ page }) => {
    const school = 'Escuela Ofertas Uno E2E';
    const { accessCode } = await createSchoolWithGroup(
      { name: school, province: 'JUJUY', city: 'Tilcara' },
      '5° A',
      {
        accessCode: true,
        publishedProposal: true,
      },
    );
    await registerInterest(page, school, accessCode!.toLowerCase());
    await page.getByRole('link', { name: 'Ver la propuesta' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Propuesta para 5° A' }),
    ).toBeVisible();
    await expectWorkedExample(page);

    // Every tier up to the maximum (18) is offered; the family says which one it prefers.
    for (const option of [
      'Contado',
      'En 3 cuotas',
      'En 6 cuotas',
      'En 12 cuotas',
      'En 18 cuotas',
    ]) {
      await expect(page.getByRole('radio', { name: new RegExp(`^${option}:`) })).toBeAttached();
    }
    // The whole card is the radio's label: tapping it chooses the option.
    await page.getByText('En 6 cuotas', { exact: true }).click();
    await expect(page.getByRole('radio', { name: /^En 6 cuotas:/ })).toBeChecked();
    await page.getByRole('button', { name: 'Me interesa en 6 cuotas' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Le avisamos a tu asesor que te interesa pagar en 6 cuotas.',
    );
    await page.reload();
    await expect(page.getByRole('radio', { name: /^En 6 cuotas:/ })).toBeChecked();

    await page.getByRole('link', { name: '← Mis viajes' }).click();
    await expect(page.getByText('Propuesta disponible')).toBeVisible();
  });

  test('code entered later: CODE_REQUIRED, a wrong code, then the offer', async ({ page }) => {
    const school = 'Escuela Ofertas Dos E2E';
    const { accessCode } = await createSchoolWithGroup(
      { name: school, province: 'JUJUY', city: 'Humahuaca' },
      '5° B',
      {
        accessCode: true,
        publishedProposal: true,
      },
    );
    await registerInterest(page, school);
    await expect(page.getByText(/Cuando tu asesor te dé el código del grupo/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver la propuesta' })).toHaveCount(0);

    await page.goto('/mis-viajes');
    await page.getByRole('link', { name: /Falta el código del grupo/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Ingresá el código del grupo' }),
    ).toBeVisible();
    await page.getByLabel('Código del grupo').fill('ZZZZ-ZZZZ');
    await page.getByRole('button', { name: 'Ver la propuesta' }).click();
    await expect(alertIn(page)).toHaveText(
      'El código no es válido para este grupo. Revisalo con tu asesor.',
    );
    await page.getByLabel('Código del grupo').fill(accessCode!);
    await page.getByRole('button', { name: 'Ver la propuesta' }).click();
    await expectWorkedExample(page);
  });

  test('valid code but nothing published: the offer is being prepared', async ({ page }) => {
    const school = 'Escuela Ofertas Tres E2E';
    const { accessCode } = await createSchoolWithGroup(
      { name: school, province: 'JUJUY', city: 'Purmamarca' },
      '5° C',
      {
        accessCode: true,
      },
    );
    await registerInterest(page, school, accessCode!);
    await expect(
      page.getByText('Tu propuesta se está preparando.', { exact: false }),
    ).toBeVisible();
  });
});
