import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { before, after } from 'node:test';
import pg from 'pg';
import { uuidv7 } from '../../security/src/index.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '';
const target = new URL(connectionString || 'file:///missing');
assert.equal(target.protocol, 'postgresql:');
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
assert.match(target.pathname, /^\/lythaus_auth_test_post_attachment_[a-f0-9]{32}$/);
assert.equal(target.search, '');
assert.equal(target.hash, '');

const client = new pg.Client({ connectionString: target.toString(), ssl: false });
const proposalPath = new URL('../../../database/planetscale/proposals/post_media_attachments.sql.proposal', import.meta.url);

before(async () => {
  await client.connect();
  const version = Number((await client.query("SELECT current_setting('server_version_num') AS version")).rows[0].version);
  assert.ok(version >= 170000 && version < 180000, `expected disposable PostgreSQL 17, found ${version}`);
  await client.query(await readFile(proposalPath, 'utf8'));
});

after(async () => client.end());

async function fixture({ purpose = 'standard', uploadStatus = 'approved', objectState = 'approved' } = {}) {
  const ownerId = uuidv7();
  const postId = uuidv7();
  const sessionId = uuidv7();
  const mediaId = uuidv7();
  await client.query('INSERT INTO identity.users(id) VALUES($1)', [ownerId]);
  await client.query(`INSERT INTO content.posts(id,author_id,body,declared_creation_mode,visibility,moderation_state)
    VALUES($1,$2,'synthetic post body','human','private','under_review')`, [postId, ownerId]);
  await client.query(`INSERT INTO media.upload_sessions
    (id,user_id,object_key,content_type,expected_bytes,checksum_sha256,expires_at,purpose,status)
    VALUES($1,$2,$3,'image/png',100,$4,now()+interval '10 minutes',$5,$6)`,
  [sessionId, ownerId, `synthetic/${sessionId}`, 'a'.repeat(64), purpose, uploadStatus]);
  await client.query(`INSERT INTO media.objects
    (id,owner_id,object_key,content_type,byte_size,sha256,state,source_upload_session_id)
    VALUES($1,$2,$3,'image/webp',200,$4,$5,$6)`,
  [mediaId, ownerId, `synthetic/${mediaId}`, 'b'.repeat(64), objectState, sessionId]);
  return { ownerId, postId, sessionId, mediaId };
}

const INSERT = `INSERT INTO content.post_media_attachments
  (post_id,author_id,media_object_id,media_owner_id,source_upload_session_id,expected_media_state_version,ordinal)
  VALUES($1,$2,$3,$4,$5,$6,$7)`;

async function insertOrReplay(f, ordinal = 0) {
  await client.query('BEGIN');
  try {
    const inserted = await client.query(`${INSERT} ON CONFLICT (post_id,media_object_id) DO NOTHING RETURNING media_object_id`,
      [f.postId, f.ownerId, f.mediaId, f.ownerId, f.sessionId, 1, ordinal]);
    if (inserted.rowCount === 1) {
      await client.query('COMMIT');
      return 'inserted';
    }
    const existing = await client.query(`SELECT author_id,media_owner_id,source_upload_session_id,
      expected_media_state_version,ordinal FROM content.post_media_attachments
      WHERE post_id=$1 AND media_object_id=$2`, [f.postId, f.mediaId]);
    const row = existing.rows[0];
    if (!row || row.author_id !== f.ownerId || row.media_owner_id !== f.ownerId
      || row.source_upload_session_id !== f.sessionId
      || Number(row.expected_media_state_version) !== 1 || row.ordinal !== ordinal) {
      throw new Error('post_attachment_idempotency_conflict');
    }
    await client.query('COMMIT');
    return 'replayed';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function waitForLock(pid) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const state = (await client.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0];
    if (state?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('attachment insert did not wait on the concurrent media state lock');
}

test('proposal relation contains opaque linkage fields but no object key or URL projection', async () => {
  const columns = (await client.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='content' AND table_name='post_media_attachments' ORDER BY ordinal_position`)).rows.map(row => row.column_name);
  assert.deepEqual(columns, ['post_id', 'author_id', 'media_object_id', 'media_owner_id',
    'source_upload_session_id', 'expected_media_state_version', 'ordinal', 'publication_eligible', 'created_at']);
  assert.equal(columns.some(name => /url|object_key|signed/i.test(name)), false);
  assert.match(await readFile(proposalPath, 'utf8'), /publication_eligible boolean NOT NULL DEFAULT false CHECK \(publication_eligible = false\)/);
});

test('composite owner/source constraints reject cross-owner links and missing media', async () => {
  const f = await fixture();
  await assert.rejects(client.query(INSERT, [f.postId, f.ownerId, f.mediaId, uuidv7(), f.sessionId, 1, 0]),
    error => error.code === '23514' || error.code === '23503');
  await assert.rejects(client.query(INSERT, [f.postId, f.ownerId, uuidv7(), f.ownerId, f.sessionId, 1, 0]),
    error => error.code === '23514' && error.message === 'post_attachment_media_missing');
});

test('purpose, status, and media state guards reject private, pending, and review rows', async () => {
  for (const [options, expected] of [
    [{ purpose: 'authenticity_alpha' }, 'post_attachment_upload_purpose_unsupported'],
    [{ purpose: 'authenticity_beta' }, 'post_attachment_upload_purpose_unsupported'],
    [{ uploadStatus: 'pending' }, 'post_attachment_upload_state_unavailable'],
    [{ objectState: 'review' }, 'post_attachment_media_state_unavailable'],
  ]) {
    const f = await fixture(options);
    await assert.rejects(client.query(INSERT, [f.postId, f.ownerId, f.mediaId, f.ownerId, f.sessionId, 1, 0]),
      error => error.code === '23514' && error.message === expected);
  }
});

test('attachment identity and ordering are unique; exact retries are idempotent and conflicts fail', async () => {
  const f = await fixture();
  assert.equal(await insertOrReplay(f), 'inserted');
  assert.equal(await insertOrReplay(f), 'replayed');
  assert.equal((await client.query('SELECT publication_eligible FROM content.post_media_attachments WHERE post_id=$1', [f.postId])).rows[0].publication_eligible, false);
  await assert.rejects(
    client.query('UPDATE content.post_media_attachments SET publication_eligible=true WHERE post_id=$1', [f.postId]),
    error => error.code === '23514',
  );
  assert.equal(Number((await client.query('SELECT count(*) AS count FROM content.post_media_attachments WHERE post_id=$1', [f.postId])).rows[0].count), 1);
  await assert.rejects(insertOrReplay(f, 1), /post_attachment_idempotency_conflict/);
  const otherSession = uuidv7(), otherMedia = uuidv7();
  await client.query(`INSERT INTO media.upload_sessions
    (id,user_id,object_key,content_type,expected_bytes,checksum_sha256,expires_at,purpose,status)
    VALUES($1,$2,$3,'image/png',100,$4,now()+interval '10 minutes','standard','approved')`,
  [otherSession, f.ownerId, `synthetic/${otherSession}`, 'c'.repeat(64)]);
  await client.query(`INSERT INTO media.objects
    (id,owner_id,object_key,content_type,byte_size,sha256,state,source_upload_session_id)
    VALUES($1,$2,$3,'image/webp',200,$4,'approved',$5)`,
  [otherMedia, f.ownerId, `synthetic/${otherMedia}`, 'd'.repeat(64), otherSession]);
  await assert.rejects(client.query(INSERT, [f.postId, f.ownerId, otherMedia, f.ownerId, otherSession, 1, 0]),
    error => error.code === '23505');
});

test('state version increments on mutation and stale insert is rejected after concurrent change', async () => {
  const f = await fixture();
  const update = new pg.Client({ connectionString: target.toString(), ssl: false });
  const waiter = new pg.Client({ connectionString: target.toString(), ssl: false });
  await Promise.all([update.connect(), waiter.connect()]);
  try {
    await update.query('BEGIN');
    const changed = await update.query("UPDATE media.objects SET state='review' WHERE id=$1 RETURNING attachment_state_version", [f.mediaId]);
    assert.equal(Number(changed.rows[0].attachment_state_version), 2);
    await waiter.query('BEGIN');
    const pid = (await waiter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const pendingInsert = waiter.query(INSERT, [f.postId, f.ownerId, f.mediaId, f.ownerId, f.sessionId, 1, 0]);
    const rejected = assert.rejects(pendingInsert,
      error => error.code === '23514' && error.message === 'post_attachment_media_version_stale');
    await waitForLock(pid);
    await update.query('COMMIT');
    await rejected;
    await waiter.query('ROLLBACK');
    assert.equal(Number((await client.query('SELECT count(*) AS count FROM content.post_media_attachments WHERE post_id=$1', [f.postId])).rows[0].count), 0);
  } finally {
    await update.query('ROLLBACK').catch(() => undefined);
    await waiter.query('ROLLBACK').catch(() => undefined);
    await Promise.all([update.end(), waiter.end()]);
  }
});
