import { randomUUID } from 'node:crypto';
import { type Browser, devices, expect, type Page, test } from '@playwright/test';
import { CONSENT_TEXT_VERSION } from '@travel-rock/shared';
import { activate, api } from '../global-setup';
import { alertIn, login } from '../helpers';
import { createSchoolWithGroup, staffCookie, staffPost } from '../public-helpers';
import { apiTestUrl, E2E_USERS } from '../test-env';
import {
  addServices,
  chooseSchoolAndGroup,
  confirmInterest,
  familyEmail,
  familyPhone,
  heading,
  inDays,
  publish,
  toSchoolSearch,
  valueOf,
  verifyFamily,
  expireProposal,
} from './journey-helpers';

// Phase 13 negative cases, after the business journeys, on the same clean database.

const { admin } = E2E_USERS;
const COMMERCIAL = {
  email: 'e2e-recorrido-comercial@travelrock.test',
  fullName: 'Comercial Recorrido',
  role: 'COMMERCIAL',
  password: 'contraseña comercial del recorrido',
};
const VIEWER = {
  email: 'e2e-recorrido-lectura@travelrock.test',
  fullName: 'Lectura Recorrido',
  role: 'VIEWER',
  password: 'contraseña de lectura del recorrido',
};
const DENIED = 'No tenés permisos para ver esta sección.';

// Runs again if a failure restarts the worker: the accounts may already exist.
test.beforeAll('the ADMIN invites a COMMERCIAL and a VIEWER', async () => {
  const adminCookie = await staffCookie(admin);
  const existing = (await (
    await fetch(`${apiTestUrl}/api/admin/users`, { headers: { cookie: adminCookie } })
  ).json()) as { items: { email: string }[] };
  for (const user of [COMMERCIAL, VIEWER]) {
    if (existing.items.some(({ email }) => email === user.email)) continue;
    const created = await api(
      '/users',
      { email: user.email, fullName: user.fullName, role: user.role },
      adminCookie,
    );
    const { temporaryPassword } = (await created.json()) as { temporaryPassword: string };
    await activate(user.email, temporaryPassword, user.password);
  }
});

/** A same-origin JSON request from the page's own session (as the browser app would send it). */
function sameOrigin(page: Page) {
  const origin = new URL(page.url()).origin;
  return {
    get: (path: string) => page.request.get(path),
    post: (path: string, data: object = {}) =>
      page.request.post(path, { data, headers: { Origin: origin } }),
  };
}

async function staffDesktop(browser: Browser, user: { email: string; password: string }) {
  const context = await browser.newContext({ ...devices['Desktop Chrome'] });
  const page = await context.newPage();
  await login(page, user.email, user.password);
  return page;
}

test('a group that is not in the selected school is never offered nor accepted', async ({
  browser,
}) => {
  const north = await createSchoolWithGroup(
    { name: 'Colegio Negativo Norte', province: 'JUJUY', city: 'La Quiaca' },
    '5° N',
    { as: admin },
  );
  const south = await createSchoolWithGroup(
    { name: 'Colegio Negativo Sur', province: 'JUJUY', city: 'Palpalá' },
    '5° S',
    { as: admin },
  );
  const family = await familyPhone(browser);
  await verifyFamily(family, familyEmail('grupo-ajeno'));
  await toSchoolSearch(family, 'JUJUY');
  await family.getByLabel('Nombre del colegio').fill('negativo norte');
  await family
    .getByRole('list', { name: 'Colegios encontrados' })
    .getByRole('button', { name: /Colegio Negativo Norte/ })
    .click();
  const groups = family.getByRole('list', { name: 'Grupos del colegio' });
  await expect(groups.getByRole('button', { name: /^5° N/ })).toBeVisible();
  await expect(groups.getByRole('button', { name: /^5° S/ })).toHaveCount(0);

  // A tampered request pairing the north school with the south group.
  const response = await sameOrigin(family).post('/api/public/enrollments', {
    idempotencyKey: randomUUID(),
    schoolId: north.schoolId,
    schoolGroupId: south.groupId,
    studentFirstName: 'Sofía',
    studentLastName: 'Recorrido',
    relationship: 'GUARDIAN',
    consentTextVersion: CONSENT_TEXT_VERSION,
    consent: true,
  });
  expect(response.status()).toBe(400);
  expect(await response.text()).toContain('El grupo no corresponde al colegio elegido.');
  const own = (await (await sameOrigin(family).get('/api/public/enrollments')).json()) as {
    items: unknown[];
  };
  expect(own.items).toHaveLength(0);
  await family.context().close();
});

test('invalid pricing is rejected by the server and nothing is published', async ({ page }) => {
  test.setTimeout(90_000);
  const { groupId } = await createSchoolWithGroup(
    { name: 'Colegio Precio Inválido', province: 'CHACO', city: 'Resistencia' },
    '5° P',
    { as: admin },
  );
  const cookie = await staffCookie(admin);
  await staffPost(cookie, '/services', {
    name: 'Paquete Precio Inválido',
    category: 'OTHER',
    basePriceMinor: '100000000',
  });
  await login(page, admin.email, admin.password);
  await page.goto(`/admin/groups/${groupId}`);
  await page.getByRole('button', { name: 'Crear propuesta' }).click();
  await heading(page, /versión 1 \(Borrador\)/);

  await test.step('publishing an empty draft', async () => {
    await publish(page);
    await expect(page.getByText('Agregá al menos un servicio.')).toBeVisible();
  });

  await addServices(page, ['Paquete Precio Inválido']);
  await page.getByLabel('Cantidad de cuotas').selectOption('12');

  await test.step('TNA above the 66 % cap', async () => {
    await page.getByLabel('TNA (%)').fill('70');
    await expect(page.getByText('La TNA tiene que estar entre 0 % y 66 %.')).toBeVisible();
    await page.getByLabel('TNA (%)').fill('30');
  });

  await test.step('down payment above the cash price', async () => {
    await page.getByLabel('Anticipo (ARS)').fill('1.500.000');
    await expect(
      page.getByText('El anticipo no puede superar el precio de contado.'),
    ).toBeVisible();
    await publish(page);
    await expect(
      page.getByText('El anticipo no puede superar el precio de contado.'),
    ).toBeVisible();
    await page.getByLabel('Anticipo (ARS)').fill('100.000');
  });

  await test.step('installments below the $ 100.000,00 minimum', async () => {
    // $ 900.000 financed at 30 % TNA: 12 installments are below the minimum, 10 is the maximum.
    const minimum =
      'Cada cuota tiene que ser de al menos $ 100.000,00: con este monto financiado, hasta 10 cuotas.';
    await expect(page.getByText(minimum)).toBeVisible();
    await publish(page);
    await expect(page.getByText(minimum)).toBeVisible();
    await page.getByLabel('Cantidad de cuotas').selectOption('8');
    await expect(valueOf(page, 'Cuotas')).toHaveText(
      '7 cuotas de $ 125.520,61 y 1 de $ 125.520,62',
    );
  });

  await test.step('a validity date that is not in the future', async () => {
    await publish(page);
    await expect(page.getByText('Indicá hasta cuándo es válida la propuesta.')).toBeVisible();
    await page.getByLabel('Válida hasta').fill(inDays(-1));
    await publish(page);
    await expect(page.getByText('La fecha de vencimiento tiene que ser futura.')).toBeVisible();
  });

  await page.reload();
  await heading(page, /versión 1 \(Borrador\)/);
  await page.goto(`/admin/groups/${groupId}`);
  await expect(
    page.getByRole('region', { name: 'Propuestas' }).getByRole('row', { name: /Publicada/ }),
  ).toHaveCount(0);
});

test('invalid or rotated access codes do not open the offer', async ({ browser }) => {
  test.setTimeout(90_000);
  const { groupId, accessCode } = await createSchoolWithGroup(
    { name: 'Colegio Código Inválido', province: 'FORMOSA', city: 'Clorinda' },
    '5° K',
    { as: admin, accessCode: true, publishedProposal: true },
  );
  const family = await familyPhone(browser);
  await verifyFamily(family, familyEmail('codigo'));
  await toSchoolSearch(family, 'FORMOSA');
  await chooseSchoolAndGroup(
    family,
    { search: 'codigo invalido', school: 'Colegio Código Inválido' },
    '5° K',
  );

  await test.step('a wrong code at registration is rejected; the interest is kept without it', async () => {
    await confirmInterest(family, 'ZZZZ-ZZZZ');
    await expect(
      family.getByText('El código no es válido para este grupo. Revisalo con tu asesor.'),
    ).toBeVisible();
    await heading(family, 'Revisá y confirmá');
    await family.getByLabel('Código del grupo (opcional)').fill('');
    await family.getByRole('button', { name: 'Confirmar' }).click();
    await heading(family, '¡Listo!');
    await expect(family.getByText(/Cuando tu asesor te dé el código del grupo/)).toBeVisible();
    await expect(family.getByRole('link', { name: 'Ver la propuesta' })).toHaveCount(0);
  });

  const rotated = await staffPost<{ accessCode: string }>(
    await staffCookie(admin),
    `/school-groups/${groupId}/access-code`,
    {},
  );

  await test.step('after staff rotates the code, the old one no longer works', async () => {
    await family.goto('/mis-viajes');
    await family.getByRole('link', { name: /Falta el código del grupo/ }).click();
    await heading(family, 'Ingresá el código del grupo');
    await family.getByLabel('Código del grupo').fill(accessCode!);
    await family.getByRole('button', { name: 'Ver la propuesta' }).click();
    await expect(alertIn(family)).toHaveText(
      'El código no es válido para este grupo. Revisalo con tu asesor.',
    );
    await family.getByLabel('Código del grupo').fill(rotated.accessCode);
    await family.getByRole('button', { name: 'Ver la propuesta' }).click();
    await heading(family, 'Propuesta para 5° K');
  });
  await family.context().close();
});

test('admin actions are refused without a session, to families and to insufficient roles', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const { proposalId } = await createSchoolWithGroup(
    { name: 'Colegio Permisos', province: 'LA_PAMPA', city: 'Santa Rosa' },
    '5° R',
    { as: admin, publishedProposal: true },
  );

  await test.step('anonymous visitors', async () => {
    await page.goto(`/admin/proposals/${proposalId}`);
    await expect(page).toHaveURL(/\/admin\/login\?next=/);
    expect((await sameOrigin(page).get('/api/admin/schools')).status()).toBe(401);
    expect(
      (await sameOrigin(page).post(`/api/admin/proposals/${proposalId}/versions`)).status(),
    ).toBe(401);
  });

  await test.step('a verified family session is not a staff session', async () => {
    const family = await familyPhone(browser);
    await verifyFamily(family, familyEmail('permisos'));
    expect((await sameOrigin(family).get('/api/admin/schools')).status()).toBe(401);
    expect((await sameOrigin(family).post('/api/admin/schools', {})).status()).toBe(401);
    await family.context().close();
  });

  await test.step('VIEWER reads but cannot change anything', async () => {
    const viewer = await staffDesktop(browser, VIEWER);
    await viewer.goto(`/admin/proposals/${proposalId}`);
    await heading(viewer, /versión 1 \(Publicada\)/);
    await expect(viewer.getByRole('button', { name: 'Crear nueva versión' })).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Retirar publicación' })).toHaveCount(0);
    for (const path of ['/admin/schools/new', '/admin/groups/new', '/admin/services/new']) {
      await viewer.goto(path);
      await expect(alertIn(viewer)).toHaveText(DENIED);
    }
    const api = sameOrigin(viewer);
    expect((await api.post(`/api/admin/proposals/${proposalId}/versions`)).status()).toBe(403);
    expect((await api.post(`/api/admin/proposals/${proposalId}/archive`)).status()).toBe(403);
    expect(
      (await api.post('/api/admin/schools', { name: 'X', province: 'SALTA', city: 'Y' })).status(),
    ).toBe(403);
    await viewer.context().close();
  });

  await test.step('COMMERCIAL cannot manage staff users', async () => {
    const commercial = await staffDesktop(browser, COMMERCIAL);
    await commercial.goto('/admin/users');
    await expect(alertIn(commercial)).toHaveText(DENIED);
    const response = await sameOrigin(commercial).post('/api/admin/users', {
      email: 'intruso@travelrock.test',
      fullName: 'Intruso',
      role: 'ADMIN',
    });
    expect(response.status()).toBe(403);
    await commercial.context().close();
  });

  // Nothing above changed the published version.
  await page.goto('/admin/login');
  await login(page, admin.email, admin.password);
  await page.goto(`/admin/proposals/${proposalId}`);
  await heading(page, /versión 1 \(Publicada\)/);
});

/** Waits until each page shows either the published heading or the conflict message. */
async function outcomeOf(page: Page, published: RegExp, conflict: string) {
  const won = page.getByRole('heading', { level: 1, name: published });
  const lost = page.getByText(conflict);
  await expect(won.or(lost)).toBeVisible();
  return (await won.isVisible()) ? 'won' : 'lost';
}

test('two staff members acting at the same time: one draft, one publication', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { groupId } = await createSchoolWithGroup(
    { name: 'Colegio Concurrencia', province: 'MISIONES', city: 'Oberá' },
    '5° X',
    { as: admin },
  );
  const first = await staffDesktop(browser, admin);
  const second = await staffDesktop(browser, COMMERCIAL);

  let draftUrl = '';
  await test.step('simultaneous "Crear propuesta": only one draft is created', async () => {
    await Promise.all([first, second].map((page) => page.goto(`/admin/groups/${groupId}`)));
    await Promise.all(
      [first, second].map((page) => page.getByRole('button', { name: 'Crear propuesta' }).click()),
    );
    const conflict = 'El grupo ya tiene un borrador. Editalo o descartalo antes de crear otro.';
    const outcomes = await Promise.all(
      [first, second].map((page) => outcomeOf(page, /versión 1 \(Borrador\)/, conflict)),
    );
    expect([...outcomes].sort()).toEqual(['lost', 'won']);
    draftUrl = (outcomes[0] === 'won' ? first : second).url();
    expect(draftUrl).toMatch(/\/admin\/proposals\//);
  });

  await test.step('the draft is completed and saved', async () => {
    await first.goto(draftUrl);
    await addServices(first, ['Paquete Precio Inválido']);
    await first.getByLabel('Cantidad de cuotas').selectOption('6');
    await first.getByLabel('TNA (%)').fill('0');
    await first.getByLabel('Válida hasta').fill(inDays(30));
    await first.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(first.getByRole('status').filter({ hasText: 'Borrador guardado.' })).toBeVisible();
    await second.goto(draftUrl);
    await heading(second, /versión 1 \(Borrador\)/);
    await first.reload();
    await heading(first, /versión 1 \(Borrador\)/);
  });

  await test.step('publishing a draft that someone else changed meanwhile is refused', async () => {
    await first.getByLabel('Cantidad de cuotas').selectOption('3');
    await first.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(first.getByRole('status').filter({ hasText: 'Borrador guardado.' })).toBeVisible();
    // `second` still shows 6 installments: it must not publish prices its user never saw.
    await publish(second);
    await expect(
      second.getByText(
        'Alguien más modificó este borrador. Recargá la página para ver los cambios.',
      ),
    ).toBeVisible();
    await heading(second, /versión 1 \(Borrador\)/);
    await Promise.all([first, second].map((page) => page.reload()));
    await expect(second.getByLabel('Cantidad de cuotas')).toHaveValue('3');
  });

  await test.step('simultaneous "Publicar": exactly one succeeds', async () => {
    await Promise.all([first, second].map((page) => publish(page)));
    const outcomes = await Promise.all(
      [first, second].map((page) =>
        outcomeOf(
          page,
          /versión 1 \(Publicada\)/,
          'La propuesta está publicada: para cambiarla creá una nueva versión.',
        ),
      ),
    );
    expect([...outcomes].sort()).toEqual(['lost', 'won']);
    await first.goto(`/admin/groups/${groupId}`);
    const versions = first.getByRole('region', { name: 'Propuestas' });
    await expect(versions.getByRole('row', { name: /Publicada/ })).toHaveCount(1);
    await expect(versions.getByRole('row', { name: /Borrador/ })).toHaveCount(0);
  });
  await first.context().close();
  await second.context().close();
});

test('an expired publication stops being offered until staff publishes a current version', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const { accessCode, proposalId } = await createSchoolWithGroup(
    { name: 'Colegio Vencimiento', province: 'TUCUMAN', city: 'Tafí del Valle' },
    '5° V',
    { as: admin, accessCode: true, publishedProposal: true },
  );
  const family = await familyPhone(browser);
  await verifyFamily(family, familyEmail('vencida'));
  await toSchoolSearch(family, 'TUCUMAN');
  await chooseSchoolAndGroup(
    family,
    { search: 'vencimiento', school: 'Colegio Vencimiento' },
    '5° V',
  );
  await confirmInterest(family, accessCode!);
  await expect(family.getByRole('link', { name: 'Ver la propuesta' })).toBeVisible();
  const offerUrl = new URL(
    (await family.getByRole('link', { name: 'Ver la propuesta' }).getAttribute('href'))!,
    family.url(),
  ).toString();

  await test.step('time passes: the family no longer sees the offer', async () => {
    expireProposal(proposalId!);
    await family.goto('/mis-viajes');
    await expect(family.getByText('Propuesta en preparación')).toBeVisible();
    await family.goto(offerUrl);
    await heading(family, 'Tu propuesta se está preparando');
    await expect(valueOf(family, 'Total a pagar')).toHaveCount(0);
  });

  await test.step('staff sees it as expired and a copy cannot be published with the old date', async () => {
    await login(page, admin.email, admin.password);
    await expect(
      valueOf(page.getByRole('region', { name: 'Propuestas', exact: true }), 'Publicadas vencidas'),
    ).toHaveText('1');
    await page.goto(`/admin/proposals/${proposalId}`);
    await page.getByRole('button', { name: 'Crear nueva versión' }).click();
    await heading(page, /versión 2 \(Borrador\)/);
    await publish(page);
    await expect(page.getByText('La fecha de vencimiento tiene que ser futura.')).toBeVisible();
    await heading(page, /versión 2 \(Borrador\)/);
  });

  await test.step('a new version with a future date is offered again', async () => {
    await page.getByLabel('Válida hasta').fill(inDays(45));
    await publish(page);
    await heading(page, /versión 2 \(Publicada\)/);
    await family.goto('/mis-viajes');
    await expect(family.getByText('Propuesta disponible')).toBeVisible();
    await page.goto('/admin');
    await expect(
      valueOf(page.getByRole('region', { name: 'Propuestas', exact: true }), 'Publicadas vencidas'),
    ).toHaveText('0');
  });
  await family.context().close();
});
