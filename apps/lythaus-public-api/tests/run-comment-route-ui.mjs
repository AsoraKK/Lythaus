import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { privacyPostgresTarget } from './privacy-postgres-target.mjs';
import { commentRuntimeFixture } from './comment-runtime-fixture.mjs';

const connectionString = privacyPostgresTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL).toString();
const control = new pg.Client({ connectionString, ssl: false });
let fixture, server;
try {
  await control.connect();
  assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  const owner = uuidv7(), actor = uuidv7(), postId = uuidv7(), comments = [];
  await control.query("INSERT INTO identity.users(id,status) VALUES($1,'active'),($2,'active')", [owner, actor]);
  await control.query("INSERT INTO content.posts(id,author_id,body,declared_creation_mode,moderation_state,visibility) VALUES($1,$2,'Synthetic parent','human','allowed','followers')", [postId, owner]);
  await control.query("INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label) VALUES($1,'human','Human-authored')", [postId]);
  for (let index = 0; index < 30; index++) {
    const id = uuidv7(); comments.push(id);
    await control.query(`INSERT INTO content.comments(id,post_id,author_id,body,depth,declared_creation_mode,moderation_state,created_at)
      VALUES($1,$2,$3,$4,0,'human','allowed','2026-10-01T00:00:00Z'::timestamptz + $5 * interval '1 second')`,
    [id, postId, owner, 'Synthetic gated comment ' + index, index]);
  }
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const keyId = 'synthetic-comment-ui-route';
  const token = await signAccessToken({ userId: actor, privateKeyPem: await exportPKCS8(privateKey), keyId });
  fixture = await commentRuntimeFixture(connectionString, {
    ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test', CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
    PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
    JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
  });
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/fixture/config') return response.end(JSON.stringify({ actor, postId }));
      if (url.pathname === '/fixture/reset' && request.method === 'POST') {
        await control.query("UPDATE content.posts SET visibility='followers' WHERE id=$1", [postId]);
        await control.query("UPDATE content.comments SET moderation_state='allowed' WHERE post_id=$1", [postId]);
        await control.query('INSERT INTO social.follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [actor, owner]);
        return response.end('{}');
      }
      if (url.pathname === '/fixture/revoke' && request.method === 'POST') {
        if (url.searchParams.get('kind') === 'unfollow') await control.query('DELETE FROM social.follows WHERE follower_id=$1 AND followed_id=$2', [actor, owner]);
        else if (url.searchParams.get('kind') === 'private') await control.query("UPDATE content.posts SET visibility='private' WHERE id=$1", [postId]);
        else if (url.searchParams.get('kind') === 'empty-tail') await control.query("UPDATE content.comments SET moderation_state='blocked' WHERE id=ANY($1::uuid[])", [comments.slice(0, 5)]);
        else throw new Error('unsupported_fixture_change');
        return response.end('{}');
      }
      if (request.method !== 'GET' || url.pathname !== '/api/posts/' + postId + '/comments') {
        response.writeHead(404); return response.end('{}');
      }
      const result = await fixture.dispatchFetch('https://api.lythaus.test' + url.pathname + url.search, {
        headers: { authorization: 'Bearer ' + token, origin: 'https://app.lythaus.test' },
      });
      response.writeHead(result.status, { 'content-type': 'application/json' });
      response.end(await result.text());
    } catch { response.writeHead(500); response.end('{"error":"fixture_failed"}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await mkdir('.artifacts', { recursive: true });
  await copyFile('tests/contract/dart/comment_route_ui_test.dart.fixture', '.artifacts/comment_route_ui_test.dart');
  const status = await new Promise((resolve, reject) => {
    const child = spawn('flutter', ['test', '--no-pub', '.artifacts/comment_route_ui_test.dart'], {
      stdio: 'inherit', env: { ...process.env, COMMENT_ROUTE_FIXTURE_URL: 'http://127.0.0.1:' + server.address().port },
    });
    child.once('error', reject); child.once('exit', code => resolve(code));
  });
  assert.equal(status, 0, 'Real comment route to Flutter UI acceptance must pass');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await fixture?.dispose();
  await control.end();
}
