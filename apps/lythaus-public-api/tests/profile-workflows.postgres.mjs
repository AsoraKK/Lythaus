import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { nativePostgresPrivacyWorkflowFixture } from './native-postgres-workflow-fixture.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['127.0.0.1', 'localhost'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_auth_test') || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Privacy workflow tests require an explicitly local disposable PostgreSQL database');
}
async function sql(text, values = []) {
  const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
  await client.connect();
  try { await client.query("SET statement_timeout='5s'"); return await client.query(text, values); }
  finally { await client.end(); }
}
const columns = ['presentation_left_handed', 'presentation_profile_swipe', 'presentation_preferences_version'];
let fixture;
let ownedStorage = false;
before(async () => {
  const version = (await sql("SELECT current_setting('server_version_num')::integer AS version")).rows[0].version;
  assert.ok(version >= 170000 && version < 180000);
  assert.equal((await sql(`SELECT count(*)::integer AS count FROM pg_attribute
    WHERE attrelid='identity.users'::regclass AND NOT attisdropped AND attname=ANY($1)`, [columns])).rows[0].count, 0);
  ownedStorage = true;
  fixture = await nativePostgresPrivacyWorkflowFixture(connectionString);
});
after(async () => {
  await fixture?.dispose();
  if (ownedStorage) await storage('absent');
});
async function storage(state) {
  await sql(`ALTER TABLE identity.users DROP COLUMN IF EXISTS presentation_left_handed,
    DROP COLUMN IF EXISTS presentation_profile_swipe, DROP COLUMN IF EXISTS presentation_preferences_version`);
  if (state === 'ready') await sql(readFileSync(new URL('../../../database/planetscale/proposals/profile-presentation-preferences.sql', import.meta.url), 'utf8'));
  if (state === 'incomplete') await sql('ALTER TABLE identity.users ADD COLUMN presentation_left_handed boolean NOT NULL DEFAULT false');
}
async function subject() {
  const subjectId = uuidv7();
  await sql('INSERT INTO identity.users(id,display_name) VALUES($1,$2)', [subjectId, 'Synthetic privacy workflow member']);
  await sql("INSERT INTO social.profiles(user_id,bio,moderation_state) VALUES($1,'Synthetic saved biography','allowed')", [subjectId]);
  return subjectId;
}
async function request(subjectId, kind) {
  const requestId = uuidv7();
  await sql('INSERT INTO privacy.requests(id,subject_id,request_type) VALUES($1,$2,$3)', [requestId, subjectId, kind]);
  return { subjectId, requestId };
}
async function savePreferences(subjectId) {
  await sql(`UPDATE identity.users SET presentation_left_handed=true,
    presentation_profile_swipe=false,presentation_preferences_version=7 WHERE id=$1`, [subjectId]);
}
async function preferences(subjectId) {
  return (await sql(`SELECT presentation_left_handed AS left, presentation_profile_swipe AS swipe,
    presentation_preferences_version AS version FROM identity.users WHERE id=$1`, [subjectId])).rows[0];
}
async function completed(kind, params) {
  const status = await fixture.run(kind, params);
  assert.equal(status.status, 'complete', JSON.stringify(status));
  assert.deepEqual(status.output, { subjectId: params.subjectId, state: 'completed' });
  const row = (await sql('SELECT state,completed_at FROM privacy.requests WHERE id=$1', [params.requestId])).rows[0];
  assert.equal(row.state, 'completed');
  assert.ok(row.completed_at);
  assert.equal((await sql("SELECT count(*)::integer AS count FROM privacy.request_events WHERE request_id=$1 AND event_type='completed'", [params.requestId])).rows[0].count, 1);
}
async function assertNoCompletion(params) {
  const row = (await sql('SELECT state,completed_at FROM privacy.requests WHERE id=$1', [params.requestId])).rows[0];
  assert.notEqual(row.state, 'completed');
  assert.equal(row.completed_at, null);
  assert.equal((await sql("SELECT count(*)::integer AS count FROM privacy.request_events WHERE request_id=$1 AND event_type='completed'", [params.requestId])).rows[0].count, 0);
}
const key = params => `exports/${params.subjectId}/${params.requestId}.json`;
const saved = { left: true, swipe: false, version: 7 };
const defaults = { left: false, swipe: true, version: 1 };

test('native full export and delete use private preferences, R2, canonical grants and isolated completion', async () => {
  await storage('ready');
  const subjectId = await subject();
  const otherId = await subject();
  await savePreferences(subjectId);
  await savePreferences(otherId);
  const postId = uuidv7();
  await sql("INSERT INTO content.posts(id,author_id,body,declared_creation_mode,visibility,moderation_state) VALUES($1,$2,'Synthetic unpublished post','human','private','under_review')", [postId, subjectId]);
  await sql("INSERT INTO system.idempotency_keys(scope,key,actor_id,response) VALUES('profile-workflow',$1,$2,$3::jsonb)",
    [subjectId, subjectId, JSON.stringify({ state: 'completed', presentationPreferences: saved })]);
  const exported = await request(subjectId, 'export');
  const exports = await fixture.bucket('PRIVATE_EXPORTS');
  await exports.put(`exports/${otherId}/retained.json`, 'Other synthetic member');
  const statementStart = fixture.statements.length;
  await completed('export', exported);
  const object = await exports.get(key(exported));
  const body = await object.text();
  const passport = JSON.parse(body);
  assert.equal(object.httpMetadata.contentType, 'application/json');
  assert.equal(passport.schemaVersion, 'lythaus-data-passport-v3');
  assert.equal(passport.profile.id, subjectId);
  assert.equal(passport.profile.bio, 'Synthetic saved biography');
  assert.deepEqual(passport.profile.presentation_preferences, { leftHandedMode: true, horizontalSwipeEnabled: false, version: 7 });
  assert.ok(!body.includes('presentation_preferences_storage_state'));
  assert.ok(!body.includes(otherId));
  assert.equal(passport.posts[0].id, postId);
  assert.equal(passport.posts[0].moderation_state, 'under_review');
  assert.ok(passport.subjectDataLocations.some(location => location.resource_reference === 'identity.users'));
  const manifest = (await sql('SELECT object_key,package_hash,expires_at FROM privacy.export_manifests WHERE request_id=$1', [exported.requestId])).rows[0];
  assert.equal(manifest.object_key, key(exported));
  assert.equal(manifest.package_hash, createHash('sha256').update(body).digest('hex'));
  assert.ok(Math.abs(new Date(manifest.expires_at).getTime() - Date.now() - 7 * 86_400_000) < 60_000);
  assert.equal((await sql("SELECT count(*)::integer AS count FROM feed.notifications WHERE recipient_id=$1 AND notification_type='privacy.export_ready'", [subjectId])).rows[0].count, 1);
  assert.ok(fixture.statements.slice(statementStart).some(s => s.role === 'lythaus_privacy' && s.text.includes('presentation_preferences_storage_state')));

  const mediaId = uuidv7();
  const uploadId = uuidv7();
  const mediaKey = `synthetic/${subjectId}/approved`;
  const uploadKey = `synthetic/${subjectId}/quarantine`;
  await sql("INSERT INTO media.objects(id,owner_id,object_key,content_type,byte_size,state) VALUES($1,$2,$3,'image/png',1,'approved')", [mediaId, subjectId, mediaKey]);
  await sql("INSERT INTO media.upload_sessions(id,user_id,object_key,content_type,expected_bytes,checksum_sha256,expires_at) VALUES($1,$2,$3,'image/png',1,$4,now()-interval '1 hour')", [uploadId, subjectId, uploadKey, 'a'.repeat(64)]);
  const approved = await fixture.bucket('MEDIA_APPROVED');
  const quarantine = await fixture.bucket('MEDIA_QUARANTINE');
  await approved.put(mediaKey, 'Synthetic media');
  await quarantine.put(uploadKey, 'Synthetic upload');
  const deleted = await request(subjectId, 'delete');
  const stepStart = fixture.steps.length;
  await completed('delete', deleted);
  assert.deepEqual(await preferences(subjectId), defaults);
  assert.deepEqual(await preferences(otherId), saved);
  assert.equal((await sql('SELECT status,display_name FROM identity.users WHERE id=$1', [subjectId])).rows[0].status, 'deleted');
  assert.equal((await sql('SELECT count(*)::integer AS count FROM social.profiles WHERE user_id=$1', [subjectId])).rows[0].count, 0);
  assert.deepEqual((await sql('SELECT body,visibility,moderation_state,published_at FROM content.posts WHERE id=$1', [postId])).rows[0],
    { body: '[deleted]', visibility: 'private', moderation_state: 'blocked', published_at: null });
  assert.equal(await exports.get(key(exported)), null);
  assert.ok(await exports.get(`exports/${otherId}/retained.json`));
  assert.equal(await approved.get(mediaKey), null);
  assert.equal(await quarantine.get(uploadKey), null);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.export_manifests WHERE request_id=$1', [exported.requestId])).rows[0].count, 0);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM system.idempotency_keys WHERE key=$1', [subjectId])).rows[0].count, 0);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.deletion_tombstones WHERE subject_id=$1', [subjectId])).rows[0].count, 1);
  const successfulSteps = fixture.steps.slice(stepStart).filter(s => s.state === 'succeeded').map(s => s.name);
  assert.deepEqual(successfulSteps, ['resolve-request', 'lock-account-and-revoke-sessions', 'evaluate-legal-holds',
    'purge-support-feedback-for-deletion', 'tombstone-private-beta', 'wait-private-beta-upload-expiry', 'purge-private-beta',
    'redact-authoritative-content', 'reset-presentation-preferences', 'purge-media-and-mark-locator',
    'verify-support-deletion-locations', 'complete-request-and-tombstone']);
  assert.ok(fixture.statements.some(s => s.role === 'lythaus_privacy' && s.values[0] === subjectId && s.text.includes('SET presentation_left_handed = false')));
  await completed('delete', deleted);
  assert.deepEqual(await preferences(subjectId), defaults);
  assert.deepEqual(await preferences(otherId), saved);
  assert.equal((await sql("SELECT count(*)::integer AS count FROM trust.user_activity_events WHERE user_id=$1 AND event_type='account.deletion_completed'", [subjectId])).rows[0].count, 1);
});

test('native complete workflows preserve wholly absent schema compatibility', async () => {
  await storage('absent');
  const subjectId = await subject();
  const exported = await request(subjectId, 'export');
  await completed('export', exported);
  const exports = await fixture.bucket('PRIVATE_EXPORTS');
  assert.equal((await (await exports.get(key(exported))).json()).profile.presentation_preferences, null);
  const start = fixture.statements.length;
  await completed('delete', await request(subjectId, 'delete'));
  assert.ok(fixture.statements.slice(start).some(s => s.text.includes('FOR UPDATE OF u') && s.role === 'lythaus_privacy'));
  assert.ok(!fixture.statements.slice(start).some(s => s.text.includes('SET presentation_left_handed = false')));
  assert.equal(await exports.get(key(exported)), null);
});

test('incomplete storage stops completion and permits repaired same-request re-execution', async () => {
  await storage('incomplete');
  const subjectId = await subject();
  await sql('UPDATE identity.users SET presentation_left_handed=true WHERE id=$1', [subjectId]);
  const exported = await request(subjectId, 'export');
  const exports = await fixture.bucket('PRIVATE_EXPORTS');
  const exportStatus = await fixture.run('export', exported);
  assert.equal(exportStatus.status, 'errored', JSON.stringify(exportStatus));
  assert.match(JSON.stringify(exportStatus.error), /presentation_preferences_storage_incomplete/);
  await assertNoCompletion(exported);
  assert.equal(await exports.get(key(exported)), null);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.export_manifests WHERE request_id=$1', [exported.requestId])).rows[0].count, 0);
  const deleted = await request(subjectId, 'delete');
  await exports.put(`exports/${subjectId}/existing.json`, 'Synthetic retained until completed purge');
  const deleteStatus = await fixture.run('delete', deleted);
  assert.equal(deleteStatus.status, 'errored', JSON.stringify(deleteStatus));
  assert.match(JSON.stringify(deleteStatus.error), /presentation_preferences_storage_incomplete/);
  await assertNoCompletion(deleted);
  assert.equal((await sql('SELECT presentation_left_handed FROM identity.users WHERE id=$1', [subjectId])).rows[0].presentation_left_handed, true);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.deletion_tombstones WHERE subject_id=$1', [subjectId])).rows[0].count, 0);
  assert.ok(await exports.get(`exports/${subjectId}/existing.json`));
  assert.equal((await sql('SELECT status FROM identity.users WHERE id=$1', [subjectId])).rows[0].status, 'deleted');
  await storage('ready');
  await savePreferences(subjectId);
  await completed('export', exported);
  assert.equal((await (await exports.get(key(exported))).json()).profile.presentation_preferences.version, 7);
  await completed('delete', deleted);
  assert.deepEqual(await preferences(subjectId), defaults);
  assert.equal(await exports.get(`exports/${subjectId}/existing.json`), null);
});

test('legal hold blocks the native deletion before preference reset and R2 purge', async () => {
  await storage('ready');
  const subjectId = await subject();
  await savePreferences(subjectId);
  await sql("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic workflow legal hold')", [uuidv7(), subjectId]);
  const exports = await fixture.bucket('PRIVATE_EXPORTS');
  await exports.put(`exports/${subjectId}/held.json`, 'Synthetic held export');
  const deleted = await request(subjectId, 'delete');
  const start = fixture.steps.length;
  const status = await fixture.run('delete', deleted);
  assert.equal(status.status, 'complete', JSON.stringify(status));
  assert.deepEqual(status.output, { subjectId, state: 'blocked' });
  await assertNoCompletion(deleted);
  assert.equal((await sql('SELECT state FROM privacy.requests WHERE id=$1', [deleted.requestId])).rows[0].state, 'blocked');
  assert.deepEqual(await preferences(subjectId), saved);
  assert.ok(await exports.get(`exports/${subjectId}/held.json`));
  assert.ok(!fixture.steps.slice(start).some(s => s.name === 'reset-presentation-preferences'));
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.deletion_tombstones WHERE subject_id=$1', [subjectId])).rows[0].count, 0);
  assert.equal((await sql("SELECT count(*)::integer AS count FROM feed.notifications WHERE recipient_id=$1 AND notification_type='privacy.deletion_blocked'", [subjectId])).rows[0].count, 1);
});

test('stored private and pending biographies stay owner-bound in the complete native export', async () => {
  await storage('absent');
  const otherId = await subject();
  const otherBio = 'Other member’s synthetic private biography — excluded';
  await sql("UPDATE social.profiles SET bio=$2,public_visibility=false,moderation_state='under_review' WHERE user_id=$1", [otherId, otherBio]);
  const exports = await fixture.bucket('PRIVATE_EXPORTS');
  for (const [state, visible] of [['under_review', true], ['under_review', false], ['blocked', false], ['allowed', false]]) {
    const subjectId = await subject();
    const bio = `This member’s stored biography: ${state}.\nPrivate text remains in the owner's export.`;
    await sql('UPDATE social.profiles SET bio=$2,moderation_state=$3,public_visibility=$4 WHERE user_id=$1', [subjectId, bio, state, visible]);
    const exported = await request(subjectId, 'export');
    await completed('export', exported);
    const body = await (await exports.get(key(exported))).text();
    const passport = JSON.parse(body);
    assert.equal(passport.profile.id, subjectId);
    assert.equal(passport.profile.bio, bio);
    assert.equal(passport.profile.presentation_preferences, null);
    assert.ok(!body.includes(otherBio));
    assert.ok(!body.includes(otherId));
  }
  assert.equal((await sql('SELECT bio FROM social.profiles WHERE user_id=$1', [otherId])).rows[0].bio, otherBio);
});

test('missing profile exports null biography; empty text and canonical NOT NULL remain distinct', async () => {
  await storage('absent');
  const subjectId = await subject();
  await sql('DELETE FROM social.profiles WHERE user_id=$1', [subjectId]);
  const exported = await request(subjectId, 'export');
  await completed('export', exported);
  const exports = await fixture.bucket('PRIVATE_EXPORTS');
  const missing = await (await exports.get(key(exported))).json();
  assert.equal(missing.profile.id, subjectId);
  assert.equal(missing.profile.bio, null);
  assert.equal(missing.privateProfile, null);
  const emptyId = await subject();
  await assert.rejects(sql('UPDATE social.profiles SET bio=NULL WHERE user_id=$1', [emptyId]), error => error.code === '23502');
  assert.equal((await sql('SELECT bio FROM social.profiles WHERE user_id=$1', [emptyId])).rows[0].bio, 'Synthetic saved biography');
  await sql("UPDATE social.profiles SET bio='' WHERE user_id=$1", [emptyId]);
  const emptyExport = await request(emptyId, 'export');
  await completed('export', emptyExport);
  assert.equal((await (await exports.get(key(emptyExport))).json()).profile.bio, '');
});
