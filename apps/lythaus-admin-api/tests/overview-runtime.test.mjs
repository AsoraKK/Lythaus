import assert from 'node:assert/strict';
import test from 'node:test';
import { handleOverview } from '../src/overview-runtime.ts';

const owner = { userId: '01900000-0000-7000-8000-000000000099', role: 'owner' };
const sample = '2026-10-02T12:00:00Z';
const at = Date.parse(sample);
function fixture() {
  const env = { DB_ADMIN_FRESH: {} }, reads = [];
  const state = { active: true, role: 'owner', sampledAt: sample, audit: true, fail: false };
  const run = (_binding, work) => work({ query: async (sql, values) => {
    reads.push({ sql, values });
    if (sql.startsWith('SET ')) return { rows: [], rowCount: null };
    if (sql.includes('identity.admin_memberships')) return { rows: state.active && state.role === 'owner' ? [{ sampled_at: state.sampledAt }] : [], rowCount: state.active && state.role === 'owner' ? 1 : 0 };
    if (sql.startsWith('WITH')) {
      if (state.fail) throw new Error('password=synthetic-private; token=synthetic-private');
      return { rows: ['current', 'previous'].map(window => ({ window, post_rows: 0, comment_rows: 0, user_rows: 0, posts: 0, comments: 0,
        cohort_comments: 0, unanswered_posts: 0, unique_contributors: 0, new_registrations: 0, subscriptions_free: 0, subscriptions_premium: 0, subscriptions_black: 0 })), rowCount: 2 };
    }
    if (sql.includes('INSERT INTO system.audit_events')) return { rows: [], rowCount: state.audit ? 1 : 0 };
    throw new Error('unexpected fixture query');
  } });
  return { env, run, state, reads, call: (path = '', actor = owner, now = at) => handleOverview(new Request(`https://admin.lythaus.co/api/admin/overview${path}`), env, actor, 'synthetic-overview', run, now) };
}

test('every non-owner role and missing current owner is denied before aggregate disclosure', async () => {
  const f = fixture();
  for (const role of ['administrator', 'moderator', 'operations', 'editorial', 'privacy_operator', 'guest']) await assert.rejects(f.call('', { ...owner, role }), /overview_owner_required/);
  assert.equal(f.reads.length, 0);
  f.state.active = false;
  await assert.rejects(f.call(), /overview_owner_required/);
  assert.ok(!f.reads.some(x => x.sql.startsWith('WITH')));
  assert.ok(!f.reads.some(x => x.sql.includes('INSERT')));
});

test('aggregate and audit complete before returning a private no-store allowlist', async () => {
  const f = fixture(), response = await f.call(), data = await response.json();
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.match(response.headers.get('vary'), /Cf-Access-Jwt-Assertion/);
  assert.equal(data.metrics.posts.value, 0);
  assert.equal(data.metrics.commentsPerPost.value, null);
  assert.equal(data.correlationId, 'synthetic-overview');
  const aggregate = f.reads.find(x => x.sql.startsWith('WITH'));
  assert.equal(aggregate.values.at(-1), 5001);
  assert.ok(!/body|email_ciphertext|password_hash|metadata/.test(aggregate.sql));
  assert.match(f.reads[1].sql, /1500ms/);
  const audit = f.reads.at(-1);
  assert.equal(audit.values[1], owner.userId);
  assert.ok(!JSON.stringify(data).includes(owner.userId));
  assert.ok(!JSON.stringify(data).includes('synthetic-private'));
});

test('cache reduces aggregate reads while rechecking owner and auditing every response', async () => {
  const f = fixture();
  await f.call();
  const response = await f.call('', owner, at + 1000);
  assert.equal((await response.json()).sampledAt, new Date(sample).toISOString());
  assert.equal(f.reads.filter(x => x.sql.startsWith('WITH')).length, 1);
  assert.equal(f.reads.filter(x => x.sql.includes('identity.admin_memberships')).length, 2);
  assert.equal(f.reads.filter(x => x.sql.includes('INSERT INTO system.audit_events')).length, 2);
  f.state.active = false;
  await assert.rejects(f.call('', owner, at + 2000), /overview_owner_required/);
  f.state.active = true; f.state.role = 'administrator';
  await assert.rejects(f.call('', owner, at + 3000), /overview_owner_required/);
});

test('expired, backward-clock and calendar-boundary cache entries are recomputed; failed recomputation never serves stale data', async () => {
  const f = fixture(); await f.call();
  f.state.sampledAt = '2026-10-02T12:01:01Z';
  await f.call('', owner, at + 61000);
  assert.equal(f.reads.filter(x => x.sql.startsWith('WITH')).length, 2);
  f.state.fail = true;
  await assert.rejects(f.call('', owner, at + 122000), /overview_unavailable/);
  f.state.fail = false;
  await f.call('', owner, at - 1);
  assert.equal(f.reads.filter(x => x.sql.startsWith('WITH')).length, 4);
  f.state.sampledAt = '2026-10-03T00:00:00Z';
  await f.call('', owner, at + 1);
  assert.equal(f.reads.filter(x => x.sql.startsWith('WITH')).length, 5);
});

test('failed audit and raw query errors fail closed with a safe unavailable code', async () => {
  const f = fixture(); f.state.audit = false;
  await assert.rejects(f.call(), { message: 'overview_unavailable' });
  f.state.audit = true; f.state.fail = true;
  await assert.rejects(f.call(), { message: 'overview_unavailable' });
  assert.equal(f.reads.filter(x => x.sql.startsWith('WITH')).length, 2);
});

test('unsupported periods, duplicate filters and cross-user query parameters are rejected', async () => {
  const f = fixture();
  for (const path of ['?period=month', '?period=today&period=ytd', '?userId=foreign', '?since=2026-01-01']) await assert.rejects(f.call(path), /overview_invalid_period/);
  assert.equal(f.reads.length, 0);
});

test('a transaction commit failure discloses nothing and never populates the cache', async () => {
  const f = fixture();
  const failCommit = async (binding, work) => { await f.run(binding, work); throw new Error('synthetic private commit failure'); };
  await assert.rejects(handleOverview(new Request('https://admin.lythaus.co/api/admin/overview'), f.env, owner, 'synthetic-overview', failCommit, at), { message: 'overview_unavailable' });
  const data = await (await f.call()).json();
  assert.equal(data.metrics.posts.value, 0);
  assert.equal(f.reads.filter(x => x.sql.startsWith('WITH')).length, 2);
});
