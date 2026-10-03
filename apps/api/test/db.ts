import type { PrismaService } from '../src/prisma/prisma.service.js';

/** Empties every application table. Refuses to run against a database not named *_test. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const [database] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (!database?.name.endsWith('_test')) {
    throw new Error(`Refusing to reset non-test database "${database?.name}"`);
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
  }
}
