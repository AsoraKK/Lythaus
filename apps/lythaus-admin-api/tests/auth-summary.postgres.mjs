import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import * as database from '@lythaus/db';
import { uuidv7 } from '@lythaus/security';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_auth_test')
    || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Admin auth summary tests require disposable local PostgreSQL');
}

let currentClient;
let queryCalls = 0;
mock.module('@lythaus/db', { namedExports: { ...database,
  query: async (_binding, text, values) => {
    assert.ok(currentClient, 'restricted PostgreSQL fixture is required');
    queryCalls++;
    return currentClient.query(text, values);
  },
} });
const { getAdminAuthSummary } = await import('../src/keeper-runtime.ts');
const env = { DB_ADMIN_FRESH: {} };
const request = new Request('https://admin.lythaus.co/api/admin/auth/summary');

async function fixture(work) {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try {
    const version = Number((await client.query("SELECT current_setting('server_version_num') AS n")).rows[0].n);
    assert.ok(version >= 170000 && version < 180000, 'PostgreSQL 17 is required');
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '5s'");
    const actor = { userId: uuidv7(), role: 'administrator' };
    await client.query("INSERT INTO identity.users (id, status) VALUES ($1, 'locked')", [actor.userId]);
    currentClient = client;
    queryCalls = 0;
    await work(client, actor);
  } finally {
    currentClient = undefined;
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}

test('restricted Admin summary reads verification state and records the authorized read without exposing identity material', async () => {
  await fixture(async (client, actor) => {
    await client.query('SET LOCAL ROLE lythaus_admin');
    const before = await (await getAdminAuthSummary(request, env, actor, uuidv7())).json();
    await client.query('RESET ROLE');
    const [contact, credential, pending] = Array.from({ length: 3 }, () => uuidv7());
    await client.query("INSERT INTO identity.users (id, status) VALUES ($1, 'active'), ($2, 'locked'), ($3, 'active')",
      [contact, credential, pending]);
    await client.query(`INSERT INTO identity.contact_emails
      (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, source_provider, verified_at)
      VALUES ($1, $2, $3, 'synthetic', 'email', now())`,
    [contact, Buffer.from('synthetic-contact-only'), randomBytes(32)]);
    await client.query(`INSERT INTO identity.email_credentials
      (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, hmac_key_version, password_hash, verified_at)
      VALUES ($1, $2, $3, 'synthetic', 'synthetic', '{"synthetic":true}'::jsonb, now())`,
    [credential, Buffer.from('synthetic-credential-only'), randomBytes(32)]);
    await client.query('SET LOCAL ROLE lythaus_admin');
    const correlation = uuidv7();
    const response = await getAdminAuthSummary(request, env, actor, correlation);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const result = await response.json();
    assert.equal(result.accounts.total, before.accounts.total + 3);
    assert.equal(result.accounts.verified, before.accounts.verified + 2);
    assert.equal(result.accounts.pendingVerification, before.accounts.pendingVerification + 1);
    assert.equal(result.accounts.active, before.accounts.active + 2);
    assert.equal(result.accounts.locked, before.accounts.locked + 1);
    assert.ok(!JSON.stringify(result).includes('synthetic'));
    assert.ok(![contact, credential, pending, actor.userId].some(id => JSON.stringify(result).includes(id)));
    const audit = await client.query(`SELECT action, metadata FROM system.audit_events
      WHERE actor_id = $1 AND correlation_id = $2`, [actor.userId, correlation]);
    assert.deepEqual(audit.rows, [{ action: 'identity.auth_summary_viewed', metadata: {} }]);
  });
});

test('the previous missing grants reproduce 42501 and prevent a success receipt', async () => {
  await fixture(async (client, actor) => {
    await client.query('REVOKE SELECT (user_id, verified_at) ON identity.contact_emails, identity.email_credentials FROM lythaus_admin');
    await client.query('SAVEPOINT missing_grants');
    await client.query('SET LOCAL ROLE lythaus_admin');
    const correlation = uuidv7();
    await assert.rejects(getAdminAuthSummary(request, env, actor, correlation), { code: '42501' });
    await client.query('ROLLBACK TO SAVEPOINT missing_grants');
    const audit = await client.query('SELECT 1 FROM system.audit_events WHERE correlation_id = $1', [correlation]);
    assert.equal(audit.rowCount, 0);
  });
});

test('verification grants do not expose credentials, email ciphertext or lookups, or allow verification writes', async () => {
  await fixture(async client => {
    const privileges = await client.query(`SELECT
      has_column_privilege('lythaus_admin', 'identity.contact_emails', 'user_id', 'SELECT') AS contact_join,
      has_column_privilege('lythaus_admin', 'identity.contact_emails', 'verified_at', 'SELECT') AS contact_verified,
      has_column_privilege('lythaus_admin', 'identity.email_credentials', 'user_id', 'SELECT') AS credential_join,
      has_column_privilege('lythaus_admin', 'identity.email_credentials', 'verified_at', 'SELECT') AS credential_verified`);
    assert.deepEqual(Object.values(privileges.rows[0]), [true, true, true, true]);
    await client.query('SET LOCAL ROLE lythaus_admin');
    for (const text of [
      'SELECT password_hash FROM identity.email_credentials LIMIT 1',
      'SELECT email_ciphertext FROM identity.email_credentials LIMIT 1',
      'SELECT email_lookup_hmac FROM identity.email_credentials LIMIT 1',
      'SELECT email_ciphertext FROM identity.contact_emails LIMIT 1',
      'SELECT email_lookup_hmac FROM identity.contact_emails LIMIT 1',
      'UPDATE identity.email_credentials SET verified_at = now() WHERE false',
      'UPDATE identity.contact_emails SET verified_at = now() WHERE false',
    ]) {
      await client.query('SAVEPOINT forbidden');
      await assert.rejects(client.query(text), { code: '42501' });
      await client.query('ROLLBACK TO SAVEPOINT forbidden');
    }
  });
});

test('an audit failure does not return a successful summary, and non-admin roles cannot query it', async () => {
  await fixture(async (client, actor) => {
    for (const role of ['privacy_operator', 'moderator', 'user']) {
      await assert.rejects(getAdminAuthSummary(request, env, { ...actor, role }, uuidv7()),
        { message: 'admin_role_required' });
    }
    assert.equal(queryCalls, 0);
    await client.query('REVOKE INSERT ON system.audit_events FROM lythaus_admin');
    await client.query('SAVEPOINT audit_failure');
    await client.query('SET LOCAL ROLE lythaus_admin');
    const correlation = uuidv7();
    await assert.rejects(getAdminAuthSummary(request, env, actor, correlation), { code: '42501' });
    await client.query('ROLLBACK TO SAVEPOINT audit_failure');
    const audit = await client.query('SELECT 1 FROM system.audit_events WHERE correlation_id = $1', [correlation]);
    assert.equal(audit.rowCount, 0);
  });
});
