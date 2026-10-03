// E2E only: makes a published proposal expire, as the passage of time would (validUntil cannot be
// edited on a published version, so the immutability trigger is bypassed inside one transaction).
// Refuses to run against a database whose name does not end in "_test".
import pg from 'pg';

const [proposalId] = process.argv.slice(2);
if (!proposalId) throw new Error('Usage: node scripts/expire-test-proposal.mjs <proposalId>');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const {
    rows: [database],
  } = await client.query('SELECT current_database() AS name');
  if (!database.name.endsWith('_test')) {
    throw new Error(`Refusing to modify non-test database "${database.name}"`);
  }
  await client.query('BEGIN');
  await client.query(
    'ALTER TABLE "CommercialProposal" DISABLE TRIGGER "CommercialProposal_immutable_update"',
  );
  const { rowCount } = await client.query(
    `UPDATE "CommercialProposal" SET "validUntil" = now() - interval '1 minute'
     WHERE id = $1::uuid AND status = 'PUBLISHED'`,
    [proposalId],
  );
  await client.query(
    'ALTER TABLE "CommercialProposal" ENABLE TRIGGER "CommercialProposal_immutable_update"',
  );
  if (rowCount !== 1) throw new Error(`No published proposal ${proposalId}`);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
