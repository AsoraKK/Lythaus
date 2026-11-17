import { loadPreparedSuggestionEvidence } from '../src/monthly-suggestion-evidence.ts';
import { purgeSupportForPrivacy } from '../src/support-feedback-privacy.ts';

export function registerMonthlySuggestionEvidenceCases({ test, assert, fixture, policy, suggestion, control, transaction, uuidv7 }) {
  const load = (f, requestId, overrides = {}) => transaction('lythaus_admin')(client => loadPreparedSuggestionEvidence(client, {
    requestId, subjectUserId: f.member, supportPolicyVersion: f.policy.version, ...overrides,
  }));
  const assertPending = result => {
    assert.equal(result.adapterVersion, 'support-suggestion-observation-v1');
    assert.equal(result.status, 'earning_policy_pending');
    assert.equal(result.appliedPoints, 0);
    assert.equal(result.runtimeActivationAllowed, false);
    assert.deepEqual(result.earningRevisions, []);
    assert.ok(Array.isArray(result.pendingGates) && result.pendingGates.length > 0);
    assert.ok(result.pendingGates.every(gate => typeof gate === 'string'));
    assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
  };
  const sourceEvents = async requestId => (await control().query(`SELECT * FROM system.outbox_events
    WHERE event_type='support.workflow.changed' AND aggregate_id=$1 ORDER BY (payload->>'revision')::integer`, [requestId])).rows;
  async function accepted(t, { self = false, custom = policy(), concurrent = false } = {}) {
    const f = await fixture(t, custom), subjectUserId = self ? f.owner : f.member;
    const submitted = await f.submit({ ...suggestion(), title: 'PRIVATE_SENTINEL synthetic suggestion' }, subjectUserId);
    const requestId = submitted.request.id;
    const evidence = await f.service('owner').ownerEvidence(await f.ownerRequest(), 'suggestion', requestId,
      { expectedRevision: submitted.request.revision, type: 'usefulness', description: 'PRIVATE_SENTINEL usefulness observation' });
    const proof = await f.ownerRequest(), input = {
      expectedRevision: evidence.request.revision, state: 'accepted', reason: 'useful',
      memberMessage: 'PRIVATE_SENTINEL support decision', evidenceIds: [evidence.recordId],
    };
    const decide = () => f.service('owner').ownerDecision(proof, 'suggestion', requestId, input);
    const results = concurrent ? await Promise.all([decide(), decide()]) : [await decide()];
    const decision = results[0], events = await sourceEvents(requestId);
    const event = events.find(event => event.payload.revision === decision.request.revision);
    assert.ok(event);
    return { f, requestId, subjectUserId, evidence, decision, event, results, proof, input };
  }
  const historyPolicy = () => {
    const custom = policy(); custom.version = 'synthetic_suggestion_observation_v1';
    custom.contract.states.suggestion.push('under_review', 'duplicate');
    custom.evidenceTypes.push('duplicate_reference');
    custom.transitions.push(
      { kind: 'suggestion', from: 'submitted', to: 'under_review', terminal: false, reasons: ['synthetic_review'], evidenceTypes: [] },
      { kind: 'suggestion', from: 'under_review', to: 'accepted', terminal: true, reasons: ['useful'], evidenceTypes: ['usefulness'] },
      { kind: 'suggestion', from: 'accepted', to: 'declined', terminal: true, reasons: ['synthetic_reversal'], evidenceTypes: ['usefulness'] },
      { kind: 'suggestion', from: 'declined', to: 'accepted', terminal: true, reasons: ['synthetic_reacceptance'], evidenceTypes: ['usefulness'] },
      { kind: 'suggestion', from: 'submitted', to: 'duplicate', terminal: true, reasons: ['synthetic_duplicate'], evidenceTypes: ['duplicate_reference'] },
    );
    return custom;
  };

  test('suggestion observations resolve signed support decisions and omit prose without awarding points', async t => {
    const { f, requestId, evidence, decision, event } = await accepted(t);
    const result = await load(f, requestId); assertPending(result);
    assert.equal(result.observations.length, 1);
    const observation = result.observations[0];
    assert.deepEqual(Object.keys(observation).sort(), ['eventId', 'decisionId', 'requestId', 'subjectUserId', 'reviewerUserId',
      'sourceRevision', 'previousDecisionId', 'supportPolicyVersion', 'fromState', 'toState', 'reasonCode', 'performedAt',
      'decidedAt', 'observedUtcMonth', 'observedUtcQuarter', 'evidence', 'exclusionReasons', 'earningStatus'].sort());
    assert.equal(observation.eventId, event.id);
    assert.equal(observation.decisionId, decision.recordId);
    assert.equal(observation.requestId, requestId);
    assert.equal(observation.subjectUserId, f.member);
    assert.equal(observation.reviewerUserId, f.owner);
    assert.notEqual(observation.subjectUserId, observation.reviewerUserId);
    assert.equal(observation.sourceRevision, decision.request.revision);
    assert.equal(observation.previousDecisionId, null);
    assert.equal(observation.supportPolicyVersion, f.policy.version);
    assert.equal(observation.fromState, 'submitted'); assert.equal(observation.toState, 'accepted');
    assert.equal(observation.reasonCode, 'useful'); assert.equal(observation.earningStatus, 'policy_pending');
    assert.deepEqual(observation.exclusionReasons, []);
    assert.equal(observation.evidence.length, 1);
    assert.deepEqual(Object.keys(observation.evidence[0]).sort(), ['id', 'type', 'authorUserId', 'sourceRevision', 'recordedAt'].sort());
    assert.equal(observation.evidence[0].id, evidence.recordId);
    assert.equal(observation.evidence[0].type, 'usefulness');
    assert.equal(observation.evidence[0].authorUserId, f.owner);
    assert.equal(observation.evidence[0].sourceRevision, evidence.request.revision);
    for (const field of ['performedAt', 'decidedAt']) assert.match(observation[field], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    assert.match(observation.evidence[0].recordedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    assert.ok(!Object.hasOwn(observation, 'useful'));
    assert.ok(!Object.hasOwn(observation, 'independentlyReviewed'));
  });

  test('concurrent signed support decision retries commit one canonical observation and replay the same identifiers', async t => {
    const { f, requestId, decision, event, results, proof, input } = await accepted(t, { concurrent: true });
    assert.equal(results.filter(result => result.replayed).length, 1);
    assert.equal(results[0].recordId, results[1].recordId);
    assert.equal(results[0].request.revision, results[1].request.revision);
    assert.equal((await control().query('SELECT count(*)::integer AS count FROM support.decisions WHERE request_id=$1', [requestId])).rows[0].count, 1);
    assert.equal((await sourceEvents(requestId)).filter(item => item.payload.revision === decision.request.revision).length, 1);
    const replay = await f.service('owner').ownerDecision(proof, 'suggestion', requestId, input);
    assert.equal(replay.replayed, true); assert.equal(replay.recordId, decision.recordId);
    const first = await load(f, requestId, { deliveredEventIds: [event.id, event.id] });
    const second = await load(f, requestId, { deliveredEventIds: [event.id] });
    assertPending(first); assert.deepEqual(first, second); assert.equal(first.observations.length, 1);
    assert.equal(first.observations[0].eventId, event.id);
  });

  test('gapped request revisions preserve raw review, decline and reaccept history without inventing earning revisions', async t => {
    const f = await fixture(t, historyPolicy()), requestId = (await f.submit(suggestion())).request.id;
    const reviewed = await f.service('owner').ownerDecision(await f.ownerRequest(), 'suggestion', requestId,
      { expectedRevision: 1, state: 'under_review', reason: 'synthetic_review', memberMessage: 'Synthetic review observation', evidenceIds: [] });
    const note = await f.service('owner').ownerNote(await f.ownerRequest(), 'suggestion', requestId,
      { expectedRevision: reviewed.request.revision, text: 'PRIVATE_SENTINEL unrelated internal note' });
    const evidence = await f.service('owner').ownerEvidence(await f.ownerRequest(), 'suggestion', requestId,
      { expectedRevision: note.request.revision, type: 'usefulness', description: 'PRIVATE_SENTINEL source evidence' });
    const decide = (expectedRevision, state, reason) => f.ownerRequest().then(proof => f.service('owner').ownerDecision(proof, 'suggestion', requestId,
      { expectedRevision, state, reason, memberMessage: 'Synthetic configured support transition', evidenceIds: [evidence.recordId] }));
    const acceptance = await decide(evidence.request.revision, 'accepted', 'useful');
    const between = await f.service('owner').ownerNote(await f.ownerRequest(), 'suggestion', requestId,
      { expectedRevision: acceptance.request.revision, text: 'PRIVATE_SENTINEL interstitial note' });
    const decline = await decide(between.request.revision, 'declined', 'synthetic_reversal');
    const reacceptance = await decide(decline.request.revision, 'accepted', 'synthetic_reacceptance');
    const result = await load(f, requestId); assertPending(result);
    assert.deepEqual(result.observations.map(item => item.sourceRevision), [2, 5, 7, 8]);
    assert.deepEqual(result.observations.map(item => item.toState), ['under_review', 'accepted', 'declined', 'accepted']);
    assert.deepEqual(result.observations.map(item => item.previousDecisionId), [null, reviewed.recordId, acceptance.recordId, decline.recordId]);
    assert.deepEqual(result.observations.map(item => item.decisionId), [reviewed.recordId, acceptance.recordId, decline.recordId, reacceptance.recordId]);
    assert.ok(result.observations.every(item => item.earningStatus === 'policy_pending'));
    const last = result.observations.at(-1), first = result.observations[0];
    const filtered = await load(f, requestId, { deliveredEventIds: [last.eventId, first.eventId, last.eventId] });
    assert.deepEqual(filtered.observations, [first, last]);
    assert.equal(filtered.observations.at(-1).previousDecisionId, decline.recordId);
    assert.deepEqual((await load(f, requestId, { deliveredEventIds: [] })).observations, []);
  });

  test('self support decisions remain valid workflow records and are explicitly excluded from earning evidence', async t => {
    const { f, requestId, subjectUserId } = await accepted(t, { self: true });
    const result = await load(f, requestId, { subjectUserId }); assertPending(result);
    assert.equal(result.observations[0].subjectUserId, f.owner);
    assert.equal(result.observations[0].reviewerUserId, f.owner);
    assert.deepEqual(result.observations[0].exclusionReasons, ['self_interaction']);
    assert.equal(result.observations[0].earningStatus, 'excluded');
  });

  test('canonical duplicate references exclude a workflow observation without assigning an earning outcome', async t => {
    const f = await fixture(t, historyPolicy()), original = (await f.submit(suggestion())).request.id;
    const requestId = (await f.submit(suggestion())).request.id;
    const evidence = await f.service('owner').ownerEvidence(await f.ownerRequest(), 'suggestion', requestId,
      { expectedRevision: 1, type: 'duplicate_reference', description: 'PRIVATE_SENTINEL canonical duplicate', reference: original });
    await f.service('owner').ownerDecision(await f.ownerRequest(), 'suggestion', requestId,
      { expectedRevision: evidence.request.revision, state: 'duplicate', reason: 'synthetic_duplicate',
        memberMessage: 'Synthetic duplicate workflow observation', evidenceIds: [evidence.recordId] });
    const result = await load(f, requestId); assertPending(result);
    assert.equal(result.observations[0].toState, 'duplicate');
    assert.deepEqual(result.observations[0].exclusionReasons, ['duplicate_reference']);
    assert.equal(result.observations[0].earningStatus, 'excluded');
    assert.ok(!JSON.stringify(result).includes(original));
  });

  test('source loading binds the requested member and recorded support version before exposing private observations', async t => {
    const { f, requestId } = await accepted(t);
    assert.equal(await load(f, requestId, { subjectUserId: f.other }), null);
    assert.equal(await load(f, uuidv7()), null);
    await assert.rejects(() => load(f, requestId, { supportPolicyVersion: 'synthetic_other_version' }),
      { message: 'monthly_suggestion_source_policy_mismatch' });
    await control().query("UPDATE identity.users SET status='deleted',deleted_at=clock_timestamp() WHERE id=$1", [f.member]);
    assert.equal(await load(f, requestId), null);
  });

  test('privacy scrub removes the canonical source and cannot leave usable observation history', async t => {
    const { f, requestId } = await accepted(t);
    assert.equal((await load(f, requestId)).observations.length, 1);
    const deletionId = await f.privacyRequest('delete');
    assert.equal((await transaction('lythaus_privacy')(client => purgeSupportForPrivacy(client, deletionId, f.policy))).scrubbedRecords, 1);
    assert.equal(await load(f, requestId), null);
    assert.equal((await control().query('SELECT count(*)::integer AS count FROM support.decisions WHERE request_id=$1', [requestId])).rows[0].count, 0);
    assert.equal((await sourceEvents(requestId)).length, 0);
  });

  test('delivered event IDs cannot substitute another member source, a nondecision workflow event or an unknown event', async t => {
    const { f, requestId, event } = await accepted(t);
    const peerId = (await f.submit(suggestion(), f.other)).request.id;
    const peerEvent = (await sourceEvents(peerId))[0], ownSubmission = (await sourceEvents(requestId))[0];
    for (const deliveredEventIds of [[peerEvent.id], [ownSubmission.id], [uuidv7()], [event.id, peerEvent.id]]) {
      await assert.rejects(() => load(f, requestId, { deliveredEventIds }), { message: 'monthly_suggestion_canonical_history_required' });
    }
  });

  test('missing canonical audit, workflow event or referenced evidence prevents observation reconstruction', async t => {
    for (const missing of ['audit', 'event', 'evidence']) {
      const { f, requestId, event, evidence, decision } = await accepted(t);
      if (missing === 'audit') await control().query(`DELETE FROM system.audit_events WHERE action='support.decision'
        AND target_id=$1 AND metadata->>'revision'=$2`, [requestId, String(decision.request.revision)]);
      else if (missing === 'event') await control().query('DELETE FROM system.outbox_events WHERE id=$1', [event.id]);
      else await control().query('DELETE FROM support.evidence WHERE id=$1', [evidence.recordId]);
      await assert.rejects(() => load(f, requestId), { message: 'monthly_suggestion_canonical_history_required' }, missing);
    }
  });

  test('mismatched canonical source identity, state, revision and version cannot authenticate an observation', async t => {
    const mutations = [
      "UPDATE system.outbox_events SET actor_id=$2 WHERE id=$1",
      "UPDATE system.outbox_events SET aggregate_id=$2 WHERE id=$1",
      "UPDATE system.outbox_events SET aggregate_type='unrelated' WHERE id=$1 AND $2::uuid IS NOT NULL",
      "UPDATE system.outbox_events SET payload=jsonb_set(payload,'{subjectId}',to_jsonb($2::text)) WHERE id=$1",
      "UPDATE system.outbox_events SET payload=jsonb_set(payload,'{state}','\"declined\"'::jsonb) WHERE id=$1 AND $2::uuid IS NOT NULL",
      "UPDATE system.outbox_events SET payload=jsonb_set(payload,'{revision}','999'::jsonb) WHERE id=$1 AND $2::uuid IS NOT NULL",
    ];
    for (const sql of mutations) {
      const { f, requestId, event } = await accepted(t);
      await control().query(sql, [event.id, f.other]);
      await assert.rejects(() => load(f, requestId), { message: 'monthly_suggestion_canonical_history_required' }, sql);
    }
    for (const change of ["actor_id=$3", "metadata=jsonb_set(metadata,'{actorId}',to_jsonb($3::text))",
      "metadata=jsonb_set(metadata,'{revision}','999'::jsonb)", "metadata=jsonb_set(metadata,'{policyVersion}','\"synthetic_other_version\"'::jsonb)"]) {
      const { f, requestId, decision } = await accepted(t);
      await control().query(`UPDATE system.audit_events SET ${change} WHERE action='support.decision'
        AND target_id=$1 AND metadata->>'revision'=$2 AND $3::uuid IS NOT NULL`, [requestId, String(decision.request.revision), f.other]);
      await assert.rejects(() => load(f, requestId), { message: 'monthly_suggestion_canonical_history_required' }, change);
    }
  });

  test('ambiguous duplicate workflow events and evidence moved to another request fail canonical history validation', async t => {
    const duplicate = await accepted(t);
    await control().query(`INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,actor_id,payload)
      SELECT $2,event_type,aggregate_type,aggregate_id,actor_id,payload FROM system.outbox_events WHERE id=$1`, [duplicate.event.id, uuidv7()]);
    await assert.rejects(() => load(duplicate.f, duplicate.requestId), { message: 'monthly_suggestion_canonical_history_required' });
    const moved = await accepted(t), otherRequestId = (await moved.f.submit(suggestion())).request.id;
    await control().query('UPDATE support.evidence SET request_id=$2 WHERE id=$1', [moved.evidence.recordId, otherRequestId]);
    await assert.rejects(() => load(moved.f, moved.requestId), { message: 'monthly_suggestion_canonical_history_required' });
  });

  test('canonical decision microseconds bind UTC month and quarter without backdating to submission', async t => {
    const { f, requestId, evidence, decision } = await accepted(t, { custom: historyPolicy() });
    const decline = await f.service('owner').ownerDecision(await f.ownerRequest(), 'suggestion', requestId,
      { expectedRevision: decision.request.revision, state: 'declined', reason: 'synthetic_reversal',
        memberMessage: 'Synthetic later-quarter observation', evidenceIds: [evidence.recordId] });
    await control().query(`UPDATE support.requests SET created_at='2026-09-30T23:59:59.999999Z',
      updated_at='2027-01-01T00:00:00.000001Z' WHERE id=$1`, [requestId]);
    await control().query("UPDATE support.evidence SET created_at='2026-12-31T23:59:59.999997Z' WHERE id=$1", [evidence.recordId]);
    for (const [record, instant] of [[decision, '2026-12-31T23:59:59.999999Z'], [decline, '2027-01-01T00:00:00.000001Z']]) {
      await control().query('UPDATE support.decisions SET created_at=$2::timestamptz WHERE id=$1', [record.recordId, instant]);
      await control().query('UPDATE support.messages SET created_at=$3::timestamptz WHERE request_id=$1 AND revision=$2', [requestId, record.request.revision, instant]);
      await control().query(`UPDATE system.outbox_events SET created_at=$3::timestamptz WHERE aggregate_id=$1
        AND event_type='support.workflow.changed' AND payload->>'revision'=$2`, [requestId, String(record.request.revision), instant]);
      await control().query(`UPDATE system.audit_events SET created_at=$3::timestamptz WHERE target_id=$1
        AND action='support.decision' AND metadata->>'revision'=$2`, [requestId, String(record.request.revision), instant]);
    }
    const result = await load(f, requestId); assertPending(result);
    assert.deepEqual(result.observations.map(item => item.performedAt), ['2026-09-30T23:59:59.999999Z', '2026-09-30T23:59:59.999999Z']);
    assert.deepEqual(result.observations.map(item => item.decidedAt), ['2026-12-31T23:59:59.999999Z', '2027-01-01T00:00:00.000001Z']);
    assert.deepEqual(result.observations.map(item => item.observedUtcMonth), ['2026-12', '2027-01']);
    assert.deepEqual(result.observations.map(item => item.observedUtcQuarter), ['2026-Q4', '2027-Q1']);
    assert.equal(result.observations[0].evidence[0].recordedAt, '2026-12-31T23:59:59.999997Z');
    assert.equal(result.observations[1].previousDecisionId, decision.recordId);
    assert.equal(result.observations[1].earningStatus, 'policy_pending');
  });

  test('ordinary grants permit read-only repeatable observation without new records or an ingestion receipt', async t => {
    const { f, requestId } = await accepted(t);
    const snapshot = async () => (await control().query(`SELECT
      (SELECT count(*) FROM support.decisions WHERE request_id=$1)::integer AS decisions,
      (SELECT count(*) FROM system.outbox_events WHERE aggregate_id=$1)::integer AS outbox,
      (SELECT count(*) FROM system.audit_events WHERE target_id=$1)::integer AS audit,
      (SELECT count(*) FROM system.consumer_inbox)::integer AS inbox,
      (SELECT count(*) FROM trust.reputation_events)::integer AS reputation` , [requestId])).rows[0];
    const before = await snapshot();
    const first = await transaction('lythaus_admin')(async client => {
      await client.query('SET TRANSACTION READ ONLY');
      return loadPreparedSuggestionEvidence(client, { requestId, subjectUserId: f.member, supportPolicyVersion: f.policy.version });
    });
    assertPending(first); assert.deepEqual(await load(f, requestId), first);
    assert.deepEqual(await snapshot(), before);
  });
}
