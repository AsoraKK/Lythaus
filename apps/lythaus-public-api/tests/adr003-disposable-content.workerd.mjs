import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { publicationAdmissionFixture } from './publication-admission-fixture.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.match(target.pathname, /^\/lythaus_auth_test_post_[a-z0-9_]+$/);
assert.equal(target.search, ''); assert.equal(target.hash, '');
const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
let fixture, token, userId;

before(async () => {
  await client.connect();
  assert.match((await client.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const keyId = 'synthetic-adr003-local';
  userId = uuidv7();
  await client.query("INSERT INTO identity.users(id,status,display_name) VALUES($1,'active','Synthetic acceptance actor')", [userId]);
  await client.query("INSERT INTO social.profiles(user_id,moderation_state,public_visibility) VALUES($1,'allowed',true)", [userId]);
  token = await signAccessToken({ userId, privateKeyPem: await exportPKCS8(privateKey), keyId });
  fixture = await publicationAdmissionFixture(connectionString, {
    ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test', CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
    JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
    PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
  });
});
after(async () => { await fixture?.dispose(); await client.end(); });

async function call(method, route, body) {
  return fixture.dispatchFetch('https://api.lythaus.test' + route, { method, headers: {
    authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': uuidv7(),
    'cf-connecting-ip': '192.0.2.15',
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

test('ADR-003 A11-A13 execute authenticated writes only on disposable PG17 and Workerd', async () => {
  const profile = await call('GET', '/api/users/me');
  assert.equal(profile.status, 200, await profile.clone().text());
  const update = await call('PATCH', '/api/users/me', { bio: 'Synthetic ADR-003 fixture' });
  assert.equal(update.status, 200, await update.clone().text());
  const saved = await client.query('SELECT bio FROM social.profiles WHERE user_id=$1', [userId]);
  assert.equal(saved.rows[0].bio, 'Synthetic ADR-003 fixture');

  const post = await call('POST', '/api/posts', { body: 'Synthetic ADR-003 fixture', declaredCreationMode: 'human', geoScope: 'none' });
  assert.equal(post.status, 201, await post.clone().text());
  const postId = (await post.json()).id;
  assert.ok(postId);
  const storedPost = await client.query('SELECT author_id, moderation_state FROM content.posts WHERE id=$1', [postId]);
  assert.equal(storedPost.rows[0].author_id, userId);
  assert.equal(storedPost.rows[0].moderation_state, 'under_review');

  const flag = await call('POST', '/api/flags', { contentType: 'post', contentId: postId, reasonCode: 'acceptance_test' });
  assert.equal(flag.status, 201, await flag.clone().text());
  const flagId = (await flag.json()).flagId;
  const storedFlag = await client.query('SELECT reporter_id,content_id FROM moderation.content_flags WHERE id=$1', [flagId]);
  assert.deepEqual(storedFlag.rows[0], { reporter_id: userId, content_id: postId });
});
