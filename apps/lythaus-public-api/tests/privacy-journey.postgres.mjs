import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import * as database from '@lythaus/db';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { PLATFORM_SAFETY_LIMITS } from '../../../packages/contracts/src/tier-policy.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_auth_test') || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Privacy tests require an explicitly local disposable PostgreSQL database');
}
async function withClient(work, role) {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try {
    await client.query("SET statement_timeout='5s'");
    if (role) {
      assert.equal(role, 'lythaus_runtime');
      await client.query('SET ROLE lythaus_runtime');
    }
    return await work(client);
  } finally { await client.end(); }
}
const sql = (text, values) => withClient(client => client.query(text, values));
mock.module('@lythaus/db', { namedExports: { ...database,
  query: (binding, text, values) => withClient(client => client.query(text, values), binding.role),
  transaction: (binding, work) => withClient(async client => {
    await client.query('BEGIN');
    try { const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
  }, binding.role),
} });
const { default: worker } = await import('../src/index.ts');
const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
const keyId = 'synthetic-local-privacy-test';
const privateKeyPem = await exportPKCS8(privateKey);
const storageReads = [];
const objects = new Map();
const env = {
  ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
  CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test', DB_APP_FRESH: { role: 'lythaus_runtime' },
  JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
  PRIVATE_EXPORTS: { async get(key) { storageReads.push(key); return objects.get(key) ?? null; } },
};
async function owner() {
  const id = uuidv7();
  await sql("INSERT INTO identity.users(id,status) VALUES($1,'active')", [id]);
  return { id, token: await signAccessToken({ userId: id, privateKeyPem, keyId }) };
}
async function call(actor, method, path, body, key = uuidv7()) {
  return worker.fetch(new Request('https://api.lythaus.test/api/privacy/requests' + path, {
    method, headers: {
      ...(actor ? { Authorization: 'Bearer ' + actor.token } : {}),
      Origin: 'https://app.lythaus.test',
      ...(body !== undefined ? { 'Content-Type': 'application/json', 'Idempotency-Key': key } : {}),
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), env, { waitUntil() {} });
}
async function request(actor, state, ageDays = 1, type = 'export') {
  const id = uuidv7();
  await sql(`INSERT INTO privacy.requests(id,subject_id,request_type,state,created_at,completed_at)
    VALUES($1,$2,$3,$4,now()-($5::integer*interval '1 day'),CASE WHEN $4='completed' THEN now() ELSE NULL END)`,
  [id, actor.id, type, state, ageDays]);
  return id;
}

test('anonymous requests are rejected and authenticated empty history is explicit', async () => {
  assert.equal((await call(null, 'GET', '?requestType=export')).status, 401);
  assert.equal((await call(null, 'POST', '', { requestType: 'export' })).status, 401);
  const actor = await owner();
  const response = await call(actor, 'GET', '?requestType=export');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { request: null, retryAfterSeconds: 0 });
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
});

for (const state of ['received', 'processing', 'blocked', 'completed', 'failed']) {
  test(`${state} status preserves the canonical cooldown and owner isolation`, async () => {
    const actor = await owner(); const other = await owner();
    const id = await request(actor, state);
    const response = await call(actor, 'GET', '?requestType=export');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.request.requestId, id); assert.equal(body.request.state, state);
    const expected = (PLATFORM_SAFETY_LIMITS.exportCooldownDays - 1) * 86400;
    assert.ok(body.retryAfterSeconds <= expected && body.retryAfterSeconds >= expected - 2);
    assert.deepEqual(await (await call(other, 'GET', '?requestType=export')).json(), { request: null, retryAfterSeconds: 0 });
    const repeat = await call(actor, 'POST', '', { requestType: 'export' });
    assert.equal(repeat.status, 429, await repeat.clone().text());
  });
}

test('cooldown expiry permits one new request while active processing and holds remain blocked', async () => {
  const actor = await owner(); await request(actor, 'completed', PLATFORM_SAFETY_LIMITS.exportCooldownDays + 1);
  assert.equal((await (await call(actor, 'GET', '?requestType=export')).json()).retryAfterSeconds, 0);
  const key = uuidv7();
  const first = await call(actor, 'POST', '', { requestType: 'export' }, key);
  assert.equal(first.status, 202, await first.clone().text());
  const acknowledgement = await first.json();
  assert.equal(acknowledgement.state, 'received'); assert.ok(acknowledgement.acceptedAt);
  const retry = await call(actor, 'POST', '', { requestType: 'export' }, key);
  assert.equal(retry.status, 202); assert.deepEqual(await retry.json(), acknowledgement);
  assert.equal((await sql('SELECT id FROM privacy.requests WHERE subject_id=$1', [actor.id])).rowCount, 2);
  assert.equal((await sql("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='privacy.request.created'", [acknowledgement.requestId])).rowCount, 1);
  for (const state of ['processing', 'blocked']) {
    const held = await owner(); await request(held, state, PLATFORM_SAFETY_LIMITS.exportCooldownDays + 1);
    assert.equal((await call(held, 'POST', '', { requestType: 'export' })).status, 429);
  }
});

test('concurrent repeated exports queue only one request', async () => {
  const actor = await owner();
  const responses = await Promise.all([call(actor, 'POST', '', { requestType: 'export' }), call(actor, 'POST', '', { requestType: 'export' })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [202, 429]);
  assert.equal((await sql('SELECT id FROM privacy.requests WHERE subject_id=$1', [actor.id])).rowCount, 1);
});

test('deletion remains an asynchronous owner request and respects an existing hold', async () => {
  const actor = await owner();
  const response = await call(actor, 'POST', '', { requestType: 'delete' });
  assert.equal(response.status, 202); const acknowledgement = await response.json();
  assert.equal(acknowledgement.state, 'received');
  assert.equal((await sql('SELECT status FROM identity.users WHERE id=$1', [actor.id])).rows[0].status, 'active');
  await sql("UPDATE privacy.requests SET state='blocked' WHERE id=$1", [acknowledgement.requestId]);
  const status = await (await call(actor, 'GET', '?requestType=delete')).json();
  assert.equal(status.request.state, 'blocked'); assert.ok(!('retryAfterSeconds' in status));
  assert.equal((await call(actor, 'POST', '', { requestType: 'delete' })).status, 429);
});

test('download requires the current owner, completion and an unexpired manifest before storage reads', async () => {
  const actor = await owner(); const stranger = await owner(); const id = await request(actor, 'completed');
  const bytes = Buffer.from(JSON.stringify({ syntheticOwner: actor.id }));
  const hash = createHash('sha256').update(bytes).digest('hex'); const objectKey = 'synthetic/' + id;
  await sql(`INSERT INTO privacy.export_manifests(id,request_id,object_key,package_hash,expires_at)
    VALUES($1,$2,$3,$4,now()+interval '1 day')`, [uuidv7(), id, objectKey, hash]);
  objects.set(objectKey, { body: bytes, httpEtag: 'synthetic', httpMetadata: { contentType: 'application/json' } });
  const before = storageReads.length;
  assert.notEqual((await call(stranger, 'GET', '/' + id + '/export')).status, 200);
  assert.equal(storageReads.length, before);
  const response = await call(actor, 'GET', '/' + id + '/export');
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get('x-content-sha256'), hash);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.match(response.headers.get('access-control-expose-headers'), /x-content-sha256/);
  await sql("UPDATE privacy.export_manifests SET expires_at=now()-interval '1 second' WHERE request_id=$1", [id]);
  const after = storageReads.length;
  assert.notEqual((await call(actor, 'GET', '/' + id + '/export')).status, 200);
  await sql("UPDATE privacy.export_manifests SET expires_at=now()+interval '1 day' WHERE request_id=$1", [id]);
  await sql("UPDATE privacy.requests SET state='blocked' WHERE id=$1", [id]);
  assert.notEqual((await call(actor, 'GET', '/' + id + '/export')).status, 200);
  assert.equal(storageReads.length, after);
  await sql('UPDATE identity.users SET token_version=token_version+1 WHERE id=$1', [actor.id]);
  assert.equal((await call(actor, 'GET', '?requestType=export')).status, 401);
  assert.equal((await call(actor, 'GET', '/' + id + '/export')).status, 401);
});
