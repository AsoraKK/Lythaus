import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { handleOverview, OVERVIEW_AGGREGATE_SQL, overviewSnapshot } from '../src/overview-runtime.ts';
import { overviewScope } from '../src/overview-policy.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1'].includes(target.hostname) || !(target.pathname.startsWith('/lythaus_auth_test') || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) throw new Error('Overview tests require disposable local PostgreSQL');
const ids = Array.from({ length: 6 }, () => uuidv7());
const posts = Array.from({ length: 9 }, () => uuidv7());
const owner = { userId: uuidv7(), role: 'owner' };
const env = { DB_ADMIN_FRESH: {} };
const scope = overviewScope('today', new Date('2001-10-02T12:00:00Z'));
async function sql(text, values = [], role) {
  const client = new pg.Client({ connectionString, ssl: false }); await client.connect();
  try {
    await client.query(role ? "SET statement_timeout = '1500ms'" : "SET statement_timeout = '15s'");
    if (role) await client.query(`SET ROLE ${role}`);
    return await client.query(text, values);
  } finally { await client.end(); }
}
const aggregate = () => sql(OVERVIEW_AGGREGATE_SQL, [scope.current.start, scope.current.end, scope.previous.start, scope.previous.end, 5001], 'lythaus_admin');
const runTransaction = (reads, failAudit = false) => async (_binding, work) => {
  const client = new pg.Client({ connectionString, ssl: false }); await client.connect();
  try {
    await client.query('SET ROLE lythaus_admin'); await client.query('BEGIN');
    const result = await work({ query: async (text, values) => {
      reads.push(text);
      if (failAudit && text.includes('INSERT INTO system.audit_events')) await client.query('SET LOCAL ROLE lythaus_runtime');
      return client.query(text, values);
    } });
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
};
const readOverview = (reads, failAudit = false) => handleOverview(new Request('https://admin.lythaus.co/api/admin/overview'), env, owner, uuidv7(), runTransaction(reads, failAudit));

before(async () => {
  await sql('INSERT INTO identity.users (id, is_production_acceptance) VALUES ($1, true)', [owner.userId]);
  await sql("INSERT INTO identity.admin_memberships (user_id, access_subject_hmac, role, active) VALUES ($1, $2, 'owner', true)", [owner.userId, randomBytes(32)]);
  for (const [index, id] of ids.entries()) await sql(`INSERT INTO identity.users (id, status, created_at, deleted_at, is_production_acceptance)
    VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5)`, [id, index === 1 ? 'suspended' : index === 2 ? 'locked' : index === 3 ? 'deleted' : 'active',
    index === 0 ? '2001-10-01T00:00:00Z' : '2001-10-02T01:00:00Z', index === 3 ? '2001-10-02T02:00:00Z' : null, index === 4]);
  await sql(`INSERT INTO identity.user_entitlements (user_id, subscription_tier) VALUES ($1, 'premium'), ($2, 'black')`, [ids[1], ids[2]]);
  const specs = [
    [ids[0], 'public', 'allowed', null, '2001-10-02T01:00:00Z'],
    [ids[1], 'public', 'allowed', null, '2001-10-02T02:00:00Z'],
    [ids[0], 'public', 'allowed', null, '2001-10-01T01:00:00Z'],
    [ids[0], 'private', 'allowed', null, '2001-10-02T01:00:00Z'],
    [ids[0], 'public', 'blocked', null, '2001-10-02T01:00:00Z'],
    [ids[0], 'public', 'allowed', '2001-10-02T02:00:00Z', '2001-10-02T01:00:00Z'],
    [ids[4], 'public', 'allowed', null, '2001-10-02T01:00:00Z'],
    [ids[3], 'public', 'allowed', null, '2001-10-02T01:00:00Z'],
    [ids[0], 'public', 'allowed', null, '2001-10-02T12:00:00Z'],
  ];
  for (const [index, spec] of specs.entries()) await sql(`INSERT INTO content.posts (id, author_id, body, declared_creation_mode, visibility, moderation_state, deleted_at, created_at)
    VALUES ($1, $2, 'Synthetic private fixture body', 'human', $3, $4, $5::timestamptz, $6::timestamptz)`, [posts[index], ...spec]);
  for (const [post, author, state, deleted, created] of [
    [posts[0], ids[1], 'allowed', null, '2001-10-02T03:00:00Z'],
    [posts[0], ids[0], 'allowed', null, '2001-10-02T03:00:00Z'],
    [posts[1], ids[1], 'allowed', null, '2001-10-02T03:00:00Z'],
    [posts[2], ids[2], 'allowed', null, '2001-10-02T03:00:00Z'],
    [posts[0], ids[2], 'under_review', null, '2001-10-02T03:00:00Z'],
    [posts[0], ids[2], 'allowed', '2001-10-02T04:00:00Z', '2001-10-02T03:00:00Z'],
    [posts[3], ids[2], 'allowed', null, '2001-10-02T03:00:00Z'],
    [posts[0], ids[4], 'allowed', null, '2001-10-02T03:00:00Z'],
    [posts[0], ids[3], 'allowed', null, '2001-10-02T03:00:00Z'],
    [posts[8], ids[2], 'allowed', null, '2001-10-02T03:00:00Z'],
    [posts[0], ids[2], 'allowed', null, '2001-10-02T12:00:00Z'],
  ]) await sql(`INSERT INTO content.comments (id, post_id, author_id, body, declared_creation_mode, moderation_state, deleted_at, created_at)
    VALUES ($1, $2, $3, 'Synthetic private comment', 'human', $4, $5::timestamptz, $6::timestamptz)`, [uuidv7(), post, author, state, deleted, created]);
});

after(async () => {
  await sql('DELETE FROM system.audit_events WHERE actor_id = $1', [owner.userId]);
  await sql('DELETE FROM identity.admin_memberships WHERE user_id = $1', [owner.userId]);
  await sql('DELETE FROM identity.users WHERE id = $1', [owner.userId]);
  await sql('DELETE FROM content.comments WHERE author_id = ANY($1::uuid[])', [ids]);
  await sql('DELETE FROM content.posts WHERE id = ANY($1::uuid[])', [posts]);
  await sql('DELETE FROM identity.users WHERE id = ANY($1::uuid[])', [ids]);
});

test('real restricted-role aggregates reconcile exact records, exclusions, cohort ratio, distinct authors and elapsed prior window', async () => {
  const result = await aggregate(), data = overviewSnapshot(scope, result.rows);
  const expected = { posts: 2, comments: 4, commentsPerPost: 1.5, unansweredPosts: 1, uniqueContributors: 3, newRegistrations: 3 };
  for (const [key, value] of Object.entries(expected)) assert.equal(data.metrics[key].value, value, key);
  assert.equal(data.metrics.posts.previous, 1);
  assert.equal(data.metrics.comments.previous, 0);
  assert.equal(data.metrics.unansweredPosts.previous, 1);
  assert.equal(data.metrics.subscriptionsFree.value, 2);
  assert.equal(data.metrics.subscriptionsPremium.value, 1);
  assert.equal(data.metrics.subscriptionsBlack.value, 1);
  assert.ok(!JSON.stringify(data).includes('Synthetic private fixture body'));
  assert.ok(!ids.some(id => JSON.stringify(data).includes(id)));
});

test('query plan bounds each primary scan before filters and uses bounded keyed author lookups', async () => {
  const explained = await sql(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${OVERVIEW_AGGREGATE_SQL}`, [scope.current.start, scope.current.end, scope.previous.start, scope.previous.end, 5001], 'lythaus_admin');
  const plan = explained.rows[0]['QUERY PLAN'][0];
  function nodes(node) { return [node, ...(node.Plans ?? []).flatMap(nodes)]; }
  const limits = nodes(plan.Plan).filter(node => node['Node Type'] === 'Limit');
  assert.ok(limits.length >= 6);
  assert.ok(limits.every(node => node['Actual Rows'] <= 5001));
  assert.ok(plan['Execution Time'] < 1500);
});

test('deletion revises retained historical comparisons and never relabels them as a durable event ledger', async () => {
  await sql('UPDATE content.posts SET deleted_at = now() WHERE id = $1', [posts[0]]);
  const data = overviewSnapshot(scope, (await aggregate()).rows);
  assert.equal(data.metrics.posts.value, 1); assert.equal(data.metrics.comments.value, 2);
  assert.equal(data.metrics.commentsPerPost.value, 1); assert.equal(data.metrics.uniqueContributors.value, 2);
  assert.equal(data.coverage, 'retained_current_state');
});

test('actual transactions recheck current owner on cached reads and commit audit before disclosure', async () => {
  const reads = [];
  const data = await (await readOverview(reads)).json();
  assert.equal(data.contractVersion, 'overview-v1');
  assert.ok(!JSON.stringify(data).includes(owner.userId));
  await readOverview(reads);
  assert.equal(reads.filter(text => text.startsWith('WITH')).length, 1);
  assert.equal(reads.filter(text => text.includes('identity.admin_memberships')).length, 2);
  const audits = () => sql("SELECT count(*)::integer AS n FROM system.audit_events WHERE actor_id = $1 AND action = 'operations.overview_viewed'", [owner.userId]);
  assert.equal((await audits()).rows[0].n, 2);
  for (const change of ["UPDATE identity.admin_memberships SET active = false WHERE user_id = $1", "UPDATE identity.admin_memberships SET active = true, role = 'administrator' WHERE user_id = $1"]) {
    await sql(change, [owner.userId]);
    await assert.rejects(readOverview(reads), /overview_owner_required/);
  }
  await sql("UPDATE identity.admin_memberships SET role = 'owner' WHERE user_id = $1", [owner.userId]);
  await sql("UPDATE identity.users SET status = 'locked' WHERE id = $1", [owner.userId]);
  await assert.rejects(readOverview(reads), /overview_owner_required/);
  await sql("UPDATE identity.users SET status = 'active' WHERE id = $1", [owner.userId]);
  await assert.rejects(readOverview(reads, true), { message: 'overview_unavailable' });
  assert.equal((await audits()).rows[0].n, 2);
});

test('populations above the cap produce unavailable totals within the bounded query budget', async () => {
  const extra = Array.from({ length: 5001 }, () => uuidv7());
  try {
    await sql("INSERT INTO identity.users (id, created_at) SELECT id, '2001-10-02T01:00:00Z'::timestamptz FROM unnest($1::uuid[]) id", [extra]);
    await sql("INSERT INTO content.posts (id, author_id, body, declared_creation_mode, visibility, moderation_state, created_at) SELECT id, $2, 'Synthetic cap fixture', 'human', 'public', 'allowed', '2001-10-02T01:00:00Z'::timestamptz FROM unnest($1::uuid[]) id", [extra, ids[0]]);
    await sql("INSERT INTO content.comments (id, post_id, author_id, body, declared_creation_mode, moderation_state, created_at) SELECT id, $2, $3, 'Synthetic cap fixture', 'human', 'allowed', '2001-10-02T03:00:00Z'::timestamptz FROM unnest($1::uuid[]) id", [extra, posts[2], ids[0]]);
    const data = overviewSnapshot(scope, (await aggregate()).rows);
    for (const item of Object.values(data.metrics)) { assert.equal(item.value, null); assert.equal(item.reason, 'snapshot_row_limit'); }
  } finally {
    await sql('DELETE FROM content.comments WHERE id = ANY($1::uuid[])', [extra]);
    await sql('DELETE FROM content.posts WHERE id = ANY($1::uuid[])', [extra]);
    await sql('DELETE FROM identity.users WHERE id = ANY($1::uuid[])', [extra]);
  }
});
