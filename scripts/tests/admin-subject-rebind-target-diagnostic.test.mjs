import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assessRebindInstallTarget } from '../ci/admin-subject-rebind-target-diagnostic.mjs';

const source = 'a'.repeat(40);
const host = 'synthetic.psdb.cloud';
const fingerprint = database => createHash('sha256').update(JSON.stringify({ scheme: 'postgres', host, port: 5432, database })).digest('hex');
const expected = { expectedMainOriginFingerprint: fingerprint('postgres') };
const environment = {
  RELEASE_SHA: source,
  PSCALE_ROLE_IDENTIFIERS: JSON.stringify({ lythaus_migrations: 'pscale_api_syntheticmigration' }),
  PLANETSCALE_ADMIN_DATABASE_URL: `postgresql://pscale_api_syntheticmigration.vqa2g2xc9wsl:synthetic-password@${host}/postgres?sslmode=verify-full`,
};
const assess = (changes = {}, pins = expected) => assessRebindInstallTarget({
  environment: { ...environment, ...changes }, expected: pins, generatedAt: '2026-11-14T00:00:00Z',
});

test('matching pins reveal only boolean checks, without connecting or claiming authority', () => {
  const result = assess();
  assert.equal(result.status, 'MATCHES_INSTALL_TARGET_PINS');
  assert.deepEqual(Object.values(result.checks), [true, true, true, true]);
  assert.deepEqual(result.blockers, []);
  for (const key of ['databaseConnections', 'databaseWrites', 'providerRequests', 'credentialsCreated', 'authorityAssessed', 'functionStateAssessed']) {
    assert.equal(result[key], false);
  }
  const output = JSON.stringify(result);
  for (const secret of ['synthetic-password', host, 'pscale_api_syntheticmigration', expected.expectedMainOriginFingerprint]) assert.ok(!output.includes(secret));
});

for (const [label, changes, pins, failed] of [
  ['branch', { PLANETSCALE_ADMIN_DATABASE_URL: environment.PLANETSCALE_ADMIN_DATABASE_URL.replace('.vqa2g2xc9wsl:', '.syntheticwrong:') }, expected, ['branchMatches']],
  ['database', { PLANETSCALE_ADMIN_DATABASE_URL: environment.PLANETSCALE_ADMIN_DATABASE_URL.replace('/postgres?', '/syntheticother?') }, { expectedMainOriginFingerprint: fingerprint('syntheticother') }, ['databaseMatches']],
  ['physical origin', { PLANETSCALE_ADMIN_DATABASE_URL: environment.PLANETSCALE_ADMIN_DATABASE_URL.replace(host, 'synthetic-other.psdb.cloud') }, expected, ['originMatches']],
  ['migration role', { PSCALE_ROLE_IDENTIFIERS: JSON.stringify({ lythaus_migrations: 'pscale_api_syntheticother' }) }, expected, ['migrationRoleMatches']],
]) {
  test(`rejects a ${label} mismatch independently`, () => {
    const result = assess(changes, pins);
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.blockers, failed);
    assert.equal(Object.values(result.checks).filter(value => value === false).length, 1);
  });
}

test('reports all failing pins without reflecting either configured value', () => {
  const result = assess({ PLANETSCALE_ADMIN_DATABASE_URL: 'postgresql://pscale_api_unapproved.wrongbranch:private-password@other.psdb.cloud/otherdb?sslmode=verify-full' });
  assert.deepEqual(Object.values(result.checks), [false, false, false, false]);
  const output = JSON.stringify(result);
  for (const value of ['unapproved', 'wrongbranch', 'private-password', 'other.psdb.cloud', 'otherdb']) assert.ok(!output.includes(value));
});

for (const raw of [undefined, '', 'invalid-secret-map', 'null', '[]', '{}', '{"lythaus_migrations":"private invalid role"}', '{"lythaus_migrations":["pscale_api_syntheticmigration"]}']) {
  test(`invalid role map fails without exposing input (${String(raw)})`, () => {
    const result = assess({ PSCALE_ROLE_IDENTIFIERS: raw });
    assert.deepEqual(result.blockers, ['canonical_migration_role_map_invalid']);
    assert.deepEqual(Object.values(result.checks), [null, null, null, null]);
    assert.ok(!JSON.stringify(result).includes('private invalid role'));
  });
}

for (const raw of [undefined, '', 'private-invalid-url', environment.PLANETSCALE_ADMIN_DATABASE_URL.replace('verify-full', 'disable'), environment.PLANETSCALE_ADMIN_DATABASE_URL + '&host=private-override']) {
  test('invalid connection input retains strict parser and emits only a fixed failure', () => {
    const result = assess({ PLANETSCALE_ADMIN_DATABASE_URL: raw });
    assert.deepEqual(result.blockers, ['existing_migration_connection_target_invalid']);
    assert.deepEqual(Object.values(result.checks), [null, null, null, null]);
    assert.ok(!JSON.stringify(result).includes('private-'));
  });
}

test('invalid source and committed pin cannot produce an affirmative result', () => {
  assert.deepEqual(assess({ RELEASE_SHA: 'private-source' }).blockers, ['release_sha_invalid']);
  assert.deepEqual(assess({}, {}).blockers, ['committed_main_origin_pin_invalid']);
});

test('CLI failure never emits connection material in stdout or stderr', () => {
  const child = spawnSync(process.execPath, ['scripts/ci/admin-subject-rebind-target-diagnostic.mjs'], {
    env: { ...process.env, ...environment, PLANETSCALE_ADMIN_DATABASE_URL: 'private-url-with-password' }, encoding: 'utf8',
  });
  assert.equal(child.status, 1);
  assert.deepEqual(JSON.parse(child.stdout).blockers, ['existing_migration_connection_target_invalid']);
  assert.equal(child.stderr, '');
  assert.ok(!child.stdout.includes('private-url-with-password'));
});
