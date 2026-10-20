import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { before, after, test } from 'node:test';
import { verifyTextReviewEvidence } from '../../../packages/authenticity/src/text-review-evidence.ts';
import { textReviewQueueFixture, fixtureDigest, fixtureId } from './text-review-queue-fixture.mjs';

let fixture;
before(async () => { fixture = await textReviewQueueFixture(); });
after(async () => { assert.equal(fixture.externalRequests, 0); await fixture.dispose(); });
const hash = text => createHash('sha256').update(text).digest('hex');
const counts = () => [fixture.data.detectors.length, fixture.data.cases.length, fixture.data.decisions.length, fixture.data.activity.length];
function pending() {
  assert.equal(fixture.data.row.moderation_state, 'under_review'); assert.equal(fixture.data.row.published_at, null);
  assert.ok(!fixture.statements.some(s => /INSERT INTO system.outbox_events|UPDATE content\.(posts|comments)/.test(s.sql)));
}
async function bound(event, expectedReasoning) {
  assert.deepEqual(counts(), [1, 1, 1, 1]);
  const detector = fixture.data.detectors[0], evidence = detector.signal.textReviewEvidence, link = detector.signal.textReviewDecision;
  assert.equal(await verifyTextReviewEvidence(evidence), true);
  assert.deepEqual(evidence.revision, { contentId: fixture.data.row.id, sourceEventId: event.eventId,
    bodyHash: event.payload.bodyHash, declaredCreationMode: event.payload.declaredCreationMode });
  assert.equal(evidence.reasoning.state, expectedReasoning);
  assert.equal(evidence.safety.state, 'ABSTAIN'); assert.equal(evidence.authorship.state, 'ABSTAIN');
  assert.equal(evidence.safety.thresholdVersion, null); assert.equal(evidence.authorship.thresholdVersion, null);
  assert.equal(evidence.publicationEligible, false); assert.equal(link.publicationEligible, false);
  assert.equal(link.evidenceHash, evidence.evidenceHash); assert.equal(link.detectorRunId, detector.id);
  assert.equal(link.caseId, fixture.data.cases[0].id); assert.equal(link.decisionId, fixture.data.decisions[0].id);
  assert.equal(fixture.data.decisions[0].outcome, 'queue'); assert.equal(fixture.data.inbox[event.eventId].state, 'completed');
  const binding = fixture.statements.findLast(s => s.sql.startsWith('UPDATE moderation.detector_runs r'));
  const committed = fixture.statements.filter(s => s.id === binding.id);
  for (const name of ['INSERT INTO moderation.detector_runs', 'INSERT INTO moderation.cases', 'INSERT INTO moderation.decisions', 'INSERT INTO trust.user_activity_events'])
    assert.ok(committed.some(s => s.sql.includes(name)), 'review bundle uses one transaction: ' + name);
  assert.equal(committed.at(-1).sql, 'COMMIT');
  pending();
}

for (const type of ['post', 'comment']) test(`${type} ordinary queue persists one exact evaluation-only evidence/decision bundle`, async () => {
  const event = fixture.reset(type), calls = fixture.modelCalls;
  assert.deepEqual(await fixture.deliver(event), { ack: 1, retry: 0 });
  await bound(event, type === 'post' ? 'OBSERVED_UNQUALIFIED' : 'NOT_RUN');
  assert.equal(fixture.modelCalls, calls + (type === 'post' ? 1 : 0));
  assert.deepEqual(fixture.errors, []);
});

for (const type of ['post', 'comment']) test(`${type} concurrent and repeated delivery preserves identical IDs and evidence hash`, async () => {
  const event = fixture.reset(type), calls = fixture.modelCalls;
  const replies = await Promise.all([fixture.deliver(event), fixture.deliver(event)]);
  assert.ok(replies.some(r => r.ack === 1));
  const original = structuredClone(fixture.data.detectors);
  assert.deepEqual(await fixture.deliver(event), { ack: 1, retry: 0 });
  assert.deepEqual(fixture.data.detectors, original); await bound(event, type === 'post' ? 'OBSERVED_UNQUALIFIED' : 'NOT_RUN');
  assert.equal(fixture.modelCalls, calls + (type === 'post' ? 1 : 0));
});

for (const type of ['post', 'comment']) test(`${type} out-of-order old revision is ignored and current revision binds fresh source`, async () => {
  const old = fixture.reset(type), calls = fixture.modelCalls;
  fixture.data.row.body = 'Synthetic revised body'; fixture.data.row.moderation_source_event_id = fixtureId(4);
  fixture.data.source.id = fixtureId(4); fixture.data.source.event_type = `content.${type}.updated`;
  fixture.data.source.payload.sourceEventId = fixtureId(4); fixture.data.source.payload.bodyHash = hash(fixture.data.row.body);
  assert.deepEqual(await fixture.deliver(old), { ack: 1, retry: 0 }); assert.deepEqual(counts(), [0, 0, 0, 0]);
  assert.equal(fixture.modelCalls, calls);
  const current = fixture.event(); assert.deepEqual(await fixture.deliver(current), { ack: 1, retry: 0 });
  await bound(current, type === 'post' ? 'OBSERVED_UNQUALIFIED' : 'NOT_RUN');
  assert.deepEqual(await fixture.deliver(old), { ack: 1, retry: 0 }); assert.deepEqual(counts(), [1, 1, 1, 1]);
});

for (const mode of ['failure', 'invalid_json', 'low_score']) test(`post ${mode} never becomes qualified safety/authorship or allow`, async () => {
  const event = fixture.reset();
  if (mode === 'failure') fixture.failModel = true;
  if (mode === 'invalid_json') fixture.modelResponse = 'invalid JSON';
  assert.deepEqual(await fixture.deliver(event), { ack: 1, retry: 0 });
  await bound(event, mode === 'low_score' ? 'OBSERVED_UNQUALIFIED' : 'UNAVAILABLE');
});

for (const type of ['post', 'comment']) for (const mutation of ['body', 'source', 'declaration', 'deleted', 'inactive_author', 'deleted_author', 'source_actor', 'source_payload', 'independent_hold']) {
  test(`${type} ${mutation} before delivery cannot persist new evidence`, async () => {
    const event = fixture.reset(type), calls = fixture.modelCalls;
    if (mutation === 'body') fixture.data.row.body = 'Changed synthetic bytes';
    if (mutation === 'source') fixture.data.row.moderation_source_event_id = fixtureId(9);
    if (mutation === 'declaration') fixture.data.row.declared_creation_mode = 'ai_assisted';
    if (mutation === 'deleted') fixture.data.row.deleted_at = new Date().toISOString();
    if (mutation === 'inactive_author') fixture.data.author.status = 'suspended';
    if (mutation === 'deleted_author') fixture.data.author.deleted_at = new Date().toISOString();
    if (mutation === 'source_actor') fixture.data.source.actor_id = fixtureId(9);
    if (mutation === 'source_payload') fixture.data.source.payload.bodyHash = 'f'.repeat(64);
    if (mutation === 'independent_hold') fixture.data.hold = true;
    assert.deepEqual(await fixture.deliver(event), { ack: 1, retry: 0 });
    assert.deepEqual(counts(), [0, 0, 0, 0]); assert.equal(fixture.modelCalls, calls);
    assert.equal(fixture.data.row.published_at, null);
  });
}

for (const mutation of ['body', 'source', 'declaration', 'deleted', 'inactive_author', 'deleted_author', 'hold']) test(`post ${mutation} during model call discards late evidence`, async () => {
  const event = fixture.reset();
  fixture.duringModel = async () => {
    if (mutation === 'body') fixture.data.row.body = 'Changed during inference';
    if (mutation === 'source') fixture.data.row.moderation_source_event_id = fixtureId(8);
    if (mutation === 'declaration') fixture.data.row.declared_creation_mode = 'ai_assisted';
    if (mutation === 'deleted') fixture.data.row.deleted_at = new Date().toISOString();
    if (mutation === 'inactive_author') fixture.data.author.status = 'suspended';
    if (mutation === 'deleted_author') fixture.data.author.deleted_at = new Date().toISOString();
    if (mutation === 'hold') fixture.data.hold = true;
  };
  assert.deepEqual(await fixture.deliver(event), { ack: 1, retry: 0 }); assert.deepEqual(counts(), [0, 0, 0, 0]); pending();
});

for (const type of ['post', 'comment']) for (const changed of [false, true]) test(`${type} appeal override applies only to its frozen body and evidence`, async () => {
  const event = fixture.reset(type);
  fixture.data.overrides.push({ content_type: type, content_id: fixture.data.row.id, source_event_id: event.eventId,
    content_hash: fixtureDigest({ body: fixture.data.row.body, declaration: 'human' }), evidence_hash: fixtureDigest(changed ? [{ changed: true }] : []) });
  assert.deepEqual(await fixture.deliver(event), { ack: 1, retry: 0 });
  if (changed) await bound(event, type === 'post' ? 'OBSERVED_UNQUALIFIED' : 'NOT_RUN');
  else { assert.deepEqual(counts(), [0, 0, 0, 0]); pending(); }
});

for (const type of ['post', 'comment']) for (const phase of ['before', 'after']) test(`${type} ${phase} binding-write failure rolls back and retries without orphaned decisions`, async () => {
  const event = fixture.reset(type);
  fixture.failure = { match: 'UPDATE moderation.detector_runs r', phase, remaining: 1 };
  assert.deepEqual(await fixture.deliver(event), { ack: 0, retry: 1 });
  assert.deepEqual(counts(), [0, 0, 0, 0]); assert.equal(fixture.data.inbox[event.eventId], undefined);
  assert.equal(fixture.data.audit.length, 0); assert.equal(fixture.data.provenance.length, 0); assert.equal(fixture.data.declaration, null);
  assert.ok(fixture.statements.some(s => s.sql === 'ROLLBACK'));
  assert.deepEqual(await fixture.deliver(event), { ack: 1, retry: 0 });
  await bound(event, type === 'post' ? 'OBSERVED_UNQUALIFIED' : 'NOT_RUN');
  if (type === 'post') { assert.equal(fixture.budgetKeys.length, 2); assert.equal(fixture.budgetKeys[0], fixture.budgetKeys[1]); }
});

test('post budget/model idempotency is stable per source event and distinct across content revisions', async () => {
  const original = fixture.reset(); assert.deepEqual(await fixture.deliver(original), { ack: 1, retry: 0 });
  const firstKey = fixture.budgetKeys[0]; assert.ok(firstKey.endsWith(original.eventId));
  fixture.data.source.id = fixtureId(7); fixture.data.source.event_type = 'content.post.updated';
  fixture.data.row.moderation_source_event_id = fixtureId(7); fixture.data.source.payload.sourceEventId = fixtureId(7);
  fixture.data.row.body = 'Different revision'; fixture.data.source.payload.bodyHash = hash(fixture.data.row.body);
  assert.deepEqual(await fixture.deliver(), { ack: 1, retry: 0 });
  assert.equal(fixture.budgetKeys.length, 2); assert.notEqual(fixture.budgetKeys[1], firstKey);
  assert.ok(fixture.budgetKeys[1].endsWith(fixtureId(7))); pending();
});

test('absent post author-fence capability retries before model execution or evidence', async () => {
  const event = fixture.reset(), calls = fixture.modelCalls; fixture.data.capability = false;
  assert.deepEqual(await fixture.deliver(event), { ack: 0, retry: 1 });
  assert.deepEqual(counts(), [0, 0, 0, 0]); assert.equal(fixture.modelCalls, calls); pending();
});

test('absent comment subject-lock capability cannot fall back to an unlocked author read', async () => {
  const event = fixture.reset('comment'), calls = fixture.modelCalls; fixture.data.capability = false;
  assert.deepEqual(await fixture.deliver(event), { ack: 0, retry: 1 });
  assert.deepEqual(counts(), [0, 0, 0, 0]); assert.equal(fixture.modelCalls, calls);
  assert.equal(fixture.data.inbox[event.eventId], undefined); pending();
});

for (const type of ['post', 'comment']) for (const changes of [{ status: 'locked' }, { deleted_at: '2026-10-20T00:00:00Z' }]) {
  test(`${type} account writer that commits first excludes final review evidence`, async () => {
    const event = fixture.reset(type), entered = Promise.withResolvers();
    const commit = fixture.holdAccountWriter(changes);
    let locked = false;
    fixture.afterSql = ({ sql }) => { if (sql.includes('has_function_privilege')) { locked = true; entered.resolve(); } };
    const delivery = fixture.deliver(event);
    try {
      await entered.promise; assert.equal(locked, true); commit();
      assert.deepEqual(await delivery, { ack: 1, retry: 0 }); assert.deepEqual(counts(), [0, 0, 0, 0]); pending();
    } finally { commit(); await delivery; }
  });
  test(`${type} final account fence holds a deletion/status writer through review COMMIT`, async () => {
    const event = fixture.reset(type), reached = Promise.withResolvers(), resume = Promise.withResolvers();
    let invocations = 0, writerDone = false;
    fixture.afterSql = async ({ sql }) => {
      if (sql.includes('SELECT status FROM trust.lock_reputation_subject') && ++invocations === (type === 'post' ? 2 : 1)) {
        reached.resolve(); await resume.promise;
      }
    };
    const delivery = fixture.deliver(event);
    try {
      await reached.promise;
      const writer = fixture.restrictAuthor(changes).then(() => { writerDone = true; });
      await Promise.resolve(); assert.equal(writerDone, false);
      resume.resolve(); assert.deepEqual(await delivery, { ack: 1, retry: 0 }); await writer;
      await bound(event, type === 'post' ? 'OBSERVED_UNQUALIFIED' : 'NOT_RUN');
      const final = fixture.statements.findLast(s => s.sql.startsWith('UPDATE moderation.detector_runs r'));
      const statements = fixture.statements.filter(s => s.id === final.id).map(s => s.sql);
      const account = statements.findIndex(s => s.includes('SELECT status FROM trust.lock_reputation_subject'));
      const content = statements.findIndex(s => s.includes('FOR UPDATE OF item NOWAIT'));
      assert.ok(account >= 0 && content > account, 'account is locked before content');
      assert.equal(fixture.data.author.status, changes.status ?? 'active');
      assert.equal(fixture.data.author.deleted_at, changes.deleted_at ?? null);
    } finally { resume.resolve(); await delivery; }
  });
}

for (const type of ['post', 'comment']) for (const match of ['FOR UPDATE OF item NOWAIT', 'ORDER BY id FOR UPDATE NOWAIT']) {
  test(`${type} fail-fast content/case contention releases the account fence and retries`, async () => {
    const event = fixture.reset(type); fixture.failure = { match, phase: 'before', remaining: 1 };
    assert.deepEqual(await fixture.deliver(event), { ack: 0, retry: 1 });
    assert.deepEqual(counts(), [0, 0, 0, 0]); assert.equal(fixture.data.inbox[event.eventId], undefined);
    assert.deepEqual(await fixture.deliver(event), { ack: 1, retry: 0 });
    await bound(event, type === 'post' ? 'OBSERVED_UNQUALIFIED' : 'NOT_RUN');
  });
}

for (const type of ['post', 'comment']) for (const phase of ['before', 'after']) test(`${type} inbox completion failure ${phase} write reuses the committed evidence bundle`, async () => {
  const event = fixture.reset(type);
  fixture.failure = { match: "UPDATE system.consumer_inbox SET state = 'completed'", phase, remaining: 1 };
  assert.deepEqual(await fixture.deliver(event), { ack: 0, retry: 1 });
  assert.deepEqual(counts(), [1, 1, 1, 1]); assert.equal(fixture.data.inbox[event.eventId], undefined);
  const original = structuredClone(fixture.data.detectors), calls = fixture.modelCalls;
  assert.deepEqual(await fixture.deliver(event), { ack: 1, retry: 0 });
  assert.deepEqual(fixture.data.detectors, original); assert.equal(fixture.modelCalls, calls);
  await bound(event, type === 'post' ? 'OBSERVED_UNQUALIFIED' : 'NOT_RUN');
});
