import { uuidv7 } from '../../security/src/index.ts';

export function registerSupportContributorCases({ test, assert, fixture, policy, database, runner, connection, blocked, gate,
  purgeSupportForPrivacy, retainSupportBatch }) {
  test('a contributor hold protects every child type, replay ledger and reporter text; release permits existing scrub', async t => {
    const f = await fixture(t), id = (await f.submit()).request.id;
    await f.service('owner').ownerReply(await f.ownerRequest(), 'problem', id, { expectedRevision: 1, message: 'Synthetic contributor reply' });
    await f.service('owner').ownerNote(await f.ownerRequest(), 'problem', id, { expectedRevision: 2, text: 'Synthetic contributor private note' });
    const evidence = await f.service('owner').ownerEvidence(await f.ownerRequest(), 'problem', id,
      { expectedRevision: 3, type: 'verification', description: 'Synthetic contributor evidence' });
    await f.service('owner').ownerDecision(await f.ownerRequest(), 'problem', id,
      { expectedRevision: 4, state: 'resolved', reason: 'verified', memberMessage: 'Synthetic contributor decision', evidenceIds: [evidence.recordId] });
    const held = uuidv7(), request = await f.privacyRequest('delete');
    await database().query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic contributor hold')", [held, f.owner]);
    const before = (await database().query('SELECT count(*)::int AS count FROM support.operation_refs WHERE request_id=$1', [id])).rows[0].count;
    await assert.rejects(() => runner('lythaus_privacy')(c => purgeSupportForPrivacy(c, request, policy())), /support_privacy_held/);
    assert.ok((await database().query('SELECT submission FROM support.requests WHERE id=$1', [id])).rows[0].submission);
    for (const relation of ['messages', 'notes', 'evidence', 'decisions']) {
      assert.equal((await database().query(`SELECT count(*)::int AS count FROM support.${relation} WHERE request_id=$1`, [id])).rows[0].count, relation === 'messages' ? 2 : 1);
    }
    assert.equal((await database().query('SELECT count(*)::int AS count FROM support.operation_refs WHERE request_id=$1', [id])).rows[0].count, before);
    assert.ok((await database().query('SELECT count(*)::int AS count FROM system.idempotency_keys WHERE actor_id=$1', [f.owner])).rows[0].count > 0);
    await database().query('UPDATE privacy.legal_holds SET active=false,released_at=now() WHERE id=$1', [held]);
    assert.equal((await runner('lythaus_privacy')(c => purgeSupportForPrivacy(c, request, policy()))).scrubbedRecords, 1);
    assert.equal((await runner('lythaus_privacy')(c => purgeSupportForPrivacy(c, request, policy()))).scrubbedRecords, 0);
    assert.equal((await database().query('SELECT count(*)::int AS count FROM system.idempotency_keys WHERE actor_id=$1', [f.owner])).rows[0].count, 0);
  });

  test('an audit/replay-only contributor remains protected after its content row is absent', async t => {
    const f = await fixture(t), id = (await f.submit()).request.id;
    await f.service('owner').ownerNote(await f.ownerRequest(), 'problem', id, { expectedRevision: 1, text: 'Synthetic audit-only contributor' });
    await database().query('DELETE FROM support.notes WHERE request_id=$1', [id]);
    await database().query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic audit actor hold')", [uuidv7(), f.owner]);
    const request = await f.privacyRequest('delete');
    await assert.rejects(() => runner('lythaus_privacy')(c => purgeSupportForPrivacy(c, request, policy())), /support_privacy_held/);
    assert.ok((await database().query('SELECT submission FROM support.requests WHERE id=$1', [id])).rows[0].submission);
  });

  test('retention skips contributor-held requests without starving another eligible reporter', async t => {
    const f = await fixture(t), held = (await f.submit()).request.id, eligible = (await f.submit(undefined, uuidv7(), f.other)).request.id;
    await f.service('owner').ownerReply(await f.ownerRequest(), 'problem', held, { expectedRevision: 1, message: 'Synthetic held history' });
    await database().query("UPDATE support.requests SET state='resolved',closed_at=now()-interval '2 hours' WHERE id=ANY($1::uuid[])", [[held, eligible]]);
    await database().query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic contributor retention hold')", [uuidv7(), f.owner]);
    assert.equal((await runner('lythaus_privacy')(c => retainSupportBatch(c, policy()))).scrubbedRecords, 1);
    assert.ok((await database().query('SELECT submission FROM support.requests WHERE id=$1', [held])).rows[0].submission);
    assert.equal((await database().query('SELECT submission FROM support.requests WHERE id=$1', [eligible])).rows[0].submission, null);
  });

  test('an in-flight contributor hold FK lock defers scrub; its committed hold prevents the retry', async t => {
    const f = await fixture(t), id = (await f.submit()).request.id, c = await connection(), started = gate();
    await f.service('owner').ownerReply(await f.ownerRequest(), 'problem', id, { expectedRevision: 1, message: 'Synthetic hold race' });
    const request = await f.privacyRequest('delete');
    try {
      await c.query('BEGIN');
      await c.query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic winning contributor hold')", [uuidv7(), f.owner]);
      const pending = runner('lythaus_privacy', { onClient: client => started.resolve(client.processID) })(client => purgeSupportForPrivacy(client, request, policy()));
      const denied = assert.rejects(pending, /support_privacy_unavailable/);
      await started.promise; await denied; await c.query('COMMIT');
      await assert.rejects(() => runner('lythaus_privacy')(client => purgeSupportForPrivacy(client, request, policy())), /support_privacy_held/);
      assert.ok((await database().query('SELECT submission FROM support.requests WHERE id=$1', [id])).rows[0].submission);
    } finally { await c.query('ROLLBACK'); await c.end(); }
  });

  test('a contributor hold placed after retention selection preserves the held suffix and commits only the unheld prefix', async t => {
    const f = await fixture(t), first = (await f.submit()).request.id, held = (await f.submit()).request.id;
    await f.service('owner').ownerReply(await f.ownerRequest(), 'problem', held, { expectedRevision: 1, message: 'Synthetic newly held contributor' });
    await database().query("UPDATE support.requests SET state='resolved',closed_at=now()-interval '2 hours' WHERE id=ANY($1::uuid[])", [[first, held]]);
    const selected = gate(), release = gate();
    const pending = runner('lythaus_privacy', { afterRetentionCandidates: async () => { selected.resolve(); await release.promise; } })(client => retainSupportBatch(client, policy()));
    try {
      await selected.promise;
      await database().query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic post-selection contributor hold')", [uuidv7(), f.owner]);
      release.resolve(); assert.deepEqual(await pending, { scrubbedRecords: 1, heldRecords: 1 });
      assert.equal((await database().query('SELECT submission FROM support.requests WHERE id=$1', [first])).rows[0].submission, null);
      assert.ok((await database().query('SELECT submission FROM support.requests WHERE id=$1', [held])).rows[0].submission);
    } finally { release.resolve(); await pending.catch(() => undefined); }
  });

  test('scrub winning contributor locks serializes a later hold placement through commit', async t => {
    const f = await fixture(t), id = (await f.submit()).request.id, c = await connection(), locked = gate(), release = gate();
    await f.service('owner').ownerReply(await f.ownerRequest(), 'problem', id, { expectedRevision: 1, message: 'Synthetic scrub race' });
    const request = await f.privacyRequest('delete');
    const scrub = runner('lythaus_privacy', { afterSupportParticipantLock: async () => { locked.resolve(); await release.promise; } })(client => purgeSupportForPrivacy(client, request, policy()));
    try {
      await locked.promise;
      const place = c.query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic later contributor hold')", [uuidv7(), f.owner]);
      await blocked(c.processID); release.resolve();
      assert.equal((await scrub).scrubbedRecords, 1); await place;
      assert.equal((await database().query('SELECT submission FROM support.requests WHERE id=$1', [id])).rows[0].submission, null);
    } finally { release.resolve(); await c.end(); }
  });

  test('scrub locks an existing inactive contributor hold so activation waits until commit', async t => {
    const f = await fixture(t), id = (await f.submit()).request.id, hold = uuidv7(), c = await connection('lythaus_privacy');
    await f.service('owner').ownerReply(await f.ownerRequest(), 'problem', id, { expectedRevision: 1, message: 'Synthetic hold reactivation race' });
    await database().query("INSERT INTO privacy.legal_holds(id,subject_id,reason,active,released_at) VALUES($1,$2,'Synthetic inactive contributor hold',false,now())", [hold, f.owner]);
    const request = await f.privacyRequest('delete'), checked = gate(), release = gate();
    const scrub = runner('lythaus_privacy', { afterSupportParticipantHoldLock: async () => { checked.resolve(); await release.promise; } })(client => purgeSupportForPrivacy(client, request, policy()));
    let activation, activeBeforeRelease;
    try {
      await checked.promise;
      activation = c.query('UPDATE privacy.legal_holds SET active=true,released_at=NULL WHERE id=$1', [hold]);
      activation.catch(() => undefined);
      try { await blocked(c.processID); }
      finally { activeBeforeRelease = (await database().query('SELECT active FROM privacy.legal_holds WHERE id=$1', [hold])).rows[0].active; }
      assert.equal(activeBeforeRelease, false);
      release.resolve(); assert.equal((await scrub).scrubbedRecords, 1); await activation;
      assert.equal((await database().query('SELECT active FROM privacy.legal_holds WHERE id=$1', [hold])).rows[0].active, true);
    } finally {
      release.resolve(); await scrub.catch(() => undefined); await activation?.catch(() => undefined);
      const deleted = (await database().query('SELECT deleted_at IS NOT NULL AS deleted FROM support.requests WHERE id=$1', [id])).rows[0].deleted;
      t.diagnostic(`inactive hold activation: active before scrub release=${activeBeforeRelease}, scrub deleted=${deleted}`);
      await c.end();
    }
  });

  test('in-flight activation and a waiting account lock defer privacy without a deadlock; committed activation blocks retry', async t => {
    const f = await fixture(t), id = (await f.submit()).request.id, hold = uuidv7(), c = await connection('lythaus_privacy');
    await f.service('owner').ownerReply(await f.ownerRequest(), 'problem', id, { expectedRevision: 1, message: 'Synthetic activation account cycle' });
    await database().query("INSERT INTO privacy.legal_holds(id,subject_id,reason,active,released_at) VALUES($1,$2,'Synthetic inactive cycle hold',false,now())", [hold, f.owner]);
    const request = await f.privacyRequest('delete'), locked = gate(), release = gate();
    let scrub, account;
    try {
      await c.query('BEGIN'); await c.query('UPDATE privacy.legal_holds SET active=true,released_at=NULL WHERE id=$1', [hold]);
      scrub = runner('lythaus_privacy', { afterSupportParticipantLock: async () => { locked.resolve(); await release.promise; } })(client => purgeSupportForPrivacy(client, request, policy()));
      const denied = assert.rejects(scrub, /support_privacy_unavailable/); denied.catch(() => undefined);
      await locked.promise;
      account = c.query('SELECT id FROM identity.users WHERE id=$1 FOR SHARE', [f.owner]); account.catch(() => undefined);
      await blocked(c.processID); release.resolve(); await denied; await account; await c.query('COMMIT');
      assert.ok((await database().query('SELECT submission FROM support.requests WHERE id=$1', [id])).rows[0].submission);
      await assert.rejects(() => runner('lythaus_privacy')(client => purgeSupportForPrivacy(client, request, policy())), /support_privacy_held/);
      await database().query('UPDATE privacy.legal_holds SET active=false,released_at=now() WHERE id=$1', [hold]);
      assert.equal((await runner('lythaus_privacy')(client => purgeSupportForPrivacy(client, request, policy()))).scrubbedRecords, 1);
    } finally {
      release.resolve(); await scrub?.catch(() => undefined); await account?.catch(() => undefined);
      await c.query('ROLLBACK'); await c.end();
    }
  });

  test('activation of an existing inactive hold after retention selection preserves its contributor content', async t => {
    const f = await fixture(t), id = (await f.submit()).request.id, hold = uuidv7();
    await f.service('owner').ownerReply(await f.ownerRequest(), 'problem', id, { expectedRevision: 1, message: 'Synthetic retention activation' });
    await database().query("UPDATE support.requests SET state='resolved',closed_at=now()-interval '2 hours' WHERE id=$1", [id]);
    await database().query("INSERT INTO privacy.legal_holds(id,subject_id,reason,active,released_at) VALUES($1,$2,'Synthetic inactive retention hold',false,now())", [hold, f.owner]);
    const selected = gate(), release = gate();
    const pending = runner('lythaus_privacy', { afterRetentionCandidates: async () => { selected.resolve(); await release.promise; } })(client => retainSupportBatch(client, policy()));
    try {
      await selected.promise; await database().query('UPDATE privacy.legal_holds SET active=true,released_at=NULL WHERE id=$1', [hold]);
      release.resolve(); assert.deepEqual(await pending, { scrubbedRecords: 0, heldRecords: 1 });
      assert.ok((await database().query('SELECT submission FROM support.requests WHERE id=$1', [id])).rows[0].submission);
      await database().query('UPDATE privacy.legal_holds SET active=false,released_at=now() WHERE id=$1', [hold]);
      assert.equal((await runner('lythaus_privacy')(client => retainSupportBatch(client, policy()))).scrubbedRecords, 1);
    } finally { release.resolve(); await pending.catch(() => undefined); }
  });
}
