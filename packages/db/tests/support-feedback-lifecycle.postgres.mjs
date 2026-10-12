import { createHash } from 'node:crypto';
import { uuidv7 } from '../../security/src/index.ts';

export function registerSupportLifecycleCases({ test, assert, fixture, policy, problem, suggestion, database, runner, blocked, gate,
  publicWorker, adminWorker, workerEnvironment, invokeWorker, retainSupportBatch }) {
  const submissions = [problem, suggestion];
  const plural = kind => kind === 'problem' ? 'problems' : 'suggestions';
  const count = async (table, ticket) => (await database().query(`SELECT count(*)::int AS n FROM support.${table} WHERE request_id=$1`, [ticket])).rows[0].n;
  const systemCount = async (table, column, ticket) => (await database().query(`SELECT count(*)::int AS n FROM system.${table} WHERE ${column}=$1`, [ticket])).rows[0].n;

  test('actual Public Worker rejects attachment media without claiming a logical submission or reply', async t => {
    const f = await fixture(t), env = workerEnvironment();
    for (const submission of submissions) {
      const body = submission(), path = `/api/support/${plural(body.kind)}`, proof = await f.memberRequest();
      for (const contentType of ['text/plain', 'multipart/form-data; boundary=synthetic', 'application/octet-stream']) {
        const headers = new Headers(proof.headers); headers.set('origin', env.CORS_ALLOWED_ORIGINS); headers.set('content-type', contentType);
        const response = await publicWorker.fetch(new Request(`https://local-fixture.example.invalid${path}`,
          { method: 'POST', headers, body: JSON.stringify(body) }), env);
        assert.equal(response.status, 415); assert.deepEqual(await response.json(), { error: 'unsupported_media_type' });
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
      }
      assert.equal((await database().query('SELECT count(*)::int AS n FROM system.idempotency_keys WHERE actor_id=$1 AND key=$2',
        [f.member, proof.headers.get('idempotency-key')])).rows[0].n, 0);
      const created = await invokeWorker(publicWorker, proof, path, env, body); assert.equal(created.status, 201);
      const row = (await created.json()).request, replyProof = await f.memberRequest();
      const headers = new Headers(replyProof.headers); headers.set('origin', env.CORS_ALLOWED_ORIGINS); headers.set('content-type', 'text/plain');
      const replyBody = { expectedRevision: 1, message: 'Synthetic retry after rejected media' };
      const rejected = await publicWorker.fetch(new Request(`https://local-fixture.example.invalid${path}/${row.id}/messages`,
        { method: 'POST', headers, body: JSON.stringify(replyBody) }), env);
      assert.equal(rejected.status, 415); assert.equal(await count('messages', row.id), 0);
      const reply = await invokeWorker(publicWorker, replyProof, `${path}/${row.id}/messages`, env, replyBody);
      assert.equal(reply.status, 201); assert.equal(await count('messages', row.id), 1);
      assert.equal(await systemCount('outbox_events', 'aggregate_id', row.id), 2);
    }
    const hash = createHash('sha256').update(f.member).digest('hex');
    const windows = await database().query(`SELECT scope,sum(request_count)::int AS total FROM system.rate_limit_windows
      WHERE scope IN ('support:member:reply','support:member:submit:day','support:member:submit:hour') AND subject_hash=$1
      GROUP BY scope ORDER BY scope`, [hash]);
    assert.deepEqual(windows.rows, [
      { scope: 'support:member:reply', total: 2 },
      { scope: 'support:member:submit:day', total: 2 },
      { scope: 'support:member:submit:hour', total: 2 },
    ]);
    assert.equal((await database().query('SELECT count(*)::int AS n FROM support.requests WHERE submitter_id=$1', [f.member])).rows[0].n, 2);
  });

  test('same-key member and staff replies commit one message, audit, intent and quota unit in both flows', async t => {
    const f = await fixture(t);
    for (const submission of submissions) for (const channel of ['member', 'owner']) {
      const row = (await f.submit(submission())).request, body = { expectedRevision: 1, message: 'Synthetic one logical reply' };
      const proof = channel === 'member' ? await f.memberRequest() : await f.ownerRequest();
      const method = channel === 'member' ? 'memberReply' : 'ownerReply';
      const replies = await Promise.all([f.service(channel)[method](proof, row.kind, row.id, body), f.service(channel)[method](proof, row.kind, row.id, body)]);
      assert.deepEqual(replies.map(result => result.replayed).sort(), [false, true]);
      assert.equal(replies[0].recordId, replies[1].recordId); assert.equal(replies[0].request.revision, 2);
      assert.equal(await count('messages', row.id), 1); assert.equal(await systemCount('outbox_events', 'aggregate_id', row.id), 2);
      const audits = await database().query("SELECT count(*)::int AS n FROM system.audit_events WHERE action='support.reply' AND metadata->>'requestId'=$1", [row.id]);
      assert.equal(audits.rows[0].n, 1);
      await assert.rejects(() => f.service(channel)[method](proof, row.kind, row.id, { ...body, message: 'Changed retry' }), /support_idempotency_conflict/);
      const latest = await f.service('owner').ownerReply(await f.ownerRequest(), row.kind, row.id, { expectedRevision: 2, message: 'Latest synthetic public state' });
      const replay = await f.service(channel)[method](proof, row.kind, row.id, body);
      assert.equal(replay.replayed, true); assert.deepEqual(replay.request, channel === 'owner' ? latest.request
        : Object.fromEntries(Object.entries(latest.request).filter(([key]) => key !== 'submitterId')));
    }
    for (const [actor, channel, expected] of [[f.member, 'member', 6], [f.owner, 'owner', 6]]) {
      const hash = createHash('sha256').update(actor).digest('hex');
      assert.equal((await database().query('SELECT sum(request_count)::int AS total FROM system.rate_limit_windows WHERE scope=$1 AND subject_hash=$2', [`support:${channel}`, hash])).rows[0].total, expected);
    }
  });

  test('staff closure and concurrent public/private edits have one revision winner after a real row lock wait', async t => {
    for (const submission of submissions) for (const edit of ['memberReply', 'ownerNote']) for (const closureFirst of [false, true]) {
      const f = await fixture(t), row = (await f.submit(submission())).request;
      const type = row.kind === 'problem' ? 'verification' : 'usefulness';
      const evidence = await f.service('owner').ownerEvidence(await f.ownerRequest(), row.kind, row.id,
        { expectedRevision: 1, type, description: 'Synthetic verification for concurrent closure' });
      const decision = { expectedRevision: 2, state: row.kind === 'problem' ? 'resolved' : 'accepted',
        reason: row.kind === 'problem' ? 'verified' : 'useful', memberMessage: 'Synthetic closure', evidenceIds: [evidence.recordId] };
      const editBody = edit === 'memberReply' ? { expectedRevision: 2, message: 'Synthetic concurrent reply' } : { expectedRevision: 2, text: 'PRIVATE_SENTINEL concurrent note' };
      const locked = gate(), release = gate(), connected = gate(); t.after(() => release.resolve());
      const winnerMethod = closureFirst ? 'ownerDecision' : edit, loserMethod = closureFirst ? edit : 'ownerDecision';
      const channel = method => method === 'memberReply' ? 'member' : 'owner';
      const proof = async method => channel(method) === 'member' ? f.memberRequest() : f.ownerRequest();
      const winnerProof = await proof(winnerMethod), loserProof = await proof(loserMethod);
      const winner = f.service(channel(winnerMethod));
      const controlled = f.service(channel(winnerMethod), { captureQuery: async args => {
        if (typeof args[0] === 'string' && args[0].includes('FOR UPDATE OF r')) { locked.resolve(); await release.promise; }
      } });
      const first = controlled[winnerMethod](winnerProof, row.kind, row.id, closureFirst ? decision : editBody);
      await locked.promise;
      const second = f.service(channel(loserMethod), { onClient: client => connected.resolve(client.processID) })[loserMethod](loserProof, row.kind, row.id, closureFirst ? editBody : decision);
      const rejected = assert.rejects(second, { message: 'support_revision_conflict' });
      try { await blocked(await connected.promise); } finally { release.resolve(); }
      const result = await first; await rejected;
      assert.equal(result.request.revision, 3); assert.equal(result.request.closed, closureFirst);
      assert.equal(await count('decisions', row.id), closureFirst ? 1 : 0);
      assert.equal(await count('notes', row.id), !closureFirst && edit === 'ownerNote' ? 1 : 0);
      assert.equal(await count('messages', row.id), closureFirst || edit === 'memberReply' ? 1 : 0);
      assert.equal((await database().query('SELECT count(*)::int AS n FROM system.idempotency_keys WHERE actor_id=$1 AND key=$2',
        [channel(loserMethod) === 'member' ? f.member : f.owner, loserProof.headers.get('idempotency-key')])).rows[0].n, 0);
      const replay = await winner[winnerMethod](winnerProof, row.kind, row.id, closureFirst ? decision : editBody);
      assert.equal(replay.replayed, true); assert.equal(replay.recordId, result.recordId);
    }
  });

  test('account switching cannot enumerate peer tickets or read private evidence and attachment references', async t => {
    const f = await fixture(t), env = workerEnvironment();
    for (const submission of submissions) {
      const row = (await f.submit(submission())).request, path = `/api/support/${plural(row.kind)}`;
      await f.service('owner').ownerEvidence(await f.ownerRequest(), row.kind, row.id,
        { expectedRevision: 1, type: row.kind === 'problem' ? 'verification' : 'usefulness', description: 'PRIVATE_SENTINEL evidence', reference: 'PRIVATE_SENTINEL private locator' });
      const switched = await f.memberRequest(f.other);
      const list = await invokeWorker(publicWorker, switched, `${path}?limit=3`, env); assert.equal(list.status, 200); assert.deepEqual((await list.json()).items, []);
      for (const ticket of [row.id, uuidv7()]) {
        for (const body of [undefined, { expectedRevision: 2, message: 'Synthetic cross-account attempt' }]) {
          const response = await invokeWorker(publicWorker, switched, `${path}/${ticket}${body ? '/messages' : ''}`, env, body);
          assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: 'support_not_found' });
          assert.equal(response.headers.get('cache-control'), 'private, no-store');
        }
      }
      for (const action of ['notes', 'evidence', 'decision']) {
        const response = await invokeWorker(publicWorker, await f.memberRequest(), `${path}/${row.id}/${action}`, env, { expectedRevision: 2 });
        assert.equal(response.status, 404); assert.ok(!JSON.stringify(await response.json()).includes('PRIVATE_SENTINEL'));
      }
      const unauthorized = await invokeWorker(adminWorker, await f.ownerRequest(f.adminSubject), `/api/admin/support/${plural(row.kind)}/${row.id}`, env);
      assert.equal(unauthorized.status, 403); assert.deepEqual(await unauthorized.json(), { error: 'support_owner_required' });
      const own = await invokeWorker(publicWorker, await f.memberRequest(), `${path}/${row.id}`, env);
      assert.equal(own.status, 200); assert.ok(!JSON.stringify(await own.json()).includes('PRIVATE_SENTINEL'));
      for (const attachments of [{ attachments: ['synthetic-private-object'] }, { attachmentId: uuidv7() }, { evidenceIds: [uuidv7()] }]) {
        const response = await invokeWorker(publicWorker, await f.memberRequest(), path, env, { ...submission(), ...attachments });
        assert.equal(response.status, 400);
      }
      assert.equal(await count('messages', row.id), 0); assert.equal(await count('evidence', row.id), 1);
    }
    const anonymous = new Request('https://local-fixture.example.invalid', { headers: { 'idempotency-key': 'synthetic-guest' } });
    const guest = await invokeWorker(publicWorker, anonymous, '/api/support/problems', env, problem());
    assert.equal(guest.status, 401); assert.deepEqual(await guest.json(), { error: 'support_authentication_required' });
  });

  test('closed problem and suggestion retention scrub all staff content and invalidate old replies without exposing a peer', async t => {
    for (const submission of submissions) {
      const f = await fixture(t), row = (await f.submit(submission())).request, peer = (await f.submit(submission(), uuidv7(), f.other)).request;
      const ownerProof = await f.ownerRequest(), memberProof = await f.memberRequest();
      await f.service('member').memberReply(memberProof, row.kind, row.id, { expectedRevision: 1, message: 'Synthetic member follow-up' });
      await f.service('owner').ownerNote(ownerProof, row.kind, row.id, { expectedRevision: 2, text: 'PRIVATE_SENTINEL retained note' });
      const evidence = await f.service('owner').ownerEvidence(await f.ownerRequest(), row.kind, row.id,
        { expectedRevision: 3, type: row.kind === 'problem' ? 'verification' : 'usefulness', description: 'PRIVATE_SENTINEL retained evidence', reference: 'PRIVATE_SENTINEL locator' });
      await f.service('owner').ownerDecision(await f.ownerRequest(), row.kind, row.id, { expectedRevision: 4,
        state: row.kind === 'problem' ? 'resolved' : 'accepted', reason: row.kind === 'problem' ? 'verified' : 'useful',
        memberMessage: 'Synthetic retained closure', evidenceIds: [evidence.recordId] });
      await database().query("UPDATE support.requests SET closed_at=now()-interval '2 hours' WHERE id=$1", [row.id]);
      assert.deepEqual(await runner('lythaus_privacy')(client => retainSupportBatch(client, policy())), { scrubbedRecords: 1, heldRecords: 0 });
      const tombstone = (await database().query('SELECT submission,member_message,deleted_at FROM support.requests WHERE id=$1', [row.id])).rows[0];
      assert.equal(tombstone.submission, null); assert.equal(tombstone.member_message, null); assert.ok(tombstone.deleted_at);
      for (const table of ['messages', 'notes', 'evidence', 'decisions', 'operation_refs']) assert.equal(await count(table, row.id), 0);
      assert.equal(await systemCount('outbox_events', 'aggregate_id', row.id), 0);
      assert.equal((await database().query("SELECT count(*)::int AS n FROM system.idempotency_keys WHERE response->>'requestId'=$1", [row.id])).rows[0].n, 0);
      assert.equal((await database().query("SELECT count(*)::int AS n FROM system.audit_events WHERE metadata->>'requestId'=$1", [row.id])).rows[0].n, 0);
      await assert.rejects(() => f.service('member').memberReply(memberProof, row.kind, row.id, { expectedRevision: 1, message: 'Synthetic member follow-up' }), /support_not_found/);
      await assert.rejects(() => f.service('owner').ownerNote(ownerProof, row.kind, row.id, { expectedRevision: 2, text: 'PRIVATE_SENTINEL retained note' }), /support_not_found/);
      assert.equal((await f.service('member').memberDetail(await f.memberRequest(f.other), peer.kind, peer.id)).request.id, peer.id);
      assert.deepEqual(await runner('lythaus_privacy')(client => retainSupportBatch(client, policy())), { scrubbedRecords: 0, heldRecords: 0 });
    }
  });
}
