// Empties every application table of the test database (used by the E2E global setup).
// Refuses to run against a database whose name does not end in "_test".
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const {
    rows: [database],
  } = await client.query('SELECT current_database() AS name');
  if (!database.name.endsWith('_test')) {
    throw new Error(`Refusing to reset non-test database "${database.name}"`);
  }
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length > 0) {
    await client.query(
      `TRUNCATE ${rows.map(({ tablename }) => `"${tablename}"`).join(', ')} CASCADE`,
    );
  }
} finally {
  await client.end();
}
