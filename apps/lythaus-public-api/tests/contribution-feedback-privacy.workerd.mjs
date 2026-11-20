import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { loadApprovedMigrations } from '../../../scripts/ci/planetscale-migration-manifest.mjs';
import { nativePostgresPrivacyWorkflowFixture } from './native-postgres-workflow-fixture.mjs';

const target = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? 'file:///missing');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.ok(target.pathname.startsWith('/lythaus_auth_test'));
const database = `lythaus_support_test_workflow_feedback_${uuidv7().replaceAll('-', '')}`;
const local = new URL(target); local.pathname = '/' + database;
let control, fixture, created = false;

before(async () => {
  const bootstrap = new pg.Client({ connectionString: target.toString(), ssl: false });
  await bootstrap.connect();
  try {
    assert.match((await bootstrap.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    await bootstrap.query(`CREATE DATABASE ${database}`);
    created = true;
  } finally { await bootstrap.end(); }
  control = new pg.Client({ connectionString: local.toString(), ssl: false });
  await control.connect();
  for (const migration of loadApprovedMigrations().migrations) await control.query(migration.contents.toString());
  await control.query(readFileSync('database/planetscale/grants/roles.sql', 'utf8'));
  await control.query(readFileSync('docs/proposals/contribution-feedback-schema.sql', 'utf8'));
  fixture = await nativePostgresPrivacyWorkflowFixture(local.toString());
});

after(async () => {
  await fixture?.dispose();
  await control?.end();
  if (created) {
    assert.match(database, /^lythaus_support_test_workflow_feedback_[a-f0-9]+$/);
    const bootstrap = new pg.Client({ connectionString: target.toString(), ssl: false });
    await bootstrap.connect();
    try { await bootstrap.query(`DROP DATABASE ${database} WITH (FORCE)`); }
    finally { await bootstrap.end(); }
  }
});

async function seed() {
  const subject = uuidv7(), other = uuidv7(), post = uuidv7(), otherPost = uuidv7(), comment = uuidv7(), requestId = uuidv7();
  for (const id of [subject, other]) await control.query("INSERT INTO identity.users(id,status) VALUES($1,'active')", [id]);
  for (const [id, author] of [[post, subject], [otherPost, other]]) {
    await control.query("INSERT INTO content.posts(id,author_id,body,declared_creation_mode,moderation_state,visibility) VALUES($1,$2,'synthetic','human','allowed','public')", [id, author]);
    await control.query("INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label) VALUES($1,'human','Human-authored')", [id]);
  }
  await control.query("INSERT INTO content.comments(id,post_id,author_id,body,declared_creation_mode,moderation_state,depth) VALUES($1,$2,$3,'synthetic','human','allowed',0)", [comment, otherPost, other]);
  await control.query(`INSERT INTO social.contribution_feedback(id,actor_id,post_id,comment_id,channel,value) VALUES
    ($1,$2,$3,NULL,'quality','like'), ($4,$2,NULL,$5,'emotion','sad'),
    ($6,$7,$8,NULL,'quality','dislike'), ($9,$7,$3,NULL,'emotion','angry')`,
  [uuidv7(), subject, otherPost, uuidv7(), comment, uuidv7(), other, post, uuidv7()]);
  await control.query("INSERT INTO social.reactions(user_id,post_id,reaction_type) VALUES($1,$2,'insightful')", [subject, otherPost]);
  await control.query("INSERT INTO privacy.requests(id,subject_id,request_type,state) VALUES($1,$2,'export','received')", [requestId, subject]);
  return { subject, other, post, otherPost, comment, requestId };
}

test('actual privacy export includes only the subject’s two channels and legacy reactions', async () => {
  const data = await seed();
  const result = await fixture.run('export', { subjectId: data.subject, requestId: data.requestId });
  assert.equal(result.status, 'complete', JSON.stringify(result));
  const object = await (await fixture.bucket('PRIVATE_EXPORTS')).get(`exports/${data.subject}/${data.requestId}.json`);
  assert.ok(object);
  const passport = await object.json();
  assert.equal(passport.profile.id, data.subject);
  assert.equal(passport.contributionFeedback.length, 2);
  assert.deepEqual(passport.contributionFeedback.map(row => [row.channel, row.value]).sort(), [['emotion', 'sad'], ['quality', 'like']]);
  assert.equal(passport.reactions.length, 1);
  assert.equal(passport.reactions[0].reaction_type, 'insightful');
  assert.ok(passport.contributionFeedback.every(row => !('actor_id' in row)));
  assert.equal(passport.subjectDataLocations.filter(row => row.resource_reference === 'social.contribution_feedback').length, 2);
});

test('actual account deletion removes the subject’s and their content’s feedback only', async () => {
  const data = await seed();
  const deletion = uuidv7();
  await control.query("INSERT INTO privacy.requests(id,subject_id,request_type,state) VALUES($1,$2,'delete','received')", [deletion, data.subject]);
  const result = await fixture.run('delete', { subjectId: data.subject, requestId: deletion });
  assert.equal(result.status, 'complete', JSON.stringify(result));
  assert.equal((await control.query('SELECT status FROM identity.users WHERE id=$1', [data.subject])).rows[0].status, 'deleted');
  const remaining = await control.query('SELECT actor_id,post_id,comment_id,channel,value FROM social.contribution_feedback WHERE actor_id IN ($1,$2)', [data.subject, data.other]);
  assert.deepEqual(remaining.rows, [{ actor_id: data.other, post_id: data.otherPost, comment_id: null, channel: 'emotion', value: 'angry' }]);
  assert.equal((await control.query('SELECT 1 FROM social.reactions WHERE user_id=$1', [data.subject])).rowCount, 0);
});

test('missing feedback privileges prevent partial export and deletion', async () => {
  const data = await seed();
  const deletion = uuidv7();
  await control.query("INSERT INTO privacy.requests(id,subject_id,request_type,state) VALUES($1,$2,'delete','received')", [deletion, data.subject]);
  await control.query('REVOKE SELECT ON social.contribution_feedback FROM lythaus_jobs');
  try {
    const exportResult = await fixture.run('export', { subjectId: data.subject, requestId: data.requestId });
    assert.equal(exportResult.status, 'errored', JSON.stringify(exportResult));
    assert.equal(await (await fixture.bucket('PRIVATE_EXPORTS')).get(`exports/${data.subject}/${data.requestId}.json`), null);
    const deleteResult = await fixture.run('delete', { subjectId: data.subject, requestId: deletion });
    assert.equal(deleteResult.status, 'errored', JSON.stringify(deleteResult));
    assert.equal((await control.query('SELECT count(*)::integer AS n FROM social.contribution_feedback WHERE actor_id=$1', [data.subject])).rows[0].n, 2);
    assert.equal((await control.query('SELECT body FROM content.posts WHERE id=$1', [data.post])).rows[0].body, 'synthetic');
  } finally { await control.query('GRANT SELECT ON social.contribution_feedback TO lythaus_jobs'); }
  const retry = await fixture.run('delete', { subjectId: data.subject, requestId: deletion });
  assert.equal(retry.status, 'complete', JSON.stringify(retry));
  assert.equal((await control.query('SELECT count(*)::integer AS n FROM social.contribution_feedback WHERE actor_id=$1', [data.subject])).rows[0].n, 0);
});
