import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { privacyPostgresTarget } from './privacy-postgres-target.mjs';
import { readCommentThread } from '../src/comment-thread-reader.ts';
import { ownerCommentQuery, ownerCommentsQuery } from '../src/owner-content-reader.ts';
import { commentReplyTargetQuery, nestedReplyDepth } from '../../../packages/db/src/comment-visibility.ts';
import { commentNotificationRecipientQuery, commentNotificationRevisionLockQuery, commentNotificationVisibilitySql } from '../../../packages/db/src/comment-notifications.ts';

const connectionString = privacyPostgresTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL).toString();
const control = new pg.Client({ connectionString, ssl: false });
const users = [], posts = [], events = [];
before(async () => {
  await control.connect();
  assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  await control.query("SET statement_timeout='5s'");
});
after(async () => {
  try {
    await control.query('DELETE FROM feed.notifications WHERE recipient_id=ANY($1::uuid[])', [users]);
    await control.query("DELETE FROM moderation.decisions WHERE case_id IN (SELECT id FROM moderation.cases WHERE content_type='comment' AND content_id IN (SELECT id FROM content.comments WHERE post_id=ANY($1::uuid[])))", [posts]);
    await control.query("DELETE FROM moderation.cases WHERE content_type='comment' AND content_id IN (SELECT id FROM content.comments WHERE post_id=ANY($1::uuid[]))", [posts]);
    await control.query('DELETE FROM editorial.publications WHERE post_id=ANY($1::uuid[])', [posts]);
    await control.query('DELETE FROM content.comments WHERE post_id=ANY($1::uuid[])', [posts]);
    await control.query('DELETE FROM content.posts WHERE id=ANY($1::uuid[])', [posts]);
    await control.query('DELETE FROM system.outbox_events WHERE id=ANY($1::uuid[])', [events]);
    await control.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])', [users]);
  } finally { await control.end(); }
});
async function actor() {
  const id = uuidv7(); users.push(id);
  await control.query("INSERT INTO identity.users(id,status) VALUES($1,'active')", [id]);
  return id;
}
async function post(author, visibility = 'public') {
  const id = uuidv7(); posts.push(id);
  await control.query("INSERT INTO content.posts(id,author_id,body,declared_creation_mode,moderation_state,visibility) VALUES($1,$2,'Synthetic post','human','allowed',$3)", [id, author, visibility]);
  await control.query("INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label) VALUES($1,'human','Human-authored')", [id]);
  return id;
}
async function comment(postId, author, { parent = null, state = 'allowed', timestamp = '2026-10-01T00:00:00.123456Z', deleted = false } = {}) {
  const id = uuidv7();
  await control.query(`INSERT INTO content.comments(id,post_id,author_id,body,parent_id,depth,declared_creation_mode,moderation_state,created_at,deleted_at,moderation_source_event_id)
    VALUES($1,$2,$3,$4,$5,$6,'human',$7,$8,CASE WHEN $9 THEN now() END,$10)`,
  [id, postId, author, 'Synthetic comment ' + id, parent, parent ? 1 : 0, state, timestamp, deleted, uuidv7()]);
  return id;
}
async function query(sql, values, role = 'lythaus_runtime') {
  await control.query('SET ROLE ' + role);
  try {
    assert.equal((await control.query('SELECT current_user AS role')).rows[0].role, role);
    return await control.query(sql, values);
  } finally { await control.query('RESET ROLE'); }
}
const read = (postId, viewerId, options = {}) => readCommentThread({
  postId, viewerId, request: new Request('https://local.test/api/posts/' + postId + '/comments?' + new URLSearchParams({ view: 'conversations', ...options })), query,
});
const ids = page => page.items.map(item => item.id);

test('post-backed articles share one conversation; nested replies are chronological and counted once', async () => {
  const owner = await actor(), author = await actor(), postId = await post(owner);
  const publication = uuidv7();
  await control.query("INSERT INTO editorial.publications(id,membership_user_id,title,post_id,published_at) VALUES($1,$2,'Synthetic article',$3,now())", [publication, owner, postId]);
  const root = await comment(postId, owner);
  const reply = await comment(postId, author, { parent: root, timestamp: '2026-10-01T00:00:00.123457Z' });
  const nested = await comment(postId, owner, { parent: reply, timestamp: '2026-10-01T00:00:00.123458Z' });
  await comment(postId, author, { parent: root, state: 'under_review' });
  await comment(postId, author, { parent: root, state: 'blocked' });
  const articlePost = (await control.query('SELECT post_id FROM editorial.publications WHERE id=$1', [publication])).rows[0].post_id;
  const page = await read(articlePost, null);
  assert.deepEqual(ids(page), [root]);
  assert.equal(page.items[0].replyCount, 2);
  assert.equal(page.items[0].publicLabel, 'Human-authored');
  const replies = await read(postId, null, { conversationId: root });
  assert.deepEqual(ids(replies), [reply, nested]);
  assert.ok(replies.items.every(item => item.replyCount === 0));
  assert.ok(replies.items.every(item => item.publicLabel === 'Human-authored'));
  assert.equal(replies.items[1].parentId, reply);
  assert.equal(replies.items[1].conversationId, root);
  assert.equal(replies.items[1].replyToAuthorId, author);
  assert.ok(replies.items.every(item => item.cursorCreatedAt === undefined && item.snapshotAt === undefined));
  assert.deepEqual(ids(await read(postId, owner, { conversationId: root })), [reply, nested]);
  assert.equal((await query(commentReplyTargetQuery, [reply, postId, owner])).rowCount, 1);
  assert.equal(nestedReplyDepth({ depth: 1 }), 1);
});

test('newest/oldest use precise deterministic cursors bound to the post, filter and conversation', async () => {
  const owner = await actor(), postId = await post(owner);
  const first = await comment(postId, owner);
  const second = await comment(postId, owner, { timestamp: '2026-10-01T00:00:00.123457Z' });
  const third = await comment(postId, owner, { timestamp: '2026-10-01T00:00:00.123457Z' });
  const tied = [second, third].sort().reverse();
  const newest = await read(postId, null, { limit: '1', sort: 'newest' });
  assert.deepEqual(ids(newest), [tied[0]]);
  const cursor = JSON.parse(Buffer.from(newest.nextCursor, 'base64url'));
  assert.equal(cursor.timestamp, '2026-10-01T00:00:00.123457Z');
  const secondPage = await read(postId, null, { limit: '1', sort: 'newest', cursor: newest.nextCursor });
  const finalPage = await read(postId, null, { limit: '1', sort: 'newest', cursor: secondPage.nextCursor });
  assert.deepEqual([...ids(newest), ...ids(secondPage), ...ids(finalPage)], [...tied, first]);
  assert.equal(finalPage.nextCursor, null);
  assert.deepEqual(ids(await read(postId, null, { sort: 'oldest' })), [first, ...tied.toReversed()]);
  const concurrent = await comment(postId, owner, { timestamp: new Date(Date.now() + 10).toISOString() });
  assert.ok(!ids(await read(postId, null, { sort: 'newest', cursor: newest.nextCursor })).includes(concurrent));
  for (const changes of [{ sort: 'oldest' }, { conversationId: first }, { view: 'legacy' }]) {
    await assert.rejects(read(postId, null, { cursor: newest.nextCursor, ...changes }), /invalid_pagination/);
  }
  await assert.rejects(read(await post(owner), null, { cursor: newest.nextCursor }), /invalid_pagination/);
  await assert.rejects(read(postId, null, { sort: 'most_relevant' }), /comment_sort_unavailable/);
  assert.equal(newest.capabilities.mostRelevantAvailable, false);
});

test('31 root conversations page without skips or duplicates while exact targets bypass the first page', async () => {
  const owner = await actor(), postId = await post(owner), roots = [];
  for (let index = 0; index < 31; index++) {
    roots.push(await comment(postId, owner, {
      timestamp: `2026-10-01T00:00:${String(index).padStart(2, '0')}.000000Z`,
    }));
  }
  const first = await read(postId, null, { limit: '25', sort: 'newest' });
  assert.deepEqual(ids(first), [...roots].reverse().slice(0, 25));
  assert.ok(first.nextCursor);

  const exact = await read(postId, null, { targetId: roots[0], sort: 'newest' });
  assert.deepEqual(ids(exact), [roots[0]]);

  const concurrentTimestamp = (await control.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS timestamp`)).rows[0].timestamp;
  const concurrentRoot = await comment(postId, owner, { timestamp: concurrentTimestamp });
  const second = await read(postId, null, { limit: '25', sort: 'newest', cursor: first.nextCursor });
  assert.deepEqual(ids(second), [...roots].reverse().slice(25));
  const pagedIds = [...ids(first), ...ids(second)];
  assert.equal(pagedIds.length, 31);
  assert.equal(new Set(pagedIds).size, 31);
  assert.ok(!pagedIds.includes(concurrentRoot));
  assert.equal(second.nextCursor, null);

  const fresh = await read(postId, null, { sort: 'newest' });
  assert.equal(ids(fresh)[0], concurrentRoot);
});

test('hidden ancestors, cross-post links, cycles, blocks and mutes cannot expose descendants or private receipts', async () => {
  const owner = await actor(), viewer = await actor(), ancestorAuthor = await actor(), postId = await post(owner);
  const root = await comment(postId, ancestorAuthor);
  const reply = await comment(postId, viewer, { parent: root });
  const nested = await comment(postId, viewer, { parent: reply });
  const ownRead = () => query(ownerCommentQuery, [nested, viewer]);
  assert.equal((await ownRead()).rowCount, 1);
  for (const state of ['blocked', 'under_review']) {
    await control.query('UPDATE content.comments SET moderation_state=$2 WHERE id=$1', [root, state]);
    await assert.rejects(read(postId, viewer, { conversationId: root }), /comment_not_found/);
    assert.equal((await ownRead()).rowCount, 0);
    assert.equal((await query(ownerCommentsQuery, [viewer, null, null, 10])).rowCount, 0);
    assert.equal((await query(commentReplyTargetQuery, [reply, postId, viewer])).rowCount, 0);
  }
  await control.query("UPDATE content.comments SET moderation_state='allowed',deleted_at=now(),body='[deleted]' WHERE id=$1", [root]);
  const tombstone = await read(postId, viewer);
  assert.equal(tombstone.items[0].body, null);
  assert.equal(tombstone.items[0].replyCount, 2);
  assert.deepEqual(ids(await read(postId, viewer, { conversationId: root })), [reply, nested].sort());
  assert.equal((await query(commentReplyTargetQuery, [root, postId, viewer])).rowCount, 0);
  for (const table of ['blocks', 'mutes']) {
    const [actorKey, targetKey] = table === 'blocks' ? ['blocker_id', 'blocked_id'] : ['muter_id', 'muted_id'];
    await control.query(`INSERT INTO social.${table}(${actorKey},${targetKey}) VALUES($1,$2)`, [viewer, ancestorAuthor]);
    assert.deepEqual(ids(await read(postId, viewer)), []);
    assert.equal((await ownRead()).rowCount, 0);
    await control.query(`DELETE FROM social.${table} WHERE ${actorKey}=$1 AND ${targetKey}=$2`, [viewer, ancestorAuthor]);
  }
  const foreignRoot = await comment(await post(owner), owner);
  await control.query('UPDATE content.comments SET parent_id=$2 WHERE id=$1', [reply, foreignRoot]);
  assert.equal((await ownRead()).rowCount, 0);
  assert.deepEqual(ids(await read(postId, viewer, { conversationId: root })), []);
  await control.query('UPDATE content.comments SET parent_id=$2 WHERE id=$1', [reply, nested]);
  assert.equal((await ownRead()).rowCount, 0);
  assert.equal((await query(commentReplyTargetQuery, [nested, postId, viewer])).rowCount, 0);
  assert.deepEqual(ids(await read(postId, viewer, { conversationId: root })), []);
});

test('current parent access controls guest and A to B to A reads independently', async () => {
  const owner = await actor(), author = await actor(), outsider = await actor(), postId = await post(owner, 'followers');
  const root = await comment(postId, author);
  await control.query('INSERT INTO social.follows(follower_id,followed_id) VALUES($1,$2)', [author, owner]);
  for (const viewer of [author, outsider, author, null]) {
    if (viewer === author) assert.deepEqual(ids(await read(postId, viewer)), [root]);
    else await assert.rejects(read(postId, viewer), /post_not_found/);
    assert.equal((await query(ownerCommentQuery, [root, viewer ?? outsider])).rowCount, viewer === author ? 1 : 0);
  }
  await control.query('DELETE FROM social.follows WHERE follower_id=$1 AND followed_id=$2', [author, owner]);
  assert.equal((await query(ownerCommentQuery, [root, author])).rowCount, 0);
  for (const change of ["visibility='private'", "moderation_state='under_review'", 'deleted_at=now()']) {
    await control.query('UPDATE content.posts SET ' + change + ' WHERE id=$1', [postId]);
    await assert.rejects(read(postId, author), /post_not_found/);
    assert.equal((await query(ownerCommentQuery, [root, author])).rowCount, 0);
  }
});

test('reply tail revalidation authoritatively removes hidden ancestors and redacts tombstones on 200 reads', async () => {
  const owner = await actor(), author = await actor(), postId = await post(owner);
  const root = await comment(postId, owner);
  const middle = await comment(postId, author, { parent: root, timestamp: '2026-10-01T00:00:00.123457Z' });
  const child = await comment(postId, owner, { parent: middle, timestamp: '2026-10-01T00:00:00.123458Z' });
  const initial = await read(postId, owner, { conversationId: root });
  for (const state of ['blocked', 'under_review']) {
    await control.query('UPDATE content.comments SET moderation_state=$2,body=$3 WHERE id=$1', [middle, state, 'Private revised ancestor']);
    const refreshed = await read(postId, owner, { conversationId: root, cursor: initial.refreshCursor,
      refresh: 'true', revalidateIds: [middle, child].join(',') });
    assert.deepEqual(refreshed.items, []);
    assert.deepEqual(refreshed.revalidatedItems, []);
    assert.ok(!JSON.stringify(refreshed).includes('Private revised ancestor'));
  }
  const ownPending = await read(postId, author, { conversationId: root, revalidationOnly: 'true', revalidateIds: [middle, child].join(',') });
  assert.deepEqual(ownPending.revalidatedItems.map(row => row.id), [middle]);
  assert.equal(ownPending.revalidatedItems[0].body, 'Private revised ancestor');
  assert.equal(Object.hasOwn(ownPending.revalidatedItems[0], 'publicLabel'), false);
  await control.query("UPDATE content.comments SET moderation_state='allowed',deleted_at=now() WHERE id=$1", [middle]);
  const deleted = await read(postId, owner, { conversationId: root, revalidationOnly: 'true', revalidateIds: [middle, child].join(',') });
  assert.equal(deleted.revalidatedItems.find(row => row.id === middle).body, null);
  assert.equal(deleted.revalidatedItems.find(row => row.id === middle).deleted, true);
  assert.equal(deleted.revalidatedItems.find(row => row.id === middle).publicLabel, 'Human-authored');
  assert.ok(deleted.revalidatedItems.some(row => row.id === child));
  assert.equal(deleted.revalidatedItems.find(row => row.id === child).replyToDeleted, true);
  const unrelated = await comment(await post(owner), owner);
  assert.deepEqual((await read(postId, owner, { conversationId: root, revalidationOnly: 'true', revalidateIds: unrelated })).revalidatedItems, []);
});

test('reply refresh authoritatively redacts a remotely deleted root and preserves its allowed descendants', async () => {
  const owner = await actor(), postId = await post(owner), root = await comment(postId, owner);
  const child = await comment(postId, owner, { parent: root });
  const page = await read(postId, owner, { conversationId: root });
  await control.query('UPDATE content.comments SET deleted_at=now() WHERE id=$1', [root]);
  const refreshed = await read(postId, owner, { conversationId: root, cursor: page.refreshCursor,
    refresh: 'true', revalidateIds: [root, child].join(',') });
  const tombstone = refreshed.revalidatedItems.find(row => row.id === root);
  assert.equal(tombstone.body, null);
  assert.equal(tombstone.deleted, true);
  assert.equal(tombstone.replyCount, 1);
  assert.equal(refreshed.revalidatedItems.find(row => row.id === child).replyToDeleted, true);
  assert.deepEqual(refreshed.items, []);
});

test('reply pagination holds its snapshot until the reader explicitly checks for new replies', async () => {
  const owner = await actor(), postId = await post(owner), root = await comment(postId, owner);
  const first = await comment(postId, owner, { parent: root });
  const page = await read(postId, null, { conversationId: root, limit: '1' });
  assert.deepEqual(ids(page), [first]);
  assert.equal(page.nextCursor, null);
  assert.ok(page.refreshCursor);
  const timestamp = (await control.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS timestamp")).rows[0].timestamp;
  const next = await comment(postId, owner, { parent: first, timestamp });
  const oldSnapshot = await read(postId, null, { conversationId: root, cursor: page.refreshCursor });
  assert.deepEqual(ids(oldSnapshot), []);
  const explicit = await read(postId, null, { conversationId: root, cursor: page.refreshCursor, refresh: 'true' });
  assert.deepEqual(ids(explicit), [next]);
  const replay = await read(postId, null, { conversationId: root, cursor: explicit.refreshCursor, refresh: 'true' });
  assert.deepEqual(ids(replay), []);
  await control.query('UPDATE content.comments SET deleted_at=now() WHERE id=$1', [first]);
  const tombstone = await read(postId, null, { conversationId: root });
  assert.equal(tombstone.items[0].body, null);
  assert.equal(tombstone.items[1].replyToAuthorId, null);
  assert.equal(tombstone.items[1].replyToDeleted, true);
  assert.equal((await read(postId, null)).items[0].replyCount, 1);
});

test('bounded ancestor traversal rejects over-limit writes and corrupt descendants without changing stored depth', async () => {
  const owner = await actor(), postId = await post(owner), root = await comment(postId, owner);
  let parent = root;
  for (let index = 1; index < 64; index++) parent = await comment(postId, owner, { parent });
  assert.equal((await query(ownerCommentQuery, [parent, owner])).rows[0].conversationId, root);
  assert.equal((await query(commentReplyTargetQuery, [parent, postId, owner])).rowCount, 0);
  assert.deepEqual(ids(await read(postId, null, { targetId: parent })), [parent]);
  const overflow = await comment(postId, owner, { parent });
  assert.deepEqual(ids(await read(postId, null, { targetId: overflow })), []);
  assert.equal((await query(ownerCommentQuery, [overflow, owner])).rowCount, 0);
  for (const depth of [undefined, null, '', '1', -1, 2]) assert.throws(() => nestedReplyDepth({ depth }), /invalid_comment_parent/);
});

test('malformed and mismatched cursor state fails before SQL and relevance never becomes a chronological alias', async () => {
  const postId = uuidv7();
  const denied = options => readCommentThread({ postId, viewerId: null,
    request: new Request('https://local.test/?' + new URLSearchParams(options)),
    query: async () => assert.fail('Invalid pagination reached SQL'),
  });
  for (const options of [{ limit: '101' }, { limit: '1.5' }, { cursor: 'broken' },
    { conversationId: 'broken' }, { targetId: 'broken' }, { refresh: 'true' }, { sort: 'likes' }]) {
    await assert.rejects(denied(options), /invalid_pagination/);
  }
  await assert.rejects(denied({ sort: 'most_relevant' }), /comment_sort_unavailable/);
  const cursor = Buffer.from(JSON.stringify({ version: 1, postId, view: 'legacy', sort: 'oldest', conversationId: null,
    timestamp: '2026-02-31T00:00:00.000000Z', snapshot: '2026-10-01T00:00:00.000000Z', id: uuidv7() })).toString('base64url');
  await assert.rejects(denied({ cursor }), /invalid_pagination/);
});

async function publication(commentId, timestamp, payload = {}) {
  const id = uuidv7(); events.push(id);
  const revision = (await control.query('SELECT moderation_source_event_id FROM content.comments WHERE id=$1', [commentId])).rows[0].moderation_source_event_id;
  let caseId = (await control.query("SELECT id FROM moderation.cases WHERE content_type='comment' AND content_id=$1 AND source_event_id=$2", [commentId, revision])).rows[0]?.id;
  if (!caseId) {
    caseId = uuidv7();
    await control.query("INSERT INTO moderation.cases(id,content_type,content_id,source_event_id,policy_version,state,resolved_at) VALUES($1,'comment',$2,$3,'synthetic-comment-fixture','resolved',$4)", [caseId, commentId, revision, timestamp]);
  }
  const decisionId = uuidv7();
  await control.query("INSERT INTO moderation.decisions(id,case_id,outcome,policy_version,created_at) VALUES($1,$2,'allow','synthetic-comment-fixture',$3)", [decisionId, caseId, timestamp]);
  await control.query('UPDATE content.comments SET updated_at=$2 WHERE id=$1', [commentId, timestamp]);
  await control.query(`INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,payload,created_at)
    VALUES($1,'content.comment.published','comment',$2,$3::jsonb,$4)`, [id, commentId, JSON.stringify({ ...payload, sourceEventId: revision, decisionId }), timestamp]);
  return id;
}
test('delayed notifications use live relationships and revisions; replay stays unique and reads hide withdrawn children', async () => {
  const owner = await actor(), author = await actor(), postId = await post(owner), root = await comment(postId, owner);
  const child = await comment(postId, author, { parent: root });
  const event = await publication(child, '2026-10-02T10:00:00Z', { authorId: owner, postId: uuidv7(), parentId: uuidv7() });
  const recipients = async id => (await query(commentNotificationRecipientQuery, [id], 'lythaus_jobs')).rows;
  const recipient = (await recipients(event))[0];
  assert.equal(recipient.recipient_id, owner);
  assert.equal(recipient.notification_type, 'content.reply_received');
  await control.query("UPDATE system.outbox_events SET payload=payload-'sourceEventId' WHERE id=$1", [event]);
  assert.deepEqual(await recipients(event), []);
  await control.query("UPDATE system.outbox_events SET payload=jsonb_set(payload,'{sourceEventId}',to_jsonb($2::text)) WHERE id=$1", [event, uuidv7()]);
  assert.deepEqual(await recipients(event), []);
  const revision = (await control.query('SELECT moderation_source_event_id FROM content.comments WHERE id=$1', [child])).rows[0].moderation_source_event_id;
  await control.query("UPDATE system.outbox_events SET payload=jsonb_set(payload,'{sourceEventId}',to_jsonb($2::text)) WHERE id=$1", [event, revision]);
  for (let attempt = 0; attempt < 2; attempt++) await control.query(`INSERT INTO feed.notifications(id,recipient_id,notification_type,entity_id,source_event_id)
    VALUES($1,$2,'content.reply_received',$3,$4) ON CONFLICT DO NOTHING`, [uuidv7(), owner, child, event]);
  const visibleNotifications = () => query(`SELECT entity_id FROM feed.notifications WHERE recipient_id=$1 AND ${commentNotificationVisibilitySql}`, [owner]);
  assert.equal((await visibleNotifications()).rowCount, 1);
  await control.query("UPDATE content.comments SET updated_at='2026-10-03',moderation_state='under_review',moderation_source_event_id=$2 WHERE id=$1", [child, uuidv7()]);
  assert.deepEqual(await recipients(event), []);
  assert.equal((await visibleNotifications()).rowCount, 0);
  await control.query("UPDATE content.comments SET moderation_state='allowed' WHERE id=$1", [child]);
  assert.deepEqual(await recipients(event), []);
  const current = await publication(child, '2026-10-04T10:00:00Z');
  assert.equal((await recipients(current)).length, 1);
  await control.query("UPDATE content.posts SET visibility='private',author_id=$2 WHERE id=$1", [postId, author]);
  assert.deepEqual(await recipients(current), []);
  assert.equal((await visibleNotifications()).rowCount, 0);
  await control.query("UPDATE content.posts SET visibility='public' WHERE id=$1", [postId]);
  await control.query('UPDATE content.comments SET deleted_at=now() WHERE id=$1', [root]);
  assert.deepEqual(await recipients(current), []);
});

test('notification revision lock orders a concurrent edit before any subsequent eligible delivery', async () => {
  const owner = await actor(), author = await actor(), postId = await post(owner);
  const child = await comment(postId, author), event = await publication(child, '2026-10-05T10:00:00Z');
  const jobs = new pg.Client({ connectionString, ssl: false });
  await jobs.connect();
  let editing;
  try {
    await jobs.query('SET ROLE lythaus_jobs');
    await jobs.query('BEGIN');
    await jobs.query(commentNotificationRevisionLockQuery, [event]);
    editing = control.query("UPDATE content.comments SET moderation_state='under_review',moderation_source_event_id=$2 WHERE id=$1", [child, uuidv7()]);
    let blocked = false;
    for (let attempt = 0; attempt < 40 && !blocked; attempt++) {
      const row = (await jobs.query('SELECT pg_blocking_pids($1) AS blockers', [control.processID])).rows[0];
      blocked = row.blockers.includes(jobs.processID);
      if (!blocked) await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(blocked, true);
    assert.equal((await jobs.query(commentNotificationRecipientQuery, [event])).rowCount, 1);
    await jobs.query('COMMIT');
    await editing;
    assert.equal((await jobs.query(commentNotificationRecipientQuery, [event])).rowCount, 0);
  } finally {
    await jobs.query('ROLLBACK');
    await jobs.end();
    await editing;
  }
});
