import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const functionSignature = 'trust.lock_reputation_subject(pg_catalog.uuid)';

// This helper installs only the reviewed function body into a caller-owned
// disposable database and grants its synthetic Jobs role. The dedicated
// reputation PG17 suite separately validates the complete audience packet.
export async function installReputationLockFunctionFixture(client, executionRole) {
  assert.equal(executionRole, 'lythaus_jobs');
  const existing = (await client.query(`SELECT pg_catalog.to_regprocedure('${functionSignature}') AS fn`)).rows[0].fn;
  if (existing) return;

  const root = new URL('../../../../', import.meta.url);
  const source = readFileSync(new URL('database/planetscale/proposals/reputation_subject_lock.v2.sql.proposal', root), 'utf8');
  const begin = 'CREATE FUNCTION trust.lock_reputation_subject(p_subject_id pg_catalog.uuid)';
  const end = '\nREVOKE ALL ON FUNCTION trust.lock_reputation_subject(pg_catalog.uuid)';
  const definition = source.split(begin)[1]?.split(end)[0];
  assert.ok(definition?.includes('RETURNS TABLE(status pg_catalog.text)'));

  await client.query('BEGIN');
  try {
    await client.query(`CREATE FUNCTION trust.lock_reputation_subject(p_subject_id pg_catalog.uuid)${definition}`);
    await client.query(`REVOKE ALL ON FUNCTION ${functionSignature} FROM PUBLIC`);
    await client.query(`GRANT EXECUTE ON FUNCTION ${functionSignature} TO ${executionRole}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
