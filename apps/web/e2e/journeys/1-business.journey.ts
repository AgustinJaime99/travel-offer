import { expect, test } from '@playwright/test';
import { alertIn, login } from '../helpers';
import { E2E_USERS } from '../test-env';
import {
  addServices,
  chooseSchoolAndGroup,
  confirmInterest,
  createSchoolAndGroup,
  createService,
  familyEmail,
  familyPhone,
  heading,
  inDays,
  publish,
  toSchoolSearch,
  TRAVEL_YEAR,
  valueOf,
  verifyFamily,
} from './journey-helpers';

// Phase 13 (MVP_PLAN.md): run in this order, one worker, on a database that starts with only the
// initial ADMIN (journeys/global-setup.ts). Staff work on desktop, families on a phone.

const SERVICES = [
  { name: 'Transporte Recorrido', category: 'Transporte', price: '1.100.000' },
  { name: 'Alojamiento Recorrido', category: 'Alojamiento', price: '1.500.000' },
  { name: 'Excursiones Recorrido', category: 'Excursiones', price: '500.000' },
];

test('A: from an empty catalog, staff publishes an offer and the family sees it with the group code', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const { admin } = E2E_USERS;
  const school = { name: 'Colegio Recorrido Andino', province: 'Mendoza', city: 'Tunuyán' };

  await test.step('the only account is the initial ADMIN and the commercial database is empty', async () => {
    await login(page, admin.email, admin.password);
    await heading(page, 'Panel');
    for (const card of [
      'Colegios',
      'Grupos',
      'Propuestas',
      'Inscripciones de familias',
      'Solicitudes',
    ]) {
      for (const value of await page
        .getByRole('region', { name: card, exact: true })
        .locator('dd')
        .all()) {
        await expect(value).toHaveText('0');
      }
    }
    await page.goto('/admin/users');
    await expect(page.getByRole('cell', { name: admin.email })).toBeVisible();
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(2); // header + ADMIN
    await page.goto('/admin/schools');
    await expect(page.getByText('Todavía no hay colegios cargados.')).toBeVisible();
    await page.goto('/admin/services');
    await expect(page.getByRole('link', { name: SERVICES[0]!.name })).toHaveCount(0);
  });

  let groupUrl = '';
  let accessCode = '';
  await test.step('school, group and its access code', async () => {
    const created = await createSchoolAndGroup(page, school, '5° A');
    groupUrl = created.groupUrl;
    accessCode = created.accessCode!;
  });

  await test.step('services', async () => {
    for (const service of SERVICES) await createService(page, service);
  });

  await test.step('proposal priced by the server (DOMAIN.md worked example) and published', async () => {
    await page.goto(groupUrl);
    await page.getByRole('button', { name: 'Crear propuesta' }).click();
    await heading(page, /versión 1 \(Borrador\)/);
    await addServices(
      page,
      SERVICES.map((service) => service.name),
    );
    await page.getByLabel('Descuento comercial (ARS)').fill('100.000');
    await page.getByLabel('Anticipo (ARS)').fill('600.000');
    await page.getByLabel('Cantidad de cuotas').selectOption('18');
    await page.getByLabel('TNA (%)').fill('35');
    await page.getByLabel('Válida hasta').fill(inDays(60));
    await expect(valueOf(page, 'Total a pagar')).toHaveText('$ 3.718.927,69');
    await publish(page);
    await heading(page, /versión 1 \(Publicada\)/);
    await expect(page.getByText(/Publicada el .* por Admin E2E/)).toBeVisible();
  });

  const family = await familyPhone(browser);
  await test.step('the family verifies its email, finds the group and registers with the code', async () => {
    await verifyFamily(family, familyEmail('a'));
    await toSchoolSearch(family, 'MENDOZA');
    await chooseSchoolAndGroup(
      family,
      { search: 'recorrido andino', school: 'Colegio Recorrido Andino' },
      '5° A',
    );
    await confirmInterest(family, accessCode.toLowerCase().replace('-', ''));
    await heading(family, '¡Listo!');
  });

  await test.step('the family sees the published offer, priced as staff saw it', async () => {
    await family.getByRole('link', { name: 'Ver la propuesta' }).click();
    await heading(family, 'Propuesta para 5° A');
    await expect(family.getByText('Colegio Recorrido Andino')).toBeVisible();
    // Every payment option includes the same services.
    const includes = family.getByRole('region', { name: 'Tu viaje incluye' });
    for (const service of SERVICES) await expect(includes.getByText(service.name)).toBeVisible();
    await expect(valueOf(family, 'Precio de contado')).toHaveText('$ 3.000.000,00');
    await expect(valueOf(family, 'Anticipo')).toHaveText('$ 600.000,00');
    await expect(valueOf(family, 'Monto financiado')).toHaveText('$ 2.400.000,00');
    await expect(valueOf(family, 'TNA')).toHaveText('35,00 %');
    await expect(valueOf(family, 'TEA')).toHaveText('41,20 %');
    await expect(valueOf(family, 'CFT')).toHaveText('41,20 %');
    await expect(valueOf(family, 'Cuotas')).toHaveText(
      '17 cuotas de $ 173.273,76 y 1 de $ 173.273,77',
    );
    await expect(valueOf(family, 'Total a pagar')).toHaveText('$ 3.718.927,69');
    await expect(family.getByText(/No es una reserva|no es una reserva/).first()).toBeVisible();
  });
  await family.context().close();

  await test.step('the dashboard counts what was just created', async () => {
    await page.goto('/admin');
    const proposals = page.getByRole('region', { name: 'Propuestas', exact: true });
    await expect(valueOf(proposals, 'Publicadas vigentes')).toHaveText('1');
    const enrollments = page.getByRole('region', {
      name: 'Inscripciones de familias',
      exact: true,
    });
    await expect(valueOf(enrollments, 'Total')).toHaveText('1');
    await expect(valueOf(enrollments, 'Con código del grupo')).toHaveText('1');
  });
  await expect(alertIn(page)).toHaveCount(0);
});

test('B: a group without a publication: the family with the code sees the offer is being prepared', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const { admin } = E2E_USERS;
  await login(page, admin.email, admin.password);
  const { accessCode } = await createSchoolAndGroup(
    page,
    { name: 'Escuela Recorrido Calchaquí', province: 'Salta', city: 'Cafayate' },
    '5° B',
  );

  const family = await familyPhone(browser);
  await verifyFamily(family, familyEmail('b'));
  await toSchoolSearch(family, 'SALTA');
  await chooseSchoolAndGroup(
    family,
    { search: 'calchaqui', school: 'Escuela Recorrido Calchaquí' },
    '5° B',
  );
  await confirmInterest(family, accessCode!);
  await heading(family, '¡Listo!');
  await expect(
    family.getByText('Tu propuesta se está preparando.', { exact: false }),
  ).toBeVisible();
  await expect(family.getByRole('link', { name: 'Ver la propuesta' })).toHaveCount(0);
  await family.goto('/mis-viajes');
  await expect(family.getByText('Propuesta en preparación')).toBeVisible();
  await family.context().close();
});

test('C: the family cannot find its school, reports it and staff sees the pending request', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const email = familyEmail('c');
  const family = await familyPhone(browser);
  await verifyFamily(family, email);
  await toSchoolSearch(family, 'CATAMARCA');
  await family.getByLabel('Nombre del colegio').fill('escuela que no existe');
  await expect(family.getByText(/No encontramos colegios con ese nombre/)).toBeVisible();
  await family.getByRole('button', { name: 'No encuentro mi colegio' }).click();
  await family.getByLabel('Nombre del colegio').fill('Escuela Recorrido Faltante');
  await family.getByLabel('Localidad').fill('Andalgalá');
  await family.getByLabel('Curso o división').fill('5° C');
  await family.getByLabel('Año del viaje').selectOption(TRAVEL_YEAR);
  await family.getByRole('button', { name: 'Enviar' }).click();
  await expect(family.getByRole('status')).toContainText('Recibimos tu solicitud.');
  await family.context().close();

  const { admin } = E2E_USERS;
  await login(page, admin.email, admin.password);
  await expect(
    valueOf(page.getByRole('region', { name: 'Solicitudes', exact: true }), 'Pendientes'),
  ).toHaveText('1');
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Solicitudes' })
    .click();
  const row = page.getByRole('row', { name: /Escuela Recorrido Faltante/ });
  await expect(row).toContainText('Colegio no encontrado');
  await expect(row).toContainText(`5° C · ${TRAVEL_YEAR}`);
  await expect(row).toContainText('Pendiente');
  await row.getByRole('link').click();
  await expect(page.getByText(`Familia Recorrido · ${email}`)).toBeVisible();
  // The report never creates catalog data: the school is still unknown to the catalog.
  await page.goto('/admin/schools?q=recorrido+faltante');
  await expect(page.getByText('No hay colegios que coincidan con la búsqueda.')).toBeVisible();
});
