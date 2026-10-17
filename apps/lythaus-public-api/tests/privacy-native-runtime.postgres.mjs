import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { nativePostgresProfileFixture } from './native-postgres-worker-fixture.mjs';
import { privacyPostgresTarget } from './privacy-postgres-target.mjs';

const connectionString = privacyPostgresTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL).toString();
const ids = Object.fromEntries(['a', 'b', 'c', 'd'].map(actor => [actor, uuidv7()]));
const subjects = Object.values(ids);
const fixtureIp = '2001:db8:' + ids.c.replaceAll('-', '').slice(-16).match(/.{4}/g).join(':') + '::1';
const rateHash = createHash('sha256').update(`public-api:${fixtureIp}`).digest('hex');
const exportsByActor = Object.fromEntries(['a', 'b'].map(actor => {
  const requestId = uuidv7();
  const body = JSON.stringify({ userId: ids[actor], privateValue: `SYNTHETIC_EXPORT_${actor.toUpperCase()}` });
  return [actor, { requestId, body, key: `exports/${ids[actor]}/${requestId}.json`, hash: createHash('sha256').update(body).digest('hex') }];
}));
const queries = [], tokens = {};
let control, fixture, unexpectedOutbound = 0;

before(async () => {
  control = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
  await control.connect();
  await control.query("SET statement_timeout='5s'");
  const version = Number((await control.query('SHOW server_version_num')).rows[0].server_version_num);
  assert.ok(version >= 170000 && version < 180000);
  await control.query('BEGIN');
  try {
    for (const id of subjects) await control.query('INSERT INTO identity.users(id) VALUES($1)', [id]);
    for (const actor of ['a', 'b']) {
      const item = exportsByActor[actor];
      await control.query(`INSERT INTO privacy.requests(id,subject_id,request_type,state,completed_at)
        VALUES($1,$2,'export','completed',now())`, [item.requestId, ids[actor]]);
      await control.query(`INSERT INTO privacy.export_manifests(id,request_id,object_key,package_hash,expires_at)
        VALUES($1,$2,$3,$4,now()+interval '1 day')`, [uuidv7(), item.requestId, item.key, item.hash]);
    }
    await control.query('COMMIT');
  } catch (error) { await control.query('ROLLBACK'); throw error; }
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const privateKeyPem = await exportPKCS8(privateKey), keyId = 'synthetic-native-privacy';
  for (const actor of Object.keys(ids)) tokens[actor] = await signAccessToken({ userId: ids[actor], privateKeyPem, keyId });
  fixture = await nativePostgresProfileFixture(connectionString, {
    ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
    CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
    WORKER_VERSION: { id: uuidv7(), tag: 'synthetic-native-privacy' },
    JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
  }, {
    privateExports: true,
    outboundService: async () => { unexpectedOutbound += 1; return new Response(null, { status: 403 }); },
    onQuery: record => {
      assert.equal(record.role, 'lythaus_runtime');
      assert.ok(!record.rolsuper && !record.rolcreaterole && !record.rolcreatedb);
      queries.push(record);
    },
  });
  const bucket = await fixture.privateExports();
  for (const item of Object.values(exportsByActor)) await bucket.put(item.key, item.body, { httpMetadata: { contentType: 'application/json' } });
});

after(async () => {
  try { await fixture?.dispose(); }
  finally {
    if (control) {
      try {
        await control.query('BEGIN');
        for (const table of ['privacy.export_manifests', 'privacy.request_events']) await control.query(
          `DELETE FROM ${table} WHERE request_id IN (SELECT id FROM privacy.requests WHERE subject_id=ANY($1::uuid[]))`, [subjects]);
        await control.query('DELETE FROM privacy.requests WHERE subject_id=ANY($1::uuid[])', [subjects]);
        await control.query('DELETE FROM trust.user_activity_events WHERE user_id=ANY($1::uuid[]) OR actor_user_id=ANY($1::uuid[])', [subjects]);
        await control.query('DELETE FROM system.outbox_events WHERE actor_id=ANY($1::uuid[])', [subjects]);
        await control.query('DELETE FROM system.idempotency_keys WHERE actor_id=ANY($1::uuid[])', [subjects]);
        await control.query("DELETE FROM system.rate_limit_windows WHERE scope='public-api' AND subject_hash=$1", [rateHash]);
        await control.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])', [subjects]);
        assert.equal((await control.query('SELECT count(*)::integer AS count FROM identity.users WHERE id=ANY($1::uuid[])', [subjects])).rows[0].count, 0);
        assert.equal((await control.query("SELECT count(*)::integer AS count FROM system.rate_limit_windows WHERE scope='public-api' AND subject_hash=$1", [rateHash])).rows[0].count, 0);
        await control.query('COMMIT');
        process.stdout.write('Native privacy cleanup: zero owned users and rate windows.\n');
      } catch (error) { await control.query('ROLLBACK'); throw error; }
      finally { await control.end(); }
    }
  }
});

async function call(actor, path, body, key) {
  const headers = { origin: 'https://app.lythaus.test', 'cf-connecting-ip': fixtureIp,
    ...(actor ? { authorization: 'Bearer ' + tokens[actor] } : {}),
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(key ? { 'idempotency-key': key } : {}) };
  return fixture.dispatchFetch('https://api.lythaus.test/api/privacy/requests' + path, {
    method: body === undefined ? 'GET' : 'POST', headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function assertPrivate(response) { assert.equal(response.headers.get('cache-control'), 'private, no-store'); }

async function privateError(response, status, error) {
  assert.equal(response.status, status);
  assertPrivate(response);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['correlationId', 'error']);
  assert.equal(body.error, error);
  assert.equal(response.headers.get('x-correlation-id'), body.correlationId);
  for (const header of ['etag', 'x-content-sha256', 'content-disposition']) assert.equal(response.headers.get(header), null);
  const headers = Object.fromEntries(response.headers);
  delete headers['x-correlation-id'];
  return { status, body: { error }, headers };
}

async function waitFor(predicate) {
  const deadline = Date.now() + 10_000;
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for the synthetic privacy request lock');
    await setTimeout(20);
  }
}

test('native Workerd serves exact owner exports and makes malformed, missing and foreign IDs indistinguishable', async () => {
  for (const actor of ['a', 'b', 'a']) {
    const item = exportsByActor[actor], other = exportsByActor[actor === 'a' ? 'b' : 'a'];
    const response = await call(actor, '/' + item.requestId + '/export');
    assert.equal(response.status, 200);
    assertPrivate(response);
    assert.equal(response.headers.get('x-content-sha256'), item.hash);
    const body = await response.text();
    assert.equal(body, item.body);
    assert.ok(!body.includes(JSON.parse(other.body).privateValue));
    const status = await call(actor, '?requestType=export&subjectId=' + ids[actor === 'a' ? 'b' : 'a']);
    assert.equal(status.status, 200);
    assertPrivate(status);
    const statusBody = await status.json();
    assert.equal(statusBody.request.requestId, item.requestId);
    assert.equal(statusBody.request.state, 'completed');
    assert.ok(statusBody.request.completedAt);
    assert.ok(!JSON.stringify(statusBody).includes(other.requestId));
  }
  const successCount = (await control.query("SELECT count(*)::integer AS count FROM trust.user_activity_events WHERE user_id=ANY($1::uuid[]) AND event_type='privacy.export_accessed'", [[ids.a, ids.b]])).rows[0].count;
  const missing = await privateError(await call('a', '/' + uuidv7() + '/export'), 404, 'export_not_found');
  assert.deepEqual(await privateError(await call('a', '/' + exportsByActor.b.requestId + '/export'), 404, 'export_not_found'), missing);
  for (const id of ['not-a-uuid', `${uuidv7()}' OR '1'='1`, '../../private-export']) {
    const start = queries.length;
    assert.deepEqual(await privateError(await call('a', '/' + encodeURIComponent(id) + '/export'), 404, 'export_not_found'), missing);
    assert.ok(!queries.slice(start).some(row => row.text.includes('FROM privacy.export_manifests')));
  }
  const guest = await privateError(await call(undefined, '/' + exportsByActor.b.requestId + '/export'), 401, 'authentication_required');
  assert.deepEqual(await privateError(await call(undefined, '/' + uuidv7() + '/export'), 401, 'authentication_required'), guest);
  await control.query("UPDATE privacy.export_manifests SET expires_at=now()-interval '1 second' WHERE request_id=$1", [exportsByActor.a.requestId]);
  assert.deepEqual(await privateError(await call('a', '/' + exportsByActor.a.requestId + '/export'), 404, 'export_not_found'), missing);
  await control.query("UPDATE privacy.export_manifests SET expires_at=now()+interval '1 day' WHERE request_id=$1", [exportsByActor.a.requestId]);
  await control.query("UPDATE privacy.requests SET state='processing' WHERE id=$1", [exportsByActor.a.requestId]);
  assert.deepEqual(await privateError(await call('a', '/' + exportsByActor.a.requestId + '/export'), 404, 'export_not_found'), missing);
  assert.equal((await control.query("SELECT count(*)::integer AS count FROM trust.user_activity_events WHERE user_id=ANY($1::uuid[]) AND event_type='privacy.export_accessed'", [[ids.a, ids.b]])).rows[0].count, successCount);
});

test('native export and deletion requests, replay and status remain account-bound and asynchronous', async () => {
  for (const requestType of ['export', 'delete']) {
    const key = uuidv7(), body = { requestType };
    await privateError(await call(undefined, `?requestType=${requestType}&subjectId=${ids.c}`), 401, 'authentication_required');
    await privateError(await call(undefined, '', body, uuidv7()), 401, 'authentication_required');
    const first = await call('c', '', body, key);
    assert.equal(first.status, 202);
    assertPrivate(first);
    const accepted = await first.json();
    assert.equal(accepted.requestType, requestType);
    assert.equal(accepted.state, 'received');
    assert.ok(!('completedAt' in accepted) && !('deleted' in accepted));
    const replay = await call('c', '', body, key);
    assert.equal(replay.status, 202);
    assertPrivate(replay);
    assert.deepEqual(await replay.json(), accepted);
    await privateError(await call('d', '', body, key), 409, 'idempotency_key_conflict');
    await privateError(await call('c', '', { requestType: requestType === 'export' ? 'delete' : 'export' }, key), 409, 'idempotency_key_conflict');
    const own = await call('c', `?requestType=${requestType}&subjectId=${ids.d}`);
    assert.equal(own.status, 200);
    assertPrivate(own);
    const ownBody = await own.json();
    assert.equal(ownBody.request.requestId, accepted.requestId);
    assert.equal(ownBody.request.state, 'received');
    assert.equal(ownBody.request.completedAt, null);
    const foreign = await call('d', `?requestType=${requestType}&subjectId=${ids.c}&requestId=${accepted.requestId}`);
    assert.equal(foreign.status, 200);
    assertPrivate(foreign);
    assert.deepEqual(await foreign.json(), requestType === 'export' ? { request: null, retryAfterSeconds: 0 } : { request: null });
    await privateError(await call('c', '', body, uuidv7()), 429, 'privacy_request_active');
    assert.equal((await control.query('SELECT count(*)::integer AS count FROM privacy.requests WHERE subject_id=$1 AND request_type=$2', [ids.c, requestType])).rows[0].count, 1);
    assert.equal((await control.query("SELECT count(*)::integer AS count FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='privacy.request.created'", [accepted.requestId])).rows[0].count, 1);
    if (requestType === 'delete') {
      await control.query("UPDATE privacy.requests SET state='blocked' WHERE id=$1", [accepted.requestId]);
      const blocked = await call('c', '?requestType=delete');
      assert.equal(blocked.status, 200);
      assertPrivate(blocked);
      const blockedBody = await blocked.json();
      assert.equal(blockedBody.request.state, 'blocked');
      assert.equal(blockedBody.request.completedAt, null);
    }
  }
  assert.equal((await control.query('SELECT status FROM identity.users WHERE id=$1', [ids.c])).rows[0].status, 'active');
  assert.equal((await control.query('SELECT count(*)::integer AS count FROM privacy.requests WHERE subject_id=$1', [ids.d])).rows[0].count, 0);
});

test('a privacy request rechecks active account state after waiting behind deletion', async () => {
  await control.query('BEGIN');
  await control.query("UPDATE identity.users SET status='locked' WHERE id=$1", [ids.d]);
  const queryStart = queries.length;
  const outcome = call('d', '', { requestType: 'export' }, uuidv7());
  let reachedAccountLock = false;
  try {
    await Promise.race([
      waitFor(() => queries.slice(queryStart).some(query => query.text.includes('FROM identity.users')
        && query.text.includes('FOR UPDATE') && query.values[0] === ids.d))
        .then(() => { reachedAccountLock = true; }),
      outcome.then(async response => {
        if (reachedAccountLock) return;
        throw new Error(`privacy request stopped before account lock: ${response.status} ${await response.text()} ${JSON.stringify(queries.slice(queryStart))}`);
      }),
    ]);
    await control.query('COMMIT');
  } catch (error) {
    await control.query('ROLLBACK');
    await outcome.catch(() => undefined);
    throw error;
  }
  const response = await outcome;
  await privateError(response, 401, 'authentication_required');
  assert.equal((await control.query('SELECT count(*)::integer AS count FROM privacy.requests WHERE subject_id=$1', [ids.d])).rows[0].count, 0);
  assert.equal((await control.query("SELECT count(*)::integer AS count FROM system.outbox_events WHERE actor_id=$1 AND event_type='privacy.request.created'", [ids.d])).rows[0].count, 0);
});

test('native privacy SQL uses only the restricted canonical runtime role and no outbound destinations', () => {
  assert.ok(queries.length > 0 && queries.every(row => row.role === 'lythaus_runtime' && !row.rolsuper && !row.rolcreaterole && !row.rolcreatedb));
  assert.ok(queries.some(row => row.text.includes('FROM privacy.export_manifests')));
  assert.ok(queries.some(row => row.text.includes('INSERT INTO privacy.requests')));
  assert.equal(unexpectedOutbound, 0);
});
