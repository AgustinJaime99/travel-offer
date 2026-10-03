import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { DEMO_FAMILY_EMAIL, DEMO_STAFF, isEmptyForDemo, seedDemo } from '../demo/seed-demo.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Usage: pnpm demo:seed [--reset]
// Local demo data (README → Demo). Development only: refuses NODE_ENV=production and any database
// that already has staff or catalog data, unless --reset empties the development database first.

if (existsSync('.env')) process.loadEnvFile('.env');
const { values } = parseArgs({ options: { reset: { type: 'boolean', default: false } } });

if (process.env['NODE_ENV'] !== 'development') {
  console.error('The demo seed only runs with NODE_ENV=development.');
  process.exitCode = 1;
} else {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    const [database] = await prisma.$queryRaw<
      { name: string }[]
    >`SELECT current_database() AS name`;
    if (values.reset) {
      if (database?.name.endsWith('_test'))
        throw new Error('Use the test scripts for the test database.');
      const tables = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
      await prisma.$executeRawUnsafe(
        `TRUNCATE ${tables.map(({ tablename }) => `"${tablename}"`).join(', ')} CASCADE`,
      );
      console.log(`Emptied database "${database?.name}".`);
    } else if (!(await isEmptyForDemo(prisma))) {
      console.error(
        `Database "${database?.name}" already has staff or catalog data. Run "pnpm demo:seed --reset" to empty it first (deletes ALL its data).`,
      );
      process.exitCode = 1;
    }
    if (process.exitCode !== 1) {
      const demo = await seedDemo(app);
      console.log(`
Demo data created (development only). Web: http://localhost:3000 · Mailpit web UI: http://localhost:${process.env['MAILPIT_UI_PORT'] ?? '8025'}

Staff (http://localhost:3000/admin):
${DEMO_STAFF.map((user) => `  ${user.role.padEnd(10)} ${user.email.padEnd(34)} ${user.password}`).join('\n')}

Families (http://localhost:3000/onboarding, any email; the code arrives in Mailpit):
  A  ${demo.offer.school} · ${demo.offer.group} · viaje ${demo.travelYear}
     group access code: ${demo.offer.accessCode}   → published offer
  B  ${demo.preparing.school} · ${demo.preparing.group} · viaje ${demo.travelYear}
     group access code: ${demo.preparing.accessCode}   → "se está preparando" (no offer)
  C  pending request "${demo.requestSchoolName}" from ${DEMO_FAMILY_EMAIL} (staff: Solicitudes)

Access codes are shown only now (staff can generate new ones on the group page).`);
    }
  } finally {
    await app.close();
  }
}
