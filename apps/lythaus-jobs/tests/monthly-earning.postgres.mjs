import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test, mock } from 'node:test';
import pg from 'pg';
import * as database from '@lythaus/db';
import { uuidv7 } from '@lythaus/security';
import { MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH } from '@lythaus/contracts';
import { PROPOSED_WEEKLY_EARNING_RULES } from '../../../packages/contracts/src/monthly-earning-policy.ts';
import { recordMonthlyContentEarning, refreshMonthlyEarningWeek, loadMonthlyEarningConfiguration } from '../../../packages/db/src/monthly-earning.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['127.0.0.1', 'localhost'].includes(target.hostname)
  || !(target.pathname === '/lythaus_monthly_test' || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Monthly earning tests require explicitly local disposable PostgreSQL');
}
const statements = [];
async function transact(work, role = 'lythaus_jobs') {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '10s'");
    if (role) {
      assert.ok(['lythaus_jobs', 'lythaus_runtime', 'lythaus_privacy'].includes(role));
      await client.query(`SET LOCAL ROLE ${role}`);
    }
    const result = await work({ query: (text, values) => { statements.push(text); return client.query(text, values); } });
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
}
const sql = (text, values) => transact(client => client.query(text, values), null);
const binding = Object.freeze({ connectionString: 'disposable-fresh-binding' });
mock.module('@lythaus/db', { namedExports: { ...database,
  transaction: (actual, work) => { assert.equal(actual, binding); return transact(work); },
  query: (actual, text, values) => { assert.equal(actual, binding); return transact(client => client.query(text, values)); },
} });
const { processMonthlyEarningEvent, reconcileMonthlyEarning } = await import('../src/monthly-earning.ts');
const env = { DB_JOBS_FRESH: binding, MONTHLY_REPUTATION_SHADOW_RULES: PROPOSED_WEEKLY_EARNING_RULES.version };
const userId = uuidv7(), reviewerId = uuidv7(), otherId = uuidv7(), deletedOpenWeekId = uuidv7();
const flag = 'trust.monthly_reputation_shadow';
const rule = PROPOSED_WEEKLY_EARNING_RULES.version;
const fixtureIds = [];
let flagGrantExisted, firstWeekId;
const posts = [];

async function makePost(patch = {}) {
  const id = uuidv7(), source = uuidv7(), event = uuidv7(), caseId = uuidv7(), decision = uuidv7();
  fixtureIds.push(id);
  const body = patch.body ?? `Distinct human contribution ${id}`;
  const created = patch.created ?? '2026-08-03T12:00:00.000Z';
  const subject = patch.author ?? userId;
  const mode = patch.mode ?? 'human';
  await sql(`INSERT INTO content.posts (id, author_id, body, declared_creation_mode, visibility, moderation_state, moderation_source_event_id, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, subject, body, mode, patch.visibility ?? 'public', patch.state ?? 'allowed', source, created]);
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, created_at)
    VALUES ($1, 'content.post.created', 'post', $2, $3, '{}'::jsonb, $4),
      ($5, 'content.post.published', 'post', $2, $6, $7::jsonb, $8)`,
    [source, id, subject, created, event, reviewerId, JSON.stringify({ authorId: otherId, points: 13500 }), patch.reviewed ?? '2026-08-04T12:00:00.000Z']);
  await sql(`INSERT INTO moderation.cases (id, content_type, content_id, state, policy_version, source_event_id)
    VALUES ($1, 'post', $2, 'resolved', 'synthetic-publication-v1', $3)`, [caseId, id, source]);
  await sql(`INSERT INTO moderation.decisions (id, case_id, outcome, public_label, policy_version, decided_by)
    VALUES ($1, $2, 'allow', $3, 'synthetic-publication-v1', $4)`, [decision, caseId, mode === 'human' ? 'Human-authored' : 'AI-assisted', patch.reviewer ?? reviewerId]);
  return { id, source, event, caseId, body };
}
const latest = async (subject = userId, starts = '2026-08-03T00:00:00.000Z') =>
  (await sql(`SELECT * FROM trust.monthly_earning_week_revisions WHERE subject_user_id = $1 AND week_start = $2 ORDER BY revision DESC LIMIT 1`, [subject, starts])).rows[0];

before(async () => {
  assert.ok((await sql("SELECT current_setting('server_version_num')::integer AS n")).rows[0].n >= 170000);
  flagGrantExisted = (await sql("SELECT has_table_privilege('lythaus_jobs', 'system.feature_flags', 'SELECT') AS allowed")).rows[0].allowed;
  await sql(readFileSync(new URL('../../../database/planetscale/proposals/monthly_reputation_earning.sql', import.meta.url), 'utf8'));
  await sql('INSERT INTO identity.users (id, display_name) VALUES ($1, $5), ($2, $5), ($3, $5), ($4, $5)',
    [userId, reviewerId, otherId, deletedOpenWeekId, 'Synthetic earning fixture']);
  await sql(`INSERT INTO trust.monthly_earning_rule_sets (version, policy_version, catalogue_hash, mode, collect_from, configuration)
    VALUES ($1, $2, $3, 'shadow', '2026-08-01T00:00:00.000Z', $4::jsonb)`, [rule, MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH, JSON.stringify(PROPOSED_WEEKLY_EARNING_RULES)]);
});
after(async () => {
  await sql('DROP TRIGGER IF EXISTS fail_monthly_week_fixture ON system.outbox_events');
  await sql('DROP FUNCTION IF EXISTS system.fail_monthly_week_fixture()');
  await sql('DROP TABLE IF EXISTS trust.monthly_earning_week_revisions, trust.monthly_earning_receipts, trust.monthly_earning_evidence_revisions, trust.monthly_earning_contributions, trust.monthly_earning_rule_sets');
  await sql('DROP FUNCTION IF EXISTS trust.reject_monthly_earning_update()');
  await sql('DROP FUNCTION IF EXISTS trust.redact_monthly_earning_calculation(jsonb)');
  await sql('DELETE FROM system.feature_flags WHERE flag_key = $1', [flag]);
  if (!flagGrantExisted) await sql('REVOKE SELECT ON system.feature_flags FROM lythaus_jobs');
  await sql('DELETE FROM moderation.decisions WHERE case_id IN (SELECT id FROM moderation.cases WHERE content_id = ANY($1::uuid[]))', [fixtureIds]);
  await sql('DELETE FROM moderation.cases WHERE content_id = ANY($1::uuid[])', [fixtureIds]);
  await sql('DELETE FROM content.comments WHERE author_id IN ($1, $2, $3, $4)', [userId, reviewerId, otherId, deletedOpenWeekId]);
  await sql('DELETE FROM content.posts WHERE id = ANY($1::uuid[])', [fixtureIds]);
  await sql('DELETE FROM system.outbox_events WHERE actor_id IN ($1, $2, $3, $4)', [userId, reviewerId, otherId, deletedOpenWeekId]);
  await sql('DELETE FROM identity.users WHERE id IN ($1, $2, $3, $4)', [userId, reviewerId, otherId, deletedOpenWeekId]);
});

test('SEC-01: collection needs explicit shadow rules and a matching enabled policy; there is no implicit default', async () => {
  statements.length = 0;
  assert.equal(await processMonthlyEarningEvent({ DB_JOBS_FRESH: binding }, uuidv7()), null);
  assert.deepEqual(await reconcileMonthlyEarning({ DB_JOBS_FRESH: binding }), { processed: 0, settled: 0 });
  assert.equal(statements.length, 0);
  assert.equal(await processMonthlyEarningEvent(env, uuidv7()), null);
  assert.equal(statements.some(text => text.includes('trust.monthly_earning')), false);
  await sql('INSERT INTO system.feature_flags (flag_key, enabled, policy_version) VALUES ($1, true, $2)', [flag, MONTHLY_REPUTATION_POLICY_VERSION]);
  assert.equal(await processMonthlyEarningEvent({ ...env, MONTHLY_REPUTATION_SHADOW_RULES: 'missing' }, uuidv7()), null);
  await assert.rejects(processMonthlyEarningEvent(env, uuidv7()), /canonical_event_required/);
});

test('PTS-01/CAL-20: real publication sources produce one three-post milestone under concurrent duplicate delivery', async () => {
  for (let i = 0; i < 3; i++) posts.push(await makePost());
  const results = await Promise.all(posts.flatMap(post => [processMonthlyEarningEvent(env, post.event), processMonthlyEarningEvent(env, post.event)]));
  assert.equal(results.filter(result => result.processed).length, 3);
  const week = await latest(); firstWeekId = week.week_id;
  assert.equal(week.points, 500);
  assert.equal(week.calculation.actions.find(row => row.actionId === 'weekly.three_human_posts').points, 250);
  assert.equal((await sql('SELECT id FROM trust.monthly_earning_contributions WHERE subject_user_id = $1', [otherId])).rowCount, 0);
  assert.equal((await sql('SELECT id FROM trust.monthly_earning_evidence_revisions')).rowCount, 3);
  assert.equal((await sql('SELECT user_id FROM trust.reputation_profiles WHERE user_id = $1', [userId])).rowCount, 0);
  assert.equal(JSON.stringify(week.calculation).includes(posts[0].body), false);
  await assert.rejects(transact(client => client.query('SELECT * FROM trust.monthly_earning_week_revisions'), 'lythaus_runtime'), { code: '42501' });
});

test('PTS-08/13/14: duplicate work, self-acceptance, invalid declarations and pending publication never create extra credit', async () => {
  const inputs = [await makePost({ body: posts[0].body }), await makePost({ reviewer: userId }),
    await makePost({ body: 'Permitted assistance', mode: 'ai_assisted' }), await makePost({ body: 'a'.repeat(250), mode: 'ai_assisted' }),
    await makePost({ visibility: 'private' }), await makePost({ state: 'under_review' }),
    await makePost({ mode: 'ai_generated', visibility: 'private', state: 'blocked' })];
  for (const post of inputs) await processMonthlyEarningEvent(env, post.event);
  const week = await latest();
  assert.equal(week.points, 500);
  assert.equal(week.week_id, firstWeekId);
  assert.ok(week.calculation.evidence.some(row => row.reasonCode === 'duplicate_work'));
  assert.ok(week.calculation.evidence.some(row => row.reasonCode === 'declaration_ineligible'));
  assert.ok(week.calculation.evidence.some(row => row.state === 'pending_review'));
  const honest = await makePost({ author: otherId, mode: 'ai_assisted', body: 'Honest assistance' });
  await processMonthlyEarningEvent(env, honest.event);
  assert.equal((await latest(otherId)).points, 50);
});

test('CAL-18/RPT-04: ordinary deletion preserves legitimate earning; independent invalidation appends a correction', async () => {
  const deleted = posts[2];
  const event = uuidv7();
  await sql('UPDATE content.posts SET deleted_at = now() WHERE id = $1', [deleted.id]);
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
    VALUES ($1, 'content.post.deleted', 'post', $2, $3, '{}'::jsonb)`, [event, deleted.id, userId]);
  await processMonthlyEarningEvent(env, event);
  assert.equal((await latest()).points, 500);
  assert.ok((await latest()).calculation.evidence.some(row => row.reasonCode === 'legitimate_deletion_preserved' && row.state === 'accepted'));
  const invalidation = uuidv7();
  await sql("UPDATE content.posts SET moderation_state = 'blocked' WHERE id = $1", [deleted.id]);
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
    VALUES ($1, 'moderation.content.blocked', 'post', $2, $3, '{}'::jsonb)`, [invalidation, deleted.id, otherId]);
  await processMonthlyEarningEvent(env, invalidation);
  assert.equal((await latest()).points, 250);
  assert.equal((await latest()).state, 'corrected');
  const stale = await makePost({ author: otherId });
  const edit = uuidv7();
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, created_at)
    VALUES ($1, 'content.post.updated', 'post', $2, $3, '{}'::jsonb, '2026-08-04T15:00:00.000Z')`, [edit, stale.id, otherId]);
  await sql("UPDATE content.posts SET body = 'Changed content', moderation_state = 'under_review', moderation_source_event_id = $2 WHERE id = $1", [stale.id, edit]);
  await processMonthlyEarningEvent(env, stale.event);
  assert.equal((await latest(otherId)).points, 50);
  assert.equal((await latest(otherId)).calculation.evidence.find(row => row.sourceRevisionId === edit).state, 'pending_review');
  await assert.rejects(sql('UPDATE trust.monthly_earning_evidence_revisions SET input = input'), { code: '55000' });
  await assert.rejects(sql('UPDATE trust.monthly_earning_week_revisions SET points = points'), { code: '55000' });
});

test('REL-02: evidence, receipt, weekly revision and outbox commit together or all roll back', async () => {
  const post = await makePost({ author: otherId });
  await sql(`CREATE FUNCTION system.fail_monthly_week_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.event_type = 'trust.monthly_week.revised' THEN RAISE EXCEPTION 'synthetic_outbox_failure'; END IF; RETURN NEW; END $$`);
  await sql('CREATE TRIGGER fail_monthly_week_fixture BEFORE INSERT ON system.outbox_events FOR EACH ROW EXECUTE FUNCTION system.fail_monthly_week_fixture()');
  await assert.rejects(processMonthlyEarningEvent(env, post.event), /synthetic_outbox_failure/);
  assert.equal((await sql('SELECT id FROM trust.monthly_earning_contributions WHERE source_id = $1', [post.id])).rowCount, 0);
  assert.equal((await sql('SELECT event_id FROM trust.monthly_earning_receipts WHERE event_id = $1', [post.event])).rowCount, 0);
  await sql('DROP TRIGGER fail_monthly_week_fixture ON system.outbox_events');
  assert.equal((await processMonthlyEarningEvent(env, post.event)).processed, true);
});

test('REL-02: durable source reconciliation catches events delivered during a pause, without relying on inbox replay', async () => {
  const post = await makePost({ author: otherId });
  await sql('UPDATE system.feature_flags SET enabled = false WHERE flag_key = $1', [flag]);
  assert.equal(await processMonthlyEarningEvent(env, post.event), null);
  assert.deepEqual(await reconcileMonthlyEarning(env), { processed: 0, settled: 0 });
  await sql('UPDATE system.feature_flags SET enabled = true WHERE flag_key = $1', [flag]);
  const result = await reconcileMonthlyEarning(env);
  assert.ok(result.processed > 0);
  assert.equal((await sql('SELECT event_id FROM trust.monthly_earning_receipts WHERE event_id = $1', [post.event])).rowCount, 1);
  assert.equal((await latest(otherId)).points, 250);
  assert.deepEqual(await reconcileMonthlyEarning(env), { processed: 0, settled: 0 });
});

test('CAL-05/19: original performance time survives late review and settlement appends the same whole-week identity', async () => {
  const post = await makePost({ author: otherId, created: '2026-08-31T10:00:00.000Z', reviewed: '2026-09-01T10:00:00.000Z' });
  await transact(client => recordMonthlyContentEarning(client, { eventId: post.source, rulesVersion: rule, evaluatedAt: '2026-09-02T00:00:00.000Z' }));
  const recorded = await transact(client => recordMonthlyContentEarning(client, { eventId: post.event, rulesVersion: rule, evaluatedAt: '2026-09-02T00:00:00.000Z' }));
  assert.equal(recorded.calculation.ownerMonth, '2026-09');
  assert.equal(recorded.calculation.state, 'open');
  const configuration = await transact(client => loadMonthlyEarningConfiguration(client, rule));
  const settled = await reconcileMonthlyEarning(env);
  assert.equal(settled.settled, 1);
  const locked = await latest(otherId, '2026-08-31T00:00:00.000Z');
  assert.equal(locked.week_id, recorded.weekId);
  assert.equal(locked.calculation.state, 'locked');
  const late = await makePost({ author: otherId, created: '2026-08-31T12:00:00.000Z', reviewed: '2026-10-01T12:00:00.000Z' });
  const corrected = await processMonthlyEarningEvent(env, late.event);
  assert.equal(corrected.calculation.ownerMonth, '2026-09');
  assert.equal(corrected.weekId, locked.week_id);
  await assert.rejects(transact(client => recordMonthlyContentEarning(client, { eventId: late.event, rulesVersion: rule, evaluatedAt: '2026-09-30T12:00:00.000Z' })), /event_in_future/);
  await assert.rejects(transact(client => refreshMonthlyEarningWeek(client, { subjectUserId: otherId, startsAt: '2026-08-31T00:00:00.000Z', configuration: { ...configuration, rules: { ...configuration.rules, version: 'different' } }, evaluatedAt: '2026-09-10T00:00:00.000Z' })), /period_rules_locked/);
});

test('PTS-02/04/05: actual comment and reply ownership is classified from storage while contextual acceptance stays pending', async () => {
  let parentId = null;
  for (const [author, reply, kind] of [[userId, false, 'own_comment'], [userId, true, 'own_reply'], [otherId, false, 'other_comment'], [otherId, true, 'other_reply']]) {
    const id = uuidv7(), source = uuidv7(), event = uuidv7(), caseId = uuidv7(); fixtureIds.push(id);
    await sql(`INSERT INTO content.comments (id, post_id, author_id, parent_id, body, moderation_state, declared_creation_mode, moderation_source_event_id, created_at, depth)
      VALUES ($1, $2, $3, $4, 'Useful contextual contribution', 'allowed', 'human', $5, '2026-08-04T12:00:00.000Z', $6)`,
      [id, posts[0].id, author, reply ? parentId : null, source, reply ? 1 : 0]);
    await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, created_at)
      VALUES ($1, 'content.comment.created', 'comment', $2, $3, '{}'::jsonb, '2026-08-04T12:00:00.000Z'),
        ($4, 'content.comment.published', 'comment', $2, $3, '{}'::jsonb, '2026-08-05T12:00:00.000Z')`, [source, id, author, event]);
    await sql(`INSERT INTO moderation.cases (id, content_type, content_id, state, policy_version, source_event_id)
      VALUES ($1, 'comment', $2, 'resolved', 'synthetic-publication-v1', $3)`, [caseId, id, source]);
    await sql(`INSERT INTO moderation.decisions (id, case_id, outcome, policy_version, decided_by)
      VALUES ($1, $2, 'allow', 'synthetic-publication-v1', $3)`, [uuidv7(), caseId, reviewerId]);
    await processMonthlyEarningEvent(env, event);
    const evidence = (await latest(author)).calculation.evidence.find(row => row.sourceRevisionId === source);
    assert.equal(evidence.kind, kind); assert.equal(evidence.state, 'pending_review');
    assert.equal(evidence.reasonCode, 'context_review_required');
    if (!parentId) parentId = id;
  }
});

test('REL-02: reconciliation skips deleted owners with open weeks without repeated refresh failures', async () => {
  const post = await makePost({ author: deletedOpenWeekId, created: '2026-08-03T12:00:00.000Z',
    reviewed: '2026-08-04T12:00:00.000Z' });
  await transact(client => recordMonthlyContentEarning(client, {
    eventId: post.event, rulesVersion: rule, evaluatedAt: '2026-08-05T00:00:00.000Z',
  }));
  const before = await latest(deletedOpenWeekId);
  assert.equal(before.calculation.state, 'open');
  assert.ok(before.points > 0);
  await sql("UPDATE identity.users SET status = 'deleted', deleted_at = now() WHERE id = $1", [deletedOpenWeekId]);

  const first = await reconcileMonthlyEarning(env);
  assert.equal(first.settled, 0);
  const afterFirst = await latest(deletedOpenWeekId);
  assert.equal(afterFirst.revision, before.revision);
  assert.equal(afterFirst.points, before.points);
  assert.equal(afterFirst.calculation.state, 'open');

  const second = await reconcileMonthlyEarning(env);
  assert.equal(second.settled, 0);
  const afterSecond = await latest(deletedOpenWeekId);
  assert.equal(afterSecond.revision, before.revision);
  assert.equal(afterSecond.points, before.points);
});

test('CAL-05/PTS-08: after-period edits cannot earn retroactively; deleted and out-of-scope sources leave no invented work', async () => {
  const edited = await makePost({ author: otherId });
  const event = uuidv7();
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, created_at)
    VALUES ($1, 'content.post.updated', 'post', $2, $3, '{}'::jsonb, '2026-08-10T00:00:00.000Z')`, [event, edited.id, otherId]);
  await sql('UPDATE content.posts SET moderation_source_event_id = $2 WHERE id = $1', [edited.id, event]);
  const result = await processMonthlyEarningEvent(env, event);
  assert.equal(result.calculation.evidence.find(row => row.sourceRevisionId === event).reasonCode, 'cross_period_revision_requires_review');
  assert.equal(result.calculation.evidence.find(row => row.sourceRevisionId === event).state, 'pending_review');
  await sql('DELETE FROM content.posts WHERE id = $1', [edited.id]);
  const deletion = uuidv7();
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
    VALUES ($1, 'content.post.deleted', 'post', $2, $3, '{}'::jsonb),
      ($4, 'content.post.deleted', 'post', $5, $3, '{}'::jsonb),
      ($6, 'moderation.content.blocked', 'profile', $3, $3, '{}'::jsonb)`,
    [deletion, edited.id, otherId, uuidv7(), uuidv7(), uuidv7()]);
  const reversed = await processMonthlyEarningEvent(env, deletion);
  assert.ok(reversed.calculation.evidence.some(row => row.reasonCode === 'content_deleted' && row.kind === 'post'));
  const legitimate = await makePost({ author: otherId });
  const accepted = await processMonthlyEarningEvent(env, legitimate.event);
  const work = (await sql('SELECT id FROM trust.monthly_earning_contributions WHERE source_id = $1', [legitimate.id])).rows[0];
  assert.equal(accepted.calculation.evidence.find(row => row.workId === work.id).state, 'accepted');
  await sql('DELETE FROM content.posts WHERE id = $1', [legitimate.id]);
  const ordinaryDeletion = uuidv7(), purgedBlock = uuidv7();
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
    VALUES ($1, 'content.post.deleted', 'post', $2, $3, '{}'::jsonb),
      ($4, 'moderation.content.blocked', 'post', $2, $5, '{}'::jsonb)`, [ordinaryDeletion, legitimate.id, otherId, purgedBlock, reviewerId]);
  const preserved = await processMonthlyEarningEvent(env, ordinaryDeletion);
  assert.equal(preserved.calculation.evidence.find(row => row.workId === work.id).state, 'accepted');
  const invalidated = await processMonthlyEarningEvent(env, purgedBlock);
  assert.equal(invalidated.calculation.evidence.find(row => row.workId === work.id).state, 'reversed');
  const historical = await makePost({ author: otherId, created: '2026-07-27T12:00:00.000Z' });
  await processMonthlyEarningEvent(env, historical.event);
  assert.equal((await sql('SELECT id FROM trust.monthly_earning_contributions WHERE source_id = $1', [historical.id])).rowCount, 0);
  await reconcileMonthlyEarning(env);
});

test('CAL-19/SEC-01/REL-02: an older event cannot consume a future current revision; retries retain one causal award', async () => {
  const post = await makePost({ author: otherId, created: '2026-08-17T12:00:00.000Z', reviewed: '2026-08-18T14:00:00.000Z' });
  const revision = uuidv7();
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, created_at)
    VALUES ($1, 'content.post.updated', 'post', $2, $3, '{}'::jsonb, '2026-08-18T12:00:00.000Z')`, [revision, post.id, otherId]);
  await sql('UPDATE content.posts SET moderation_source_event_id = $2 WHERE id = $1', [post.id, revision]);
  await sql('UPDATE moderation.cases SET source_event_id = $2 WHERE id = $1', [post.caseId, revision]);

  await assert.rejects(transact(client => recordMonthlyContentEarning(client, {
    eventId: post.source, rulesVersion: rule, evaluatedAt: '2026-08-17T18:00:00.000Z',
  })), /source_revision_in_future/);
  assert.equal((await sql('SELECT id FROM trust.monthly_earning_contributions WHERE source_id = $1', [post.id])).rowCount, 0);
  assert.equal((await sql('SELECT event_id FROM trust.monthly_earning_receipts WHERE event_id = $1', [post.source])).rowCount, 0);
  assert.equal(await latest(otherId, '2026-08-17T00:00:00.000Z'), undefined);

  const delivered = await Promise.all([processMonthlyEarningEvent(env, revision), processMonthlyEarningEvent(env, revision)]);
  assert.equal(delivered.filter(result => result.processed).length, 1);
  const earned = await latest(otherId, '2026-08-17T00:00:00.000Z');
  assert.equal(earned.points, 250);
  assert.equal(earned.calculation.evidence[0].sourceRevisionId, revision);
  const delayed = await processMonthlyEarningEvent(env, post.source);
  assert.equal(delayed.processed, true);
  assert.equal(delayed.created, false);
  assert.equal((await latest(otherId, '2026-08-17T00:00:00.000Z')).revision, earned.revision);
  assert.equal((await sql('SELECT id FROM trust.monthly_earning_evidence_revisions WHERE contribution_id = $1',
    [earned.calculation.evidence[0].workId])).rowCount, 1);

  const invalidation = uuidv7();
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, created_at)
    VALUES ($1, 'moderation.content.blocked', 'post', $2, $3, '{}'::jsonb, '2026-08-19T12:00:00.000Z')`, [invalidation, post.id, reviewerId]);
  await sql("UPDATE content.posts SET moderation_state = 'blocked', moderation_source_event_id = $2 WHERE id = $1", [post.id, invalidation]);
  await assert.rejects(transact(client => recordMonthlyContentEarning(client, {
    eventId: post.event, rulesVersion: rule, evaluatedAt: '2026-08-18T18:00:00.000Z',
  })), /source_revision_in_future/);
  assert.equal((await latest(otherId, '2026-08-17T00:00:00.000Z')).revision, earned.revision);
  assert.equal((await sql('SELECT event_id FROM trust.monthly_earning_receipts WHERE event_id = $1', [post.event])).rowCount, 0);
  const reversed = await Promise.all([processMonthlyEarningEvent(env, invalidation), processMonthlyEarningEvent(env, invalidation)]);
  assert.equal(reversed.filter(result => result.processed).length, 1);
  const corrected = await latest(otherId, '2026-08-17T00:00:00.000Z');
  assert.equal(corrected.points, 0);
  assert.equal(corrected.week_id, earned.week_id);
  assert.equal(corrected.state, 'corrected');
  assert.equal(corrected.revision, earned.revision + 1);
  assert.equal((await processMonthlyEarningEvent(env, post.event)).created, false);
  assert.equal((await sql('SELECT points FROM trust.monthly_earning_week_revisions WHERE id = $1', [earned.id])).rows[0].points, 250);
});

test('RPT-04: privacy role can erase scoped evidence and its weekly history without exposing another member', async () => {
  await sql("UPDATE identity.users SET status = 'locked' WHERE id = $1", [userId]);
  const historical = await makePost();
  const earned = await processMonthlyEarningEvent(env, historical.event);
  assert.equal(earned.calculation.evidence.find(row => row.sourceRevisionId === historical.source).state, 'accepted');
  await transact(async client => {
    await client.query('DELETE FROM trust.monthly_earning_contributions WHERE subject_user_id = $1', [userId]);
    await client.query('DELETE FROM trust.monthly_earning_week_revisions WHERE subject_user_id = $1', [userId]);
    await client.query('DELETE FROM trust.monthly_earning_receipts WHERE subject_user_id = $1', [userId]);
  }, 'lythaus_privacy');
  assert.equal((await sql('SELECT id FROM trust.monthly_earning_contributions WHERE subject_user_id = $1', [userId])).rowCount, 0);
  assert.ok((await sql('SELECT id FROM trust.monthly_earning_contributions WHERE subject_user_id = $1', [otherId])).rowCount > 0);
  await sql("UPDATE identity.users SET status = 'deleted', deleted_at = now() WHERE id = $1", [userId]);
  const delayed = await makePost();
  await processMonthlyEarningEvent(env, delayed.event);
  assert.equal((await sql('SELECT id FROM trust.monthly_earning_contributions WHERE subject_user_id = $1', [userId])).rowCount, 0);
  assert.equal((await sql('SELECT subject_user_id FROM trust.monthly_earning_receipts WHERE event_id = $1', [delayed.event])).rows[0].subject_user_id, null);
});
