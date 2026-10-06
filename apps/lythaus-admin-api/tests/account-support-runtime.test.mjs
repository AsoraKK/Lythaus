import assert from 'node:assert/strict';
import test from 'node:test';
import { hmacLookup } from '@lythaus/security';
import { handleAccountSupport } from '../src/account-support-runtime.ts';
import { handleAccountSupportLookup } from '../../lythaus-public-api/src/account-support-entrypoint.ts';
import { handleEmailEnvelope } from '../../lythaus-public-api/src/email-envelope-entrypoint.ts';
import { accountSupportSnapshot } from '@lythaus/contracts';

const ID = '01900000-0000-7000-8000-000000000001';
const OTHER = '01900000-0000-7000-8000-000000000002';
const OWNER = { userId: '01900000-0000-7000-8000-000000000099', role: 'owner' };
const VERSION = '01900000-0000-7000-8000-000000000088';
const correlation = 'synthetic-support-correlation';
const email = 'synthetic@example.invalid';
const record = { id: ID, status: 'active', verification_state: 'verified', verified_at: '2026-10-01T00:00:00Z',
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', deleted_at: null, last_sign_in_at: null,
  active_session_count: 0, subscription_tier: 'free' };
const account = accountSupportSnapshot({ id: ID, status: 'active', verificationState: 'verified', verifiedAt: record.verified_at,
  createdAt: record.created_at, updatedAt: record.updated_at, deletedAt: null, lastSignInAt: null, activeSessionCount: 0, subscriptionTier: 'free' });
const publicEnv = { DB_APP_FRESH: {}, PII_HMAC_KEY_V1: 'synthetic-only-hmac-key', WORKER_VERSION: { id: VERSION } };
const internal = (body, path = '/keeper-account-support/lookup', method = 'POST') => new Request(`https://private.internal${path}`, { method, ...(method !== 'GET' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
const request = (body = { email, reasonCode: 'SUPPORT_REQUEST' }, path = '/api/admin/account-support/lookup', method = 'POST', headers = {}) => new Request(`https://admin.lythaus.co${path}`, {
  method, headers: { origin: 'https://admin.lythaus.co', 'content-type': 'application/json', ...headers }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {})
});
function database({ member = true, rows = [], exists = true, auditCount = 1, failure = null, profileUpdatedAt = '2026-10-01T00:00:00.000002Z', profileCorrectionsAvailable = true } = {}) {
  const profileRow = { display_name: 'Synthetic member', bio: 'Synthetic bio', user_updated_at: '2026-10-01T00:00:00.000001Z',
    profile_updated_at: profileUpdatedAt, status: 'active', deleted_at: null };
  const queries = [];
  return { queries, run: async (_binding, work) => work({ query: async (sql, values = []) => {
    queries.push({ sql, values });
    if (failure) throw new Error(failure);
    if (sql.includes('identity.admin_memberships')) return { rows: member ? [{ user_id: OWNER.userId }] : [], rowCount: member ? 1 : 0 };
    if (sql.includes('has_schema_privilege')) return { rows: [{ available: profileCorrectionsAvailable }], rowCount: 1 };
    if (sql.includes('SELECT u.display_name, COALESCE(p.bio')) return { rows: [{ ...profileRow }], rowCount: 1 };
    if (sql.includes('FROM identity.users WHERE id = $1 FOR UPDATE')) return { rows: [{ ...profileRow }], rowCount: 1 };
    if (sql.includes('FROM social.profiles WHERE user_id = $1 FOR UPDATE')) return { rows: [{ bio: profileRow.bio, profile_updated_at: profileRow.profile_updated_at }], rowCount: 1 };
    if (sql.startsWith('UPDATE identity.users SET display_name')) return { rows: [{ user_updated_at: '2026-10-02T00:00:00.000001Z' }], rowCount: 1 };
    if (sql.startsWith('INSERT INTO social.profiles')) return { rows: [{ profile_updated_at: '2026-10-02T00:00:00.000002Z' }], rowCount: 1 };
    if (sql.startsWith('INSERT INTO system.outbox_events')) return { rows: [{ id: ID }], rowCount: 1 };
    if (sql.startsWith('SELECT id FROM identity.users')) return { rows: exists ? [{ id: ID }] : [], rowCount: exists ? 1 : 0 };
    if (sql.includes('AS snapshot_at')) return { rows: [{ snapshot_at: '2026-10-02T10:00:00.123456Z' }], rowCount: 1 };
    if (sql.includes('INSERT INTO system.audit_events')) return { rows: [{ id: ID }], rowCount: auditCount };
    return { rows, rowCount: rows.length };
  } }) };
}
function environment(binding = async () => Response.json({ workerVersion: VERSION, result: { state: 'found', account: { ...account, password_hash: 'private' } } })) {
  return { DB_ADMIN_FRESH: {}, CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co', AUTH_EMAIL_ENVELOPE: { fetch: binding } };
}
function entry(id = ID, source = 'activity', created_at = '2026-10-01T10:00:00.000001Z') {
  return { id, source, created_at, event_type: 'account.login_succeeded', correlation_id: correlation, reason_code: null, category: 'account', outcome: 'succeeded', metadata: { password: 'private' } };
}
const profilePath = `/api/admin/account-support/users/${ID}/profile`;

test('private lookup verifies owner, uses only HMAC equality and returns minimal state without secrets or fabricated sign-in', async () => {
  const db = database({ rows: [record] });
  const response = await handleAccountSupportLookup(internal({ actorId: OWNER.userId, email: `  ${email.toUpperCase()}  ` }), publicEnv, db.run);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).result, { state: 'found', account });
  const lookup = db.queries[1];
  assert.deepEqual(lookup.values, [hmacLookup(email, publicEnv.PII_HMAC_KEY_V1)]);
  assert.ok(!lookup.sql.includes('ILIKE'));
  assert.match(lookup.sql, /c\.user_id IS NULL AND e\.email_lookup_hmac/);
  for (const sensitive of ['password_hash', 'email_ciphertext', 'refresh_token_hash', 'token_version', 'provider_subject', 'metadata']) assert.ok(!lookup.sql.includes(sensitive));
  assert.ok(!JSON.stringify(db.queries).includes(email));
  assert.ok(db.queries.every(query => query.sql.startsWith('SELECT')));
});

test('private service reports missing or ambiguous matches without disclosing account data', async () => {
  for (const [rows, state] of [[[], 'not_found'], [[record, { ...record, id: OTHER }], 'ambiguous']]) {
    const result = await handleAccountSupportLookup(internal({ actorId: OWNER.userId, email }), publicEnv, database({ rows }).run);
    assert.deepEqual((await result.json()).result, { state, account: null });
  }
});

test('existing private handler dispatches lookup without email delivery keys and retains owner and read-only boundaries', async () => {
  for (const [options, expectedStatus, expectedState] of [
    [{ rows: [record] }, 200, 'found'], [{ rows: [] }, 200, 'not_found'],
    [{ rows: [record, { ...record, id: OTHER }] }, 200, 'ambiguous'], [{ member: false }, 403, undefined],
  ]) {
    const db = database(options);
    const response = await handleEmailEnvelope(internal({ actorId: OWNER.userId, email }), publicEnv, db.run);
    assert.equal(response.status, expectedStatus);
    const body = await response.json();
    if (expectedState) assert.equal(body.result.state, expectedState);
    else assert.equal(body.error, 'account_support_owner_required');
    assert.ok(!JSON.stringify(body).includes(email));
    assert.ok(db.queries.every(query => query.sql.startsWith('SELECT')));
  }
  const rejected = await handleEmailEnvelope(internal({ actorId: OWNER.userId, email, token: 'synthetic-private' }), publicEnv, database().run);
  assert.equal(rejected.status, 503);
  assert.ok(!(await rejected.text()).includes('synthetic-private'));
  assert.equal((await handleEmailEnvelope(internal({}, undefined, 'GET'), publicEnv)).status, 404);
});

test('private service denies inactive owners and hides malformed input or private database failure', async () => {
  const denied = await handleAccountSupportLookup(internal({ actorId: OWNER.userId, email }), publicEnv, database({ member: false }).run);
  assert.equal(denied.status, 403);
  for (const body of [null, [], {}, { actorId: 'bad', email }, { actorId: OWNER.userId, email: 'partial' }, { actorId: OWNER.userId, email, password: 'private' }, '{', 'x'.repeat(4097)]) {
    assert.equal((await handleAccountSupportLookup(internal(body), publicEnv, database().run)).status, 503);
  }
  for (const env of [{}, { ...publicEnv, PII_HMAC_KEY_V1: undefined }, { ...publicEnv, WORKER_VERSION: { id: 'bad' } }]) assert.equal((await handleAccountSupportLookup(internal({ actorId: OWNER.userId, email }), env, database().run)).status, 503);
  const failed = await handleAccountSupportLookup(internal({ actorId: OWNER.userId, email }), publicEnv, database({ failure: 'postgres-password-private' }).run);
  assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes('postgres-password-private'));
  assert.equal((await handleAccountSupportLookup(internal({}, '/other'), publicEnv)).status, 404);
  assert.equal((await handleAccountSupportLookup(internal({}, undefined, 'GET'), publicEnv)).status, 404);
});

test('admin lookup rechecks owner after private lookup, audits before response, strips extras and retains no raw email', async () => {
  const db = database(); let call;
  const env = environment(async (url, init) => {
    call = { url, init };
    assert.ok(!db.queries.some(query => query.sql.includes('INSERT')));
    return Response.json({ workerVersion: VERSION, result: { state: 'found', account: { ...account, password: 'private', email } } });
  });
  const result = await handleAccountSupport(request(), env, OWNER, correlation, db.run);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal(result.headers.get('x-correlation-id'), correlation);
  assert.deepEqual(await result.json(), { state: 'found', account, correlationId: correlation });
  assert.equal(call.url, 'https://lythaus-public.internal/keeper-account-support/lookup');
  assert.deepEqual(JSON.parse(call.init.body), { actorId: OWNER.userId, email });
  assert.equal(db.queries.filter(query => query.sql.includes('identity.admin_memberships')).length, 2);
  const audit = db.queries.at(-1);
  assert.equal(audit.values[3], ID); assert.equal(audit.values[4], 'SUPPORT_REQUEST');
  assert.deepEqual(JSON.parse(audit.values[6]), { outcome: 'found', lookupType: 'exact_email' });
  assert.ok(!JSON.stringify(db.queries).includes(email));
});

test('owner profile read returns only editable fields and audits target and reason', async () => {
  const db = database();
  const response = await handleAccountSupport(request({ reasonCode: 'SUPPORT_REQUEST' }, profilePath), environment(), OWNER, correlation, db.run);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const result = await response.json();
  assert.deepEqual(result, { profile: {
    displayName: 'Synthetic member', bio: 'Synthetic bio', userUpdatedAt: '2026-10-01T00:00:00.000001Z', profileUpdatedAt: '2026-10-01T00:00:00.000002Z'
  }, correlationId: correlation });
  const audit = db.queries.at(-1);
  assert.equal(audit.values[1], OWNER.userId); assert.equal(audit.values[2], 'identity.account_support_profile_viewed');
  assert.equal(audit.values[3], ID); assert.equal(audit.values[4], 'SUPPORT_REQUEST');
  assert.deepEqual(JSON.parse(audit.values[6]).fields, ['display_name', 'bio']);
  assert.ok(!JSON.stringify(result).match(/password|token|security|role/i));
});

test('owner profile correction records reason, changes and moderation outbox', async () => {
  const db = database();
  const body = { displayName: 'Corrected synthetic member', bio: 'Corrected synthetic bio', expectedUserUpdatedAt: '2026-10-01T00:00:00.000001Z',
    expectedProfileUpdatedAt: '2026-10-01T00:00:00.000002Z', reasonCode: 'SUPPORT_REQUEST', confirmation: 'UPDATE MEMBER PROFILE' };
  const response = await handleAccountSupport(request(body, profilePath, 'PATCH'), environment(), OWNER, correlation, db.run);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { profile: { displayName: body.displayName, bio: body.bio,
    userUpdatedAt: '2026-10-02T00:00:00.000001Z', profileUpdatedAt: '2026-10-02T00:00:00.000002Z', moderationState: 'under_review' }, correlationId: correlation });
  const profileUpdate = db.queries.find(query => query.sql.startsWith('INSERT INTO social.profiles'));
  assert.equal(profileUpdate.values[1], body.bio); assert.equal(profileUpdate.values[3], body.expectedProfileUpdatedAt);
  const outbox = db.queries.find(query => query.sql.startsWith('INSERT INTO system.outbox_events'));
  assert.match(outbox.sql, /'content\.profile\.updated'/); assert.equal(outbox.values[1], ID); assert.equal(outbox.values[2], OWNER.userId);
  assert.deepEqual(JSON.parse(outbox.values[3]).changedFields, ['display_name', 'bio']);
  const audit = db.queries.find(query => query.sql.includes('INSERT INTO system.audit_events'));
  assert.equal(audit.values[1], OWNER.userId); assert.equal(audit.values[3], ID); assert.equal(audit.values[4], 'SUPPORT_REQUEST');
  assert.deepEqual(JSON.parse(audit.values[6]).changedFields, ['display_name', 'bio']);
  assert.deepEqual(JSON.parse(audit.values[6]).before, { displayName: 'Synthetic member', bio: 'Synthetic bio' });
  assert.deepEqual(JSON.parse(audit.values[6]).after, { displayName: body.displayName, bio: body.bio });
});

test('profile corrections reject stale revisions, unknown settings and missing confirmation', async () => {
  const body = { bio: 'Corrected bio', expectedUserUpdatedAt: '2026-10-01T00:00:00.000001Z', expectedProfileUpdatedAt: '2026-10-01T00:00:00.000002Z',
    reasonCode: 'SUPPORT_REQUEST', confirmation: 'UPDATE MEMBER PROFILE' };
  await assert.rejects(handleAccountSupport(request({ ...body, expectedUserUpdatedAt: '2026-09-01T00:00:00.000001Z' }, profilePath, 'PATCH'), environment(), OWNER, correlation, database().run), /account_support_profile_conflict/);
  await assert.rejects(handleAccountSupport(request({ ...body, confirmation: 'CONFIRM' }, profilePath, 'PATCH'), environment(), OWNER, correlation, database().run), /confirmation_required/);
  await assert.rejects(handleAccountSupport(request({ ...body, email }, profilePath, 'PATCH'), environment(), OWNER, correlation, database().run), /unknown_field/);
  await assert.rejects(handleAccountSupport(request({ ...body, bio: 'Synthetic bio', displayName: 'Synthetic member' }, profilePath, 'PATCH'), environment(), OWNER, correlation, database().run), /profile_update_empty/);
});

test('missing and ambiguous lookup attempts are audited with no guessed target', async () => {
  for (const state of ['not_found', 'ambiguous']) {
    const db = database();
    const result = await handleAccountSupport(request(), environment(async () => Response.json({ workerVersion: VERSION, result: { state, account: null } })), OWNER, correlation, db.run);
    assert.equal((await result.json()).state, state);
    assert.equal(db.queries.at(-1).values[3], null);
    assert.equal(JSON.parse(db.queries.at(-1).values[6]).outcome, state);
  }
});

test('every read is fail-closed for inactive membership, missing binding, service failure or failed audit', async () => {
  const cases = [[environment(), database({ member: false }), 'account_support_owner_required'],
    [{ DB_ADMIN_FRESH: {}, CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co' }, database(), 'account_support_unavailable'],
    [environment(async () => { throw new Error('private-secret'); }), database(), 'account_support_unavailable'],
    [environment(), database({ auditCount: 0 }), 'account_support_unavailable'],
    [environment(), database({ failure: 'private-secret' }), 'account_support_unavailable']];
  for (const [env, db, error] of cases) await assert.rejects(handleAccountSupport(request(), env, OWNER, correlation, db.run), new RegExp(`^Error: ${error}$`));
  for (const role of ['administrator', 'moderator', 'privacy_operator', 'guest']) {
    const db = database();
    await assert.rejects(handleAccountSupport(request(), environment(), { ...OWNER, role }, correlation, db.run), /account_support_owner_required/);
    assert.equal(db.queries.length, 0);
  }
  await assert.rejects(handleAccountSupport(request(), environment(), { ...OWNER, userId: 'bad' }, correlation, database().run), /account_support_owner_required/);
});

test('private candidate pinning and bounded delegated-response validation fail closed', async () => {
  const pinned = () => request(undefined, undefined, undefined, { 'Cloudflare-Workers-Version-Overrides': `other-worker="${OTHER}", lythaus-public-api-development="${VERSION}"` });
  const result = await handleAccountSupport(pinned(), environment(async (_url, init) => {
    assert.equal(init.headers['Cloudflare-Workers-Version-Overrides'], `lythaus-public-api-development="${VERSION}"`);
    return Response.json({ workerVersion: VERSION, result: { state: 'found', account } });
  }), OWNER, correlation, database().run);
  assert.equal(result.status, 200);
  for (const payload of [{ workerVersion: OTHER, result: { state: 'found', account } }, { workerVersion: 'bad', result: { state: 'not_found', account: null } },
    { workerVersion: VERSION }, { workerVersion: VERSION, result: { state: 'other' } },
    { workerVersion: VERSION, result: { state: 'not_found', account } }, { workerVersion: VERSION, result: { state: 'found', account: {} } }]) {
    await assert.rejects(handleAccountSupport(pinned(), environment(async () => Response.json(payload)), OWNER, correlation, database().run), /account_support_unavailable/);
  }
  for (const response of [new Response('private'.repeat(1000)), new Response('{'), Response.json({ workerVersion: VERSION, error: 'private-secret' }, { status: 500 })]) {
    await assert.rejects(handleAccountSupport(request(), environment(async () => response), OWNER, correlation, database().run), /account_support_unavailable/);
  }
  await assert.rejects(handleAccountSupport(request(), environment(async () => Response.json({ workerVersion: VERSION, error: 'account_support_owner_required' }, { status: 403 })), OWNER, correlation, database().run), /account_support_owner_required/);
});

test('private service timeout prevents disclosure and aborts the pending request', async () => {
  let signal;
  await assert.rejects(handleAccountSupport(request(), environment(async (_url, init) => { signal = init.signal; return new Promise(() => {}); }), OWNER, correlation, database().run), /account_support_unavailable/);
  assert.equal(signal.aborted, true);
});

test('support routes reject non-read methods, query-string lookup and unsafe bodies before any account read', async () => {
  for (const [path, method, status] of [['/api/admin/account-support/lookup', 'GET', 405], ['/api/admin/account-support/lookup', 'DELETE', 405],
    ['/api/admin/account-support/unknown', 'POST', 404], [`/api/admin/account-support/lookup?email=${email}`, 'POST', 404]]) {
    const db = database();
    assert.equal((await handleAccountSupport(request({}, path, method), environment(), OWNER, correlation, db.run)).status, status);
    assert.equal(db.queries.length, 0);
  }
  for (const [body, error] of [[null, 'invalid_json'], [[], 'invalid_json'], [{ email, reasonCode: 'SUPPORT_REQUEST', resetToken: 'private' }, 'unknown_field'],
    [{ email: 'partial', reasonCode: 'SUPPORT_REQUEST' }, 'invalid_email'], [{ email: 1 }, 'invalid_email'], [{ email: 'x'.repeat(321) }, 'invalid_email'], [{ email }, 'reason_code_required']]) {
    const db = database(); await assert.rejects(handleAccountSupport(request(body), environment(), OWNER, correlation, db.run), new RegExp(error)); assert.equal(db.queries.length, 0);
  }
  await assert.rejects(handleAccountSupport(request(undefined, undefined, undefined, { origin: 'https://evil.invalid' }), environment(), OWNER, correlation, database().run), /admin_mutation_origin_invalid/);
  await assert.rejects(handleAccountSupport(request(undefined, undefined, undefined, { 'content-type': 'text/plain' }), environment(), OWNER, correlation, database().run), /admin_mutation_content_type_invalid/);
});

test('owner access check reads no account data and requires active owner membership', async () => {
  const db = database();
  assert.deepEqual(await (await handleAccountSupport(request({}, '/api/admin/account-support/access', 'GET'), environment(), OWNER, correlation, db.run)).json(), { available: true, profileCorrectionsAvailable: true });
  assert.equal(db.queries.length, 2);
  assert.match(db.queries[0].sql, /identity\.admin_memberships/);
  assert.match(db.queries[1].sql, /has_schema_privilege/);
  await assert.rejects(handleAccountSupport(request({}, '/api/admin/account-support/access', 'GET'), environment(), OWNER, correlation, database({ member: false }).run), /account_support_owner_required/);
});

test('history projects machine facts only, preserves microseconds, binds all filters and audits safe metadata', async () => {
  const db = database({ rows: [entry(), entry(OTHER, 'audit')] });
  const body = { reasonCode: 'SUPPORT_REQUEST', limit: 1, source: 'activity', eventType: 'account.login_succeeded', correlationId: correlation,
    since: '2026-10-01T10:00:00.000000Z', until: '2026-10-01T10:00:00.000002Z', order: 'oldest' };
  const response = await handleAccountSupport(request(body, `/api/admin/account-support/users/${ID}/history`), environment(), OWNER, correlation, db.run);
  const result = await response.json();
  assert.equal(result.items.length, 1); assert.ok(result.nextCursor);
  assert.equal(result.items[0].createdAt, '2026-10-01T10:00:00.000001Z');
  assert.equal(result.coverage, 'partial'); assert.match(result.notice, /does not prove/);
  assert.ok(!JSON.stringify(result).includes('private'));
  const query = db.queries.find(query => query.sql.includes('WITH history'));
  assert.match(query.sql, /ORDER BY created_at ASC/);
  assert.match(query.sql, /target_type = 'user' AND target_id = \$1/);
  assert.match(query.sql, /NULL::text AS correlation_id/);
  assert.ok(!/metadata|explanation|title|password|token|body/.test(query.sql));
  assert.deepEqual(query.values, [ID, '2026-10-02T10:00:00.123456Z', 'activity', 'account.login_succeeded', correlation, body.since, body.until, 2]);
  const audit = JSON.parse(db.queries.at(-1).values[6]);
  assert.equal(audit.hasEventTypeFilter, true); assert.equal(audit.hasCorrelationFilter, true); assert.equal(audit.hasDateFilter, true);
  assert.equal(audit.returnedRowCount, 1);
});

test('history cursors use timestamp, UUID and source ties, retain the first snapshot and reject changed scope', async () => {
  for (const order of ['newest', 'oldest']) {
    const body = { reasonCode: 'SUPPORT_REQUEST', limit: 1, order };
    const path = `/api/admin/account-support/users/${ID}/history`;
    const first = await (await handleAccountSupport(request(body, path), environment(), OWNER, correlation, database({ rows: [entry(ID, 'audit'), entry(ID)] }).run)).json();
    const db = database({ rows: [entry(ID)] });
    const second = await (await handleAccountSupport(request({ ...body, cursor: first.nextCursor }, path), environment(), OWNER, correlation, db.run)).json();
    assert.equal(second.nextCursor, null);
    assert.equal(second.snapshotAt, first.snapshotAt);
    assert.ok(!db.queries.some(query => query.sql.includes('AS snapshot_at')));
    const sql = db.queries.find(query => query.sql.includes('WITH history'));
    assert.match(sql.sql, new RegExp(`source COLLATE "C"\\) ${order === 'oldest' ? '>' : '<'}`));
    assert.deepEqual(sql.values.slice(2, 5), ['2026-10-01T10:00:00.000001Z', ID, 'audit']);
    for (const changed of [{ ...body, source: 'account' }, { ...body, eventType: 'email_login' }, { ...body, correlationId: 'other-correlation' }, { ...body, order: order === 'newest' ? 'oldest' : 'newest' }]) {
      await assert.rejects(handleAccountSupport(request({ ...changed, cursor: first.nextCursor }, path), environment(), OWNER, correlation, database().run), /invalid_cursor/);
    }
    await assert.rejects(handleAccountSupport(request({ ...body, cursor: first.nextCursor }, `/api/admin/account-support/users/${OTHER}/history`), environment(), OWNER, correlation, database().run), /invalid_cursor/);
  }
});

test('malformed filters and cursors are rejected before querying history', async () => {
  const valid = { reasonCode: 'SUPPORT_REQUEST' };
  const path = `/api/admin/account-support/users/${ID}/history`;
  const failures = [[{ source: 'secret' }, 'account_support_invalid_filter'], [{ source: {} }, 'account_support_invalid_filter'],
    [{ eventType: 'private prose' }, 'account_support_invalid_filter'], [{ correlationId: 'x'.repeat(129) }, 'account_support_invalid_filter'],
    [{ order: 'other' }, 'account_support_invalid_filter'], [{ since: '2026-02-30T00:00:00Z' }, 'invalid_date_filter'],
    [{ since: '2026-10-02T00:00:00Z', until: '2026-10-01T00:00:00Z' }, 'invalid_date_filter'],
    [{ limit: 0 }, 'invalid_page_limit'], [{ limit: 51 }, 'invalid_page_limit'], [{ limit: '2' }, 'invalid_page_limit'],
    [{ cursor: '' }, 'invalid_cursor'], [{ cursor: 'bad' }, 'invalid_cursor'], [{ cursor: 2 }, 'invalid_cursor'], [{ cursor: 'x'.repeat(2049) }, 'invalid_cursor'],
    [{ cursor: btoa(JSON.stringify({ scope: JSON.stringify({ userId: ID, source: null, eventType: null, correlationId: null, since: null, until: null, order: 'newest' }), id: ID, source: 'other' })) }, 'invalid_cursor']];
  for (const [changes, error] of failures) {
    const db = database(); await assert.rejects(handleAccountSupport(request({ ...valid, ...changes }, path), environment(), OWNER, correlation, db.run), new RegExp(error)); assert.equal(db.queries.length, 0);
  }
  await assert.rejects(handleAccountSupport(request(valid, '/api/admin/account-support/users/invalid/history'), environment(), OWNER, correlation, database().run), /invalid_user_id/);
});

test('empty history stays explicitly partial, absent correlations stay null and missing account or storage fails honestly', async () => {
  const path = `/api/admin/account-support/users/${ID}/history`;
  const body = { reasonCode: 'SUPPORT_REQUEST', source: null, eventType: '', correlationId: null, since: '', until: null, cursor: null };
  const empty = await (await handleAccountSupport(request(body, path), environment(), OWNER, correlation, database().run)).json();
  assert.deepEqual(empty.items, []); assert.equal(empty.nextCursor, null); assert.equal(empty.coverage, 'partial');
  await assert.rejects(handleAccountSupport(request(body, path), environment(), OWNER, correlation, database({ exists: false }).run), /user_not_found/);
  const row = { ...entry(ID, 'account'), event_type: 'private text', correlation_id: null, reason_code: 'https://private.invalid/reset?token=private', category: null, outcome: null };
  const redacted = await (await handleAccountSupport(request(body, path), environment(), OWNER, correlation, database({ rows: [row] }).run)).json();
  assert.equal(redacted.items[0].eventType, 'unavailable'); assert.equal(redacted.items[0].correlationId, null); assert.equal(redacted.items[0].reasonCode, null);
  await assert.rejects(handleAccountSupport(request(body, path), environment(), OWNER, correlation, database({ auditCount: 0 }).run), /account_support_unavailable/);
});
