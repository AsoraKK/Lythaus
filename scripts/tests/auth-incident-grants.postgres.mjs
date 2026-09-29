import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { captureIncidentDatabaseEvidence, incidentAggregateColumns, verifyIncidentAggregatePrivileges } from '../ci/auth-incident-database-contract.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
assert.ok(connectionString, 'local PostgreSQL 17 test URL is required; this test must not silently skip');
assert.ok(['localhost', '127.0.0.1', '::1'].includes(new URL(connectionString).hostname), 'incident grant tests refuse hosted databases');
const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

async function withVerifier(grants, run, { readOnly = true, fixtures = false, tableWide = false } = {}) {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try {
    await client.query('BEGIN');
    const version = await client.query("SELECT current_setting('server_version_num')::int AS version");
    assert.ok(version.rows[0].version >= 170000 && version.rows[0].version < 180000);
    const role = quote(`lythaus_incident_test_${process.pid}`);
    await client.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    await client.query(`GRANT USAGE ON SCHEMA identity, system TO ${role}`);
    for (const { schema, table, columns } of grants) {
      if (columns.length) await client.query(`GRANT SELECT (${columns.map(quote).join(',')}) ON ${quote(schema)}.${quote(table)} TO ${role}`);
    }
    if (tableWide) await client.query(`GRANT SELECT ON system.transactional_email_outbox TO ${role}`);
    if (fixtures) {
      await client.query(`INSERT INTO system.transactional_email_outbox
        (id,purpose,template_version,state,correlation_id,created_at,updated_at,delivery_envelope_ciphertext,delivery_envelope_encryption_key_version)
        VALUES ('01900000-0000-7000-8000-000000000901','verification','test','processing','synthetic-grant-test',
          now()-interval '10 minutes',now()-interval '6 minutes','synthetic-ciphertext','v1')`);
      await client.query(`INSERT INTO system.audit_events (id,action,reason_code,correlation_id)
        VALUES ('01900000-0000-7000-8000-000000000902','auth.recovery.intake',NULL,'synthetic-grant-test')`);
      await client.query(`INSERT INTO system.production_auth_acceptance_runs
        (id,release_sha,candidate_worker,candidate_version,candidate_uploaded_at,candidate_staged_at,created_at,expires_at,
          context_lookup_hmac,context_ciphertext,context_encryption_key_version,
          primary_email_ciphertext,primary_email_encryption_key_version,primary_email_lookup_hmac,
          resend_email_ciphertext,resend_email_encryption_key_version,resend_email_lookup_hmac)
        VALUES ('01900000-0000-7000-8000-000000000903',repeat('a',40),'lythaus-synthetic','synthetic-version',
          now()-interval '3 hours',now()-interval '3 hours',now()-interval '2 hours',now()-interval '1 hour',
          decode(repeat('a1',32),'hex'),'synthetic-context','v1','synthetic-primary','v1',decode(repeat('b1',32),'hex'),
          'synthetic-resend','v1',decode(repeat('c1',32),'hex'))`);
    }
    await client.query(`SET LOCAL ROLE ${role}`);
    if (readOnly) await client.query('SET TRANSACTION READ ONLY');
    await run(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}

test('all real incident queries succeed with column-only grants, including null categories and reasons', async () => {
  await withVerifier(incidentAggregateColumns, async (client) => {
    await verifyIncidentAggregatePrivileges(client);
    const evidence = await captureIncidentDatabaseEvidence(client);
    assert.equal(evidence.status, 'VERIFIED_READ_ONLY');
    assert.equal(evidence.transactionReadOnly, true);
    assert.equal(evidence.piiIncluded, false);
    const pending = evidence.emailOperations24h.find((row) => row.purpose === 'verification' && row.state === 'processing' && row.provider_error_category === null);
    assert.ok(pending.count >= 1);
    assert.ok(pending.pending_overdue >= 1);
    assert.ok(pending.abandoned_leases >= 1);
    assert.ok(pending.oldest_pending_seconds >= 600);
    assert.ok(evidence.recoveryIntake24h.find((row) => row.reason_code === null).count >= 1);
    assert.ok(evidence.acceptance.expired_incomplete >= 1);
    assert.doesNotMatch(JSON.stringify(evidence), /synthetic-|01900000|ciphertext|lookup_hmac|password_hash|token_hash|provider_message_id/);
  }, { fixtures: true });
});

for (const [table, column] of [
  ['transactional_email_outbox', 'state'],
  ['transactional_email_outbox', 'provider_error_category'],
  ['transactional_email_outbox', 'updated_at'],
  ['audit_events', 'action'],
  ['audit_events', 'created_at'],
  ['audit_events', 'reason_code'],
  ['production_auth_acceptance_runs', 'expires_at'],
  ['production_auth_acceptance_runs', 'status'],
]) {
  test(`missing ${table}.${column} fails closed instead of producing diagnostic success`, async () => {
    const grants = incidentAggregateColumns.map((row) => ({ ...row, columns: row.columns.filter((name) => row.table !== table || name !== column) }));
    await withVerifier(grants, async (client) => {
      await assert.rejects(verifyIncidentAggregatePrivileges(client), /column-only incident grants/);
      await assert.rejects(captureIncidentDatabaseEvidence(client), { code: '42501' });
    });
  });
}

test('restricted verifier cannot read any undeclared column or write incident tables', async () => {
  await withVerifier(incidentAggregateColumns, async (client) => {
    async function denied(sql, code = '42501') {
      await client.query('SAVEPOINT forbidden');
      await assert.rejects(client.query(sql), { code });
      await client.query('ROLLBACK TO SAVEPOINT forbidden');
      await client.query('RELEASE SAVEPOINT forbidden');
    }
    for (const { schema, table, columns } of incidentAggregateColumns) {
      const relation = `${schema}.${table}`;
      const attributes = await client.query(`SELECT attname FROM pg_attribute
        WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped AND NOT (attname=ANY($2::text[]))`, [relation, columns]);
      const tablePrivilege = await client.query("SELECT has_table_privilege(current_user,$1,'SELECT') AS allowed", [relation]);
      assert.equal(tablePrivilege.rows[0].allowed, false);
      await denied(`SELECT * FROM ${relation} LIMIT 0`);
      for (const { attname } of attributes.rows) await denied(`SELECT ${quote(attname)} FROM ${relation} LIMIT 0`);
      await denied(`DELETE FROM ${relation} WHERE false`);
    }
  }, { readOnly: false });
});

test('reconciliation refuses table-wide outbox SELECT even when aggregates would succeed', async () => {
  await withVerifier(incidentAggregateColumns, (client) => assert.rejects(verifyIncidentAggregatePrivileges(client), /column-only incident grants/), { tableWide: true });
});

test('audit refuses a read-write session before collecting evidence', async () => {
  await withVerifier(incidentAggregateColumns, (client) => assert.rejects(captureIncidentDatabaseEvidence(client), /read-only transaction/), { readOnly: false });
});
