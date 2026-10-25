import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { privacyPostgresTarget } from './privacy-postgres-target.mjs';
import { readCommentThread } from '../src/comment-thread-reader.ts';

const connectionString = privacyPostgresTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL).toString();
const control = new pg.Client({ connectionString, ssl: false });
const users = [], posts = [];
before(async () => {
  await control.connect();
  assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  await control.query("SET statement_timeout='5s'");
});
after(async () => {
  try {
    await control.query('DELETE FROM content.comments WHERE post_id=ANY($1::uuid[])', [posts]);
    await control.query('DELETE FROM content.posts WHERE id=ANY($1::uuid[])', [posts]);
    await control.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])', [users]);
  } finally { await control.end(); }
});
async function actor() {
  const id = uuidv7(); users.push(id);
  await control.query("INSERT INTO identity.users(id,status) VALUES($1,'active')", [id]);
  return id;
}
async function post(author) {
  const id = uuidv7(); posts.push(id);
  await control.query("INSERT INTO content.posts(id,author_id,body,declared_creation_mode,moderation_state,visibility) VALUES($1,$2,'Synthetic post','human','allowed','public')", [id, author]);
  await control.query("INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label) VALUES($1,'human','Human-authored')", [id]);
  return id;
}
async function comment(postId, author, timestamp, parent = null) {
  const id = uuidv7();
  await control.query(`INSERT INTO content.comments(id,post_id,author_id,body,parent_id,depth,declared_creation_mode,moderation_state,created_at,moderation_source_event_id)
    VALUES($1,$2,$3,'Synthetic comment',$4,$5,'human','allowed',$6,$7)`, [id, postId, author, parent, parent ? 1 : 0, timestamp, uuidv7()]);
  return id;
}
async function query(sql, values) {
  await control.query('SET ROLE lythaus_runtime');
  try { return await control.query(sql, values); }
  finally { await control.query('RESET ROLE'); }
}
const read = (postId, options = {}) => readCommentThread({ postId, viewerId: null,
  request: new Request(`https://local.test/api/posts/${postId}/comments?${new URLSearchParams({ view: 'conversations', limit: '10', sort: 'oldest', ...options })}`), query });

test('pagination remains continuous beyond 25 synthetic roots', async () => {
  const owner = await actor(), postId = await post(owner);
  for (let i = 0; i < 31; i++) {
    await comment(postId, owner, new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString());
  }
  const ids = [];
  let pages = 0;
  let page = await read(postId);
  while (true) {
    pages++;
    ids.push(...page.items.map(item => item.id));
    if (!page.nextCursor) break;
    page = await readCommentThread({ postId, viewerId: null,
      request: new Request(`https://local.test/api/posts/${postId}/comments?view=conversations&limit=10&sort=oldest&cursor=${encodeURIComponent(page.nextCursor)}`), query });
  }
  assert.equal(ids.length, 31);
  assert.equal(new Set(ids).size, 31);
  assert.equal(pages, 4);
});

test('inactive author root and replies are excluded from public thread', async () => {
  const owner = await actor(), inactive = await actor(), postId = await post(owner);
  const root = await comment(postId, inactive, new Date(Date.UTC(2026, 0, 1)).toISOString());
  const child = await comment(postId, owner, new Date(Date.UTC(2026, 0, 1, 0, 0, 1)).toISOString(), root);
  const visibleRoot = await comment(postId, owner, new Date(Date.UTC(2026, 0, 1, 0, 0, 2)).toISOString());
  await control.query("UPDATE identity.users SET status='suspended' WHERE id=$1", [inactive]);
  const page = await read(postId);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].id, visibleRoot);
  assert.notEqual(page.items[0].id, root);
  assert.notEqual(page.items[0].id, child);
  assert.equal(page.items[0].authorId, owner);
  await assert.rejects(read(postId, { conversationId: root }), /comment_not_found/,
    'A suspended author cannot open a root conversation');
  const targetedChild = await readCommentThread({ postId, viewerId: null,
    request: new Request(`https://local.test/api/posts/${postId}/comments?view=conversations&targetId=${child}`), query });
  assert.deepEqual(targetedChild.items, [], 'An exact target lookup cannot expose a child under a suspended root');
});
