import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { communityClassifierEvidence, communityDigest } from '../../../packages/db/src/community-appeal-access.ts';
import { identicalCommunityAppealOverride } from '../../../packages/db/src/community-appeal-closure.ts';
import { postSafetyEvidenceFixture } from './post-safety-evidence-fixture.mjs';
import { postModerationFixture } from './post-moderation-fixture.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.ok(target.pathname.startsWith('/lythaus_auth_test_post_'));
const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
const hash = body => createHash('sha256').update(body).digest('hex');
const selection = { enabled: true, provider: 'openai', timeoutMs: 1000, flaggedResult: 'REVIEW' };
let fixture;

before(async () => {
  await client.connect();
  await client.query("SET statement_timeout='5s'");
  assert.ok((await client.query("SELECT current_setting('server_version_num')::int AS version")).rows[0].version >= 170000);
  assert.equal((await client.query("SELECT to_regclass('moderation.community_appeal_overrides') AS table_name")).rows[0].table_name, null,
    'use a fresh disposable canonical baseline');
  await client.query(readFileSync(new URL('../../../database/planetscale/proposals/community_appeals.sql', import.meta.url), 'utf8'));
  await client.query(`INSERT INTO moderation.community_appeal_rule_sets(version,policy_version,configuration,ballot_changes_allowed)
    VALUES ('synthetic-safety-rules','lythaus-monthly-rewards-2026-10-v1',
      '{"version":"synthetic-safety-rules","status":"pending_owner_approval"}',false)`);
  fixture = await postSafetyEvidenceFixture(connectionString);
});
after(async () => { await fixture?.dispose(); await client.end(); });

async function created(body = 'Synthetic canonical post safety body', mode = 'human') {
  const id = uuidv7(), source = uuidv7(), author = uuidv7();
  await client.query("INSERT INTO identity.users(id,status,display_name) VALUES($1,'active','Synthetic safety owner')", [author]);
  await client.query("INSERT INTO social.profiles(user_id,moderation_state,public_visibility) VALUES($1,'allowed',true)", [author]);
  await client.query(`INSERT INTO content.posts(id,author_id,body,declared_creation_mode,moderation_source_event_id)
    VALUES($1,$2,$3,$4,$5)`, [id, author, body, mode, source]);
  const payload = { postId: id, sourceEventId: source, bodyHash: hash(body), declaredCreationMode: mode };
  await client.query(`INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES($1,'content.post.created','post',$2,$3,$4::jsonb)`, [source, id, author, JSON.stringify(payload)]);
  await client.query(`INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label,review_required)
    VALUES($1,$2,'Under review',true)`, [id, mode]);
  return { id, source, author, body, payload, eventId: source };
}

async function attempt(post, patch = {}) {
  const response = await fixture.dispatchFetch('https://safety.lythaus.test/', {
    method: 'POST', body: JSON.stringify({ eventId: post.eventId, payload: post.payload, selection, ...patch }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

async function unchangedState(post) {
  const tables = [
    ['content.posts', 'id'], ['content.content_declarations', 'post_id'], ['moderation.detector_runs', 'content_id'],
    ['moderation.cases', 'content_id'], ['moderation.community_appeal_overrides', 'content_id'],
    ['trust.provenance_events', 'content_id'], ['system.outbox_events', 'aggregate_id'],
  ];
  const rows = {};
  for (const [table, field] of tables) rows[table] = (await client.query(`SELECT * FROM ${table} WHERE ${field}=$1 ORDER BY 1`, [post.id])).rows;
  rows.decisions = (await client.query('SELECT * FROM moderation.decisions WHERE case_id IN (SELECT id FROM moderation.cases WHERE content_id=$1) ORDER BY id', [post.id])).rows;
  rows.appeals = (await client.query('SELECT * FROM moderation.appeals WHERE case_id IN (SELECT id FROM moderation.cases WHERE content_id=$1) ORDER BY id', [post.id])).rows;
  rows.account = (await client.query('SELECT * FROM identity.users WHERE id=$1', [post.author])).rows;
  rows.reputation = (await client.query('SELECT * FROM trust.reputation_events WHERE subject_user_id=$1 ORDER BY id', [post.author])).rows;
  rows.activity = (await client.query('SELECT * FROM trust.user_activity_events WHERE user_id=$1 ORDER BY id', [post.author])).rows;
  return rows;
}

async function held(post, policy = 'synthetic-independent-safety-v1', outcome = 'queue') {
  const caseId = uuidv7(), decision = uuidv7();
  await client.query(`INSERT INTO moderation.cases(id,content_type,content_id,state,policy_version,source_event_id)
    VALUES($1,'post',$2,'resolved',$3,$4)`, [caseId, post.id, policy, post.source]);
  await client.query(`INSERT INTO moderation.decisions(id,case_id,outcome,policy_version)
    VALUES($1,$2,$3,$4)`, [decision, caseId, outcome, policy]);
  return { caseId, decision };
}

async function overridden(post) {
  const { caseId, decision } = await held(post), appeal = uuidv7();
  const contentHash = await communityDigest({ body: post.body, declaration: post.payload.declaredCreationMode });
  const evidenceHash = await communityDigest(await communityClassifierEvidence(client, 'post', post.id, post.source));
  await client.query(`INSERT INTO moderation.appeals(id,case_id,appellant_id,state,policy_version)
    VALUES($1,$2,$3,'resolved_allow','lythaus-monthly-rewards-2026-10-v1')`, [appeal, caseId, post.author]);
  await client.query(`INSERT INTO moderation.community_appeal_sessions(appeal_id,rules_version,challenged_decision_id,
    source_event_id,content_type,content_id,content_hash,evidence_hash,state)
    VALUES($1,'synthetic-safety-rules',$2,$3,'post',$4,$5,$6,'resolved_allow')`,
  [appeal, decision, post.source, post.id, contentHash, evidenceHash]);
  await client.query(`INSERT INTO moderation.community_appeal_overrides(appeal_id,decision_id,content_type,
    content_id,source_event_id,content_hash,evidence_hash,recorded_at)
    VALUES($1,$2,'post',$3,$4,$5,$6,now())`, [appeal, decision, post.id, post.source, contentHash, evidenceHash]);
}
const identical = post => identicalCommunityAppealOverride(client, {
  contentType: 'post', contentId: post.id, sourceEventId: post.source, body: post.body, declaredCreationMode: post.payload.declaredCreationMode,
});

test('absent/disabled selection performs zero reads, hashes, factory calls, provider calls and writes', async () => {
  const post = await created(), state = await unchangedState(post), calls = fixture.calls.length, statements = fixture.statements.length;
  for (const config of [undefined, { enabled: false }]) {
    const reply = await attempt(post, { selection: config });
    assert.deepEqual(reply.result, { state: 'disabled', analyseTextCalls: 0, persisted: false });
    assert.deepEqual(reply.diagnostic, { factoryCalls: 0, hashCalls: 0, loads: 0, aborted: false });
  }
  assert.equal(fixture.calls.length, calls); assert.equal(fixture.statements.length, statements);
  assert.deepEqual(await unchangedState(post), state);
});

for (const scenario of ['safe', 'flagged']) test(`${scenario} evidence is correlated, return-only and leaves publication/declarations/rewards pending`, async () => {
  const post = await created(), state = await unchangedState(post), reply = await attempt(post, { scenario });
  assert.equal(reply.result.state, 'evidence'); assert.equal(reply.result.persisted, false); assert.equal(reply.result.analyseTextCalls, 1);
  const evidence = reply.result.evidence;
  assert.deepEqual(evidence.revision, { contentId: post.id, sourceEventId: post.source, declaredCreationMode: 'human', bodyHash: hash(post.body) });
  assert.equal(evidence.provider, 'openai'); assert.equal(evidence.model, 'omni-moderation-latest');
  assert.equal(evidence.purpose, 'safety'); assert.equal(evidence.applicability, 'evaluation-only');
  assert.equal(evidence.flagged, scenario === 'flagged'); assert.equal(evidence.categories.harassment, scenario === 'flagged');
  assert.equal(evidence.providerResult, scenario === 'flagged' ? 'REVIEW' : 'ALLOW');
  assert.equal(Object.keys(evidence.categories).length, 13);
  assert.deepEqual(evidence.categoryAppliedInputTypes.harassment, ['text']);
  assert.ok(Object.values(evidence.categoryAppliedInputTypes).every(types => types.length === 1 && types[0] === 'text'));
  assert.deepEqual(reply.diagnostic, { factoryCalls: 1, hashCalls: 2, loads: 2, aborted: false });
  assert.deepEqual(await unchangedState(post), state);
});

test('explicit BLOCK handling remains provider evidence, with no automatic authoritative block', async () => {
  const post = await created(), state = await unchangedState(post);
  const reply = await attempt(post, { scenario: 'flagged', selection: { ...selection, flaggedResult: 'BLOCK' } });
  assert.equal(reply.result.evidence.providerResult, 'BLOCK');
  assert.deepEqual(await unchangedState(post), state);
});

test('timeout, flagged handling and selection have no implied product defaults', async () => {
  const post = await created(), state = await unchangedState(post);
  for (const config of [{ enabled: true }, { ...selection, timeoutMs: undefined }, { ...selection, timeoutMs: 0 },
    { ...selection, timeoutMs: -1 }, { ...selection, timeoutMs: 1.1 }, { ...selection, provider: 'other' }, { ...selection, flaggedResult: undefined }]) {
    const reply = await attempt(post, { selection: config });
    assert.equal(reply.result.errorCategory, 'INVALID_CONFIGURATION'); assert.equal(reply.result.analyseTextCalls, 0);
    assert.equal(reply.diagnostic.factoryCalls, 0); assert.equal(reply.diagnostic.loads, 0);
  }
  assert.deepEqual(await unchangedState(post), state);
});

test('missing dependencies and credentials never fabricate evidence', async () => {
  const post = await created(), state = await unchangedState(post), calls = fixture.calls.length;
  for (const omit of ['readSnapshot', 'hashBody', 'now', 'createProvider']) {
    const reply = await attempt(post, { omit });
    assert.equal(reply.result.state, 'unknown'); assert.equal(reply.result.errorCategory, 'MISSING_DEPENDENCY');
    assert.equal(reply.result.analyseTextCalls, 0); assert.equal(reply.diagnostic.factoryCalls, 0);
  }
  const missing = await attempt(post, { scenario: 'missing_credential' });
  assert.equal(missing.result.errorCategory, 'MISSING_CREDENTIAL');
  assert.equal(missing.result.analyseTextCalls, 1, 'one analyseText invocation, zero transport requests');
  assert.equal(fixture.calls.length, calls); assert.deepEqual(await unchangedState(post), state);
});

const failures = { timeout: 'TIMEOUT', network: 'NETWORK_FAILURE', provider_rejection: 'PROVIDER_REJECTION',
  http_401: 'HTTP_AUTHENTICATION_FAILURE', http_403: 'HTTP_AUTHENTICATION_FAILURE', http_429: 'HTTP_RATE_LIMITED',
  http_500: 'HTTP_SERVER_FAILURE', http_503: 'HTTP_SERVER_FAILURE', redirect: 'HTTP_FAILURE',
  malformed_json: 'MALFORMED_RESPONSE', malformed_schema: 'UNEXPECTED_SCHEMA', malformed_model: 'UNEXPECTED_SCHEMA',
  malformed_scores: 'UNEXPECTED_SCHEMA', malformed_analysis: 'UNEXPECTED_SCHEMA', unsafe_metadata: 'UNEXPECTED_SCHEMA',
  loader_rejection: 'DEPENDENCY_FAILURE', factory_rejection: 'DEPENDENCY_FAILURE', invalid_hash: 'INVALID_HASH',
  missing_protection: 'INVALID_SNAPSHOT', missing_method: 'MISSING_DEPENDENCY',
  late_loader_rejection: 'DEPENDENCY_FAILURE', late_missing_protection: 'INVALID_SNAPSHOT' };
for (const [scenario, category] of Object.entries(failures)) test(`${scenario} returns sanitized unknown and preserves pending state`, async () => {
  const post = await created(), state = await unchangedState(post), calls = fixture.calls.length;
  const reply = await attempt(post, { scenario, selection: { ...selection, timeoutMs: scenario === 'timeout' ? 10 : 1_000 } });
  assert.equal(reply.result.state, 'unknown'); assert.equal(reply.result.errorCategory, category);
  assert.equal(reply.result.persisted, false); assert.ok(!('evidence' in reply.result));
  if (scenario === 'timeout') assert.equal(reply.diagnostic.aborted, true);
  if (scenario.startsWith('http_')) assert.equal(reply.result.httpStatus, Number(scenario.slice(5)));
  if (scenario === 'redirect') { assert.equal(reply.result.httpStatus, 307); assert.equal(fixture.calls.length, calls + 1); }
  assert.ok(!JSON.stringify(reply).includes('synthetic-secret-body-token'));
  assert.deepEqual(await unchangedState(post), state);
});

const documentedCategories = ['harassment', 'harassment/threatening', 'hate', 'hate/threatening', 'illicit', 'illicit/violent',
  'self-harm', 'self-harm/instructions', 'self-harm/intent', 'sexual', 'sexual/minors', 'violence', 'violence/graphic'];
for (const category of documentedCategories) test(`documented category ${category} is retained as safety evidence`, async () => {
  const post = await created(), state = await unchangedState(post);
  const reply = await attempt(post, { scenario: 'flagged:' + category });
  assert.equal(reply.result.state, 'evidence'); assert.equal(reply.result.evidence.flagged, true);
  assert.equal(reply.result.evidence.providerResult, 'REVIEW');
  assert.equal(reply.result.evidence.categories[category], true); assert.equal(reply.result.evidence.categoryScores[category], 0.9);
  for (const field of ['categories', 'categoryScores', 'categoryAppliedInputTypes']) {
    assert.deepEqual(Object.keys(reply.result.evidence[field]).sort(), [...documentedCategories].sort());
  }
  assert.deepEqual(await unchangedState(post), state);
});

for (const category of ['illicit', 'illicit/violent']) for (const layer of ['response', 'analysis']) {
  test(`nullable ${category} in provider ${layer} remains explicit unknown without changing pending state`, async () => {
    const post = await created(), state = await unchangedState(post), calls = fixture.calls.length;
    const reply = await attempt(post, { scenario: (layer === 'response' ? 'nullable:' : 'nullable_analysis:') + category });
    assert.deepEqual(reply.result, { state: 'unknown', persisted: false, analyseTextCalls: 1, errorCategory: 'UNEXPECTED_SCHEMA',
      ...(layer === 'response' ? { httpStatus: 200 } : {}),
    });
    assert.deepEqual(reply.diagnostic, { factoryCalls: 1, hashCalls: 2, loads: 2, aborted: false });
    assert.equal(fixture.calls.length, calls + 1, 'one synthetic transport request, no retry or fabricated success');
    assert.ok(!JSON.stringify(reply).includes(post.body)); assert.ok(!fixture.logs.join('\n').includes(post.body));
    assert.deepEqual(await unchangedState(post), state);
  });
}

const malformedMetadata = ['token_category', 'body_category', 'future_category', 'empty_maps', 'partial_maps', 'inconsistent_flag', 'unsupported_input_type',
  ...['categories', 'category_scores', 'category_applied_input_types'].flatMap(field =>
    ['empty_', 'missing_', 'token_', 'replaced_'].map(prefix => prefix + field))];
for (const scenario of malformedMetadata) test(`${scenario} never returns arbitrary or incomplete category metadata`, async () => {
  const post = await created('private-body-like-token'), state = await unchangedState(post);
  const reply = await attempt(post, { scenario });
  assert.deepEqual(reply.result, { state: 'unknown', persisted: false, analyseTextCalls: 1, errorCategory: 'UNEXPECTED_SCHEMA' });
  for (const sensitive of ['synthetic-secret-body-token', post.body, 'future-safety-category']) {
    assert.ok(!JSON.stringify(reply).includes(sensitive)); assert.ok(!fixture.logs.join('\n').includes(sensitive));
  }
  assert.deepEqual(await unchangedState(post), state);
});

test('documented category-specific input types are retained without changing post state', async () => {
  const post = await created(), state = await unchangedState(post), reply = await attempt(post, { scenario: 'documented_input_types' });
  assert.equal(reply.result.state, 'evidence');
  assert.deepEqual(reply.result.evidence.categoryAppliedInputTypes.violence, ['text', 'image']);
  assert.deepEqual(reply.result.evidence.categoryAppliedInputTypes.harassment, ['text']);
  assert.deepEqual(await unchangedState(post), state);
});

test('malformed event and canonical source mismatch are fenced before factory or provider', async () => {
  const post = await created(), state = await unchangedState(post);
  for (const patch of [{ eventId: uuidv7() }, { eventId: 'not-a-uuid' }, { payload: null },
    { payload: { ...post.payload, postId: 'not-a-uuid' } }, { payload: { ...post.payload, declaredCreationMode: 'ai_generated' } },
    { payload: { ...post.payload, bodyHash: 'bad-hash' } }, { payload: { ...post.payload, bodyHash: 'a'.repeat(64) } },
    { payload: { ...post.payload, declaredCreationMode: 'ai_assisted' } }, { payload: { ...post.payload, postId: uuidv7() } }]) {
    const reply = await attempt(post, patch);
    assert.equal(reply.result.state, 'stale'); assert.equal(reply.result.analyseTextCalls, 0); assert.equal(reply.diagnostic.factoryCalls, 0);
  }
  assert.deepEqual(await unchangedState(post), state);
  const other = await created();
  for (const [sql, values] of [
    ["UPDATE system.outbox_events SET actor_id=$2 WHERE id=$1", [post.source, other.author]],
    ["UPDATE system.outbox_events SET event_type='notification.created' WHERE id=$1", [post.source]],
    ["UPDATE system.outbox_events SET aggregate_type='comment' WHERE id=$1", [post.source]],
  ]) {
    await client.query(`UPDATE system.outbox_events SET actor_id=$2,event_type='content.post.created',aggregate_type='post'
      WHERE id=$1`, [post.source, post.author]);
    await client.query(sql, values);
    const reply = await attempt(post);
    assert.equal(reply.result.reason, 'source_event_mismatch'); assert.equal(reply.result.analyseTextCalls, 0);
  }
  await client.query(`UPDATE system.outbox_events SET actor_id=$2,event_type='content.post.created',aggregate_type='post'
    WHERE id=$1`, [post.source, post.author]);
  assert.equal((await attempt(post)).result.state, 'evidence', 'restored canonical event independently passes all guards');
});

const changes = {
  edit: post => client.query('UPDATE content.posts SET body=$2 WHERE id=$1', [post.id, 'Changed synthetic revision']),
  revision: post => client.query('UPDATE content.posts SET moderation_source_event_id=$2 WHERE id=$1', [post.id, uuidv7()]),
  declaration: post => client.query("UPDATE content.posts SET declared_creation_mode='ai_assisted' WHERE id=$1", [post.id]),
  delete: post => client.query('UPDATE content.posts SET deleted_at=now() WHERE id=$1', [post.id]),
  account: post => client.query("UPDATE identity.users SET status='suspended' WHERE id=$1", [post.author]),
  account_delete: post => client.query('UPDATE identity.users SET deleted_at=now() WHERE id=$1', [post.author]),
  terminal: post => client.query("UPDATE content.posts SET moderation_state='allowed' WHERE id=$1", [post.id]),
  hold: post => held(post),
  override: post => overridden(post),
};
for (const [name, change] of Object.entries(changes)) for (const phase of ['before', 'after']) {
  test(`${name} ${phase === 'after' ? 'during call' : 'before call'} fences results without altering current authoritative state`, async () => {
    const post = await created();
    let state;
    if (phase === 'before') { await change(post); state = await unchangedState(post); }
    else fixture.duringCall = async () => { await change(post); state = await unchangedState(post); };
    try {
      const reply = await attempt(post);
      assert.equal(reply.result.state, ['hold', 'override'].includes(name) ? 'protected' : 'stale');
      assert.equal(reply.result.phase, phase); assert.equal(reply.result.analyseTextCalls, phase === 'after' ? 1 : 0);
      assert.equal(reply.result.persisted, false); assert.deepEqual(await unchangedState(post), state);
      if (name === 'override') assert.equal(await identical(post), true);
    } finally { fixture.duringCall = undefined; }
  });
}

test('independent hold protects safe, flagged and unknown attempts including late failure', async () => {
  for (const scenario of ['safe', 'flagged', 'http_503']) {
    const post = await created(); await held(post); const state = await unchangedState(post);
    const reply = await attempt(post, { scenario });
    assert.equal(reply.result.state, 'protected'); assert.equal(reply.result.analyseTextCalls, 0);
    assert.deepEqual(await unchangedState(post), state);
    const late = await created(); let heldState;
    fixture.duringCall = async () => { await held(late); heldState = await unchangedState(late); };
    try {
      const result = (await attempt(late, { scenario })).result;
      assert.equal(result.state, 'protected'); assert.equal(result.phase, 'after'); assert.equal(result.analyseTextCalls, 1);
      assert.deepEqual(await unchangedState(late), heldState);
    } finally { fixture.duringCall = undefined; }
  }
});

test('appeal fingerprint includes added safety rows; preparation preserves identical peer override and independent hold', async () => {
  const post = await created(); await overridden(post);
  assert.equal(await identical(post), true);
  const state = await unchangedState(post);
  assert.equal((await attempt(post)).result.reason, 'scoped_peer_override');
  assert.deepEqual(await unchangedState(post), state);
  await client.query('BEGIN');
  try {
    await client.query(`INSERT INTO moderation.detector_runs(id,content_type,content_id,provider,model_version,signal,source_event_id)
      VALUES($1,'post',$2,'synthetic-unallocated-safety-purpose','omni-moderation-latest','{"purpose":"safety"}',$3)`, [uuidv7(), post.id, post.source]);
    assert.equal(await identical(post), false, 'even evaluation-only safety changes the unfiltered evidence digest');
  } finally { await client.query('ROLLBACK'); }
  assert.equal(await identical(post), true); assert.deepEqual(await unchangedState(post), state);
  await client.query(`INSERT INTO moderation.decisions(id,case_id,outcome,policy_version)
    VALUES($1,$2,'block','synthetic-independent-safety-v2')`, [uuidv7(), state['moderation.cases'][0].id]);
  const independentlyHeld = await unchangedState(post);
  assert.equal((await attempt(post)).result.state, 'protected');
  assert.deepEqual(await unchangedState(post), independentlyHeld);
});

test('a restored scoped peer override remains protected without reopening or republishing', async () => {
  const post = await created(); await overridden(post);
  await client.query("UPDATE content.posts SET moderation_state='allowed',published_at=now() WHERE id=$1", [post.id]);
  await client.query("UPDATE content.content_declarations SET public_label='Human-authored',review_required=false WHERE post_id=$1", [post.id]);
  const state = await unchangedState(post), reply = await attempt(post);
  assert.equal(reply.result.state, 'protected'); assert.equal(reply.result.reason, 'scoped_peer_override');
  assert.equal(reply.result.analyseTextCalls, 0); assert.deepEqual(await unchangedState(post), state);
});

test('repeat/concurrent attempts report calls honestly with zero durable rows or duplicate receipt claims', async () => {
  const post = await created(), state = await unchangedState(post), calls = fixture.calls.length;
  for (let i = 0; i < 2; i++) assert.equal((await attempt(post)).result.state, 'evidence');
  let arrivals = 0, release;
  const both = new Promise(resolve => { release = resolve; });
  fixture.duringCall = async () => { if (++arrivals === 2) release(); await both; };
  try {
    const replies = await Promise.all([attempt(post), attempt(post)]);
    assert.ok(replies.every(reply => reply.result.state === 'evidence' && reply.result.analyseTextCalls === 1 && reply.result.persisted === false));
    assert.equal(arrivals, 2); assert.equal(fixture.calls.length - calls, 4);
    assert.deepEqual(await unchangedState(post), state);
  } finally { fixture.duringCall = undefined; }
});

test('one durable row uniqueness is separate from external call admission (synthetic transaction only)', async () => {
  const post = await created(), state = await unchangedState(post);
  await client.query('BEGIN');
  try {
    const rows = [];
    for (let i = 0; i < 2; i++) rows.push((await client.query(`INSERT INTO moderation.detector_runs
      (id,content_type,content_id,provider,model_version,signal,source_event_id)
      VALUES($1,'post',$2,'synthetic-unallocated-safety-purpose','omni-moderation-latest','{}',$3)
      ON CONFLICT DO NOTHING RETURNING id`, [uuidv7(), post.id, post.source])).rowCount);
    assert.deepEqual(rows, [1, 0]);
  } finally { await client.query('ROLLBACK'); }
  assert.deepEqual(await unchangedState(post), state);
});

test('unknown followed by explicitly invoked success uses original source revision without automatic retry', async () => {
  const post = await created(), state = await unchangedState(post), calls = fixture.calls.length;
  assert.equal((await attempt(post, { scenario: 'http_503' })).result.state, 'unknown');
  assert.equal(fixture.calls.length, calls + 1); assert.deepEqual(await unchangedState(post), state);
  const reply = await attempt(post);
  assert.equal(reply.result.state, 'evidence'); assert.equal(reply.result.evidence.revision.sourceEventId, post.source);
  assert.equal(fixture.calls.length, calls + 2); assert.deepEqual(await unchangedState(post), state);
});

test('provider receives canonical server body, including private scope; delivery body/author/state cannot substitute it', async () => {
  const post = await created('Canonical e\u0301 synthetic private body', 'ai_assisted');
  await client.query("UPDATE content.posts SET visibility='private' WHERE id=$1", [post.id]);
  const state = await unchangedState(post);
  const reply = await attempt(post, { body: 'forged client body', authorId: uuidv7(), moderationState: 'allowed',
    payload: { ...post.payload, body: 'forged client body', authorId: uuidv7(), moderationState: 'allowed' } });
  assert.equal(reply.result.state, 'evidence'); assert.equal(fixture.calls.at(-1).body.input, post.body);
  assert.equal(reply.result.evidence.revision.bodyHash, hash(post.body), 'hash exact persisted bytes without renormalizing');
  assert.deepEqual(await unchangedState(post), state);
});

test('ordinary evaluation-only-v1 row/case/decision/declaration remains unchanged and does not count as safety completion', async () => {
  const post = await created(), ordinary = await postModerationFixture(connectionString, {
    ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
  });
  try {
    const response = await ordinary.dispatchFetch('https://api.lythaus.test/fixture/queue', { method: 'POST',
      body: JSON.stringify({ eventId: post.source, eventType: 'content.post.created', payload: post.payload }) });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ack: 1, retry: 0 });
    assert.equal(ordinary.modelCalls, 1);
    const state = await unchangedState(post);
    assert.equal(state['moderation.detector_runs'][0].provider, 'lythaus-authenticity-ai');
    assert.equal(state['moderation.cases'][0].policy_version, 'evaluation-only-v1');
    assert.equal(state['content.posts'][0].moderation_state, 'under_review');
    assert.equal((await attempt(post)).result.state, 'evidence');
    assert.deepEqual(await unchangedState(post), state);
  } finally { await ordinary.dispose(); }
});

test('hard outbound denial and sanitized logs contain no synthetic key, body or error values', async () => {
  const reply = await fixture.dispatchFetch('https://safety.lythaus.test/outbound');
  assert.deepEqual(await reply.json(), { denied: true }); assert.equal(fixture.externalRequests, 1);
  const logs = fixture.logs.join('\n');
  for (const sensitive of ['synthetic-post-safety-key', 'synthetic-secret-body-token', 'Synthetic canonical post safety body', 'forged client body']) {
    assert.ok(!logs.includes(sensitive));
  }
  assert.ok(fixture.statements.every(sql => /^\s*SELECT\b/i.test(sql)), 'runtime bridge admits reads only');
});
