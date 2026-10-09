import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test, { before, after } from 'node:test';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { applyApprovedSupportCompletionLimits } from '../../../packages/db/src/support-feedback-approved-limits.ts';
import { loadApprovedMigrations } from '../../../scripts/ci/planetscale-migration-manifest.mjs';
import { nativePostgresPrivacyWorkflowFixture } from '../../lythaus-public-api/tests/native-postgres-workflow-fixture.mjs';

const supplied = process.env.SUPPORT_LOCAL_PG_URL;
if (!supplied) throw new Error('support_workflows_require_disposable_local_pg17');
const target = new URL(supplied);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !target.pathname.startsWith('/lythaus_support_test')) throw new Error('support_workflows_refuse_nonlocal_database');
const name = `lythaus_support_test_workflow_${uuidv7().replaceAll('-', '')}`;
const local = new URL(target); local.pathname = `/${name}`;
const source = readFileSync('packages/db/tests/support-feedback.postgres.mjs', 'utf8');
const literal = source.match(/const policy=\(\)=>\(([\s\S]*?)\);\nconst problem=/)[1];
const candidate = JSON.parse(JSON.stringify(runInNewContext(`(${literal})`)));
candidate.privacy.requestStates = ['received', 'completed'];
const policy = applyApprovedSupportCompletionLimits(candidate);
let control, fixture, created = false;
const roles = ['lythaus_runtime', 'lythaus_admin', 'lythaus_privacy', 'lythaus_jobs', 'lythaus_migrations',
  'lythaus_support_function_owner', 'lythaus_support_locator_owner'];
before(async () => {
  const bootstrap = new pg.Client({ connectionString: target.toString(), ssl: false }); await bootstrap.connect();
  try {
    assert.equal((await bootstrap.query('SHOW server_version_num')).rows[0].server_version_num.slice(0, 2), '17');
    for (const role of roles) await bootstrap.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
    await bootstrap.query(`CREATE DATABASE ${name}`); created = true;
  } finally { await bootstrap.end(); }
  control = new pg.Client({ connectionString: local.toString(), ssl: false }); await control.connect();
  for (const migration of loadApprovedMigrations().migrations) await control.query(migration.contents.toString());
  await control.query(readFileSync('database/planetscale/grants/roles.sql', 'utf8'));
  await control.query(readFileSync('database/planetscale/proposals/profile-presentation-preferences.sql', 'utf8'));
  fixture = await nativePostgresPrivacyWorkflowFixture(local.toString(), { supportPolicy: policy });
});
after(async () => {
  await fixture?.dispose(); await control?.end();
  if (created) {
    assert.match(name, /^lythaus_support_test_workflow_[a-f0-9]+$/);
    const bootstrap = new pg.Client({ connectionString: target.toString(), ssl: false }); await bootstrap.connect();
    try { await bootstrap.query(`DROP DATABASE ${name}`); } finally { await bootstrap.end(); }
  }
});
async function subject() {
  const id = uuidv7();
  await control.query("INSERT INTO identity.users(id,display_name,presentation_left_handed,presentation_profile_swipe) VALUES($1,'Synthetic support workflow member',true,false)", [id]);
  await control.query("INSERT INTO social.profiles(user_id,bio,moderation_state) VALUES($1,'Synthetic private biography','allowed')", [id]);
  return id;
}
async function request(subjectId, type) {
  const requestId = uuidv7();
  await control.query('INSERT INTO privacy.requests(id,subject_id,request_type) VALUES($1,$2,$3)', [requestId, subjectId, type]);
  return { subjectId, requestId };
}
async function ticket(subjectId) {
  const id = uuidv7();
  await control.query(`INSERT INTO support.requests(id,submitter_id,kind,submission,revision,state,policy_version)
    VALUES($1,$2,'problem',$3::jsonb,1,'submitted',$4)`, [id, subjectId, JSON.stringify({ kind: 'problem', category: 'display', title: 'Synthetic Workflow ticket', actual: 'Synthetic actual', expected: 'Synthetic expected' }), policy.version]);
  return id;
}
async function assertPending(params) {
  const row = (await control.query('SELECT state,completed_at FROM privacy.requests WHERE id=$1', [params.requestId])).rows[0];
  assert.notEqual(row.state, 'completed'); assert.equal(row.completed_at, null);
  assert.equal((await control.query("SELECT count(*)::integer AS count FROM privacy.request_events WHERE request_id=$1 AND event_type='completed'", [params.requestId])).rows[0].count, 0);
  assert.equal((await control.query('SELECT count(*)::integer AS count FROM privacy.deletion_tombstones WHERE subject_id=$1', [params.subjectId])).rows[0].count, 0);
}

test('native account deletion remains operational when every optional support table is absent', async () => {
  const params = await request(await subject(), 'delete');
  const status = await fixture.run('delete', params); assert.equal(status.status, 'complete', JSON.stringify(status));
  assert.equal((await control.query('SELECT state FROM privacy.requests WHERE id=$1', [params.requestId])).rows[0].state, 'completed');
});

test('native support export and deletion preserve the reviewed profile exporter and reconcile actual rows', async () => {
  await control.query(readFileSync('database/planetscale/proposals/support-feedback.canonical.sql', 'utf8'));
  const member = await subject(), owner = await subject(), id = await ticket(member);
  await control.query("UPDATE support.requests SET revision=3,public_revision=2 WHERE id=$1", [id]);
  await control.query("INSERT INTO support.messages(id,request_id,author_id,author_role,body,revision) VALUES($1,$2,$3,'owner','Synthetic public owner reply',2)", [uuidv7(), id, owner]);
  await control.query("INSERT INTO support.notes(id,request_id,author_id,body,revision) VALUES($1,$2,$3,'PRIVATE_SYNTHETIC_OWNER_NOTE',3)", [uuidv7(), id, owner]);
  const exported = await request(member, 'export');
  const exportStatus = await fixture.run('export', exported);
  assert.equal(exportStatus.status, 'complete', JSON.stringify(exportStatus));
  const object = await (await fixture.bucket('PRIVATE_EXPORTS')).get(`exports/${member}/${exported.requestId}.json`);
  const body = await object.text(), passport = JSON.parse(body);
  assert.equal(passport.profile.bio, 'Synthetic private biography');
  assert.deepEqual(passport.profile.presentation_preferences, { leftHandedMode: true, horizontalSwipeEnabled: false, version: 1 });
  assert.equal(passport.supportFeedback.requests[0].request.id, id);
  assert.equal(passport.supportFeedback.requests[0].messages[0].text, 'Synthetic public owner reply');
  assert.ok(!body.includes('PRIVATE_SYNTHETIC_OWNER_NOTE')); assert.ok(!body.includes(owner));
  const deleted = await request(member, 'delete');
  const status = await fixture.run('delete', deleted); assert.equal(status.status, 'complete', JSON.stringify(status));
  assert.deepEqual((await control.query('SELECT submission,member_message FROM support.requests WHERE id=$1', [id])).rows[0], { submission: null, member_message: null });
  assert.equal((await control.query("SELECT count(*)::integer AS count FROM privacy.subject_data_locations WHERE subject_id=$1 AND resource_reference LIKE 'support.%' AND deletion_state='present'", [member])).rows[0].count, 0);
  assert.deepEqual((await control.query('SELECT presentation_left_handed AS left,presentation_profile_swipe AS swipe FROM identity.users WHERE id=$1', [member])).rows[0], { left: false, swipe: true });
  assert.equal((await fixture.run('delete', deleted)).status, 'complete');
  assert.equal((await control.query("SELECT count(*)::integer AS count FROM privacy.request_events WHERE request_id=$1 AND event_type='completed'", [deleted.requestId])).rows[0].count, 1);
});

test('native deletion leaves unresolved owner-authored peer content present and retries without false completion', async () => {
  const owner = await subject(), peer = await subject(), id = await ticket(peer), message = uuidv7();
  await control.query("UPDATE support.requests SET revision=2,public_revision=2 WHERE id=$1", [id]);
  await control.query("INSERT INTO support.messages(id,request_id,author_id,author_role,body,revision) VALUES($1,$2,$3,'owner','Synthetic unresolved owner contribution',2)", [message, id, owner]);
  const params = await request(owner, 'delete');
  const status = await fixture.run('delete', params); assert.equal(status.status, 'errored', JSON.stringify(status));
  assert.ok(JSON.stringify(status).includes('support_privacy_deletion_pending'), JSON.stringify(status));
  await assertPending(params);
  assert.equal((await control.query("SELECT deletion_state FROM privacy.subject_data_locations WHERE subject_id=$1 AND resource_reference='support.messages' AND entity_id=$2", [owner, message])).rows[0].deletion_state, 'present');
  assert.ok((await control.query('SELECT submission FROM support.requests WHERE id=$1', [id])).rows[0].submission);
  await control.query('DELETE FROM support.messages WHERE id=$1', [message]);
  const retry = await fixture.run('delete', params); assert.equal(retry.status, 'complete', JSON.stringify(retry));
  assert.equal((await control.query("SELECT count(*)::integer AS count FROM privacy.request_events WHERE request_id=$1 AND event_type='completed'", [params.requestId])).rows[0].count, 1);
});

test('native deletion fails closed without the reviewed support reconciler execute grant', async () => {
  const params = await request(await subject(), 'delete');
  await control.query('REVOKE EXECUTE ON FUNCTION privacy.reconcile_support_subject_data_locations(uuid) FROM lythaus_privacy');
  try {
    const status = await fixture.run('delete', params); assert.equal(status.status, 'errored', JSON.stringify(status));
    assert.ok(JSON.stringify(status).includes('support_privacy_schema_unavailable'), JSON.stringify(status)); await assertPending(params);
  } finally { await control.query('GRANT EXECUTE ON FUNCTION privacy.reconcile_support_subject_data_locations(uuid) TO lythaus_privacy'); }
  assert.equal((await fixture.run('delete', params)).status, 'complete');
});

test('native retention respects both reporter and owner support audit holds without changing audit duration', async () => {
  const member = await subject(), owner = await subject(), unrelated = await subject(), heldOwner = await subject();
  await control.query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic hold')", [uuidv7(), member]);
  await control.query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic owner hold')", [uuidv7(), heldOwner]);
  const ids = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  for (const [index, actorId, metadata] of [[0, null, { subjectId: member, actorId: owner }], [1, owner, { subjectId: member, actorId: owner }],
    [2, null, { subjectId: unrelated, actorId: unrelated }], [3, null, { subjectId: unrelated, actorId: heldOwner }]]) {
    await control.query("INSERT INTO system.audit_events(id,actor_id,action,reason_code,correlation_id,metadata,created_at) VALUES($1,$2,'support.synthetic','SUPPORT_OPERATION',$1::uuid::text,$3::jsonb,now()-interval '400 days')", [ids[index], actorId, JSON.stringify(metadata)]);
  }
  const status = await fixture.run('retention', { runId: uuidv7() }); assert.equal(status.status, 'complete', JSON.stringify(status));
  assert.deepEqual((await control.query('SELECT id FROM system.audit_events WHERE id=ANY($1::uuid[]) ORDER BY id', [ids])).rows.map(row => row.id).sort(), [ids[0], ids[1], ids[3]].sort());
});

test('native 30-day closed-content retention preserves recent and held requests', async () => {
  const members = [await subject(), await subject(), await subject()];
  const ids = [];
  for (const member of members) ids.push(await ticket(member));
  await control.query("UPDATE support.requests SET state='resolved',closed_at=now()-interval '31 days' WHERE id=ANY($1::uuid[])", [ids]);
  await control.query("UPDATE support.requests SET closed_at=now()-interval '29 days' WHERE id=$1", [ids[1]]);
  await control.query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic retention hold')", [uuidv7(), members[2]]);
  const status = await fixture.run('retention', { runId: uuidv7() }); assert.equal(status.status, 'complete', JSON.stringify(status));
  const rows = (await control.query('SELECT id,submission,deleted_at FROM support.requests WHERE id=ANY($1::uuid[])', [ids])).rows;
  assert.equal(rows.find(row => row.id === ids[0]).submission, null);
  assert.ok(rows.find(row => row.id === ids[0]).deleted_at);
  for (const id of ids.slice(1)) { const row = rows.find(row => row.id === id); assert.ok(row.submission); assert.equal(row.deleted_at, null); }
});

test('native account privacy fails closed with partial support schema and retries after restoration', async () => {
  const params = await request(await subject(), 'delete');
  await control.query('ALTER TABLE support.notes RENAME TO notes_fixture_incomplete');
  try {
    assert.equal((await fixture.run('delete', params)).status, 'errored'); await assertPending(params);
  } finally { await control.query('ALTER TABLE support.notes_fixture_incomplete RENAME TO notes'); }
  assert.equal((await fixture.run('delete', params)).status, 'complete');
});
