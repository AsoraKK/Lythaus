import assert from 'node:assert/strict';
import test from 'node:test';
import { APPROVED_MIGRATIONS, EXPECTED_MIGRATION_BYTES, EXPECTED_MIGRATION_SET_SHA256, loadApprovedMigrations } from '../ci/planetscale-migration-manifest.mjs';
import { assertMigrationDataPreconditions, classifyArtifacts, exactRegistryPrefix, incrementalMigrationNames, incrementalRegistryHead } from '../ci/planetscale-migration-reconciliation.mjs';

test('loads the immutable canonical migration payload and checksum set', () => {
  const manifest = loadApprovedMigrations();
  assert.equal(manifest.migrations.length, 14);
  assert.equal(manifest.bytes, EXPECTED_MIGRATION_BYTES);
  assert.equal(manifest.checksum, EXPECTED_MIGRATION_SET_SHA256);
  assert.equal(manifest.migrations.at(-1)?.name, '0013_marketing_waitlist.sql');
});

test('classifies catalog evidence without treating a partial state as applied', () => {
  assert.equal(classifyArtifacts([{ present: false }, { present: false }]), 'NOT_APPLIED');
  assert.equal(classifyArtifacts([{ present: true }, { present: true }]), 'FULLY_APPLIED');
  assert.equal(classifyArtifacts([{ present: true }, { present: false }]), 'PARTIALLY_APPLIED');
});

test('permits incremental release and resume only from an exact canonical prefix', () => {
  const prefix = APPROVED_MIGRATIONS.slice(0, 9).map(({ name, appliedSha256 }) => ({ version: name, checksum: appliedSha256 }));
  assert.equal(exactRegistryPrefix(prefix, '0008_legacy_relink_status.sql'), true);
  assert.equal(incrementalRegistryHead(prefix), '0008_legacy_relink_status.sql');
  assert.equal(exactRegistryPrefix([...prefix, { version: '0013_marketing_waitlist.sql', checksum: 'unexpected' }], '0008_legacy_relink_status.sql'), false);
  assert.deepEqual(incrementalMigrationNames(), APPROVED_MIGRATIONS.slice(9).map(({ name }) => name));
  for (let length = 10; length <= APPROVED_MIGRATIONS.length; length += 1) {
    const resumable = APPROVED_MIGRATIONS.slice(0, length).map(({ name, appliedSha256 }) => ({ version: name, checksum: appliedSha256 }));
    assert.equal(incrementalRegistryHead(resumable), APPROVED_MIGRATIONS[length - 1].name);
    assert.deepEqual(incrementalMigrationNames(resumable.at(-1).version), APPROVED_MIGRATIONS.slice(length).map(({ name }) => name));
  }
  assert.equal(incrementalRegistryHead([...prefix, { version: '0009_cost_budget_enforcement.sql', checksum: 'unexpected' }]), null);
});

test('waitlist migration commits retention and legal-hold safeguards', async () => {
  const source = (await import('node:fs/promises')).readFile('database/planetscale/migrations/0013_marketing_waitlist.sql', 'utf8');
  const sql = await source;
  for (const required of ['purge_after', 'retention_hold', 'retention_hold_at', 'retention_hold_released_at', 'waitlist_signups_due_purge_idx']) {
    assert.match(sql, new RegExp(required));
  }
  assert.doesNotMatch(sql, /plain(?:text)?_?email/i);
});

test('production runner preserves immutable registry history', async () => {
  const source = await (await import('node:fs/promises')).readFile('scripts/ci/apply-planetscale-production-migrations.mjs', 'utf8');
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /ON CONFLICT \(version\) DO NOTHING/);
  assert.doesNotMatch(source, /DO UPDATE SET checksum/);
  assert.match(source, /incrementalRegistryHead\(registry\)/);
  assert.match(source, /classifyMigrationState/);
  assert.match(source, /recordFullyAppliedMigration/);
  assert.match(source, /verifyWaitlistPrivileges/);
  assert.match(source, /statement_timeout = '15min'/);
});

test('migration data preconditions reject unresolved open-appeal conflicts only', () => {
  assert.doesNotThrow(() => assertMigrationDataPreconditions({ duplicate_open_appeal_keys: 0 }));
  assert.throws(() => assertMigrationDataPreconditions({ duplicate_open_appeal_keys: 1 }), /open-appeal reconciliation/);
});
