import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedMigrationPrefix } from '../ci/planetscale-migration-manifest.mjs';
import {
  assess0021RegistryState,
  assessCompatibilityDeploymentEvidence,
  assessCompatibilityWiring,
  assessOperatorCostEstimate,
  assessPlanetScaleBackupEvidence,
  MIGRATION_0020,
  MIGRATION_0021,
} from '../ci/planetscale-0021-only-contract.mjs';

const registryThrough = (version) => expectedMigrationPrefix(version).map(({ name, appliedSha256 }) => ({ version: name, checksum: appliedSha256 }));
const validBranch = {
  id: 'main-branch-id', name: 'main', kind: 'postgresql', state: 'ready', ready: true,
  production: true, deleted_at: null, deletion_protected: true,
  restore_checklist_completed_at: '2026-10-16T12:00:00.000Z',
};
const validBackup = {
  id: 'backup-123', state: 'success', created_at: '2026-10-16T13:00:00.000Z',
  completed_at: '2026-10-16T13:10:00.000Z', expires_at: '2026-11-16T13:10:00.000Z',
  deleted_at: null, protected: true,
  database_branch: { id: 'main-branch-id', name: 'main', deleted_at: null },
};

test('accepts only fresh, protected backup evidence for the ready protected production main branch', () => {
  const evidence = assessPlanetScaleBackupEvidence({ branch: validBranch, backup: validBackup, backupId: validBackup.id, now: Date.parse('2026-10-17T00:00:00Z') });
  assert.equal(evidence.ok, true);
  assert.equal(evidence.branch.restoreChecklistSemantics.includes('does not prove a restore test'), true);
  for (const override of [
    { branch: { ...validBranch, production: false } },
    { branch: { ...validBranch, deleted_at: undefined } },
    { branch: { ...validBranch, restore_checklist_completed_at: null } },
    { backup: { ...validBackup, state: 'running' } },
    { backup: { ...validBackup, expires_at: '2026-10-16T23:59:59Z' } },
    { backup: { ...validBackup, protected: false } },
    { backup: { ...validBackup, database_branch: { ...validBackup.database_branch, name: 'development' } } },
  ]) {
    const result = assessPlanetScaleBackupEvidence({ branch: override.branch ?? validBranch, backup: override.backup ?? validBackup, backupId: validBackup.id, now: Date.parse('2026-10-17T00:00:00Z') });
    assert.equal(result.ok, false);
  }
});

test('requires an operator estimate with reference at or below a positive review ceiling', () => {
  assert.equal(assessOperatorCostEstimate({ estimateUsd: '0.12', reference: 'operator note 2026-10-17', ceilingUsd: '1.00' }).ok, true);
  assert.equal(assessOperatorCostEstimate({ estimateUsd: '1.01', reference: 'estimate', ceilingUsd: '1.00' }).blockers.includes('operator_cost_estimate_exceeds_ceiling'), true);
  assert.equal(assessOperatorCostEstimate({ estimateUsd: '0.12', reference: 'estimate', ceilingUsd: '0' }).ok, false);
  assert.equal(assessOperatorCostEstimate({ estimateUsd: '', reference: '', ceilingUsd: '1.00' }).ok, false);
});

test('requires exact registry prefixes and only allows safe staged states to resume 0021', () => {
  assert.equal(MIGRATION_0020, '0020_auth_recovery_delivery.sql');
  assert.equal(MIGRATION_0021, '0021_media_quarantine_cleanup.sql');
  for (const stage of ['NOT_APPLIED', 'COLUMN_ONLY', 'INVALID_INDEX_RETRYABLE']) {
    assert.deepEqual(assess0021RegistryState(registryThrough(MIGRATION_0020), stage), { state: stage, ok: true, needsApply: true, blockers: [] });
  }
  assert.deepEqual(assess0021RegistryState(registryThrough(MIGRATION_0021), 'FULLY_APPLIED'), { state: 'COMPLETE', ok: true, needsApply: false, blockers: [] });
  assert.equal(assess0021RegistryState(registryThrough(MIGRATION_0020), 'FULLY_APPLIED').state, 'UNRECORDED_DDL');
  assert.equal(assess0021RegistryState(registryThrough(MIGRATION_0020).slice(0, -1), 'NOT_APPLIED').state, 'REGISTRY_PREFIX_MISMATCH');
  assert.equal(assess0021RegistryState(registryThrough(MIGRATION_0020), 'INVALID_INDEX_ACTIVE').ok, false);
  const forged = registryThrough(MIGRATION_0020);
  forged.at(-1).checksum = '0'.repeat(64);
  assert.equal(assess0021RegistryState(forged, 'NOT_APPLIED').ok, false);
});

test('requires an exact compatible worker source SHA and deployment run URL for protected review', () => {
  assert.equal(assessCompatibilityDeploymentEvidence({ releaseSha: 'a'.repeat(40), deploymentRunUrl: 'https://github.com/AsoraKK/Lythaus/actions/runs/117332044313' }).ok, true);
  assert.equal(assessCompatibilityDeploymentEvidence({ releaseSha: '3880', deploymentRunUrl: 'https://github.com/AsoraKK/Lythaus/actions/runs/117332044313' }).ok, false);
  assert.equal(assessCompatibilityDeploymentEvidence({ releaseSha: 'a'.repeat(40), deploymentRunUrl: 'https://example.com/run/1' }).ok, false);
});

test('blocks until all four Worker configs and release probes carry the exact 0020 plus 0021 tuple set', () => {
  const expectedIdentities = [
    { schemaVersion: MIGRATION_0020, schemaFingerprint: '0'.repeat(64), relationCount: 103 },
    { schemaVersion: MIGRATION_0021, schemaFingerprint: '1'.repeat(64), relationCount: 103 },
  ];
  const missing = assessCompatibilityWiring({
    workerConfigs: { public: { vars: {} }, admin: { vars: {} }, jobs: { vars: {} }, coordinator: { vars: {} } },
    probeFiles: { native: '', production: '', probe: '' },
    expectedIdentities,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.blockers.filter((item) => item.startsWith('worker_config_allowlist_missing_or_mismatched:')).length, 4);
  assert.equal(missing.blockers.filter((item) => item.startsWith('release_probe_allowlist_missing:')).length, 3);

  const expectedJson = JSON.stringify(expectedIdentities);
  const wired = assessCompatibilityWiring({
    workerConfigs: Object.fromEntries(['public', 'admin', 'jobs', 'coordinator'].map((name) => [name, { vars: { EXPECTED_DATABASE_SCHEMA_IDENTITIES_JSON: expectedJson } }])),
    probeFiles: { native: 'EXPECTED_DATABASE_SCHEMA_IDENTITIES_JSON', production: 'EXPECTED_DATABASE_SCHEMA_IDENTITIES_JSON', probe: 'EXPECTED_DATABASE_SCHEMA_IDENTITIES_JSON' },
    expectedIdentities,
  });
  assert.deepEqual(wired.blockers, []);
  assert.equal(wired.ok, true);
});
