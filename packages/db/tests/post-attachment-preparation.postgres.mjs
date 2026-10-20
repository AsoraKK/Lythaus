import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { before, after } from 'node:test';
import pg from 'pg';
import { uuidv7 } from '../../security/src/index.ts';
import { legalHoldPlan, retentionCleanupPlan } from '../../../apps/lythaus-jobs/src/runtime-policy.ts';
import { POST_ATTACHMENT_OWNER_LOOKUP_SQL } from '../src/post-attachment-byte-boundary.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '';
const target = new URL(connectionString || 'file:///missing');
assert.equal(target.protocol, 'postgresql:');
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
assert.match(target.pathname, /^\/lythaus_auth_test_post_attach_[a-f0-9]{32}$/);
assert.equal(target.search, '');
assert.equal(target.hash, '');

const client = new pg.Client({ connectionString: target.toString(), ssl: false });
const proposalPath = new URL('../../../database/planetscale/proposals/post_media_attachments.sql.proposal', import.meta.url);

before(async () => {
  await client.connect();
  assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, target.pathname.slice(1));
  const version = Number((await client.query("SELECT current_setting('server_version_num') AS version")).rows[0].version);
  assert.ok(version >= 170000 && version < 180000, `expected disposable PostgreSQL 17, found ${version}`);
  await client.query(await readFile(proposalPath, 'utf8'));
});

after(async () => client.end());

async function fixture({ purpose = 'standard', uploadStatus = 'approved', objectState = 'approved' } = {}) {
  const ownerId = uuidv7();
  const postId = uuidv7();
  const postRevisionEventId = uuidv7();
  const sessionId = uuidv7();
  const mediaId = uuidv7();
  await client.query('INSERT INTO identity.users(id) VALUES($1)', [ownerId]);
  await client.query(`INSERT INTO content.posts
    (id,author_id,body,declared_creation_mode,visibility,moderation_state,moderation_source_event_id)
    VALUES($1,$2,'synthetic post body','human','private','under_review',$3)`, [postId, ownerId, postRevisionEventId]);
  await client.query(`INSERT INTO media.upload_sessions
    (id,user_id,object_key,content_type,expected_bytes,checksum_sha256,expires_at,purpose,status)
    VALUES($1,$2,$3,'image/png',100,$4,now()+interval '10 minutes',$5,$6)`,
  [sessionId, ownerId, `synthetic/${sessionId}`, 'a'.repeat(64), purpose, uploadStatus]);
  await client.query(`INSERT INTO media.objects
    (id,owner_id,object_key,content_type,byte_size,sha256,state,source_upload_session_id)
    VALUES($1,$2,$3,'image/webp',200,$4,$5,$6)`,
  [mediaId, ownerId, `synthetic/${mediaId}`, 'b'.repeat(64), objectState, sessionId]);
  return { ownerId, postId, postRevisionEventId, sessionId, mediaId };
}

const INSERT = `INSERT INTO content.post_media_attachments
  (id,post_id,author_id,expected_post_revision_event_id,media_object_id,media_owner_id,
   source_upload_session_id,expected_media_state_version,ordinal)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`;

async function insertOrReplay(f, ordinal = 0) {
  const attemptId = uuidv7();
  await client.query('BEGIN');
  try {
    const inserted = await client.query(`${INSERT}
      ON CONFLICT (post_id,media_object_id) DO NOTHING RETURNING id`,
      [attemptId, f.postId, f.ownerId, f.postRevisionEventId, f.mediaId, f.ownerId, f.sessionId, 1, ordinal]);
    if (inserted.rowCount === 1) {
      await client.query('COMMIT');
      return 'inserted';
    }
    const existing = await client.query(`SELECT author_id,expected_post_revision_event_id,media_owner_id,
      source_upload_session_id,expected_media_state_version,ordinal
      FROM content.post_media_attachments
      WHERE post_id=$1 AND media_object_id=$2`, [f.postId, f.mediaId]);
    const row = existing.rows[0];
    if (!row || row.author_id !== f.ownerId || row.expected_post_revision_event_id !== f.postRevisionEventId
      || row.media_owner_id !== f.ownerId
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
  assert.deepEqual(columns, ['id', 'post_id', 'author_id', 'expected_post_revision_event_id', 'media_object_id', 'media_owner_id',
    'source_upload_session_id', 'expected_media_state_version', 'ordinal', 'publication_eligible', 'created_at']);
  assert.equal(columns.some(name => /url|object_key|signed/i.test(name)), false);
  const proposal = await readFile(proposalPath, 'utf8');
  assert.match(proposal, /publication_eligible boolean NOT NULL DEFAULT false CHECK \(publication_eligible = false\)/);
  assert.match(proposal, /expected_post_revision_event_id uuid NOT NULL/);
  assert.match(proposal, /CREATE TRIGGER post_media_attachments_immutable/);
  const locator = proposal.match(/CREATE FUNCTION privacy\.reconcile_post_media_attachment_locations[\s\S]*?\$\$;/)?.[0];
  assert.ok(locator);
  assert.doesNotMatch(locator, /object_key|signed_url|https?:\/\//i);
  assert.doesNotMatch(proposal, /^\s*GRANT\b/im);
});

test('composite owner/source constraints reject cross-owner links and missing media', async () => {
  const f = await fixture();
  await assert.rejects(client.query(INSERT, [uuidv7(), f.postId, f.ownerId, f.postRevisionEventId, f.mediaId, uuidv7(), f.sessionId, 1, 0]),
    error => error.code === '23514' || error.code === '23503');
  await assert.rejects(client.query(INSERT, [uuidv7(), f.postId, f.ownerId, f.postRevisionEventId, uuidv7(), f.ownerId, f.sessionId, 1, 0]),
    error => error.code === '23514' && error.message === 'post_attachment_media_missing');
});

test('server metadata lookup scopes both media and source owners and excludes private-purpose sources', async () => {
  const f = await fixture();
  const loaded = await client.query(POST_ATTACHMENT_OWNER_LOOKUP_SQL, [f.mediaId, f.ownerId]);
  assert.equal(loaded.rowCount, 1);
  assert.equal(loaded.rows[0].source_owner_id, f.ownerId);
  assert.equal(loaded.rows[0].source_sha256, 'a'.repeat(64));
  assert.equal(loaded.rows[0].stored_sha256, 'b'.repeat(64));
  assert.equal((await client.query(POST_ATTACHMENT_OWNER_LOOKUP_SQL, [f.mediaId, uuidv7()])).rowCount, 0);
  const privateSource = await fixture({ purpose: 'authenticity_alpha' });
  assert.equal((await client.query(POST_ATTACHMENT_OWNER_LOOKUP_SQL, [privateSource.mediaId, privateSource.ownerId])).rowCount, 0);
});

test('purpose, status, and media state guards reject private, pending, quarantine, review, and rejected rows', async () => {
  for (const [options, expected] of [
    [{ purpose: 'authenticity_alpha' }, 'post_attachment_upload_purpose_unsupported'],
    [{ purpose: 'authenticity_beta' }, 'post_attachment_upload_purpose_unsupported'],
    [{ uploadStatus: 'pending' }, 'post_attachment_upload_state_unavailable'],
    [{ uploadStatus: 'rejected' }, 'post_attachment_upload_state_unavailable'],
    [{ objectState: 'quarantine' }, 'post_attachment_media_state_unavailable'],
    [{ objectState: 'review' }, 'post_attachment_media_state_unavailable'],
    [{ objectState: 'rejected' }, 'post_attachment_media_state_unavailable'],
  ]) {
    const f = await fixture(options);
    await assert.rejects(client.query(INSERT, [uuidv7(), f.postId, f.ownerId, f.postRevisionEventId, f.mediaId, f.ownerId, f.sessionId, 1, 0]),
      error => error.code === '23514' && error.message === expected);
  }
});

test('attachment identity and ordering are unique; exact retries are idempotent and conflicts fail', async () => {
  const f = await fixture();
  assert.equal(await insertOrReplay(f), 'inserted');
  assert.equal(await insertOrReplay(f), 'replayed');
  assert.equal((await client.query('SELECT publication_eligible FROM content.post_media_attachments WHERE post_id=$1', [f.postId])).rows[0].publication_eligible, false);
  await assert.rejects(
    client.query('UPDATE content.post_media_attachments SET ordinal=1 WHERE post_id=$1', [f.postId]),
    error => error.code === '55000' && error.message === 'post_media_attachment_immutable',
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
  await assert.rejects(client.query(INSERT, [uuidv7(), f.postId, f.ownerId, f.postRevisionEventId, otherMedia, f.ownerId, otherSession, 1, 0]),
    error => error.code === '23505');

  const reusedSessionMedia = uuidv7();
  await assert.rejects(client.query(`INSERT INTO media.objects
    (id,owner_id,object_key,content_type,byte_size,sha256,state,source_upload_session_id)
    VALUES($1,$2,$3,'image/webp',200,$4,'approved',$5)`,
  [reusedSessionMedia, f.ownerId, `synthetic/${reusedSessionMedia}`, 'e'.repeat(64), f.sessionId]),
  error => error.code === '23505');
  await assert.rejects(client.query('DELETE FROM content.post_media_attachments WHERE post_id=$1', [f.postId]),
    error => error.code === '55000' && error.message === 'post_media_attachment_immutable');
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
    const pendingInsert = waiter.query(INSERT, [uuidv7(), f.postId, f.ownerId, f.postRevisionEventId, f.mediaId, f.ownerId, f.sessionId, 1, 0]);
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

test('a post revision change makes its old attachment stale without deleting history', async () => {
  const f = await fixture();
  assert.equal(await insertOrReplay(f), 'inserted');
  const nextRevision = uuidv7();
  await client.query('UPDATE content.posts SET moderation_source_event_id=$2 WHERE id=$1', [f.postId, nextRevision]);
  assert.equal((await client.query(`SELECT count(*)::integer AS count
    FROM content.post_media_attachments attachment JOIN content.posts post ON post.id=attachment.post_id
    WHERE attachment.post_id=$1 AND attachment.expected_post_revision_event_id=post.moderation_source_event_id`,
  [f.postId])).rows[0].count, 0);
  await assert.rejects(client.query(INSERT,
    [uuidv7(), f.postId, f.ownerId, f.postRevisionEventId, f.mediaId, f.ownerId, f.sessionId, 1, 0]),
  error => error.code === '23514' && error.message === 'post_attachment_post_revision_stale');
  assert.equal((await client.query('SELECT count(*)::integer AS count FROM content.post_media_attachments WHERE post_id=$1', [f.postId])).rows[0].count, 1);
});

test('locator tracks owner attachment rows, active legal holds, and canonical tombstones', async () => {
  const f = await fixture();
  assert.equal(await insertOrReplay(f), 'inserted');
  const attachment = (await client.query('SELECT id FROM content.post_media_attachments WHERE post_id=$1', [f.postId])).rows[0];
  const reconcile = async () => {
    await client.query('SELECT privacy.reconcile_subject_data_locations($1)', [f.ownerId]);
    return client.query('SELECT privacy.reconcile_post_media_attachment_locations($1) AS rows', [f.ownerId]);
  };
  const location = () => client.query(`SELECT legal_hold_state,deletion_state,retention_class
    FROM privacy.subject_data_locations
    WHERE subject_id=$1 AND resource_reference='content.post_media_attachments'
      AND entity_type='post_media_attachment' AND entity_id=$2`, [f.ownerId, attachment.id]);

  await client.query('SELECT privacy.reconcile_subject_data_locations($1)', [f.ownerId]);
  assert.equal((await location()).rowCount, 0);
  assert.equal((await client.query('SELECT privacy.reconcile_post_media_attachment_locations($1) AS rows', [f.ownerId])).rows[0].rows, 1);
  assert.deepEqual((await location()).rows[0], { legal_hold_state: 'none', deletion_state: 'present', retention_class: 'media' });

  const holdId = uuidv7();
  await client.query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic lifecycle hold')", [holdId, f.ownerId]);
  assert.equal(legalHoldPlan(holdId).state, 'blocked');
  assert.equal(retentionCleanupPlan(true, 'post'), 'skip');
  assert.equal(retentionCleanupPlan(true, 'media'), 'skip');
  assert.equal((await reconcile()).rows[0].rows, 1);
  assert.deepEqual((await location()).rows[0], { legal_hold_state: 'active', deletion_state: 'present', retention_class: 'media' });
  assert.equal((await client.query('SELECT count(*)::integer AS count FROM content.post_media_attachments WHERE id=$1', [attachment.id])).rows[0].count, 1);
  assert.equal((await client.query('SELECT state FROM media.objects WHERE id=$1', [f.mediaId])).rows[0].state, 'approved');

  await client.query('UPDATE privacy.legal_holds SET active=false,released_at=now() WHERE id=$1', [holdId]);
  await client.query(`UPDATE content.posts SET body='[deleted]',visibility='private',moderation_state='blocked',published_at=NULL,deleted_at=now()
    WHERE id=$1`, [f.postId]);
  await client.query("UPDATE media.objects SET state='deleted',deleted_at=now() WHERE id=$1", [f.mediaId]);
  await client.query("UPDATE media.upload_sessions SET status='expired' WHERE id=$1", [f.sessionId]);
  await client.query("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1", [f.ownerId]);
  assert.equal((await reconcile()).rows[0].rows, 1);
  assert.deepEqual((await location()).rows[0], { legal_hold_state: 'none', deletion_state: 'retained', retention_class: 'media' });
  assert.equal((await client.query('SELECT publication_eligible FROM content.post_media_attachments WHERE id=$1', [attachment.id])).rows[0].publication_eligible, false);
});

test('foreign keys prevent physical orphans while canonical soft deletion keeps references locatable', async () => {
  const f = await fixture();
  assert.equal(await insertOrReplay(f), 'inserted');
  await assert.rejects(client.query('DELETE FROM content.posts WHERE id=$1', [f.postId]), error => error.code === '23503');
  await assert.rejects(client.query('DELETE FROM media.objects WHERE id=$1', [f.mediaId]), error => error.code === '23503');
  await assert.rejects(client.query('DELETE FROM media.upload_sessions WHERE id=$1', [f.sessionId]), error => error.code === '23503');
  const orphanCount = () => client.query(`SELECT count(*)::integer AS count
    FROM content.post_media_attachments attachment
    LEFT JOIN content.posts post ON post.id=attachment.post_id AND post.author_id=attachment.author_id
    LEFT JOIN media.objects object ON object.id=attachment.media_object_id
      AND object.owner_id=attachment.media_owner_id AND object.source_upload_session_id=attachment.source_upload_session_id
    LEFT JOIN media.upload_sessions session ON session.id=attachment.source_upload_session_id
      AND session.user_id=attachment.media_owner_id
    WHERE attachment.post_id=$1 AND (post.id IS NULL OR object.id IS NULL OR session.id IS NULL)`, [f.postId]);
  assert.equal((await orphanCount()).rows[0].count, 0);
  await client.query(`UPDATE content.posts SET body='[deleted]',visibility='private',moderation_state='blocked',published_at=NULL,deleted_at=now()
    WHERE id=$1`, [f.postId]);
  await client.query("UPDATE media.objects SET state='deleted',deleted_at=now() WHERE id=$1", [f.mediaId]);
  await client.query("UPDATE media.upload_sessions SET status='expired' WHERE id=$1", [f.sessionId]);
  assert.equal((await orphanCount()).rows[0].count, 0);
});
