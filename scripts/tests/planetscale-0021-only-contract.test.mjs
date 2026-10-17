import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedMigrationPrefix, loadApprovedMigrations } from '../ci/planetscale-migration-manifest.mjs';
import {
  assess0021RegistryState,
  assessOperatorCostEstimate,
  assessPlanetScaleBackupEvidence,
  is0021PlanReadyOutput,
  MIGRATION_0020,
  MIGRATION_0021,
  resolve0021BackupId,
  serialize0021PlanReadyOutput,
} from '../ci/planetscale-0021-only-contract.mjs';
import { classifyLocked0021State, recordCanonical0021RegistryMarker } from '../ci/planetscale-0021-registry-marker.mjs';
import { assertAdminDatabaseTarget, branchQualifiedDatabaseTarget, buildPlanetScaleTargetIdentity } from '../ci/planetscale-0021-target-identity.mjs';
import { applyMediaQuarantineMigration } from '../ci/planetscale-media-quarantine-migration.mjs';

const registryThrough = (version) => expectedMigrationPrefix(version).map(({ name, appliedSha256 }) => ({ version: name, checksum: appliedSha256 }));
const canonical0021 = () => loadApprovedMigrations().migrations.find(({ name }) => name === MIGRATION_0021);
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

test('uses a trimmed explicit backup ID and falls back to the configured production ID', () => {
  assert.equal(resolve0021BackupId(' backup-specific ', ' production-backup '), 'backup-specific');
  assert.equal(resolve0021BackupId('   ', ' production-backup '), 'production-backup');
  assert.equal(resolve0021BackupId(undefined, ' production-backup '), 'production-backup');
  assert.equal(resolve0021BackupId('  ', '  '), '');
});

test('requires exact registry prefixes and only allows safe staged states to resume 0021', () => {
  assert.equal(MIGRATION_0020, '0020_auth_recovery_delivery.sql');
  assert.equal(MIGRATION_0021, '0021_media_quarantine_cleanup.sql');
  for (const stage of ['NOT_APPLIED', 'COLUMN_ONLY', 'INVALID_INDEX_RETRYABLE']) {
    assert.deepEqual(assess0021RegistryState(registryThrough(MIGRATION_0020), stage), { state: stage, ok: true, needsApply: true, blockers: [] });
  }
  assert.deepEqual(assess0021RegistryState(registryThrough(MIGRATION_0021), 'FULLY_APPLIED'), { state: 'COMPLETE', ok: true, needsApply: false, blockers: [] });
  assert.deepEqual(assess0021RegistryState(registryThrough(MIGRATION_0020), 'FULLY_APPLIED'), {
    state: 'RECOVERY_REQUIRED', ok: true, needsApply: false, needsRecovery: true, blockers: [],
  });
  assert.deepEqual(classifyLocked0021State(registryThrough(MIGRATION_0020), 'FULLY_APPLIED'), { action: 'RECOVER_MARKER' });
  assert.deepEqual(classifyLocked0021State(registryThrough(MIGRATION_0021), 'FULLY_APPLIED'), { action: 'ALREADY_RECORDED' });
  for (const stage of ['NOT_APPLIED', 'COLUMN_ONLY', 'INVALID_INDEX_RETRYABLE']) {
    assert.deepEqual(classifyLocked0021State(registryThrough(MIGRATION_0020), stage), { action: 'APPLY_DDL' });
  }
  assert.equal(assess0021RegistryState(registryThrough(MIGRATION_0020).slice(0, -1), 'NOT_APPLIED').state, 'REGISTRY_PREFIX_MISMATCH');
  assert.deepEqual(classifyLocked0021State(registryThrough(MIGRATION_0020).slice(0, -1), 'FULLY_APPLIED'), {
    action: 'BLOCK', reason: '0021_registry_prefix_not_exact_through_0020',
  });
  const forgedLockedPrefix = registryThrough(MIGRATION_0020);
  forgedLockedPrefix.at(-1).checksum = '0'.repeat(64);
  assert.deepEqual(classifyLocked0021State(forgedLockedPrefix, 'FULLY_APPLIED'), {
    action: 'BLOCK', reason: '0021_registry_prefix_not_exact_through_0020',
  });
  assert.equal(assess0021RegistryState(registryThrough(MIGRATION_0020), 'INVALID_INDEX_ACTIVE').ok, false);
  const forged = registryThrough(MIGRATION_0020);
  forged.at(-1).checksum = '0'.repeat(64);
  assert.equal(assess0021RegistryState(forged, 'NOT_APPLIED').ok, false);
});

test('serializes readiness exactly as GitHub true/false strings and accepts only true', () => {
  const readyOutput = serialize0021PlanReadyOutput([]);
  const blockedOutput = serialize0021PlanReadyOutput(['backup_unavailable']);
  assert.equal(readyOutput, 'true');
  assert.equal(blockedOutput, 'false');
  assert.equal(is0021PlanReadyOutput(readyOutput), true);
  assert.equal(is0021PlanReadyOutput(blockedOutput), false);
  assert.equal(is0021PlanReadyOutput(''), false);
  assert.equal(is0021PlanReadyOutput('0'), false);
  assert.equal(is0021PlanReadyOutput('ready'), false);
  assert.equal(is0021PlanReadyOutput('TRUE'), false);
});

test('binds the planned target to the actual branch-qualified admin connection', () => {
  const connectionString = 'postgresql://admin.branch123@db.example:5432/lythaus-core?sslmode=verify-full';
  const actual = branchQualifiedDatabaseTarget(connectionString);
  const plannedTarget = buildPlanetScaleTargetIdentity({
    organization: 'lythaus',
    database: 'lythaus-core',
    branchName: 'main',
    branchId: actual.branchId,
    originFingerprint: actual.originFingerprint,
  });
  assert.deepEqual(assertAdminDatabaseTarget({
    connectionString,
    plannedTarget,
    session: { databaseName: 'lythaus-core', userName: 'admin.branch123' },
  }), { branchId: 'branch123', database: 'lythaus-core', originFingerprint: actual.originFingerprint });
  assert.throws(() => assertAdminDatabaseTarget({
    connectionString: 'postgresql://admin.branch999@db.example:5432/lythaus-core?sslmode=verify-full',
    plannedTarget,
    session: { databaseName: 'lythaus-core', userName: 'admin.branch999' },
  }), { message: 'admin_database_branch_id_mismatch' });
});

function createRegistryTestClient({ hideInsertedMarker = false } = {}) {
  const registry = registryThrough(MIGRATION_0020);
  const queries = [];
  let lockHeld = false;
  let transactionSnapshot = null;
  return {
    registry,
    queries,
    get lockHeld() { return lockHeld; },
    async query(sql, values = []) {
      queries.push(sql);
      if (sql === 'SELECT pg_try_advisory_lock(hashtext($1)) AS locked') {
        if (lockHeld) return { rows: [{ locked: false }] };
        lockHeld = true;
        return { rows: [{ locked: true }] };
      }
      if (sql === 'SELECT pg_advisory_unlock(hashtext($1))') {
        lockHeld = false;
        return { rows: [{ pg_advisory_unlock: true }] };
      }
      if (sql === 'BEGIN') {
        transactionSnapshot = registry.map((row) => ({ ...row }));
        return { rows: [] };
      }
      if (sql === 'COMMIT') {
        transactionSnapshot = null;
        return { rows: [] };
      }
      if (sql === 'ROLLBACK') {
        registry.splice(0, registry.length, ...transactionSnapshot.map((row) => ({ ...row })));
        transactionSnapshot = null;
        return { rows: [] };
      }
      if (sql.startsWith('SET ') || sql.startsWith('RESET ')) return { rows: [] };
      if (sql === "SELECT to_regclass('system.schema_migrations') AS registry") {
        return { rows: [{ registry: 'system.schema_migrations' }] };
      }
      if (sql === 'SELECT version, checksum FROM system.schema_migrations ORDER BY version') {
        const rows = registry.map((row) => ({ ...row }));
        return { rows: hideInsertedMarker && rows.at(-1)?.version === MIGRATION_0021 ? rows.slice(0, -1) : rows };
      }
      if (sql === 'INSERT INTO system.schema_migrations (version, checksum) VALUES ($1, $2)') {
        assert.equal(lockHeld, true);
        registry.push({ version: values[0], checksum: values[1] });
        return { rows: [] };
      }
      throw new Error('unexpected_test_query');
    },
  };
}

async function recoverRegistryMarker(client, { verifyPostconditions = async () => {} } = {}) {
  const migration = canonical0021();
  await applyMediaQuarantineMigration(client, migration, {
    beforeApply: async () => {
      assert.deepEqual(classifyLocked0021State(registryThrough(MIGRATION_0020), 'FULLY_APPLIED'), { action: 'RECOVER_MARKER' });
      return false;
    },
    afterVerified: async ({ applied }) => {
      assert.equal(applied, false);
      await recordCanonical0021RegistryMarker(client, migration, verifyPostconditions);
    },
    verifyPostconditions: async () => {},
  });
}

test('recovers only the canonical marker after exact verification under the existing advisory lock', async () => {
  const client = createRegistryTestClient();
  let verifications = 0;
  await recoverRegistryMarker(client, {
    verifyPostconditions: async () => {
      assert.equal(client.lockHeld, true);
      verifications += 1;
    },
  });
  assert.equal(verifications, 2);
  assert.deepEqual(client.registry, registryThrough(MIGRATION_0021));
  assert.equal(client.queries.filter((sql) => sql.startsWith('INSERT INTO system.schema_migrations')).length, 1);
  assert.equal(client.queries.some((sql) => sql.includes('ALTER TABLE') || sql.includes('CREATE INDEX') || sql.includes('DROP INDEX')), false);
  assert.ok(client.queries.indexOf('BEGIN') < client.queries.findIndex((sql) => sql.startsWith('INSERT INTO system.schema_migrations')));
  assert.ok(client.queries.indexOf('COMMIT') < client.queries.indexOf('SELECT pg_advisory_unlock(hashtext($1))'));
  assert.equal(client.lockHeld, false);
});

test('rolls back registry recovery when the in-transaction exact-postcondition check fails', async () => {
  const client = createRegistryTestClient();
  let verifications = 0;
  await assert.rejects(recoverRegistryMarker(client, {
    verifyPostconditions: async () => {
      verifications += 1;
      if (verifications === 2) throw new Error('injected_postcondition_failure');
    },
  }), { message: 'injected_postcondition_failure' });
  assert.equal(client.queries.includes('ROLLBACK'), true);
  assert.equal(client.queries.some((sql) => sql.startsWith('INSERT INTO system.schema_migrations')), false);
  assert.deepEqual(client.registry, registryThrough(MIGRATION_0020));
  assert.equal(client.lockHeld, false);
});

test('rolls back an inserted registry marker when the exact registry prefix cannot be confirmed', async () => {
  const client = createRegistryTestClient({ hideInsertedMarker: true });
  await assert.rejects(recoverRegistryMarker(client), { message: '0021_registry_marker_insert_did_not_create_exact_prefix' });
  assert.equal(client.queries.some((sql) => sql.startsWith('INSERT INTO system.schema_migrations')), true);
  assert.equal(client.queries.includes('ROLLBACK'), true);
  assert.deepEqual(client.registry, registryThrough(MIGRATION_0020));
  assert.equal(client.lockHeld, false);
});
