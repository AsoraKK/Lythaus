import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { hmacLookup, uuidv7 } from '@lythaus/security';
import { handleAccountSupport } from '../src/account-support-runtime.ts';
import { handleAccountSupportLookup } from '../../lythaus-public-api/src/account-support-entrypoint.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_auth_test') || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Account support tests require disposable local PostgreSQL');
}
async function clientFor(work, role) {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try {
    await client.query("SET statement_timeout = '5s'");
    if (role) await client.query(`SET ROLE ${role}`);
    return await work(client);
  } finally { await client.end(); }
}
const sql = (text, values) => clientFor(client => client.query(text, values));
const runTransaction = (role, failAudit = false) => (_binding, work) => clientFor(async client => {
  await client.query('BEGIN');
  try {
    const query = async (text, values) => {
      if (failAudit && text.includes('INSERT INTO system.audit_events')) await client.query('SET LOCAL ROLE lythaus_runtime');
      return client.query(text, values);
    };
    const result = await work({ query });
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}, role);
const owner = { userId: uuidv7(), role: 'owner' };
const otherAdmin = { userId: uuidv7(), role: 'owner' };
const userIds = Array.from({ length: 6 }, () => uuidv7());
const emails = ['verified', 'canonical', 'fallback', 'ambiguous', 'stale'].map(name => `${name}-${uuidv7()}@example.invalid`);
const key = randomBytes(32).toString('base64');
const version = uuidv7();
const publicEnv = { DB_APP_FRESH: {}, PII_HMAC_KEY_V1: key, WORKER_VERSION: { id: version } };
const env = { DB_ADMIN_FRESH: {}, CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co', AUTH_EMAIL_ENVELOPE: {
  fetch: (url, init) => handleAccountSupportLookup(new Request(url, init), publicEnv, runTransaction('lythaus_runtime'))
} };
const request = (body, path = '/api/admin/account-support/lookup') => new Request(`https://admin.lythaus.co${path}`, { method: 'POST',
  headers: { origin: 'https://admin.lythaus.co', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const lookup = (email, actor = owner, runner = runTransaction('lythaus_admin')) => handleAccountSupport(request({ email, reasonCode: 'SUPPORT_REQUEST' }), env, actor, uuidv7(), runner);
const history = async (body = {}, correlation = uuidv7()) => (await handleAccountSupport(request({ reasonCode: 'SUPPORT_REQUEST', ...body }, `/api/admin/account-support/users/${userIds[0]}/history`), env, owner, correlation, runTransaction('lythaus_admin'))).json();
const collisionId = uuidv7();
const oldId = uuidv7();
const newId = uuidv7();
const historyCorrelation = 'synthetic-support-correlation';

before(async () => {
  for (const id of [owner.userId, otherAdmin.userId, ...userIds]) await sql('INSERT INTO identity.users (id) VALUES ($1)', [id]);
  for (const [id, role] of [[owner.userId, 'owner'], [otherAdmin.userId, 'administrator']]) {
    await sql('INSERT INTO identity.admin_memberships (user_id, access_subject_hmac, role, active) VALUES ($1, $2, $3, true)', [id, randomBytes(32), role]);
  }
  for (const [userId, email, verified] of [[userIds[0], emails[0], true], [userIds[1], emails[1], false], [userIds[3], emails[3], false]]) {
    await sql(`INSERT INTO identity.contact_emails (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, source_provider, verified_at)
      VALUES ($1, convert_to('synthetic-ciphertext', 'utf8'), decode($2, 'base64'), 'v1', 'email', $3)`, [userId, hmacLookup(email, key), verified ? '2026-10-01T00:00:00Z' : null]);
  }
  for (const [userId, email] of [[userIds[0], emails[0]], [userIds[1], emails[4]], [userIds[2], emails[2]], [userIds[4], emails[3]]]) {
    await sql(`INSERT INTO identity.email_credentials (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, hmac_key_version, password_hash, verified_at)
      VALUES ($1, convert_to('synthetic-credential-ciphertext', 'utf8'), decode($2, 'base64'), 'v1', 'v1', '{"private":"synthetic-password"}'::jsonb, '2026-10-01T00:00:00Z')`, [userId, hmacLookup(email, key)]);
  }
  await sql(`INSERT INTO identity.account_events (id, user_id, event_type, created_at, metadata)
    VALUES ($1, $2, 'email_login', '2026-10-01T01:00:00Z', '{"password":"synthetic-private"}'::jsonb)`, [uuidv7(), userIds[0]]);
  for (const [revokedFamily, revokedSession, expired] of [[false, false, false], [true, false, false], [false, true, false], [false, false, true]]) {
    const family = uuidv7();
    await sql('INSERT INTO identity.refresh_token_families (id, user_id, revoked_at) VALUES ($1, $2, $3)', [family, userIds[0], revokedFamily ? '2026-10-01T00:00:00Z' : null]);
    await sql(`INSERT INTO identity.auth_sessions (id, user_id, refresh_family_id, refresh_token_hash, expires_at, revoked_at)
      VALUES ($1, $2, $3, $4, $5, $6)`, [uuidv7(), userIds[0], family, randomBytes(32), expired ? '2026-01-01T00:00:00Z' : '2099-01-01T00:00:00Z', revokedSession ? '2026-10-01T00:00:00Z' : null]);
  }
  for (const [id, at] of [[oldId, '2026-09-30T10:00:00.000000Z'], [collisionId, '2026-09-30T10:00:00.000001Z']]) {
    await sql('INSERT INTO identity.account_events (id, user_id, event_type, created_at, metadata) VALUES ($1, $2, $3, $4, $5::jsonb)', [id, userIds[0], 'email_verified', at, JSON.stringify({ email: emails[0], resetLink: 'https://example.invalid/#private' })]);
  }
  for (const [id, userId, at, correlationId] of [[collisionId, userIds[0], '2026-09-30T10:00:00.000001Z', historyCorrelation], [newId, userIds[0], '2026-09-30T10:00:00.000002Z', 'other-correlation'], [uuidv7(), userIds[5], '2026-09-30T10:00:00.000001Z', historyCorrelation]]) {
    await sql(`INSERT INTO trust.user_activity_events
      (id, user_id, event_type, category, source, source_event_id, correlation_id, title, explanation, result, reputation_effect, policy_version, retention_class, retention_until, created_at)
      VALUES ($1, $2, 'account.email_verified', 'account', 'public_api', $3, $4, 'Synthetic title', 'Private synthetic content', 'succeeded', 'none', 'activity-v1', 'security', '2027-10-01T00:00:00Z', $5)`, [id, userId, uuidv7(), correlationId, at]);
  }
  await sql(`INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata, created_at)
    VALUES ($1, $2, 'identity.synthetic_review', 'user', $3, 'SUPPORT_REQUEST', $4, '{"privateContent":"synthetic-private"}'::jsonb, '2026-09-30T10:00:00.000001Z')`, [collisionId, owner.userId, userIds[0], historyCorrelation]);
});

after(async () => {
  const ids = [owner.userId, otherAdmin.userId, ...userIds];
  await sql("DELETE FROM system.audit_events WHERE actor_id = ANY($1::uuid[]) OR (target_type = 'user' AND target_id = ANY($1::uuid[]))", [ids]);
  for (const table of ['identity.auth_sessions', 'identity.refresh_token_families', 'identity.account_events', 'trust.user_activity_events', 'identity.email_credentials', 'identity.contact_emails', 'identity.admin_memberships']) {
    await sql(`DELETE FROM ${table} WHERE user_id = ANY($1::uuid[])`, [ids]);
  }
  await sql('DELETE FROM identity.users WHERE id = ANY($1::uuid[])', [ids]);
});

test('real role grants support canonical exact lookup, honest missing states, ambiguity and a credential-free audited projection', async () => {
  await assert.rejects(clientFor(client => client.query('SELECT email_ciphertext FROM identity.contact_emails'), 'lythaus_admin'), error => error.code === '42501');
  const before = (await sql('SELECT id, status, token_version, updated_at FROM identity.users WHERE id = ANY($1::uuid[]) ORDER BY id', [userIds])).rows;
  const found = await (await lookup(` ${emails[0].toUpperCase()} `)).json();
  assert.equal(found.account.id, userIds[0]); assert.equal(found.account.activeSessionCount, 1);
  assert.equal(found.account.lastSignInAt, '2026-10-01T01:00:00.000000Z');
  for (const word of ['ciphertext', 'password', 'token', 'private', emails[0]]) assert.ok(!JSON.stringify(found).includes(word));
  const canonical = await (await lookup(emails[1])).json();
  assert.equal(canonical.account.id, userIds[1]); assert.equal(canonical.account.verificationState, 'pending_verification');
  assert.equal(canonical.account.verifiedAt, null); assert.equal(canonical.account.lastSignInAt, null);
  assert.equal((await (await lookup(emails[4])).json()).state, 'not_found');
  assert.equal((await (await lookup(emails[2])).json()).account.id, userIds[2]);
  const ambiguous = await (await lookup(emails[3])).json(); assert.equal(ambiguous.state, 'ambiguous'); assert.equal(ambiguous.account, null);
  assert.equal((await (await lookup('not-a-record@example.invalid')).json()).state, 'not_found');
  assert.deepEqual((await sql('SELECT id, status, token_version, updated_at FROM identity.users WHERE id = ANY($1::uuid[]) ORDER BY id', [userIds])).rows, before);
  const audits = (await sql("SELECT actor_id, target_id, metadata, reason_code FROM system.audit_events WHERE action = 'identity.account_support_lookup' AND actor_id = $1", [owner.userId])).rows;
  assert.equal(audits.length, 6); assert.ok(audits.every(row => row.reason_code === 'SUPPORT_REQUEST'));
  assert.ok(!JSON.stringify(audits).includes('@example.invalid'));
  assert.equal(audits.filter(row => row.target_id === null).length, 3);
});

test('real PostgreSQL history handles cross-source UUID/timestamp ties, microseconds, filters, owner scoping and stable pagination', async () => {
  const window = { since: '2026-09-30T00:00:00Z', until: '2026-10-01T00:00:00Z' };
  const expected = [`account:${oldId}`, `account:${collisionId}`, `activity:${collisionId}`, `audit:${collisionId}`, `activity:${newId}`];
  for (const order of ['oldest', 'newest']) {
    let cursor = null; const items = []; let snapshot;
    for (let count = 0; count < 10; count += 1) {
      const page = await history({ ...window, order, limit: 1, cursor });
      snapshot ??= page.snapshotAt; assert.equal(page.snapshotAt, snapshot);
      items.push(...page.items); cursor = page.nextCursor;
      if (!cursor) break;
    }
    assert.equal(cursor, null);
    assert.deepEqual(items.map(row => `${row.source}:${row.id}`), order === 'oldest' ? expected : [...expected].reverse());
    assert.ok(items.every(row => !JSON.stringify(row).includes('private')));
    assert.equal(items.find(row => row.source === 'account').correlationId, null);
  }
  const correlated = await history({ ...window, correlationId: historyCorrelation });
  assert.deepEqual(correlated.items.map(row => row.source).sort(), ['activity', 'audit']);
  assert.equal((await history({ ...window, source: 'account' })).items.length, 2);
  assert.equal((await history({ ...window, eventType: 'email_verified' })).items.length, 2);
  assert.equal((await history({ ...window, eventType: 'email_login' })).items.length, 0);
  assert.equal((await history({ since: '2026-09-30T10:00:00.000001Z', until: '2026-09-30T10:00:00.000002Z' })).items.length, 3);
  const initialCount = Number((await sql(`SELECT
    (SELECT count(*) FROM identity.account_events WHERE user_id = $1) +
    (SELECT count(*) FROM trust.user_activity_events WHERE user_id = $1) +
    (SELECT count(*) FROM system.audit_events WHERE target_type = 'user' AND target_id = $1) AS count`, [userIds[0]])).rows[0].count);
  const ownReadIds = []; const collected = []; let cursor = null;
  for (let count = 0; count < 40; count += 1) {
    const correlation = uuidv7(); const page = await history({ order: 'oldest', limit: 2, cursor }, correlation);
    const ownAudit = (await sql('SELECT id FROM system.audit_events WHERE correlation_id = $1', [correlation])).rows[0];
    ownReadIds.push(ownAudit.id); collected.push(...page.items); cursor = page.nextCursor;
    if (!cursor) break;
  }
  assert.equal(cursor, null); assert.equal(collected.length, initialCount);
  assert.ok(!collected.some(row => row.source === 'audit' && ownReadIds.includes(row.id)));
});

test('real PostgreSQL owner state and failed audit privileges prevent disclosure, with rollback and no account mutation', async () => {
  await assert.rejects(lookup(emails[0], otherAdmin), /account_support_owner_required/);
  await sql('UPDATE identity.admin_memberships SET active = false WHERE user_id = $1', [owner.userId]);
  await assert.rejects(lookup(emails[0]), /account_support_owner_required/);
  await sql('UPDATE identity.admin_memberships SET active = true WHERE user_id = $1', [owner.userId]);
  await sql("UPDATE identity.users SET status = 'locked' WHERE id = $1", [owner.userId]);
  await assert.rejects(lookup(emails[0]), /account_support_owner_required/);
  await sql("UPDATE identity.users SET status = 'active' WHERE id = $1", [owner.userId]);
  const before = (await sql("SELECT count(*)::integer AS count FROM system.audit_events WHERE actor_id = $1 AND action = 'identity.account_support_lookup'", [owner.userId])).rows[0].count;
  await assert.rejects(lookup(emails[0], owner, runTransaction('lythaus_admin', true)), /account_support_unavailable/);
  assert.equal((await sql("SELECT count(*)::integer AS count FROM system.audit_events WHERE actor_id = $1 AND action = 'identity.account_support_lookup'", [owner.userId])).rows[0].count, before);
  assert.equal((await sql('SELECT token_version FROM identity.users WHERE id = $1', [userIds[0]])).rows[0].token_version, 1);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM system.transactional_email_outbox WHERE user_id = ANY($1::uuid[])', [userIds])).rows[0].count, 0);
});
