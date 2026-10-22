import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { standardUploadFixture } from './standard-upload-fixture.mjs';

test('private status SQL on disposable PG17: privileged synthetic fixture, no canonical-role acceptance', { timeout: 60_000 }, async t => {
  const url = new URL(process.env.LYTHAUS_MEDIA_STATUS_PG17_URL ?? '');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  assert.match(url.pathname, /^\/lythaus_image_recovery_test(?:_[a-z0-9]+)?$/);
  assert.equal(url.protocol, 'postgresql:');
  const client = new pg.Client({ connectionString: url.toString(), ssl: false });
  let fixture;
  await client.connect();
  try {
    assert.match((await client.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA identity');
    await client.query('CREATE SCHEMA media');
    await client.query('CREATE TABLE identity.users (id uuid PRIMARY KEY, status text NOT NULL, deleted_at timestamptz)');
    await client.query(`CREATE TABLE media.upload_sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL,
      status text NOT NULL, expires_at timestamptz NOT NULL, purpose text NOT NULL)`);
    fixture = await standardUploadFixture(async input => {
      assert.equal(input.action, 'query', 'status and rejected posts cannot start transactions');
      assert.ok(/^SELECT\s/.test(input.text), 'status and rejected posts cannot mutate storage');
      const result = await client.query(input.text, input.values);
      return { rows: result.rows, rowCount: result.rowCount };
    });
    const owner = randomUUID(), other = randomUUID(), sessionId = randomUUID();
    await client.query("INSERT INTO identity.users (id,status) VALUES ($1,'active'),($2,'active')", [owner, other]);
    await client.query(`INSERT INTO media.upload_sessions VALUES ($1,$2,'approved',now()+interval '10 minutes','standard')`, [sessionId, owner]);
    const read = userId => fixture.request('/fixture/status', { userId, sessionId });
    await t.test('exact owner receives private review with no detector or publication grant', async () => {
      const response = await read(owner), body = await response.json();
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(body.status, 'review');
      assert.equal(body.private, true);
      assert.equal(body.processingComplete, true);
      assert.deepEqual(body.authenticity, { status: 'not_run' });
      assert.deepEqual(body.safety, { status: 'not_run' });
      assert.deepEqual(body.publication, { allowed: false });
      assert.equal('objectKey' in body, false);
      assert.equal('url' in body, false);
    });
    await t.test('cross-owner, deleted, inactive and nonstandard rows are indistinguishable from absence', async () => {
      assert.equal((await read(other)).status, 404);
      for (const status of ['suspended', 'deleting']) {
        await client.query('UPDATE identity.users SET status=$1 WHERE id=$2', [status, owner]);
        assert.equal((await read(owner)).status, 404);
      }
      await client.query("UPDATE identity.users SET status='active',deleted_at=now() WHERE id=$1", [owner]);
      assert.equal((await read(owner)).status, 404);
      await client.query('UPDATE identity.users SET deleted_at=NULL WHERE id=$1', [owner]);
      await client.query("UPDATE media.upload_sessions SET purpose='beta'");
      assert.equal((await read(owner)).status, 404);
      await client.query("UPDATE media.upload_sessions SET purpose='standard'");
    });
    await t.test('database-clock expiry stops polling even before cleanup settles', async () => {
      for (const status of ['pending', 'queued']) {
        await client.query("UPDATE media.upload_sessions SET status=$1,expires_at=now()-interval '1 minute'", [status]);
        const body = await (await read(owner)).json();
        assert.equal(body.status, 'expired');
        assert.equal(body.processingComplete, false);
      }
    });
    await t.test('image-bearing text rejection executes no database statements', async () => {
      fixture.statements.length = 0;
      const response = await fixture.request('/fixture/post', { userId: owner,
        post: { body: 'Synthetic caption', declaredCreationMode: 'human', geoScope: 'none', mediaIds: [sessionId] } });
      assert.equal(response.status, 415);
      assert.equal(fixture.statements.length, 0);
    });
    assert.deepEqual(fixture.outbound, []);
  } finally {
    await fixture?.dispose();
    await client.query('ROLLBACK');
    await client.end();
  }
});
