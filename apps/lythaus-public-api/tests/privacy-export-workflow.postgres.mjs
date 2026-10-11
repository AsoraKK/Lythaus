import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { loadApprovedMigrations } from '../../../scripts/ci/planetscale-migration-manifest.mjs';
import { nativePostgresPrivacyWorkflowFixture } from './native-postgres-workflow-fixture.mjs';

const target = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? 'file:///missing');
if (!['localhost', '127.0.0.1'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_auth_test') || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Export workflow tests require an explicitly local disposable PostgreSQL database');
}
const name = `lythaus_auth_test_export_${uuidv7().replaceAll('-', '')}`;
const local = new URL(target); local.pathname = `/${name}`;
let control, fixture, created = false;
async function connect() {
  const client = new pg.Client({ connectionString: local.toString(), ssl: false, connectionTimeoutMillis: 5000 });
  await client.connect();
  await client.query("SET statement_timeout='5s'");
  return client;
}
before(async () => {
  const bootstrap = new pg.Client({ connectionString: target.toString(), ssl: false }); await bootstrap.connect();
  try {
    assert.equal((await bootstrap.query('SHOW server_version_num')).rows[0].server_version_num.slice(0, 2), '17');
    for (const role of ['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy', 'lythaus_migrations']) {
      await bootstrap.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
    }
    await bootstrap.query(`CREATE DATABASE ${name}`); created = true;
  } finally { await bootstrap.end(); }
  control = await connect();
  for (const migration of loadApprovedMigrations().migrations) await control.query(migration.contents.toString());
  await control.query(readFileSync('database/planetscale/grants/roles.sql', 'utf8'));
  fixture = await nativePostgresPrivacyWorkflowFixture(local.toString());
});
after(async () => {
  await fixture?.dispose(); await control?.end();
  if (created) {
    assert.match(name, /^lythaus_auth_test_export_[a-f0-9]+$/);
    const bootstrap = new pg.Client({ connectionString: target.toString(), ssl: false }); await bootstrap.connect();
    try { await bootstrap.query(`DROP DATABASE ${name}`); } finally { await bootstrap.end(); }
  }
});
async function request(accountState = 'active', requestState = 'received', type = 'export') {
  const subjectId = uuidv7(), requestId = uuidv7();
  await control.query('INSERT INTO identity.users(id,status,display_name) VALUES($1,$2,$3)', [subjectId, accountState, 'SYNTHETIC_PRIVATE_EXPORT_NAME']);
  await control.query('INSERT INTO privacy.requests(id,subject_id,request_type,state) VALUES($1,$2,$3,$4)', [requestId, subjectId, type, requestState]);
  return { subjectId, requestId };
}
const key = params => `exports/${params.subjectId}/${params.requestId}.json`;
async function assertUnpublished(params) {
  assert.equal(await (await fixture.bucket('PRIVATE_EXPORTS')).get(key(params)), null);
  assert.equal((await control.query('SELECT id FROM privacy.export_manifests WHERE request_id=$1', [params.requestId])).rowCount, 0);
  assert.equal((await control.query("SELECT id FROM privacy.request_events WHERE request_id=$1 AND event_type='completed'", [params.requestId])).rowCount, 0);
  assert.equal((await control.query("SELECT id FROM trust.user_activity_events WHERE user_id=$1 AND event_type='privacy.export_generated'", [params.subjectId])).rowCount, 0);
}
async function waitFor(predicate) {
  const deadline = Date.now() + 10_000;
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for the synthetic export checkpoint');
    await setTimeout(20);
  }
}

test('native export publishes a hashed private passport and retries without extending expiry', async () => {
  const params = await request();
  const first = await fixture.run('export', params);
  assert.equal(first.status, 'complete', JSON.stringify(first));
  const object = await (await fixture.bucket('PRIVATE_EXPORTS')).get(key(params));
  const body = await object.text(), passport = JSON.parse(body);
  assert.equal(passport.profile.id, params.subjectId);
  assert.equal(passport.profile.display_name, 'SYNTHETIC_PRIVATE_EXPORT_NAME');
  assert.deepEqual(passport.reputation.monthlyReports, { state: 'unavailable', reasonCode: 'approval_unavailable', reports: [] });
  const original = (await control.query(`SELECT manifest.package_hash,manifest.expires_at,request.completed_at
    FROM privacy.export_manifests manifest JOIN privacy.requests request ON request.id=manifest.request_id
    WHERE request.id=$1`, [params.requestId])).rows[0];
  assert.equal(original.package_hash, createHash('sha256').update(body).digest('hex'));
  const retry = await fixture.run('export', params);
  assert.equal(retry.status, 'complete', JSON.stringify(retry));
  const repeated = (await control.query(`SELECT manifest.expires_at,request.completed_at
    FROM privacy.export_manifests manifest JOIN privacy.requests request ON request.id=manifest.request_id
    WHERE request.id=$1`, [params.requestId])).rows[0];
  assert.deepEqual(repeated, { expires_at: original.expires_at, completed_at: original.completed_at });
  assert.equal((await control.query("SELECT id FROM privacy.request_events WHERE request_id=$1 AND event_type='completed'", [params.requestId])).rowCount, 1);
  assert.equal((await control.query("SELECT id FROM trust.user_activity_events WHERE user_id=$1 AND event_type='privacy.export_generated'", [params.subjectId])).rowCount, 1);
});

for (const accountState of ['locked', 'deleted']) {
  test(`a cached passport cannot publish after account becomes ${accountState}`, async () => {
    const params = await request(), lock = await connect();
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT id FROM identity.users WHERE id=$1 FOR NO KEY UPDATE', [params.subjectId]);
      const started = fixture.steps.length;
      const outcome = fixture.run('export', params);
      await waitFor(() => fixture.steps.slice(started).some(step => step.name === 'store-export-and-complete-request' && step.state === 'started'));
      await lock.query('UPDATE identity.users SET status=$2 WHERE id=$1', [params.subjectId, accountState]);
      await lock.query('COMMIT');
      const status = await outcome;
      assert.equal(status.status, 'errored', JSON.stringify(status));
      assert.ok(JSON.stringify(status).includes('privacy_export_account_unavailable'), JSON.stringify(status));
      await assertUnpublished(params);
      assert.equal((await control.query('SELECT state FROM privacy.requests WHERE id=$1', [params.requestId])).rows[0].state, 'received');
    } finally { await lock.query('ROLLBACK'); await lock.end(); }
  });
}

for (const state of ['blocked', 'failed']) {
  test(`a ${state} request cannot be changed into a completed export`, async () => {
    const params = await request('active', state);
    const status = await fixture.run('export', params);
    assert.equal(status.status, 'errored', JSON.stringify(status));
    await assertUnpublished(params);
    assert.equal((await control.query('SELECT state FROM privacy.requests WHERE id=$1', [params.requestId])).rows[0].state, state);
  });
}

test('another owner and a deletion request cannot generate an export', async () => {
  const owner = await request(), stranger = await request();
  const mismatch = await fixture.run('export', { ...owner, subjectId: stranger.subjectId });
  assert.equal(mismatch.status, 'errored', JSON.stringify(mismatch));
  await assertUnpublished(owner);
  const deletion = await request('active', 'received', 'delete');
  const wrongType = await fixture.run('export', deletion);
  assert.equal(wrongType.status, 'errored', JSON.stringify(wrongType));
  await assertUnpublished(deletion);
});

test('account deletion waits for publication and then removes the private artifact', async () => {
  const params = await request(), lock = await connect();
  const deleteRequest = { subjectId: params.subjectId, requestId: uuidv7() };
  await control.query("INSERT INTO privacy.requests(id,subject_id,request_type) VALUES($1,$2,'delete')", [deleteRequest.requestId, params.subjectId]);
  try {
    await lock.query('BEGIN');
    const blocker = (await lock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await lock.query('SELECT id FROM privacy.requests WHERE id=$1 FOR NO KEY UPDATE', [params.requestId]);
    const exporting = fixture.run('export', params);
    await waitFor(async () => (await control.query(`SELECT 1 FROM pg_stat_activity
      WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%SELECT state FROM privacy.requests%'`, [blocker])).rowCount > 0);
    const deleting = fixture.run('delete', deleteRequest);
    await waitFor(async () => (await control.query(`SELECT 1 FROM pg_stat_activity
      WHERE cardinality(pg_blocking_pids(pid))>0 AND query LIKE '%UPDATE identity.users SET status = ''locked''%'`)).rowCount > 0);
    await lock.query('COMMIT');
    const [exportStatus, deleteStatus] = await Promise.all([exporting, deleting]);
    assert.equal(exportStatus.status, 'complete', JSON.stringify(exportStatus));
    assert.equal(deleteStatus.status, 'complete', JSON.stringify(deleteStatus));
    assert.equal((await control.query('SELECT status FROM identity.users WHERE id=$1', [params.subjectId])).rows[0].status, 'deleted');
    assert.equal(await (await fixture.bucket('PRIVATE_EXPORTS')).get(key(params)), null);
    assert.equal((await control.query('SELECT id FROM privacy.export_manifests WHERE request_id=$1', [params.requestId])).rowCount, 0);
    assert.equal((await control.query('SELECT subject_id FROM privacy.deletion_tombstones WHERE subject_id=$1', [params.subjectId])).rowCount, 1);
  } finally { await lock.query('ROLLBACK'); await lock.end(); }
});

test('a database failure after storage write leaves no downloadable manifest and supports an exact-request retry', async () => {
  const params = await request('active', 'processing');
  await control.query('REVOKE INSERT ON privacy.export_manifests FROM lythaus_privacy');
  try {
    const failed = await fixture.run('export', params);
    assert.equal(failed.status, 'errored', JSON.stringify(failed));
    assert.ok(JSON.stringify(failed).includes('permission denied'), JSON.stringify(failed));
    assert.equal((await control.query('SELECT id FROM privacy.export_manifests WHERE request_id=$1', [params.requestId])).rowCount, 0);
    assert.equal((await control.query('SELECT state,completed_at FROM privacy.requests WHERE id=$1', [params.requestId])).rows[0].state, 'processing');
    assert.equal((await control.query("SELECT id FROM privacy.request_events WHERE request_id=$1 AND event_type='completed'", [params.requestId])).rowCount, 0);
    assert.ok(await (await fixture.bucket('PRIVATE_EXPORTS')).get(key(params)));
  } finally { await control.query('GRANT INSERT ON privacy.export_manifests TO lythaus_privacy'); }
  const retry = await fixture.run('export', params);
  assert.equal(retry.status, 'complete', JSON.stringify(retry));
  assert.equal((await control.query('SELECT id FROM privacy.export_manifests WHERE request_id=$1', [params.requestId])).rowCount, 1);
  assert.equal((await control.query("SELECT id FROM privacy.request_events WHERE request_id=$1 AND event_type='completed'", [params.requestId])).rowCount, 1);
});
