import { createHash } from 'node:crypto';
import { applyApprovedSupportCompletionLimits } from '../src/support-feedback-approved-limits.ts';

export function registerSupportCompletionCases({ test, assert, fixture, policy, problem, suggestion, database, publicWorker, workerEnvironment, invokeWorker }) {
  const approvedFixture = () => {
    const candidate = policy(); candidate.version = 'synthetic_completion_v1';
    Object.assign(candidate.contract.limits, { titleBytes: 1024, detailBytes: 8192, stepsBytes: 8192, memberMessageBytes: 8192 });
    Object.assign(candidate.limits, { messageBytes: 8192, noteBytes: 8192, evidenceBytes: 8192, memberMutations: 2 });
    return applyApprovedSupportCompletionLimits(candidate);
  };
  test('approved 5/hour is atomic across kinds; replay and explicit separate reply quota do not spend intake quota', async t => {
    const f = await fixture(t, approvedFixture());
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => f.submit(index % 2 ? suggestion() : problem(), `synthetic-hour-${index}`)));
    const accepted = attempts.filter(result => result.status === 'fulfilled');
    assert.equal(accepted.length, 5);
    for (const result of attempts.filter(result => result.status === 'rejected')) assert.equal(result.reason.message, 'support_rate_limited');
    const firstIndex = attempts.findIndex(result => result.status === 'fulfilled');
    const replay = await f.submit(firstIndex % 2 ? suggestion() : problem(), `synthetic-hour-${firstIndex}`);
    assert.equal(replay.replayed, true);
    const row = replay.request;
    for (let index = 0; index < 2; index++) await f.service('member').memberReply(await f.memberRequest(), row.kind, row.id, { expectedRevision: index + 1, message: 'Synthetic separate reply allowance' });
    await assert.rejects(async () => f.service('member').memberReply(await f.memberRequest(), row.kind, row.id,
      { expectedRevision: 3, message: 'Synthetic over reply allowance' }), /support_rate_limited/);
    const rates = (await database().query("SELECT scope,request_count FROM system.rate_limit_windows WHERE subject_hash=$1 ORDER BY scope", [createHash('sha256').update(f.member).digest('hex')])).rows;
    assert.deepEqual(rates, [{ scope: 'support:member:reply', request_count: 2 }, { scope: 'support:member:submit:day', request_count: 5 }, { scope: 'support:member:submit:hour', request_count: 5 }]);
  });
  test('approved 20/day rejection rolls back a new hourly counter and affects only the member', async t => {
    const f = await fixture(t, approvedFixture());
    const hash = createHash('sha256').update(f.member).digest('hex');
    await database().query(`INSERT INTO system.rate_limit_windows(scope,subject_hash,window_started_at,request_count,expires_at)
      VALUES('support:member:submit:day',$1,to_timestamp(floor(extract(epoch FROM clock_timestamp())/86400)*86400),20,now()+interval '1 day')`, [hash]);
    await assert.rejects(() => f.submit(), /support_rate_limited/);
    assert.equal((await database().query("SELECT count(*)::integer AS count FROM system.rate_limit_windows WHERE subject_hash=$1 AND scope='support:member:submit:hour'", [hash])).rows[0].count, 0);
    assert.equal((await database().query('SELECT count(*)::integer AS count FROM support.requests WHERE submitter_id=$1', [f.member])).rows[0].count, 0);
    assert.equal((await f.submit(problem(), 'synthetic-other', f.other)).request.kind, 'problem');
  });
  test('validation and failed audit leave no quota consumption; same-key retry commits exactly once', async t => {
    const f = await fixture(t, approvedFixture());
    await assert.rejects(() => f.submit({ ...problem(), title: '😀'.repeat(161) }), /support_feedback_submission_invalid/);
    const proof = await f.memberRequest(f.member, 'synthetic-audit-retry');
    await assert.rejects(() => f.service('member', { failAudit: true }).submit(proof, problem()), /support_unavailable/);
    const hash = createHash('sha256').update(f.member).digest('hex');
    assert.equal((await database().query('SELECT count(*)::integer AS count FROM system.rate_limit_windows WHERE subject_hash=$1', [hash])).rows[0].count, 0);
    assert.equal((await f.service('member').submit(proof, problem())).replayed, false);
    assert.equal((await f.service('member').submit(proof, problem())).replayed, true);
  });
  test('actual Public Worker dispatch enforces approved Unicode boundaries and returns safe closed metadata', async t => {
    const custom = approvedFixture(), f = await fixture(t, custom), env = workerEnvironment(custom);
    const created = await invokeWorker(publicWorker, await f.memberRequest(), '/api/support/problems', env, { ...problem(), title: '😀'.repeat(160), actual: '😀'.repeat(2000) });
    assert.equal(created.status, 201); const row = (await created.json()).request; assert.equal(row.closed, false);
    const oversized = await invokeWorker(publicWorker, await f.memberRequest(), '/api/support/problems', env, { ...problem(), title: '😀'.repeat(161) });
    assert.equal(oversized.status, 400);
    const reply = await invokeWorker(publicWorker, await f.memberRequest(), `/api/support/problems/${row.id}/messages`, env, { expectedRevision: 1, message: '😀'.repeat(2000) });
    assert.equal(reply.status, 201);
    const overReply = await invokeWorker(publicWorker, await f.memberRequest(), `/api/support/problems/${row.id}/messages`, env, { expectedRevision: 2, message: 'x'.repeat(2001) });
    assert.equal(overReply.status, 400);
    assert.equal(reply.headers.get('cache-control'), 'private, no-store');
  });
  const workflowFixture = () => {
    const custom = JSON.parse(JSON.stringify(approvedFixture()));
    custom.limits.memberMutations = 10;
    custom.initial = { problem: 'received', suggestion: 'received' };
    custom.contract.states = { problem: ['received', 'under_review', 'needs_information', 'resolved', 'duplicate'],
      suggestion: ['received', 'under_review', 'needs_information', 'accepted', 'declined', 'duplicate'] };
    custom.evidenceTypes.push('duplicate_reference');
    custom.transitions = [];
    for (const kind of ['problem', 'suggestion']) {
      for (const [from, to] of [['received', 'under_review'], ['under_review', 'needs_information']]) custom.transitions.push({ kind, from, to, terminal: false, reasons: ['synthetic_review'], evidenceTypes: [] });
      for (const from of ['received', 'under_review', 'needs_information']) {
        for (const to of kind === 'problem' ? ['resolved', 'duplicate'] : ['accepted', 'declined', 'duplicate']) {
          custom.transitions.push({ kind, from, to, terminal: true, reasons: ['synthetic_evidenced'], evidenceTypes: [to === 'duplicate' ? 'duplicate_reference' : 'verification'] });
        }
      }
    }
    return custom;
  };
  test('configured approved review, needs-information and closure states retain evidence and public replies without awarding points', async t => {
    const f = await fixture(t, workflowFixture());
    for (const [body, closedState] of [[problem(), 'resolved'], [suggestion(), 'accepted'], [suggestion(), 'declined']]) {
      let row = (await f.submit(body)).request; assert.equal(row.state, 'received');
      for (const state of ['under_review', 'needs_information']) row = (await f.service('owner').ownerDecision(await f.ownerRequest(), row.kind, row.id,
        { expectedRevision: row.revision, state, reason: 'synthetic_review', memberMessage: 'Synthetic request for review information', evidenceIds: [] })).request;
      row = (await f.service('member').memberReply(await f.memberRequest(), row.kind, row.id, { expectedRevision: row.revision, message: 'Synthetic requested information' })).request;
      const evidence = await f.service('owner').ownerEvidence(await f.ownerRequest(), row.kind, row.id, { expectedRevision: row.revision, type: 'verification', description: 'Synthetic closure evidence' });
      const closed = await f.service('owner').ownerDecision(await f.ownerRequest(), row.kind, row.id,
        { expectedRevision: evidence.request.revision, state: closedState, reason: 'synthetic_evidenced', memberMessage: 'Synthetic evidence-backed decision', evidenceIds: [evidence.recordId] });
      assert.equal(closed.request.closed, true); assert.equal(closed.request.state, closedState);
      await assert.rejects(async () => f.service('member').memberReply(await f.memberRequest(), row.kind, row.id,
        { expectedRevision: closed.request.revision, message: 'Synthetic closed reply' }), /support_closed/);
      const detail = await f.service('member').memberDetail(await f.memberRequest(), row.kind, row.id);
      assert.equal(detail.private, undefined); assert.equal(detail.request.closed, true);
      const events = (await database().query('SELECT event_type,payload FROM system.outbox_events WHERE aggregate_id=$1', [row.id])).rows;
      assert.ok(events.every(event => event.event_type === 'support.workflow.changed'));
      assert.ok(events.every(event => Object.keys(event.payload).sort().join(',') === 'kind,requestId,revision,state,subjectId'));
    }
  });
  test('duplicate closure requires a private UUID reference to another current same-kind canonical request', async t => {
    const f = await fixture(t, workflowFixture());
    const row = (await f.submit()).request, target = (await f.submit(problem(), 'synthetic-peer-canonical', f.other)).request;
    const crossKind = (await f.submit(suggestion())).request;
    let revision = row.revision;
    for (const reference of [row.id, crossKind.id, target.id]) {
      const evidence = await f.service('owner').ownerEvidence(await f.ownerRequest(), row.kind, row.id,
        { expectedRevision: revision, type: 'duplicate_reference', description: 'Synthetic private canonical link', reference });
      revision = evidence.request.revision;
      const decide = async () => f.service('owner').ownerDecision(await f.ownerRequest(), row.kind, row.id,
        { expectedRevision: revision, state: 'duplicate', reason: 'synthetic_evidenced', memberMessage: 'Synthetic report already tracked', evidenceIds: [evidence.recordId] });
      if (reference === row.id) await assert.rejects(decide, /support_transition_invalid/);
      else if (reference === crossKind.id) await assert.rejects(decide, /support_not_found/);
      else { const result = await decide(); revision = result.request.revision; assert.equal(result.request.closed, true); }
    }
    const detail = await f.service('member').memberDetail(await f.memberRequest(), row.kind, row.id);
    assert.ok(!JSON.stringify(detail).includes(target.id)); assert.ok(!JSON.stringify(detail).includes(f.other));
    const reverse = await f.service('owner').ownerEvidence(await f.ownerRequest(), target.kind, target.id,
      { expectedRevision: target.revision, type: 'duplicate_reference', description: 'Synthetic invalid cycle', reference: row.id });
    await assert.rejects(async () => f.service('owner').ownerDecision(await f.ownerRequest(), target.kind, target.id,
      { expectedRevision: reverse.request.revision, state: 'duplicate', reason: 'synthetic_evidenced', memberMessage: 'Synthetic cyclic decision', evidenceIds: [reverse.recordId] }), /support_transition_invalid/);
  });
}
