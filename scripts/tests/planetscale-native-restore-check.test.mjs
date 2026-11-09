import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import fs from 'node:fs';
import { RESTORE, ROLE_NAMES, ACTIONS, CREATE_TARGET_BODY, ROLE_SQL_SECURITY_BASELINE,
  ROLE_SQL_MEMBERSHIP_BASELINE, RestoreApi, RestoreCleanupApi, RestoreFailure, approvalRecord, checkBackup, checkBranch,
  checkedRoles, assertRestoreRoleSqlBaseline, apiBase, requireResetPermissions } from '../ci/planetscale-native-restore-contract.mjs';
import { runNativeRestore, githubReadiness, assertPinnedManualCleanupProof } from '../ci/planetscale-native-restore-check.mjs';
import { restoredConnection, readOnly, collectRestoreCatalog, inspectExtensionAuthority, installMissingExtensions, restoreCatalogDigest } from '../ci/planetscale-native-restore-verifier.mjs';
import { buildRestoreSmoke, runRestoreSmoke } from '../ci/planetscale-native-restore-smoke.mjs';
import { branchQualifiedDatabaseTarget } from '../ci/planetscale-0021-target-identity.mjs';
import { checkSetupWindow, DEPENDENCY_SETUP_RESERVE_MS } from '../ci/planetscale-native-restore-admission.mjs';
import { expectedMigrationPrefix } from '../ci/planetscale-migration-manifest.mjs';
import { canonicalReleaseSchemaContract } from '../ci/product-integrity-schema-contract.mjs';
import { syntheticRun12Metadata } from './planetscale-native-restore-run12-fixture.mjs';

const instant = Date.parse(RESTORE.backupCompletedAt) + 90 * 60000;
const time = minutes => new Date(instant + minutes * 60000).toISOString();
const sha = 'a'.repeat(40), newId = 'newrestore123', password = 'synthetic-secret-never-output';
const environment = () => ({ RELEASE_SHA: sha, RESTORE_CHECK_EXECUTE: 'true', GITHUB_RUN_ID: '12345',
  PLANETSCALE_SCHEMA_READ_DATABASE_URL: `postgresql://pscale_api_qodocjs6vgrb.${RESTORE.sourceId}:${password}@aws.connect.psdb.cloud/postgres?sslmode=verify-full`,
  RESTORE_CHECK_APPROVAL_JSON: JSON.stringify({ releaseSha: sha, backupId: RESTORE.backupId, target: RESTORE.target,
    maximumUsd: 5, estimatedSubtotalUsd: 0.04, taxAndFeeAllowanceUsd: 1, backupSnapshotAcknowledged: true,
    reference: 'owner-specific-approval-reference', manualOperator: 'owner', expiresAt: time(240),
    cumulativeBudget: { operator: 'owner', priorQualificationRunId: '40212030891', evidenceSha256: 'e'.repeat(64),
      reference: 'synthetic-owner-reviewed-cost-upper-bound', priorSpendUpperBoundUsd: 0.01, priorRetentionUpperBoundUsd: 0.02,
      priorRetentionEndActionReference: 'synthetic-separate-prior-retention-end-action', priorRetentionEndsAt: time(23 * 60) },
    actions: ACTIONS, roles: ROLE_NAMES, cleanupPermit: { workflowId: 42, runNumber: 1 },
    reviewWindow: { reviewer: 'owner', operator: 'owner', reserved: true, availableFrom: time(-60), availableUntil: time(240) },
    retention: { operator: 'owner', reference: 'finite-retention-approval', manualEndActionApprovalReference: 'manual-decision-approval',
      endAction: 'separately_approved_manual_decision_no_automatic_unprotect', endsAt: time(23 * 60),
      decisionBy: time(60), estimatedUsd: 0.01 } }) });
const roleRows = (id = newId) => ROLE_NAMES.map((name, index) => ({ id: `role${index}`, base_username: name,
  access_host_url: 'aws.connect.psdb.cloud',
  username: `${name}.${id}`, database_name: 'postgres', ready: true, expired: false, deleted_at: null, disabled_at: null,
  dropped_at: null, expires_at: null, with_replication: name === RESTORE.setup, inherited_roles: ['pg_read_all_settings'],
  branch: { id, name: id === RESTORE.sourceId ? 'main' : RESTORE.target, deleted_at: null } }));
const target = () => ({ id: newId, name: RESTORE.target, created_at: time(0), deleted_at: null,
  default: false, production: true, kind: 'postgresql', restored_from_branch: { id: RESTORE.sourceId }, deletion_protected: false,
  cluster_name: RESTORE.cluster, cluster_architecture: 'aarch64', region: { slug: RESTORE.region }, replicas: 0,
  minimum_storage_bytes: RESTORE.bytes, maximum_storage_bytes: RESTORE.bytes, ready: true, state: 'ready', frozen: false });
const backup = () => ({ id: RESTORE.backupId, database_branch: { id: RESTORE.sourceId, name: 'main', deleted_at: null },
  state: 'success', deleted_at: null, protected: true, completed_at: RESTORE.backupCompletedAt,
  expires_at: time(48 * 60), pvc_size: RESTORE.bytes, uncompressed_size: 53237514, restored_branches: [] });
const extensionSpecifications = () => ['pg_trgm','pgcrypto','unaccent'].map(extname => ({ extname, extversion: '1.0',
  schema: 'public', owner: 'postgres', extrelocatable: true }));
const extensionPlanRows = (missing = ['unaccent']) => extensionSpecifications().map(row => ({ ...row,
  installed_version: missing.includes(row.extname) ? null : row.extversion, installed_schema: row.schema,
  installed_owner: row.owner, installed_relocatable: true, available_version: row.extversion,
  required_schema: null, relocatable: true, can_set_owner: true, can_create_database: true, can_create_schema: true, trusted: true }));
const baseline = () => ({ catalogSha256: 'b'.repeat(64), schemaFingerprint: 'c'.repeat(64), relationCount: 103,
  schemaVersion: '0020_auth_recovery_delivery.sql', approvedPrivilegeChecks: 17, extensionCount: 3,
  extensionSpecifications: extensionSpecifications() });

function fixture(mode = '') {
  const calls = [], checkpoints = [], b = backup(); let created = false, resets = 0, branchInventories = 0, clock = instant;
  const api = {
    authority: async () => { calls.push('authority'); if (mode === 'authority_denied') throw new RestoreFailure('provider_access_denied', 'DENIED'); },
    list: async path => {
      calls.push(`LIST ${path}`);
      if (path === '/branches') {
        branchInventories++;
        if (mode === 'target_found_before_create' && branchInventories === 2) return [target()];
        if (mode === 'previous_target_reappeared' && branchInventories === 2) return [{ id: 'gnbnmpsu7r5k', name: 'different-name' }];
        return mode === 'preexisting' ? [target()] : [];
      }
      const rows = roleRows(path.includes('/main/') ? RESTORE.sourceId : newId);
      if (mode === 'source_role_metadata_invalid' && path.includes('/main/')) rows[0].expires_at = 'synthetic-lifecycle-canary';
      if (mode === 'copied_role_mismatch' && !path.includes('/main/')) rows[2].base_username = 'unexpected';
      return rows;
    },
    request: async (path, options = {}) => {
      const method = options.method ?? 'GET'; calls.push(`${method} ${path}`);
      assert.notEqual(method, 'PATCH', 'qualification must never change backup protection');
      assert.notEqual(method, 'DELETE', 'qualification must never delete on any path');
      if (method === 'POST' && path === '/branches') {
        assert.equal(options.body.backup_id, RESTORE.backupId); assert.equal(options.body.storage.maximum_storage_bytes, RESTORE.bytes);
        assert.equal(Object.hasOwn(options.body, 'restore_point'), false);
        assert.equal(options.body.create_database_if_missing, false); created = true;
        if (mode === 'unknown_create') throw new RestoreFailure('provider_transport_failed', 'UNKNOWN_MUTATION_OUTCOME');
        b.restored_branches = [{ id: newId, name: RESTORE.target }];
        return { ...target(), ...(mode === 'wrong_config' ? { replicas: 2 } : {}) };
      }
      if (method === 'POST' && path.endsWith('/reset')) {
        resets++;
        if (mode === 'partial_reset' && resets === 2) throw new RestoreFailure('provider_transport_failed', 'UNKNOWN_MUTATION_OUTCOME');
        const row = roleRows().find(item => path.includes(`/${item.id}/reset`));
        return { ...row, password, access_host_url: 'aws.connect.psdb.cloud' };
      }
      if (path === '/branches/main') return { id: RESTORE.sourceId, name: 'main', kind: 'postgresql', default: true, deleted_at: null, ready: true };
      if (path.endsWith(`/backups/${RESTORE.backupId}`)) {
        if (mode === 'unprotected') b.protected = false;
        if (mode === 'stale') b.completed_at = time(-36 * 60);
        if (mode === 'completion_mismatch') b.completed_at = new Date(Date.parse(RESTORE.backupCompletedAt) + 60000).toISOString();
        if (mode === 'binding_mismatch' && created) b.restored_branches = [{ id: 'other', name: RESTORE.target }];
        if (mode === 'backup_target_history') b.restored_branches = [{ id: 'oldrestore', name: RESTORE.target }];
        return b;
      }
      if (path === `/branches/${RESTORE.target}`) {
        if (!created && options.absent === true) {
          if (mode === 'direct_target_present') return target();
          if (mode === 'direct_target_error') throw new RestoreFailure('provider_request_failed');
          return null;
        }
        return target();
      }
      throw new Error(`unexpected synthetic path ${path}`);
    },
  };
  const options = { environment: environment(), api, now: () => clock, assertMain: async () => { calls.push('main'); },
    reserveCleanup: async () => ({ workflowId: 42, runNumber: 1 }),
    reviewedOriginFingerprint: branchQualifiedDatabaseTarget(environment().PLANETSCALE_SCHEMA_READ_DATABASE_URL).originFingerprint,
    sleep: async () => {}, checkpoint: report => { checkpoints.push(report); }, prepareSmoke: async () => ({}),
    readSession: async (raw, branchId) => {
      calls.push(`SQL_READ ${branchId}`);
      return { ...baseline(), ...(mode === 'catalog_mismatch' && branchId === newId ? { catalogSha256: 'd'.repeat(64) } : {}) };
    }, extensionAuthority: async () => {
      calls.push('extension_authority');
      if (mode === 'extension_denied') throw new RestoreFailure('missing_extension_install_authority_unproven');
      return mode === 'missing_extensions' ? ['unaccent'] : [];
    }, installExtensions: async (_raw, id, missing) => { assert.equal(id, newId); assert.deepEqual(missing, ['unaccent']); calls.push('INSTALL unaccent'); },
    smoke: async () => { calls.push('actual_smoke_adapter'); return { readOnlyDatabaseIdentity: true, distinctRoles: 4 }; },
  };
  return { calls, checkpoints, options, setNow: value => { clock = value; } };
}

test('qualification restores the specified backup snapshot, exercises five copied credentials and retains target for review', async () => {
  const f = fixture(); f.options.assertMain = async () => ({ executionHistoryReconciliation: {
    status: 'PINNED_PRE_RUNNER_CANCELLATION_RECONCILED', runId: '40184823787' } });
  const report = await runNativeRestore(f.options);
  assert.equal(report.status, 'TARGET_CHECKS_PASSED_REVIEW_REQUIRED');
  assert.equal(report.cleanup, 'TARGET_RETAINED_PENDING_REVIEW'); assert.equal(report.createdTargetId, newId);
  assert.equal(report.state, 'TARGET_RETAINED_PENDING_REVIEW'); assert.equal(report.qualificationOutcome, 'PASSED');
  assert.equal(report.creation.acknowledged, true); assert.equal(report.credentialReferencesDiscarded, true);
  assert.equal(report.expectedTargetProduction, true); assert.equal(report.creation.production, true);
  assert.equal(report.backup.restoreMode, 'SPECIFIED_BACKUP_SNAPSHOT');
  assert.deepEqual(report.executionHistoryReconciliation, { status: 'PINNED_PRE_RUNNER_CANCELLATION_RECONCILED', runId: '40184823787',
    targetReconciliation: { databaseId: RESTORE.databaseId, sourceBranchId: RESTORE.sourceId, backupId: RESTORE.backupId,
      targetName: RESTORE.target, directGetReturnedNotFound: true,
      completeBranchInventoryExcludedTarget: true, backupRestoreHistoryExcludedTarget: true,
      checkedAt: new Date(instant).toISOString() } });
  assert.equal(report.credentialActions.length, 5); assert.equal(report.sourceBaseline.approvedPrivilegeChecks, 17);
  assert.equal(report.recoveryAcceptance, 'NOT_CERTIFIED'); assert.equal(report.deploymentAuthorized, false);
  assert.equal(f.calls.filter(value => value.startsWith('POST /branches')).length, 6);
  assert.equal(f.calls.filter(value => /^(DELETE|PATCH)/.test(value)).length, 0);
  assert.ok(f.calls.indexOf('extension_authority') < f.calls.indexOf(`POST /branches/${RESTORE.target}/roles/role1/reset`));
  assert.equal(JSON.stringify(f.checkpoints).includes(password), false);
  assert.doesNotMatch(JSON.stringify(f.checkpoints), /connectionString|postgresql:\/\/|access_host_url/);
});

function syntheticCatalog({ version = '0021_media_quarantine_cleanup.sql', registry, missingArtifact, absent = true, relations } = {}) {
  const queries = [], canonical = canonicalReleaseSchemaContract();
  const rows = registry ?? expectedMigrationPrefix(version).map(row => ({ version: row.name, checksum: row.appliedSha256 }));
  return { queries, query: async sql => {
    queries.push(sql);
    if (sql.includes('AS table_type,') && sql.includes('AS table_schema')) return { rows: relations ?? canonical.relations };
    if (sql.startsWith('SELECT version, checksum FROM system.schema_migrations')) return { rows };
    if (sql.includes('AS index_absent')) return { rows: [{ index_absent: absent, column_absent: absent }] };
    if (sql.includes('FROM pg_roles WHERE rolname')) return { rows: ROLE_NAMES.map(rolname => ({ rolname, ...ROLE_SQL_SECURITY_BASELINE[rolname] })) };
    if (sql.includes('FROM pg_auth_members a')) return { rows: ROLE_SQL_MEMBERSHIP_BASELINE.map(row => ({ ...row,
      grantor: 'postgres', admin_option: false, inherit_option: true, set_option: true })) };
    if (sql.includes('FROM pg_extension e')) return { rows: extensionSpecifications() };
    if (sql.includes('has_column_privilege(') || sql.includes('has_schema_privilege(')) return { rows: [{ permitted: true }] };
    const artifact = /\/\* migration-artifact:([^*]+) \*\//.exec(sql)?.[1];
    if (artifact || sql.includes(' AS present')) return { rows: [{ present: !missingArtifact || artifact !== missingArtifact }] };
    return { rows: [] };
  } };
}

test('synthetic catalog selects exact pre-0021 or post-0021 registry and strict postconditions', async () => {
  const pre = syntheticCatalog({ version: '0020_auth_recovery_delivery.sql' });
  const old = await collectRestoreCatalog(pre);
  assert.equal(old.schemaVersion, '0020_auth_recovery_delivery.sql');
  assert.equal(old.schemaFingerprint, 'd60ce56eda3165e4c21e880e594700b92425b75b0e6eec963caf75fc72d8c1e0');
  const post = syntheticCatalog(), current = await collectRestoreCatalog(post, 'post-0021');
  assert.equal(current.schemaVersion, '0021_media_quarantine_cleanup.sql');
  assert.equal(current.schemaFingerprint, '7fdff3474c152317336d2201626b3b69aac79387264e6481576e103f82e8342d');
  assert.notEqual(old.schemaFingerprint, current.schemaFingerprint);
  assert.equal(current.relationCount, 103);
  assert.ok(post.queries.some(sql => sql.includes('migration-artifact:column:media.upload_sessions.quarantine_deleted_at')));
  const column = post.queries.find(sql => sql.includes('migration-artifact:media_quarantine_marker_contract'));
  assert.match(column, /NOT attribute\.attnotnull/); assert.match(column, /default_value\.oid IS NULL/);
  const index = post.queries.find(sql => sql.includes('migration-artifact:media_upload_quarantine_cleanup_index'));
  for (const field of ['indisvalid', 'indisready', 'pg_get_indexdef', 'pg_get_expr', 'indnkeyatts']) assert.ok(index.includes(field));
  assert.ok(!post.queries.some(sql => sql.includes('AS index_absent')));
  await assert.rejects(() => collectRestoreCatalog(syntheticCatalog(), 'pre-0021'), /exact_pre_0021_registry_required/);
  await assert.rejects(() => collectRestoreCatalog(syntheticCatalog({ version: '0020_auth_recovery_delivery.sql' }), 'post-0021'), /exact_post_0021_registry_required/);
  await assert.rejects(() => collectRestoreCatalog(syntheticCatalog({ version: '0020_auth_recovery_delivery.sql', absent: false })), /0021_catalog_must_be_absent/);
});

test('synthetic post-0021 catalog rejects ledger drift, incomplete objects and relation drift', async () => {
  const good = expectedMigrationPrefix('0021_media_quarantine_cleanup.sql').map(row => ({ version: row.name, checksum: row.appliedSha256 }));
  const badChecksum = structuredClone(good); badChecksum.at(-1).checksum = '0'.repeat(64);
  for (const registry of [good.slice(0, -1), badChecksum, [...good, { version: '0022_unapproved.sql', checksum: 'a'.repeat(64) }]]) {
    await assert.rejects(() => collectRestoreCatalog(syntheticCatalog({ registry }), 'post-0021'), /exact_post_0021_registry_required/);
  }
  for (const missingArtifact of ['column:media.upload_sessions.quarantine_deleted_at', 'media_quarantine_marker_contract',
    'media_upload_quarantine_cleanup_index']) {
    await assert.rejects(() => collectRestoreCatalog(syntheticCatalog({ missingArtifact }), 'post-0021'),
      error => error.message.includes('canonical postcondition verification failed') && error.message.includes(missingArtifact));
  }
  await assert.rejects(() => collectRestoreCatalog(syntheticCatalog({ relations: canonicalReleaseSchemaContract().relations.slice(1) }), 'post-0021'),
    /restore_relation_contract_incomplete/);
  const invalid = syntheticCatalog();
  await assert.rejects(() => collectRestoreCatalog(invalid, 'automatic'), /restore_schema_mode_invalid/);
  assert.deepEqual(invalid.queries, []);
});

test('post-0021 workflow mode is explicitly approved and reaches every catalog and smoke stage', async () => {
  const f = fixture(), seen = [];
  f.options.environment.RESTORE_CHECK_SCHEMA_MODE = 'post-0021';
  const approval = JSON.parse(f.options.environment.RESTORE_CHECK_APPROVAL_JSON);
  approval.schemaMode = 'post-0021'; f.options.environment.RESTORE_CHECK_APPROVAL_JSON = JSON.stringify(approval);
  f.options.readSession = async (_raw, branchId, _role, work) => work({ branchId });
  f.options.readCatalog = async (client, mode) => {
    seen.push([client.branchId, mode]); return { ...baseline(), schemaVersion: '0021_media_quarantine_cleanup.sql' };
  };
  f.options.smoke = async (_connections, id, source) => {
    assert.equal(id, newId); assert.equal(source.schemaVersion, '0021_media_quarantine_cleanup.sql');
    return { readOnlyDatabaseIdentity: true, distinctRoles: 4 };
  };
  assert.equal(checkSetupWindow(f.options.environment, instant).mutationAuthorized, false);
  const report = await runNativeRestore(f.options);
  assert.equal(report.qualificationOutcome, 'PASSED'); assert.equal(report.schemaMode, 'post-0021');
  assert.equal(report.sourceBaseline.schemaVersion, '0021_media_quarantine_cleanup.sql');
  assert.equal(report.restoredVerification.schemaVersion, report.sourceBaseline.schemaVersion);
  assert.deepEqual(seen, [[RESTORE.sourceId, 'post-0021'], [RESTORE.sourceId, 'post-0021'],
    [newId, 'post-0021'], [RESTORE.sourceId, 'post-0021']]);
  assert.equal(report.recoveryAcceptance, 'NOT_CERTIFIED');
  const workflow = fs.readFileSync('.github/workflows/planetscale-native-restore-check.yml', 'utf8');
  assert.match(workflow, /schema_mode:[\s\S]*?default: pre-0021[\s\S]*?- pre-0021[\s\S]*?- post-0021/);
  assert.match(workflow, /RESTORE_CHECK_SCHEMA_MODE: \$\{\{ inputs\.schema_mode \}\}/);
});

test('wrong mode, unapproved mode and wrong source schema stop before provider calls or creation', async () => {
  for (const [mode, approved, expected] of [['bad', undefined, 'restore_schema_mode_invalid'],
    ['post-0021', undefined, 'approval_record_fields_invalid'], ['post-0021', 'pre-0021', 'approval_scope_mismatch'],
    ['pre-0021', 'post-0021', 'approval_record_fields_invalid']]) {
    const f = fixture(), record = JSON.parse(f.options.environment.RESTORE_CHECK_APPROVAL_JSON);
    f.options.environment.RESTORE_CHECK_SCHEMA_MODE = mode;
    if (approved !== undefined) record.schemaMode = approved;
    f.options.environment.RESTORE_CHECK_APPROVAL_JSON = JSON.stringify(record);
    const report = await runNativeRestore(f.options);
    assert.deepEqual(report.blockers, [expected]); assert.deepEqual(f.calls, []); assert.deepEqual(report.providerMutations, []);
  }
  const f = fixture(), record = JSON.parse(f.options.environment.RESTORE_CHECK_APPROVAL_JSON);
  f.options.environment.RESTORE_CHECK_SCHEMA_MODE = 'post-0021'; record.schemaMode = 'post-0021';
  f.options.environment.RESTORE_CHECK_APPROVAL_JSON = JSON.stringify(record);
  const report = await runNativeRestore(f.options);
  assert.deepEqual(report.blockers, ['source_restore_schema_mode_mismatch']);
  assert.equal(report.createdTargetId, null); assert.deepEqual(report.providerMutations, []);
  assert.ok(!f.calls.some(call => call.startsWith('POST ')));
  let clientCreated = false;
  await assert.rejects(() => readOnly(f.options.environment.PLANETSCALE_SCHEMA_READ_DATABASE_URL, newId,
    branchQualifiedDatabaseTarget(f.options.environment.PLANETSCALE_SCHEMA_READ_DATABASE_URL).role,
    () => {}, () => { clientCreated = true; }), /sql_connection_target_mismatch/);
  assert.equal(clientCreated, false);
});

test('post-0021 target and final source schema drift prevent qualification', async () => {
  for (const drift of ['target', 'source_readback']) {
    const f = fixture(), record = JSON.parse(f.options.environment.RESTORE_CHECK_APPROVAL_JSON);
    f.options.environment.RESTORE_CHECK_SCHEMA_MODE = 'post-0021'; record.schemaMode = 'post-0021';
    f.options.environment.RESTORE_CHECK_APPROVAL_JSON = JSON.stringify(record);
    let sourceReads = 0;
    f.options.readSession = async (_raw, branchId, _role, work) => work({ branchId });
    f.options.readCatalog = async (client, mode) => {
      assert.equal(mode, 'post-0021');
      if (client.branchId === RESTORE.sourceId) sourceReads++;
      const wrong = drift === 'target' && client.branchId === newId
        || drift === 'source_readback' && client.branchId === RESTORE.sourceId && sourceReads === 3;
      return { ...baseline(), schemaVersion: wrong ? '0020_auth_recovery_delivery.sql' : '0021_media_quarantine_cleanup.sql' };
    };
    const report = await runNativeRestore(f.options);
    assert.equal(report.qualificationOutcome, 'FAILED'); assert.equal(report.recoveryAcceptance, 'NOT_CERTIFIED');
    assert.deepEqual(report.blockers, [drift === 'target' ? 'restored_catalog_registry_acl_or_grants_mismatch' : 'source_metadata_changed_during_restore']);
    if (drift === 'target') {
      assert.equal(report.credentialActions.length, 1);
      assert.ok(!f.calls.includes('actual_smoke_adapter'));
    }
  }
});

test('pinned history plus source-role metadata failure stays pre-mutation and emits shape-only diagnostics', async () => {
  const f = fixture('source_role_metadata_invalid');
  f.options.assertMain = async () => ({ executionHistoryReconciliation: { status: 'PINNED_PRIOR_EXECUTIONS_RECONCILED',
    pinnedExecutions: [{ runId: '40184823787' }, { runId: '40193991312' }] } });
  const report = await runNativeRestore(f.options);
  assert.equal(report.blockers[0], 'copied_role_metadata_invalid');
  assert.deepEqual(report.providerMutations, []); assert.deepEqual(report.credentialActions, []);
  assert.equal(report.createdTargetId, null); assert.equal(report.cleanup, 'NOT_NEEDED');
  assert.equal(report.executionHistoryReconciliation.pinnedExecutions[1].runId, '40193991312');
  assert.deepEqual(report.roleMetadataDiagnostic.role.fields.expiresAtNull,
    { present: true, type: 'STRING', expected: 'NULL', matches: false });
  assert.doesNotMatch(JSON.stringify(report), /synthetic-lifecycle-canary|synthetic-secret-never-output/);
  assert.ok(f.calls.every(value => !/^(POST|PATCH|DELETE) /.test(value)));
});

test('the mutation cutoff is rechecked after awaited preflight and checkpoint work immediately before POST', async () => {
  const f = fixture();
  f.options.checkpoint = report => {
    f.checkpoints.push(report);
    if (report.providerMutations.at(-1)?.action === 'create_fixed_restore'
      && report.providerMutations.at(-1)?.outcome === 'PENDING_OR_UNKNOWN') {
      f.setNow(instant + RESTORE.qualificationStopMs);
    }
  };
  const report = await runNativeRestore(f.options);
  assert.ok(report.blockers.includes('qualification_phase_review_reserve_reached'));
  assert.equal(report.providerMutations.at(-1)?.action, 'create_fixed_restore');
  assert.equal(report.providerMutations.at(-1)?.outcome, 'BLOCKED');
  assert.equal(report.createdTargetId, null);
  assert.equal(report.cleanup, 'NOT_NEEDED');
  assert.equal(f.calls.filter(value => /^(POST|PATCH|DELETE) /.test(value)).length, 0);
});

test('restore catalog digest binds schema, view, function-security and extension ownership metadata', () => {
  const baseline = {
    sections: {
      schemaOwnership: [{ schema: 'privacy', owner: 'lythaus_migrations' }],
      relations: [{ table_type: 'VIEW', table_schema: 'privacy', table_name: 'safe_view', owner: 'lythaus_migrations',
        reloptions: ['security_barrier=true'], view_definition: 'SELECT id FROM privacy.requests' }],
      functions: [{ schema: 'privacy', proname: 'safe_fn', arguments: '', definition: 'CREATE FUNCTION ...',
        owner: 'lythaus_migrations', security_definer: false, acl_is_null: false,
        acl_entries: [{ grantor: 'lythaus_migrations', grantee: 'lythaus_runtime', privilege: 'EXECUTE', grantable: false }] }],
    },
    migrations: [{ version: '0020_auth_recovery_delivery.sql', checksum: 'a'.repeat(64) }],
    roles: [{ rolname: 'lythaus_runtime', rolsuper: false }], members: [],
    extensions: [{ extname: 'pgcrypto', extversion: '1.3', schema: 'public', owner: 'postgres', extrelocatable: true }],
  };
  const digest = restoreCatalogDigest(baseline);
  const mutations = [
    value => { value.sections.schemaOwnership[0].owner = 'postgres'; },
    value => { value.sections.relations[0].reloptions = ['security_barrier=false']; },
    value => { value.sections.relations[0].view_definition = 'SELECT id FROM identity.users'; },
    value => { value.sections.functions[0].owner = 'postgres'; },
    value => { value.sections.functions[0].security_definer = true; },
    value => { value.sections.functions[0].acl_entries[0].grantee = 'PUBLIC'; },
    value => { value.extensions[0].schema = 'extensions'; },
    value => { value.extensions[0].owner = 'lythaus_migrations'; },
    value => { value.extensions[0].extrelocatable = false; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(baseline); mutate(changed);
    assert.notEqual(restoreCatalogDigest(changed), digest);
  }
});

test('readiness smoke uses sequential Miniflare groups with unique Hyperdrive proxy names', async () => {
  const branchId = newId;
  const connections = Object.fromEntries(['runtime','admin','jobs','privacy'].map(name => [name,
    restoredConnection({ ...roleRows().find(row => row.base_username === RESTORE[name]), password,
      access_host_url: 'aws.connect.psdb.cloud' }, branchId, RESTORE[name])]));
  const groups = []; let active = 0;
  const runtimeFactory = options => {
    assert.equal(active, 0, 'Miniflare groups must not overlap');
    const names = options.workers.map(worker => worker.name), bindings = options.workers.flatMap(worker => Object.keys(worker.hyperdrives ?? {}));
    assert.equal(new Set(bindings).size, bindings.length, 'each in-runtime TLS proxy name must be unique');
    active++;
    const current = { names, disposed: false };
    groups.push(current);
    return {
      getWorker: async name => ({ fetch: async () => {
        const row = { readiness: 'pass', readyForAuthentication: false, schemaFingerprint: baseline().schemaFingerprint,
          schemaVersion: baseline().schemaVersion, databaseEnvironment: RESTORE.target, relationCount: baseline().relationCount };
        const body = name === 'public' ? row : { readiness: 'pass', databases: { primary: row, privacy: row },
          ...(name === 'admin' ? { emailBinding: { bindingVerified: true } } : {}) };
        return Response.json(body, { status: 200 });
      } }),
      dispose: async () => { current.disposed = true; active--; },
    };
  };
  const result = await runRestoreSmoke(connections, branchId, baseline(), {}, runtimeFactory);
  assert.deepEqual(groups.map(group => group.names), [['public', 'admin'], ['jobs']]);
  assert.ok(groups.every(group => group.disposed));
  assert.equal(active, 0);
  assert.equal(result.isolatedHyperdriveRuntimeGroups, 2);
  assert.equal(result.readOnlyDatabaseIdentity, true);
  assert.equal(result.readyForProductionAuthentication, false);
});

test('real Miniflare TLS proxies dispose and let success and abort subprocesses exit naturally', { timeout: 65000 }, async () => {
  const requireUrl = JSON.stringify(new URL('../../node_modules/wrangler/package.json', import.meta.url).href);
  const common = `
    const { createRequire } = require('node:module');
    const req = createRequire(${requireUrl});
    const { Miniflare, convertV4MiniflareOptions, Log, LogLevel } = req('miniflare');
    const url = 'postgresql://fixture:never-used@127.0.0.1:5432/postgres?sslmode=verify-full';
    const log = new Log(LogLevel.NONE);
    const worker = (name, script, hyperdrives) => ({ name, modules: true, script,
      compatibilityDate: '2026-08-01', hyperdrives });
  `;
  const scenarios = [
    ['success', common + `
      (async () => {
        const groups = [
          [worker('public', 'export default { async fetch(){ return new Response("ok") } }', { DB_A: url }),
            worker('admin', 'export default { async fetch(){ return new Response("ok") } }', { DB_B: url, DB_C: url })],
          [worker('jobs', 'export default { async fetch(){ return new Response("ok") } }', { DB_A: url })],
        ];
        for (const group of groups) {
          const mf = new Miniflare(convertV4MiniflareOptions({ log, workers: group }));
          try {
            for (const spec of group) {
              const response = await (await mf.getWorker(spec.name)).fetch('https://restore.lythaus.test/');
              assert.ok(response.status === 200 && await response.text() === 'ok');
            }
          } finally { await mf.dispose(); }
        }
        console.log('success-disposed');
      })().catch(error => { console.error(error.stack || error); process.exitCode = 2; });
    `],
    ['abort', common + `
      (async () => {
        const spec = worker('abort', 'export default { async fetch(){ await new Promise(resolve => setTimeout(resolve, 5000)); return new Response("late"); } }', { DB_ABORT: url });
        const mf = new Miniflare(convertV4MiniflareOptions({ log, workers: [spec] }));
        const controller = new AbortController();
        try {
          const workerInstance = await mf.getWorker('abort');
          const pending = workerInstance.fetch('https://restore.lythaus.test/wait', { signal: controller.signal })
            .then(() => 'resolved', () => 'rejected');
          const abortTimer = setTimeout(() => controller.abort(), 50);
          let abortWatchdog;
          const outcome = await Promise.race([
            pending,
            new Promise(resolve => { abortWatchdog = setTimeout(() => resolve('timed-out'), 1000); }),
          ]);
          clearTimeout(abortTimer);
          clearTimeout(abortWatchdog);
          assert.equal(controller.signal.aborted, true);
          assert.notEqual(outcome, 'timed-out', 'aborted Worker fetch must settle before its delayed response');
        } finally { await mf.dispose(); }
        console.log('abort-disposed');
      })().catch(error => { console.error(error.stack || error); process.exitCode = 2; });
    `],
  ];
  for (const [scenario, source] of scenarios) {
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, ['-e', source], {
        cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '', stderr = '', timedOut = false, forceKill;
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      const watchdog = setTimeout(() => {
        timedOut = true;
        try { process.kill(-child.pid, 'SIGTERM'); } catch {}
        forceKill = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 1000);
      }, 20000);
      child.on('error', error => { stderr += String(error); });
      child.on('close', (code, signal) => {
        clearTimeout(watchdog);
        if (timedOut) {
          clearTimeout(forceKill);
          try { process.kill(-child.pid, 'SIGKILL'); } catch {}
        }
        resolve({ code, signal, timedOut, stdout: stdout.trim(), stderr: stderr.trim() });
      });
    });
    assert.equal(result.timedOut, false, `${scenario} Miniflare subprocess failed to exit naturally: ${result.stderr}`);
    assert.equal(result.code, 0, `${scenario} Miniflare subprocess failed: ${result.stderr}`);
    assert.equal(result.stdout, `${scenario}-disposed`);
  }
});

for (const [mode, blocker, cleanup] of [
  ['authority_denied','provider_access_denied','NOT_NEEDED'], ['preexisting','preexisting_target_refused','NOT_NEEDED'],
  ['direct_target_present','preexisting_target_refused','NOT_NEEDED'], ['direct_target_error','provider_request_failed','NOT_NEEDED'],
  ['target_found_before_create','preexisting_target_refused','NOT_NEEDED'], ['backup_target_history','backup_target_history_unexpected','NOT_NEEDED'],
  ['stale','backup_stale_or_test_window_too_short','NOT_NEEDED'],
  ['completion_mismatch','fixed_backup_completion_changed','NOT_NEEDED'],
  ['unknown_create','provider_transport_failed','UNBOUND_CREATE_OUTCOME_MANUAL_RECONCILIATION_REQUIRED'],
  ['unprotected','protected_backup_with_finite_retention_plan_is_manual_prerequisite','NOT_NEEDED'],
  ['copied_role_mismatch','copied_role_metadata_invalid','TARGET_RETAINED_PENDING_REVIEW'],
  ['extension_denied','missing_extension_install_authority_unproven','TARGET_RETAINED_PENDING_REVIEW'],
  ['catalog_mismatch','restored_catalog_registry_acl_or_grants_mismatch','TARGET_RETAINED_PENDING_REVIEW'],
  ['partial_reset','provider_transport_failed','TARGET_RETAINED_PENDING_REVIEW'],
  ['wrong_config','created_target_identity_or_configuration_changed','TARGET_RETAINED_PENDING_REVIEW'],
  ['binding_mismatch','backup_to_new_target_binding_unproven','TARGET_RETAINED_PENDING_REVIEW'],
]) test(`fails closed without mutation retry: ${mode}`, async () => {
  const f = fixture(mode), report = await runNativeRestore(f.options);
  assert.ok(report.blockers.includes(blocker), JSON.stringify(report)); assert.equal(report.cleanup, cleanup);
  const mutations = f.calls.filter(value => /^(POST|PATCH|DELETE) /.test(value));
  assert.equal(new Set(mutations).size, mutations.length);
  if (['authority_denied','preexisting','direct_target_present','direct_target_error','target_found_before_create',
    'backup_target_history','stale','completion_mismatch','unprotected'].includes(mode)) assert.equal(mutations.length, 0);
  if (mode === 'unknown_create') assert.equal(report.costEscalationRequired, true);
  assert.equal(mutations.filter(value => /^(DELETE|PATCH)/.test(value)).length, 0);
});

test('plan mode performs no SQL, reset, protection, creation or cleanup', async () => {
  const f = fixture(); f.options.environment.RESTORE_CHECK_EXECUTE = 'false';
  const report = await runNativeRestore(f.options);
  assert.equal(report.status, 'PLAN_ONLY_OWNER_ACTIONS_AND_LIVE_QUALIFICATION_REQUIRED');
  assert.ok(!f.calls.some(value => /^(SQL|POST|PATCH|DELETE)/.test(value)));
});

test('copied roles converge read-only and all five must pass together before any reset', async () => {
  const f = fixture(), list = f.options.api.list; let reads = 0, clock = instant;
  f.options.api.list = async path => {
    const rows = await list(path);
    if (!path.endsWith(`${RESTORE.target}/roles`)) return rows;
    reads++;
    assert.equal(f.calls.filter(call => call.endsWith('/reset')).length, 0);
    if (reads === 1) return rows.slice(1);
    if (reads === 2) { rows[0].ready = false; return rows; }
    return rows;
  };
  f.options.sleep = async milliseconds => { clock += milliseconds; f.setNow(clock); };
  const report = await runNativeRestore({ ...f.options, api: { ...f.options.api,
    list: async path => reads >= 3 ? list(path) : f.options.api.list(path) } });
  assert.equal(report.qualificationOutcome, 'PASSED'); assert.equal(report.credentialActions.length, 5);
  assert.deepEqual(report.roleInventoryObservations.map(row => [row.missing.length, row.pending.length, row.outcome]),
    [[1,0,'PENDING'], [0,1,'PENDING'], [0,0,'PASSED']]);
  assert.doesNotMatch(JSON.stringify(report.roleInventoryObservations), /synthetic-secret|connectionString|access_host_url/);
});

for (const mode of ['absent', 'pending', 'expired', 'malformed', 'identity_drift', 'authority_drift', 'denied', 'budget']) {
  test(`role readiness blocks without reset: ${mode}`, async () => {
    const f = fixture(), list = f.options.api.list; let reads = 0, clock = instant;
    f.options.api.list = async path => {
      const rows = await list(path);
      if (!path.endsWith(`${RESTORE.target}/roles`)) return rows;
      reads++;
      if (mode === 'denied') throw new RestoreFailure('provider_access_denied', 'DENIED');
      if (mode === 'malformed') { delete rows[0].base_username; return rows; }
      if (mode === 'expired') { rows[0].expires_at = time(-60); rows[0].expired = true; return rows; }
      if (mode === 'authority_drift') { rows[0].inherited_roles = []; return rows; }
      if (mode === 'identity_drift' && reads > 1) rows[1].id = 'replacementrole';
      if (mode === 'budget') f.setNow(instant + RESTORE.qualificationStopMs);
      if (mode === 'pending') rows[0].ready = false;
      else rows.shift();
      return rows;
    };
    f.options.sleep = async milliseconds => { clock += milliseconds; f.setNow(clock); };
    const report = await runNativeRestore(f.options);
    assert.equal(report.qualificationOutcome, 'FAILED'); assert.equal(report.credentialActions.length, 0);
    assert.equal(f.calls.filter(call => call.endsWith('/reset')).length, 0);
    assert.equal(report.cleanup, 'TARGET_RETAINED_PENDING_REVIEW');
    assert.ok(reads <= 12);
    if (['malformed','expired','authority_drift','denied','budget'].includes(mode)) assert.equal(reads, 1);
    if (mode === 'identity_drift') assert.equal(reads, 2);
    if (['absent','pending'].includes(mode)) assert.equal(reads, 12);
  });
}
test('qualification rejects missing or malformed dedicated credentials without falling back to shared access', async t => {
  const request = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected provider request'); });
  for (const execute of [false, true]) for (const token of [undefined, '', 'id-only', ':secret', 'id:', 'id:secret:extra', 'id:secret\n']) {
    const f = fixture(); f.options.api = undefined;
    Object.assign(f.options.environment, { RESTORE_CHECK_EXECUTE: String(execute),
      PLANETSCALE_API_TOKEN: 'sharedsynthetic:shared-synthetic-value', PLANETSCALE_RESTORE_API_TOKEN: token });
    const report = await runNativeRestore(f.options);
    assert.equal(report.status, 'BLOCKED'); assert.deepEqual(report.blockers, ['existing_service_token_pair_required']);
    assert.deepEqual(report.providerMutations, []); assert.deepEqual(report.credentialActions, []);
    assert.equal(report.createdTargetId, null);
  }
  assert.equal(request.mock.callCount(), 0);
});
test('qualification uses the dedicated pair and its self identity when shared access is also present', async t => {
  const f = fixture(), pair = 'restoresynthetic:restore-synthetic-value', urls = [];
  f.options.api = undefined;
  Object.assign(f.options.environment, { RESTORE_CHECK_EXECUTE: 'false', PLANETSCALE_RESTORE_API_TOKEN: pair,
    PLANETSCALE_API_TOKEN: 'sharedsynthetic:shared-synthetic-value' });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    urls.push(url); assert.equal(options.method, 'GET'); assert.equal(options.headers.authorization, pair);
    if (url === apiBase) return Response.json({ id: RESTORE.databaseId, name: RESTORE.database, kind: 'postgresql' });
    if (url.endsWith('/service-tokens/restoresynthetic')) return Response.json({ id: 'restoresynthetic',
      service_token_accesses: authorityRows() });
    assert.equal(url, apiBase + '/branches/main');
    return Response.json({ id: 'different-source' });
  });
  const report = await runNativeRestore(f.options);
  assert.deepEqual(report.blockers, ['source_branch_identity_changed']);
  assert.equal(report.authorityDiagnostic.accessRowCount, 10); assert.equal(urls.length, 3);
  assert.deepEqual(report.providerMutations, []); assert.deepEqual(report.credentialActions, []);
});
test('consumed cleanup reservation blocks qualification before spending', async () => {
  const f = fixture(); f.options.reserveCleanup = async () => ({ workflowId: 42, runNumber: 2 });
  const report = await runNativeRestore(f.options);
  assert.ok(report.blockers.includes('cleanup_reservation_not_approved')); assert.equal(f.calls.length, 1);
});

test('cleanup reservation scope is exact and independent of JSON property order', async () => {
  const f = fixture(), record = JSON.parse(f.options.environment.RESTORE_CHECK_APPROVAL_JSON);
  record.cleanupPermit = { runNumber: 1, workflowId: 42 };
  f.options.environment.RESTORE_CHECK_APPROVAL_JSON = JSON.stringify(record);
  assert.equal((await runNativeRestore(f.options)).qualificationOutcome, 'PASSED');
  for (const cleanupPermit of [{ workflowId: 42, runNumber: 1, extra: true },
    { runNumber: 1 }, { workflowId: '42', runNumber: 1 }, { workflowId: 42, runNumber: 0 }]) {
    const blocked = fixture();
    const approval = JSON.parse(blocked.options.environment.RESTORE_CHECK_APPROVAL_JSON);
    approval.cleanupPermit = cleanupPermit;
    blocked.options.environment.RESTORE_CHECK_APPROVAL_JSON = JSON.stringify(approval);
    const report = await runNativeRestore(blocked.options);
    assert.deepEqual(report.blockers, ['one_use_cleanup_reservation_required']);
    assert.deepEqual(blocked.calls, []);
  }
});

test('dependency admission checks actual remaining time plus the configured setup reserve without provider access', () => {
  const env = environment(), record = JSON.parse(env.RESTORE_CHECK_APPROVAL_JSON);
  assert.equal(checkSetupWindow(env, instant).mutationAuthorized, false);
  assert.equal(checkSetupWindow(env, instant).cumulativeBudgetVerified, false);
  record.expiresAt = new Date(instant + RESTORE.maximumMs + DEPENDENCY_SETUP_RESERVE_MS - 1).toISOString();
  env.RESTORE_CHECK_APPROVAL_JSON = JSON.stringify(record);
  assert.throws(() => checkSetupWindow(env, instant), /approval_expired_or_unbounded/);
  const late = environment(), lateRecord = JSON.parse(late.RESTORE_CHECK_APPROVAL_JSON);
  const lateNow = Date.parse(RESTORE.backupCompletedAt) + 22 * 3600000 - DEPENDENCY_SETUP_RESERVE_MS + 1;
  lateRecord.expiresAt = new Date(lateNow + 3 * 3600000).toISOString();
  lateRecord.reviewWindow.availableUntil = lateRecord.expiresAt;
  lateRecord.retention.endsAt = new Date(lateNow + 23 * 3600000).toISOString();
  lateRecord.retention.decisionBy = new Date(lateNow + 3600000).toISOString();
  lateRecord.cumulativeBudget.priorRetentionEndsAt = lateRecord.retention.endsAt;
  late.RESTORE_CHECK_APPROVAL_JSON = JSON.stringify(lateRecord);
  assert.throws(() => checkSetupWindow(late, lateNow), /pinned_backup_window_exhausted_before_setup/);
  const workflow = fs.readFileSync('.github/workflows/planetscale-native-restore-check.yml', 'utf8');
  assert.ok(workflow.indexOf('planetscale-native-restore-admission.mjs') < workflow.indexOf('npm ci'));
  assert.equal(DEPENDENCY_SETUP_RESERVE_MS, (1 + 4) * 60000);
});

for (const [label, change, code] of [
  ['missing prior liabilities', budget => { delete budget.priorSpendUpperBoundUsd; }, 'reviewed_prior_exercise_liability_bound_required'],
  ['zero prior paid spend', budget => { budget.priorSpendUpperBoundUsd = 0; }, 'reviewed_prior_exercise_liability_bound_required'],
  ['negative retention liability', budget => { budget.priorRetentionUpperBoundUsd = -1; }, 'reviewed_prior_exercise_liability_bound_required'],
  ['missing evidence digest', budget => { delete budget.evidenceSha256; }, 'reviewed_prior_exercise_liability_bound_required'],
  ['wrong attesting operator', budget => { budget.operator = 'other'; }, 'reviewed_prior_exercise_liability_bound_required'],
  ['unbounded prior retention', budget => { budget.priorRetentionEndsAt = '2126-10-25T00:00:00Z'; }, 'reviewed_prior_exercise_liability_bound_required'],
  ['exceeded cumulative ceiling', budget => { budget.priorSpendUpperBoundUsd = 4; }, 'cumulative_exercise_budget_exceeded'],
]) test(`cumulative budget admission blocks ${label} before any provider call`, async () => {
  const f = fixture(), record = JSON.parse(f.options.environment.RESTORE_CHECK_APPROVAL_JSON);
  change(record.cumulativeBudget); f.options.environment.RESTORE_CHECK_APPROVAL_JSON = JSON.stringify(record);
  const report = await runNativeRestore(f.options);
  assert.deepEqual(report.blockers, [code]); assert.deepEqual(f.calls, []); assert.deepEqual(report.providerMutations, []);
});

test('a final GitHub read rejection is blocked admission, never an unknown submitted create', async () => {
  const f = fixture(); let checks = 0;
  f.options.assertMain = async () => { if (++checks === 3) throw new TypeError('synthetic-private-error'); };
  const report = await runNativeRestore(f.options);
  assert.deepEqual(report.blockers, ['github_precondition_read_failed']);
  assert.equal(report.status, 'BLOCKED'); assert.equal(report.qualificationOutcome, 'FAILED');
  assert.equal(report.providerMutations[0].outcome, 'BLOCKED'); assert.equal(report.cleanup, 'NOT_NEEDED');
  assert.equal(f.calls.filter(call => call.startsWith('POST ')).length, 0);
  assert.doesNotMatch(JSON.stringify(report), /synthetic-private-error/);
});

test('role-readiness cancellation reaches the bound GET and starts no subsequent backup read or reset', async () => {
  const f = fixture(), request = f.options.api.request; let canceled = false, laterBackupReads = 0;
  f.options.phaseBudgetMs = 30;
  f.options.api.request = async (path, options = {}) => {
    if (options.signal && path === `/branches/${RESTORE.target}`) return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => { canceled = true; reject(options.signal.reason); }, { once: true });
    });
    if (options.signal && path.includes('/backups/')) laterBackupReads++;
    return request(path, options);
  };
  const report = await runNativeRestore(f.options);
  assert.equal(canceled, true); assert.equal(laterBackupReads, 0);
  assert.ok(report.blockers.includes('qualification_copied_roles_timeout'));
  assert.equal(f.calls.filter(call => call.endsWith('/reset')).length, 0);
});

test('pending-role sleep observes phase cancellation instead of waiting a full poll interval', async () => {
  const f = fixture(), list = f.options.api.list;
  f.options.phaseBudgetMs = 30; delete f.options.sleep;
  f.options.api.list = async path => {
    const rows = await list(path);
    if (path.endsWith(`${RESTORE.target}/roles`)) rows[0].ready = false;
    return rows;
  };
  const began = Date.now(), report = await runNativeRestore(f.options);
  assert.ok(Date.now() - began < 2000);
  assert.ok(report.blockers.includes('qualification_copied_roles_timeout'));
  assert.equal(f.calls.filter(call => call.endsWith('/reset')).length, 0);
});

test('a changed API role ID in final reset admission blocks before that reset is submitted', async () => {
  const f = fixture(), list = f.options.api.list; let roleReads = 0;
  f.options.api.list = async path => {
    const rows = await list(path);
    if (path.endsWith(`${RESTORE.target}/roles`) && ++roleReads === 3) rows[0].id = 'replacementrole';
    return rows;
  };
  const report = await runNativeRestore(f.options);
  assert.ok(report.blockers.includes('copied_role_identity_changed_before_reset'));
  assert.equal(report.providerMutations.at(-1).outcome, 'BLOCKED');
  assert.equal(f.calls.filter(call => call.endsWith('/reset')).length, 0);
});
test('only proven missing named extensions are installed', async () => {
  const f = fixture('missing_extensions'); assert.equal((await runNativeRestore(f.options)).status, 'TARGET_CHECKS_PASSED_REVIEW_REQUIRED');
  assert.equal(f.calls.filter(value => value.startsWith('INSTALL')).length, 1);
});
test('missing, stale, wrong-target, broader-role and unbounded tax/budget records block before any API call', async () => {
  for (const change of [() => undefined, record => ({ ...record, maximumUsd: 6 }), record => ({ ...record, taxAndFeeAllowanceUsd: 0 }),
    record => ({ ...record, estimatedSubtotalUsd: 5 }), record => ({ ...record, target: 'main' }),
    record => ({ ...record, roles: [...ROLE_NAMES, 'postgres'] }), record => ({ ...record, expiresAt: time(-600) }),
    record => ({ ...record, reviewWindow: { ...record.reviewWindow, reserved: false } }),
    record => ({ ...record, retention: { ...record.retention, endsAt: '2026-11-23T18:00:00Z' } }),
    record => ({ ...record, retention: { ...record.retention, estimatedUsd: 5 } })]) {
    const f = fixture(), record = JSON.parse(f.options.environment.RESTORE_CHECK_APPROVAL_JSON);
    f.options.environment.RESTORE_CHECK_APPROVAL_JSON = JSON.stringify(change(record));
    const report = await runNativeRestore(f.options); assert.equal(report.status, 'BLOCKED'); assert.equal(f.calls.length, 0);
  }
});
test('deadline reserves cleanup time and changed protected main blocks before spending', async () => {
  const f = fixture(); let counter = 0;
  f.options.now = () => instant + (counter++ > 0 ? 116 * 60000 : 0);
  assert.ok((await runNativeRestore(f.options)).blockers.includes('qualification_phase_review_reserve_reached'));
  const second = fixture(); second.options.assertMain = async () => { throw new RestoreFailure('current_protected_main_changed'); };
  const report = await runNativeRestore(second.options); assert.equal(report.providerMutations.length, 0);
});
test('qualification stops at its own boundary without extending review or the original two-hour deadline', async () => {
  for (const offset of [RESTORE.qualificationStopMs - 1, RESTORE.qualificationStopMs, RESTORE.qualificationStopMs + 1]) {
    const f = fixture(); let first = true;
    f.options.now = () => { if (first) { first = false; return instant; } return instant + offset; };
    const report = await runNativeRestore(f.options);
    assert.equal(report.qualificationStopAt, new Date(instant + RESTORE.qualificationStopMs).toISOString());
    assert.equal(report.reviewByAt, new Date(instant + RESTORE.reviewMs).toISOString());
    assert.equal(report.cleanupDeadlineAt, new Date(instant + RESTORE.maximumMs).toISOString());
    if (offset < RESTORE.qualificationStopMs) assert.equal(report.qualificationOutcome, 'PASSED');
    else {
      assert.ok(report.blockers.includes('qualification_phase_review_reserve_reached'));
      assert.equal(f.calls.filter(call => call.startsWith('POST ')).length, 0);
    }
    assert.equal(f.calls.filter(call => call.startsWith('DELETE ')).length, 0);
  }
});
test('readiness polling crossing the qualification stop retains ownership and never consumes review reserve', async () => {
  const f = fixture(), original = f.options.api.request; let clock = instant;
  f.options.now = () => clock;
  f.options.sleep = async () => { clock = instant + RESTORE.qualificationStopMs; };
  f.options.api.request = async (suffix, options) => {
    const row = await original(suffix, options);
    return suffix === `/branches/${RESTORE.target}` && !options?.method && !options?.absent ? { ...row, ready: false, state: 'pending' } : row;
  };
  const report = await runNativeRestore(f.options);
  assert.ok(report.blockers.includes('qualification_phase_review_reserve_reached'));
  assert.equal(report.state, 'TARGET_RETAINED_PENDING_REVIEW'); assert.equal(report.costEscalationRequired, true);
  assert.equal(report.finishedAt, new Date(instant + RESTORE.qualificationStopMs).toISOString());
  assert.equal(report.cleanupDeadlineAt, new Date(instant + RESTORE.maximumMs).toISOString());
  assert.equal(f.calls.filter(call => call.startsWith('DELETE ')).length, 0);
});

test('slow owned-target smoke aborts, closes resources and finalizes retained failure evidence before escalation/review', async () => {
  const f = fixture(); let clock = instant, closed = false;
  f.options.now = () => clock; f.options.phaseBudgetMs = 10;
  f.options.smoke = async (_connections, _id, _baseline, _scripts, _factory, signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { closed = true; clock = instant + RESTORE.qualificationStopMs; reject(signal.reason); }, { once: true });
  });
  const report = await runNativeRestore(f.options);
  assert.equal(closed, true); assert.equal(report.credentialReferencesDiscarded, true);
  assert.equal(report.state, 'TARGET_RETAINED_PENDING_REVIEW'); assert.equal(report.qualificationOutcome, 'FAILED');
  assert.ok(report.phases.some(row => row.name === 'smoke' && row.outcome === 'TIMED_OUT'));
  assert.ok(Date.parse(report.finishedAt) < Date.parse(report.escalationAt));
  assert.ok(Date.parse(report.finishedAt) < Date.parse(report.reviewByAt));
  assert.equal(f.checkpoints.at(-1).state, 'TARGET_RETAINED_PENDING_REVIEW');
  assert.equal(report.cleanupDeadlineAt, new Date(instant + RESTORE.maximumMs).toISOString());
  assert.equal(f.calls.filter(call => call.startsWith('DELETE ')).length, 0);
});
test('provider transport refuses redirects, denied/oversized responses and unknown writes without retrying', async () => {
  for (const [response, outcome] of [
    [new Response('{}', { status: 403 }), 'DENIED'],
    [new Response('bad', { status: 201 }), 'UNKNOWN_MUTATION_OUTCOME'],
    [new Response('x'.repeat(1048577)), 'UNKNOWN_MUTATION_OUTCOME'],
  ]) {
    let count = 0; const api = new RestoreApi('fixture-id:fixture-token', async (_url, options) => {
      count++; assert.equal(options.redirect, 'error'); return response;
    });
    await assert.rejects(() => api.request('/branches', { method: 'POST', body: CREATE_TARGET_BODY }), error => error.outcome === outcome);
    assert.equal(count, 1);
  }
  const api = new RestoreApi('fixture-id:fixture-token', async () => { throw new Error(password); });
  await assert.rejects(() => api.request('/branches', { method: 'POST', body: CREATE_TARGET_BODY }), error => error.outcome === 'UNKNOWN_MUTATION_OUTCOME' && !error.message.includes(password));
  await assert.rejects(() => api.request('/branches/main', { method: 'DELETE' }), /fixed_provider_operation_required/);
  await assert.rejects(() => api.request('/branches', { method: 'POST', body: { ...CREATE_TARGET_BODY, name: 'main' } }), /fixed_provider_operation_required/);
  const redirect = new RestoreApi('fixture-id:fixture-token', async () => ({ status: 201, redirected: true }));
  await assert.rejects(() => redirect.request('/branches', { method: 'POST', body: CREATE_TARGET_BODY }),
    error => error.code === 'provider_redirect_rejected' && error.outcome === 'UNKNOWN_MUTATION_OUTCOME');
});
test('only an explicit absent GET 404 is translated to null; GET 204 or null JSON is never deletion evidence', async () => {
  const path = `/branches/${RESTORE.target}`;
  let calls = 0;
  const api = response => new RestoreCleanupApi('fixture-id:fixture-token', async () => { calls++; return response; });
  assert.equal(await api(new Response(null, { status: 404 })).request(path, { absent: true }), null);
  await assert.rejects(() => api(new Response(null, { status: 404 })).request(path), /provider_request_failed/);
  for (const absent of [false, true]) {
    await assert.rejects(() => api(new Response(null, { status: 204 })).request(path, { absent }), /provider_response_invalid/);
    await assert.rejects(() => api(Response.json(null)).request(path, { absent }), /provider_response_invalid/);
  }
  assert.equal(await api(new Response(null, { status: 204 })).request(path, { method: 'DELETE' }), null);
  assert.equal(calls, 7);
});
test('qualification target absence accepts only the provider GET 404 and uses the normal restore API', async () => {
  const path = `/branches/${RESTORE.target}`;
  const api = response => new RestoreApi('fixture-id:fixture-token', async () => response);
  assert.equal(await api(new Response(null, { status: 404 })).request(path, { absent: true }), null);
  await assert.rejects(() => api(new Response(null, { status: 404 })).request(path), /provider_request_failed/);
  await assert.rejects(() => api(new Response(null, { status: 204 })).request(path, { absent: true }), /provider_response_invalid/);
  assert.equal((await api(Response.json({ id: 'existing', name: RESTORE.target })).request(path, { absent: true })).name, RESTORE.target);
});
test('execution stops before provider reads or mutations when protected-run reconciliation fails', async () => {
  const f = fixture(); f.options.assertMain = async () => { throw new RestoreFailure('prior_execution_runner_or_step_evidence_present'); };
  const report = await runNativeRestore(f.options);
  assert.ok(report.blockers.includes('prior_execution_runner_or_step_evidence_present'));
  assert.deepEqual(f.calls, []);
});
test('provider permissions require existing database scope, not a branch-specific or differently named resource', async () => {
  for (const resource of [{ id: RESTORE.sourceId, name: 'main', type: 'Branch' },
    { id: RESTORE.databaseId, name: 'other', type: 'Database' }]) {
    const api = new RestoreApi('fixture-id:fixture-token', async url => Response.json(url === apiBase
      ? { id: RESTORE.databaseId, name: RESTORE.database, kind: 'postgresql' }
      : { id: 'fixture-id', service_token_accesses: ['read_branch','create_branch','delete_branch','read_backups','write_backups','connect_branch']
        .map(access => ({ access, resource_id: resource.id, resource_type: resource.type,
          resource: { id: resource.id, name: resource.name, deleted_at: null } })) }));
    await assert.rejects(() => api.authority(), /existing_token_missing_read_database/);
  }
});
test('authority diagnostic proves candidate identity and describes unbound permissions without accepting them', async () => {
  const evidence = [], calls = [];
  const token = { id: 'estjkwtxzsmh', token: password, plain_text_refresh_token: password, name: password,
    service_token_accesses: ['read_database', 'read_branch', 'read_backups', 'restore_production_branch_backup']
      .map(access => ({ access, resource_id: null, resource_type: 'Database', resource: null, description: password })) };
  const api = new RestoreApi(`estjkwtxzsmh:${password}`, async (url, options) => {
    calls.push({ url, method: options.method });
    return Response.json(url === apiBase ? { id: RESTORE.databaseId, name: RESTORE.database, kind: 'postgresql' } : token);
  });
  await assert.rejects(() => api.authority(value => evidence.push(value)), /existing_token_missing_read_database/);
  assert.equal(evidence.length, 1); assert.equal(evidence[0].tokenMatchesCodeXToken, true);
  assert.equal(evidence[0].tokenMatchesOtherKnownToken, false); assert.equal(evidence[0].rows.length, 4);
  assert.ok(evidence[0].rows.every(row => row.resourceIdNull && row.resourceNull && row.resourceTypeIsDatabase
    && !row.resourceIdMatchesDatabase && !row.nestedIdMatchesDatabase));
  assert.ok(calls.every(row => row.method === 'GET')); assert.equal(calls.length, 2);
  assert.doesNotMatch(JSON.stringify(evidence), new RegExp(password));
});
test('authority diagnostic preserves missing, null, organization and exact database distinctions; valid authority still passes', async () => {
  const names = ['read_database', 'read_branch', 'delete_branch', 'delete_production_branch', 'read_backups',
    'create_branch', 'connect_branch', 'connect_production_branch', 'restore_production_branch_backup', 'delete_production_branch_password'];
  const rows = names.map(access => ({ access, resource_id: RESTORE.databaseId, resource_type: 'Database',
    resource: { id: RESTORE.databaseId, name: RESTORE.database, deleted_at: null } }));
  rows.push({ access: 'read_database' }, { access: 'read_database', resource_id: null, resource: null },
    { access: 'read_databases', resource_id: 'organization123', resource_type: 'Organization',
      resource: { id: 'organization123', name: RESTORE.organization } });
  let evidence;
  const api = new RestoreApi(`v6pg9b7rz38a:${password}`, async url => Response.json(url === apiBase
    ? { id: RESTORE.databaseId, name: RESTORE.database, kind: 'postgresql' }
    : { id: 'v6pg9b7rz38a', service_token_accesses: rows }));
  await api.authority(value => { evidence = value; });
  assert.equal(evidence.tokenMatchesCodeXToken, false); assert.equal(evidence.tokenMatchesOtherKnownToken, true);
  assert.ok(evidence.rows[0].resourceIdMatchesDatabase && evidence.rows[0].nestedIdMatchesDatabase
    && evidence.rows[0].nestedNameMatchesDatabase && evidence.rows[0].deletedAtNull);
  assert.equal(evidence.rows[10].resourceMissing, true); assert.equal(evidence.rows[10].resourceIdMissing, true);
  assert.equal(evidence.rows[11].resourceMissing, false); assert.equal(evidence.rows[11].resourceIdMissing, false);
  assert.equal(evidence.rows[12].resourceTypeIsOrganization, true); assert.equal(evidence.rows[12].deletedAtMissing, true);
});

test('provider token expiry must cover the original cleanup window and is retained without secret fields', async () => {
  const afterDeadline = new Date(instant + RESTORE.maximumMs + 1000).toISOString();
  for (const expiry of [undefined, null, 'bad-synthetic-date', new Date(instant + RESTORE.maximumMs - 1000).toISOString(),
    new Date(instant + RESTORE.maximumMs).toISOString(), afterDeadline]) {
    let evidence;
    const api = new RestoreApi('syntheticid:synthetic-value', async url => Response.json(url === apiBase
      ? { id: RESTORE.databaseId, name: RESTORE.database, kind: 'postgresql' }
      : { id: 'syntheticid', ...(expiry === undefined ? {} : { expires_at: expiry }), token: password,
        service_token_accesses: ['read_database','read_branch','delete_branch','delete_production_branch','read_backups',
          'create_branch','connect_branch','connect_production_branch','restore_production_branch_backup','delete_production_branch_password'].map(access => ({ access,
            resource_id: RESTORE.databaseId, resource_type: 'Database',
            resource: { id: RESTORE.databaseId, name: RESTORE.database, deleted_at: null } })) }));
    const work = () => api.authority(row => { evidence = row; }, false, instant + RESTORE.maximumMs);
    if (expiry === null || expiry === afterDeadline) await work();
    else await assert.rejects(work, /existing_token_lifetime_insufficient_or_unverifiable/);
    assert.equal(evidence.tokenLifetime.coversRequiredWindow, expiry === null || expiry === afterDeadline);
    assert.doesNotMatch(JSON.stringify(evidence), /synthetic-value|bad-synthetic-date|synthetic-secret/);
  }
});

test('source catalog drift discovered at admission blocks before paid creation', async () => {
  const f = fixture(), read = f.options.readSession; let reads = 0;
  f.options.readSession = async (...args) => ({ ...await read(...args), ...(++reads === 2 ? { catalogSha256: 'd'.repeat(64) } : {}) });
  const report = await runNativeRestore(f.options);
  assert.deepEqual(report.blockers, ['source_metadata_changed_before_restore']);
  assert.equal(report.createdTargetId, null);
  assert.equal(f.calls.filter(call => call.startsWith('POST ')).length, 0);
});
test('authority diagnostic retains unknown and unrelated rows as bounded enums without exporting their values', async () => {
  let evidence;
  const rows = [{ access: password, resource_id: RESTORE.databaseId, resource: { name: RESTORE.database } },
    { access: 'read_database', resource_id: 'otherdatabase', resource_name: password,
      resource_type: password, resource: { id: 'otherdatabase', name: password, deleted_at: null } },
    ...Array.from({ length: 70 }, () => ({ access: 'read_database', resource_id: null, resource_type: password,
      resource: null, resource_name: password, token: password }))];
  const api = new RestoreApi(`unknownid:${password}`, async url => Response.json(url === apiBase
    ? { id: RESTORE.databaseId, name: RESTORE.database, kind: 'postgresql' }
    : { id: 'unknownid', name: password, token: password, plain_text_refresh_token: password, service_token_accesses: rows }));
  await assert.rejects(() => api.authority(value => { evidence = value; }), /existing_token_missing_read_database/);
  assert.equal(evidence.accessRowCount, 72);
  assert.equal(evidence.rowsTruncated, true); assert.equal(evidence.rows.length, 64);
  assert.equal(evidence.tokenMatchesCodeXToken, false); assert.equal(evidence.tokenMatchesOtherKnownToken, false);
  assert.doesNotMatch(JSON.stringify(evidence), new RegExp(password));
  assert.equal(evidence.rows[0].access, 'UNKNOWN_STRING');
  assert.equal(evidence.rows[1].resourceIdMatchesDatabase, false);
  assert.equal(evidence.rows[1].nestedNameMatchesDatabase, false);
  assert.ok(evidence.rows.every(row => row.resourceTypeIsDatabase === false));
});
test('read-only plan durably checkpoints sanitized authority evidence before retaining the original rejection', async () => {
  const f = fixture(); f.options.environment.RESTORE_CHECK_EXECUTE = 'false';
  f.options.api.authority = async observe => {
    await observe({ version: 1, tokenMatchesCodeXToken: true, rows: [] });
    throw new RestoreFailure('existing_token_missing_read_database');
  };
  const report = await runNativeRestore(f.options);
  assert.deepEqual(report.blockers, ['existing_token_missing_read_database']);
  assert.equal(report.authorityDiagnostic.tokenMatchesCodeXToken, true);
  assert.ok(f.checkpoints.some(row => row.authorityDiagnostic?.tokenMatchesCodeXToken));
  assert.deepEqual(report.providerMutations, []); assert.deepEqual(report.credentialActions, []);
  assert.equal(report.createdTargetId, null); assert.equal(report.cleanup, 'NOT_NEEDED');
});
test('authority diagnostics require verified database and self identity and never turn organization rows into database grants', async () => {
  for (const mode of ['wrong_database', 'wrong_self', 'missing_access_array', 'organization_only']) {
    const evidence = [];
    const token = { id: mode === 'wrong_self' ? 'differentid' : 'estjkwtxzsmh', token: password,
      service_token_accesses: mode === 'missing_access_array' ? null : [{ access: 'read_database',
        resource_id: 'organization123', resource_type: 'Organization', resource: { name: RESTORE.organization, deleted_at: null } }] };
    const api = new RestoreApi(`estjkwtxzsmh:${password}`, async url => Response.json(url === apiBase
      ? { id: mode === 'wrong_database' ? 'differentdatabase' : RESTORE.databaseId, name: RESTORE.database, kind: 'postgresql' } : token));
    await assert.rejects(() => api.authority(value => evidence.push(value)), new RegExp(mode === 'wrong_database'
      ? 'database_identity_changed' : mode === 'organization_only' ? 'existing_token_missing_read_database' : 'existing_token_authority_unverifiable'));
    assert.equal(evidence.length, mode === 'organization_only' ? 1 : 0);
    assert.doesNotMatch(JSON.stringify(evidence), new RegExp(password));
  }
});
const authorityAccesses = ['read_database', 'read_branch', 'delete_branch', 'delete_production_branch', 'read_backups',
  'create_branch', 'connect_branch', 'connect_production_branch', 'restore_production_branch_backup', 'delete_production_branch_password'];
const authorityRows = () => authorityAccesses.map(access => ({ access, resource_id: RESTORE.databaseId, resource_type: 'Database',
  resource: { id: RESTORE.databaseId, name: RESTORE.database, deleted_at: null } }));

test('role reset requires connect AND password-delete for the target classification', async () => {
  for (const production of [false, true]) {
    const connect = production ? 'connect_production_branch' : 'connect_branch';
    const remove = production ? 'delete_production_branch_password' : 'delete_branch_password';
    const wrong = production ? 'delete_branch_password' : 'delete_production_branch_password';
    assert.deepEqual(requireResetPermissions(new Set([connect, remove]), production), [connect, remove]);
    for (const accesses of [[], [connect], [connect, wrong], [remove]]) {
      assert.throws(() => requireResetPermissions(new Set(accesses), production), /existing_token_missing_/);
    }
    if (!production) continue;
    const api = new RestoreApi('syntheticid:synthetic-value', async url => Response.json(url === apiBase
      ? { id: RESTORE.databaseId, name: RESTORE.database, kind: 'postgresql' }
      : { id: 'syntheticid', service_token_accesses: authorityRows().filter(row =>
        !row.access.includes('branch_password')).concat([{ access: remove, resource_id: RESTORE.databaseId,
          resource_type: 'Database', resource: { id: RESTORE.databaseId, name: RESTORE.database, deleted_at: null } }]) }));
    let evidence;
    await api.authority(row => { evidence = row; });
    assert.deepEqual(evidence.resetPermissionAdmission, { targetProduction: production, required: [connect, remove], missing: [], verified: true });
  }
  for (const production of [undefined, null, 'true', 1]) {
    assert.throws(() => requireResetPermissions(new Set(authorityAccesses), production), /target_classification_unverifiable/);
  }
});

for (const mode of ['missing', 'wrong_class', 'wrong_resource', 'revoked_before_create']) {
  test(`production reset permission blocks paid creation: ${mode}`, async () => {
    const f = fixture(); let tokenReads = 0;
    const api = new RestoreApi('syntheticid:synthetic-value', async url => {
      if (url === apiBase) return Response.json({ id: RESTORE.databaseId, name: RESTORE.database, kind: 'postgresql' });
      tokenReads++;
      const rows = authorityRows().filter(row => row.access !== 'delete_production_branch_password');
      if (mode === 'wrong_class') rows.push({ ...authorityRows()[0], access: 'delete_branch_password' });
      if (mode === 'wrong_resource') rows.push({ ...authorityRows()[0], access: 'delete_production_branch_password', resource_id: RESTORE.sourceId });
      if (mode === 'revoked_before_create' && tokenReads === 1) rows.push(authorityRows().at(-1));
      return Response.json({ id: 'syntheticid', expires_at: time(180), service_token_accesses: rows });
    });
    f.options.api.authority = (...args) => api.authority(...args);
    const report = await runNativeRestore(f.options);
    assert.deepEqual(report.blockers, ['existing_token_missing_delete_production_branch_password']);
    assert.deepEqual(report.authorityDiagnostic.resetPermissionAdmission.missing, ['delete_production_branch_password']);
    assert.equal(report.authorityDiagnostic.resetPermissionAdmission.verified, false);
    assert.equal(report.createdTargetId, null); assert.equal(report.cleanup, 'NOT_NEEDED');
    assert.equal(f.calls.filter(call => call.startsWith('POST ')).length, 0);
    assert.deepEqual(report.credentialActions, []);
    assert.equal(tokenReads, mode === 'revoked_before_create' ? 2 : 1);
  });
}

test('actual target classification drift during reset admission stops before any reset', async () => {
  const f = fixture(), request = f.options.api.request; let authorities = 0;
  f.options.api.authority = async () => { authorities++; };
  f.options.api.request = async (path, options) => {
    const value = await request(path, options);
    return path === `/branches/${RESTORE.target}` && authorities >= 3 ? { ...value, production: false } : value;
  };
  const report = await runNativeRestore(f.options);
  assert.deepEqual(report.blockers, ['created_target_classification_changed']);
  assert.equal(report.createdTargetId, newId);
  assert.equal(f.calls.filter(call => call.endsWith('/reset')).length, 0);
});

test('target branch classification is mandatory and cannot be inferred from source main', () => {
  for (const production of [false, undefined, null, 'true']) {
    assert.throws(() => checkBranch({ ...target(), production }, newId), /created_target_classification_changed/);
  }
  assert.doesNotThrow(() => checkBranch(target(), newId));
});

test('reset denial retains numeric status and safe provider correlation without leaking response data or retrying', async () => {
  const f = fixture(), request = f.options.api.request; let attempts = 0;
  const requestId = '11111111-2222-4333-8444-555555555555';
  const api = new RestoreApi('syntheticid:' + password, async () => {
    attempts++;
    return Response.json({ error: { code: 'permission_denied', message: password, credentials: { password } },
      token: password, sql: 'SELECT private_product_rows', connection: 'postgresql://private.invalid' },
    { status: 403, headers: { 'x-request-id': requestId, 'set-cookie': password } });
  });
  f.options.api.request = (path, options) => options?.method === 'POST' && path.endsWith('/reset')
    ? api.request(path, options) : request(path, options);
  const report = await runNativeRestore(f.options);
  assert.equal(report.status, 'DENIED'); assert.equal(report.cleanup, 'TARGET_RETAINED_PENDING_REVIEW');
  assert.deepEqual(report.providerFailure, { version: 1, method: 'POST', httpStatus: 403, requestId,
    error: { bodyFormat: 'JSON_OBJECT', code: 'permission_denied' } });
  assert.deepEqual(report.providerMutations.at(-1).providerDiagnostic, report.providerFailure);
  assert.equal(attempts, 1); assert.deepEqual(report.credentialActions, []);
  assert.doesNotMatch(JSON.stringify(f.checkpoints), /synthetic-secret|private_product_rows|private\.invalid|set-cookie/);
});

test('provider error diagnostics redact unknown codes, headers, non-JSON and excessive bodies', async () => {
  for (const [body, bodyFormat, code] of [[JSON.stringify({ code: password }), 'JSON_OBJECT', 'REDACTED'],
    [password, 'UNREADABLE_OR_NON_JSON', null], ['x'.repeat(8193), 'OVERSIZED', null]]) {
    let attempts = 0;
    const api = new RestoreApi('syntheticid:' + password, async () => {
      attempts++; return new Response(body, { status: 401, headers: { 'x-request-id': password } });
    });
    await assert.rejects(() => api.request(`/branches/${RESTORE.target}/roles/role0/reset`, { method: 'POST' }), error => {
      assert.equal(error.httpStatus, 401); assert.equal(error.providerDiagnostic.requestId, null);
      assert.deepEqual(error.providerDiagnostic.error, { bodyFormat, code });
      assert.doesNotMatch(JSON.stringify(error.providerDiagnostic), /synthetic-secret/); return error.outcome === 'DENIED';
    });
    assert.equal(attempts, 1);
  }
});

test('reset request allowlist continues to exclude main and other targets', async () => {
  let attempts = 0;
  const api = new RestoreApi('syntheticid:synthetic-value', async () => { attempts++; return Response.json({}); });
  for (const branch of ['main', RESTORE.sourceId, 'other-target']) {
    await assert.rejects(() => api.request(`/branches/${branch}/roles/role0/reset`, { method: 'POST' }), /fixed_provider_operation_required/);
  }
  assert.equal(attempts, 0);
});

test('numeric mutation failure status is retained without turning uncertain failures into retry permission', async () => {
  for (const status of [400, 401, 403, 404, 409, 422, 429, 500]) {
    let attempts = 0;
    const api = new RestoreApi('syntheticid:synthetic-value', async () => {
      attempts++; return Response.json({ code: 'forbidden', message: password }, { status });
    });
    await assert.rejects(() => api.request(`/branches/${RESTORE.target}/roles/role0/reset`, { method: 'POST' }), error => {
      assert.equal(error.httpStatus, status); assert.equal(error.providerDiagnostic.httpStatus, status);
      assert.equal(error.providerDiagnostic.requestId, null);
      return error.outcome === ([429, 500].includes(status) ? 'UNKNOWN_MUTATION_OUTCOME' : 'DENIED');
    });
    assert.equal(attempts, 1);
  }
});

function grantDiagnosticFixture({ rows = [], pages, mode = '', validAuthority = false, selfFields = {} } = {}) {
  const calls = [], evidence = [];
  const api = new RestoreApi('estjkwtxzsmh:' + password, async (url, options) => {
    calls.push({ url, method: options.method });
    if (url === apiBase) return Response.json({ id: mode === 'wrong_database' ? 'differentdatabase' : RESTORE.databaseId,
      name: RESTORE.database, kind: 'postgresql' });
    if (url.endsWith('/service-tokens/estjkwtxzsmh')) return Response.json({
      id: mode === 'wrong_self' ? 'differentid' : 'estjkwtxzsmh', token: password, name: password,
      service_token_accesses: validAuthority ? authorityRows() : rows,
      ...selfFields,
    });
    if (mode === 'denied') return Response.json({ token: password, message: password }, { status: 403 });
    if (mode === 'transport') throw new Error(password);
    if (mode === 'redirect') return { status: 200, redirected: true };
    const page = Number(new URL(url).searchParams.get('page'));
    return Response.json(pages ? pages(page) : { type: 'list', current_page: page, next_page: null, data: [] });
  });
  return { api, calls, evidence, observe: value => { evidence.push(value); } };
}
test('documented organization permission enums and OAuth scope groups are observable without authorizing global access', async () => {
  const permissions = ['read_organization', 'read_invoices', 'read_audit_logs', 'create_databases', 'delete_databases',
    'read_oauth_applications', 'read_oauth_tokens', 'write_oauth_tokens', 'delete_oauth_tokens', 'write_service_tokens',
    'delete_service_tokens', 'write_teams', 'read_metrics_endpoints', 'read_databases', 'read_service_tokens'];
  const f = grantDiagnosticFixture({ rows: permissions.map(access => ({ access, resource_type: 'Organization',
    resource_id: 'organization123', resource: { id: 'organization123', name: RESTORE.organization, deleted_at: null } })),
  selfFields: { oauth_accesses_by_resource: {
    organization: { organizations: [{ id: 'organization123', name: RESTORE.organization, url: password }],
      accesses: [{ name: 'read_branches', description: password }, { name: 'restore_production_branch_backups' }] },
    database: { databases: [{ id: RESTORE.databaseId, name: RESTORE.database, organization: RESTORE.organization, url: password },
      { id: RESTORE.databaseId, name: RESTORE.database, organization: 'otherorganization' },
      { id: 'otherdatabase', name: 'otherdatabase', organization: RESTORE.organization }],
    accesses: [{ name: 'read_database' }, { name: 'restore_backups' }, { name: password }, { name: '*' }] },
    branch: { branches: [{ id: RESTORE.sourceId, name: RESTORE.source, database: RESTORE.database,
      organization: RESTORE.organization, url: password }], accesses: [{ name: 'manage_passwords' }, { name: 'write_branch' }] },
    user: { users: [{ id: password, name: password }], accesses: [{ name: password }] }, [password]: password,
  } } });
  await assert.rejects(() => f.api.authority(f.observe), /existing_token_missing_read_database/);
  assert.equal(f.calls.length, 2); assert.ok(f.calls.every(row => row.method === 'GET'));
  const result = f.evidence[0], oauth = result.oauthAccessesByResource;
  assert.equal(result.version, 3); assert.deepEqual(result.rows.map(row => row.access), permissions);
  assert.equal(result.grants.status, 'NOT_REQUESTED'); assert.equal(oauth.kind, 'OBJECT');
  assert.equal(oauth.unknownGroupCount, 1); assert.equal(oauth.userKind, 'OBJECT');
  assert.equal(oauth.groups.organization.resources.rows[0].nameMatchesOrganization, true);
  const databases = oauth.groups.database.resources.rows;
  assert.ok(databases[0].idMatchesDatabase && databases[0].nameMatchesDatabase && databases[0].organizationMatches);
  assert.ok(databases[1].idMatchesDatabase && databases[1].nameMatchesDatabase && !databases[1].organizationMatches);
  assert.ok(!databases[2].idMatchesDatabase && !databases[2].nameMatchesDatabase && databases[2].organizationMatches);
  const branch = oauth.groups.branch.resources.rows[0];
  assert.ok(branch.idMatchesSourceBranch && branch.nameMatchesSourceBranch && branch.databaseMatches && branch.organizationMatches);
  assert.deepEqual(oauth.groups.database.accesses.rows.map(row => row.access), ['read_database', 'restore_backups', 'UNKNOWN_STRING', 'WILDCARD']);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(password));
  assert.doesNotMatch(JSON.stringify(result), /otherorganization|otherdatabase|organization123|https?:|users|description/);
});
test('OAuth wildcard, null and malformed resources never imply target binding or database authority', async () => {
  const resources = [{ id: '*', name: '*', organization: '*', database: '*' },
    { id: null, name: null, organization: null, database: null }, {}, null, password, 42,
    { id: RESTORE.databaseId, name: RESTORE.database, organization: { name: RESTORE.organization } }];
  const f = grantDiagnosticFixture({ selfFields: { oauth_accesses_by_resource: {
    database: { databases: resources, accesses: [{ name: null }, {}, null, password, { name: 'constructor' }] },
    organization: '*', branch: { branches: '*', accesses: null },
  } } });
  await assert.rejects(() => f.api.authority(f.observe), /existing_token_missing_read_database/);
  const groups = f.evidence[0].oauthAccessesByResource.groups, rows = groups.database.resources.rows;
  assert.equal(rows[0].idKind, 'WILDCARD'); assert.equal(rows[1].idKind, 'NULL'); assert.equal(rows[2].idKind, 'MISSING');
  assert.equal(rows[3].rowKind, 'NULL'); assert.equal(rows[4].rowKind, 'UNKNOWN_STRING'); assert.equal(rows[5].rowKind, 'NON_OBJECT');
  assert.ok(rows.every(row => !row.organizationMatches));
  assert.equal(rows[6].organizationKind, 'NON_STRING');
  assert.equal(groups.organization.kind, 'WILDCARD'); assert.equal(groups.organization.resources.kind, 'MISSING');
  assert.equal(groups.branch.resources.kind, 'WILDCARD'); assert.equal(groups.branch.resources.count, null);
  assert.equal(groups.branch.accesses.kind, 'NULL');
  assert.deepEqual(groups.database.accesses.rows.map(row => row.access), ['NULL', 'MISSING', 'MISSING', 'MISSING', 'UNKNOWN_STRING']);
  assert.doesNotMatch(JSON.stringify(f.evidence), new RegExp(password));
});
test('missing and malformed OAuth containers preserve strict valid database authority with bounded shape-only output', async () => {
  for (const [selfFields, kind] of [[{}, 'MISSING'], [{ oauth_accesses_by_resource: null }, 'NULL'],
    [{ oauth_accesses_by_resource: '*' }, 'WILDCARD'], [{ oauth_accesses_by_resource: password }, 'UNKNOWN_STRING'],
    [{ oauth_accesses_by_resource: [] }, 'ARRAY'], [{ oauth_accesses_by_resource: false }, 'NON_STRING'],
    [{ oauth_accesses_by_resource: { database: [] } }, 'OBJECT']]) {
    const f = grantDiagnosticFixture({ validAuthority: true, selfFields });
    await f.api.authority(f.observe);
    assert.equal(f.calls.length, 2); assert.equal(f.evidence[0].oauthAccessesByResource.kind, kind);
    assert.doesNotMatch(JSON.stringify(f.evidence), new RegExp(password));
  }
});
test('OAuth resource and permission projections are bounded per known group and cannot claim untruncated evidence', async () => {
  const scopes = Object.fromEntries([['organization', 'organizations'], ['database', 'databases'], ['branch', 'branches']]
    .map(([group, key]) => [group, { [key]: Array(70).fill({ id: password, name: password, organization: password, url: password }),
      accesses: Array(71).fill({ name: password, description: password }) }]));
  const f = grantDiagnosticFixture({ validAuthority: true, selfFields: { oauth_accesses_by_resource: scopes } });
  await f.api.authority(f.observe);
  const result = f.evidence[0];
  for (const group of Object.values(result.oauthAccessesByResource.groups)) {
    assert.equal(group.resources.count, 70); assert.equal(group.resources.rows.length, 64); assert.equal(group.resources.truncated, true);
    assert.equal(group.accesses.count, 71); assert.equal(group.accesses.rows.length, 64); assert.equal(group.accesses.truncated, true);
  }
  assert.ok(JSON.stringify(result).length < 100000); assert.doesNotMatch(JSON.stringify(result), new RegExp(password));
  assert.equal(f.calls.length, 2);
});
test('official grants GET retains all descriptor shapes as enums and never accepts unmatched all-database or organization grants', async () => {
  const variants = [
    { resource_type: 'Database', resource_id: '*', resource_name: 'All databases',
      resource: { type: 'Database', id: '*', name: 'All databases' } },
    { resource_type: 'AllDatabases', resource_id: null, resource: null },
    { resource_type: 'Organization', resource_id: 'organization123', resource_name: RESTORE.organization,
      resource: { type: 'Organization', id: 'organization123', name: RESTORE.organization, deleted_at: null } },
    { resource_type: 'Database', resource_id: 'otherdatabase', resource_name: password, resource: { id: 'otherdatabase', name: password } },
    { resource_type: 'Organization', resource_id: 'otherorganization', resource: { id: 'otherorganization', name: password } },
    { resource_type: 'constructor', resource_id: '', resource_name: password },
    {}, null, password, { resource_id: null, resource: password },
  ];
  const rows = variants.map(row => objectFixtureRow(row));
  const f = grantDiagnosticFixture({ rows, pages: page => ({ type: 'list', current_page: page, next_page: null,
    data: variants.map(row => row && typeof row === 'object' ? { ...row, accesses: [{ access: 'read_database' }, { access: password }, null, password] } : row) }) });
  await assert.rejects(() => f.api.authority(f.observe, true), TypeError);
  assert.equal(f.calls.length, 3); assert.ok(f.calls.every(row => row.method === 'GET'));
  assert.equal(f.calls[2].url, 'https://api.planetscale.com/v1/organizations/lythaus/service-tokens/estjkwtxzsmh/grants?page=1&per_page=100');
  assert.equal(f.evidence[0].grants.status, 'NOT_REQUESTED');
  const report = f.evidence.at(-1);
  assert.equal(report.version, 3); assert.equal(report.rows.length, variants.length);
  assert.equal(report.grants.status, 'COLLECTED'); assert.equal(report.grants.rows.length, variants.length);
  assert.equal(report.rows[0].resourceIdKind, 'WILDCARD'); assert.equal(report.rows[0].nestedNameKind, 'ALL_DATABASES_MARKER');
  assert.equal(report.rows[1].resourceIdKind, 'NULL'); assert.equal(report.rows[1].resourceTypeKind, 'ALL_DATABASES_MARKER');
  assert.equal(report.rows[2].nestedNameMatchesOrganization, true);
  assert.equal(report.rows[3].nestedIdMatchesDatabase, false); assert.equal(report.rows[4].nestedNameMatchesOrganization, false);
  assert.equal(report.rows[5].resourceTypeKind, 'UNKNOWN_STRING'); assert.equal(report.rows[5].resourceIdKind, 'EMPTY_STRING');
  assert.equal(report.rows[6].resourceIdKind, 'MISSING'); assert.equal(report.rows[7].rowKind, 'NULL');
  assert.equal(report.rows[8].rowKind, 'UNKNOWN_STRING'); assert.equal(report.rows[9].resourceKind, 'UNKNOWN_STRING');
  assert.deepEqual(report.grants.rows[0].accesses.map(row => row.access), ['read_database', 'UNKNOWN_STRING', 'MISSING', 'MISSING']);
  assert.doesNotMatch(JSON.stringify(f.evidence), new RegExp(password));
  assert.doesNotMatch(JSON.stringify(f.evidence), /otherdatabase|otherorganization|organization123/);
});
function objectFixtureRow(row) { return row && typeof row === 'object' ? { ...row, access: 'read_database' } : row; }
test('complete grants diagnostics preserve valid database authority while grouped grants alone cannot grant it', async () => {
  const pages = page => ({ type: 'list', current_page: page, next_page: null, data: [
    { resource_type: 'Database', resource_id: RESTORE.databaseId, resource_name: RESTORE.database,
      accesses: authorityAccesses.map(access => ({ access, description: password })) },
  ] });
  const valid = grantDiagnosticFixture({ validAuthority: true, pages });
  await valid.api.authority(valid.observe, true);
  assert.equal(valid.evidence.at(-1).grants.rows[0].resourceIdMatchesDatabase, true);
  const missing = grantDiagnosticFixture({ pages });
  await assert.rejects(() => missing.api.authority(missing.observe, true), /existing_token_missing_read_database/);
});
test('grants diagnostics use bounded reconstructed pages, ignore redirect links and retain unknown rows', async () => {
  const f = grantDiagnosticFixture({ pages: page => ({ type: 'list', current_page: page, next_page: page === 1 ? 2 : null,
    next_page_url: 'https://unrelated.invalid/' + password, data: [{ resource_type: page === 1 ? 'Database' : password,
      resource_id: page === 1 ? '*' : null, accesses: [{ access: 'read_branch' }] }] }) });
  await assert.rejects(() => f.api.authority(f.observe, true), /existing_token_missing_read_database/);
  assert.equal(f.calls.length, 4); assert.ok(f.calls.every(row => row.url.startsWith('https://api.planetscale.com/')));
  assert.match(f.calls[3].url, /grants[?]page=2&per_page=100$/);
  assert.equal(f.evidence.at(-1).grants.pages, 2); assert.equal(f.evidence.at(-1).grants.rowCount, 2);
  assert.equal(f.evidence.at(-1).grants.rows[1].resourceTypeKind, 'UNKNOWN_STRING');
  assert.doesNotMatch(JSON.stringify(f.evidence), new RegExp(password));
});
for (const mode of ['denied', 'transport', 'redirect', 'malformed_page', 'missing_next_page', 'excessive_page', 'page_limit', 'inconsistent_total']) {
  test('grants diagnostic failure is recorded without retry or replacement of original authority rejection: ' + mode, async () => {
    const f = grantDiagnosticFixture({ mode, pages: page => ({
      type: 'list', current_page: mode === 'malformed_page' ? page + 1 : page,
      next_page: mode === 'missing_next_page' ? undefined : ['page_limit', 'inconsistent_total'].includes(mode) ? page + 1 : null,
      ...(mode === 'inconsistent_total' ? { total_count: page === 1 ? 2 : 3 } : {}),
      data: mode === 'excessive_page' ? Array(101).fill({}) : [],
    }) });
    await assert.rejects(() => f.api.authority(f.observe, true), /existing_token_missing_read_database/);
    const result = f.evidence.at(-1).grants;
    assert.ok(['BLOCKED', 'DENIED'].includes(result.status)); assert.equal(typeof result.errorCode, 'string');
    assert.ok(f.calls.every(row => row.method === 'GET')); assert.equal(f.calls.length, mode === 'page_limit' ? 7 : mode === 'inconsistent_total' ? 4 : 3);
    assert.doesNotMatch(JSON.stringify(f.evidence), new RegExp(password));
  });
}
test('grant read failure still blocks a plan whose original database authority passes', async () => {
  const f = grantDiagnosticFixture({ mode: 'denied', validAuthority: true });
  await assert.rejects(() => f.api.authority(f.observe, true), /provider_access_denied/);
  assert.equal(f.evidence.at(-1).grants.status, 'DENIED'); assert.equal(f.calls.length, 3);
  assert.equal(f.evidence.at(-1).grants.httpStatus, 403);
});
test('optional grant GET failures retain only bounded HTTP status and preserve rejection without retrying', async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const f = grantDiagnosticFixture();
    const original = f.api.fetchImpl;
    let grantRequests = 0;
    f.api.fetchImpl = async (url, options) => {
      if (!url.includes('/grants?')) return original(url, options);
      grantRequests++; assert.equal(options.method, 'GET');
      return new Response(password, { status, headers: { 'x-provider-secret': password } });
    };
    await assert.rejects(() => f.api.authority(f.observe, true), /existing_token_missing_read_database/);
    const result = f.evidence.at(-1).grants;
    assert.equal(result.httpStatus, status); assert.equal(result.status, 'DENIED');
    assert.equal(result.errorCode, [401, 403].includes(status) ? 'provider_access_denied' : 'provider_request_failed');
    assert.equal(grantRequests, 1);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(password));
  }
});
test('diagnostic output limits are explicit and cannot certify complete grant collection', async () => {
  for (const mode of ['grant_rows', 'grant_accesses', 'self_rows']) {
    const f = grantDiagnosticFixture({ validAuthority: true, pages: page => ({ type: 'list', current_page: page, next_page: null,
      data: mode === 'grant_rows' ? Array(65).fill({ accesses: [] }) : [{ accesses: Array(mode === 'grant_accesses' ? 65 : 1).fill({ access: 'read_database' }) }] }) });
    if (mode === 'self_rows') {
      const original = f.api.fetchImpl;
      f.api.fetchImpl = async (url, options) => url.endsWith('/service-tokens/estjkwtxzsmh')
        ? Response.json({ id: 'estjkwtxzsmh', service_token_accesses: [...authorityRows(), ...Array(65).fill({ access: password })] })
        : original(url, options);
    }
    await assert.rejects(() => f.api.authority(f.observe, true), new RegExp(mode === 'self_rows' ? 'token_authority_diagnostic_truncated' : 'token_grants_diagnostic_truncated'));
    const result = f.evidence.at(-1);
    assert.ok(result.rows.length <= 64 && result.grants.rows.length <= 64);
    assert.ok(result.grants.rows.every(row => row.accesses.length <= 64));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(password));
  }
});
test('grants reads remain fixed to the existing token and cannot be used by cleanup or issue mutations', async () => {
  let calls = 0;
  const api = new RestoreApi('estjkwtxzsmh:' + password, async () => { calls++; return Response.json({}); });
  for (const path of ['/../service-tokens/other/grants?page=1&per_page=100',
    '/../service-tokens/self/grants?page=6&per_page=100', '/../service-tokens/self/grants?page=1&per_page=101',
    '/../service-tokens/self/grants?page=1&per_page=100&extra=secret']) {
    await assert.rejects(() => api.request(path), /fixed_provider_operation_required/);
  }
  for (const method of ['POST', 'PATCH', 'DELETE']) await assert.rejects(
    () => api.request('/../service-tokens/self/grants?page=1&per_page=100', { method }), /fixed_provider_operation_required/);
  const cleanup = new RestoreCleanupApi('estjkwtxzsmh:' + password, async () => { calls++; return Response.json({}); });
  await assert.rejects(() => cleanup.request('/../service-tokens/self/grants?page=1&per_page=100'), /fixed_provider_operation_required/);
  assert.equal(calls, 0);
});
test('diagnostics wait for database/self identity and neither workflow mode requests optional grants', async () => {
  for (const mode of ['wrong_database', 'wrong_self']) {
    const f = grantDiagnosticFixture({ mode });
    await assert.rejects(() => f.api.authority(f.observe, true), /database_identity_changed|existing_token_authority_unverifiable/);
    assert.equal(f.calls.length, mode === 'wrong_database' ? 1 : 2); assert.equal(f.evidence.length, 0);
  }
  for (const execute of [true, false]) {
    const f = fixture(); f.options.environment.RESTORE_CHECK_EXECUTE = String(execute);
    const g = grantDiagnosticFixture();
    f.options.api = g.api;
    const report = await runNativeRestore(f.options);
    assert.deepEqual(report.providerMutations, []); assert.deepEqual(report.credentialActions, []);
    assert.equal(report.createdTargetId, null); assert.equal(report.cleanup, 'NOT_NEEDED');
    assert.equal(g.calls.length, 2); assert.ok(g.calls.every(row => row.method === 'GET'));
    assert.equal(report.authorityDiagnostic.grants.status, 'NOT_REQUESTED');
  }
});
test('credential projection rejects main, mismatched role, host and password; never creates a role', () => {
  const row = { ...roleRows()[0], password, access_host_url: 'aws.connect.psdb.cloud' };
  assert.match(restoredConnection(row, newId, RESTORE.setup), /sslmode=verify-full/);
  for (const mutated of [{ ...row, access_host_url: 'https://evil.invalid' }, { ...row, password: '' },
    { ...row, username: `${RESTORE.setup}.${RESTORE.sourceId}` }]) assert.throws(() => restoredConnection(mutated, newId, RESTORE.setup));
  assert.throws(() => restoredConnection(row, RESTORE.sourceId, RESTORE.setup));
  assert.throws(() => checkedRoles(roleRows().slice(1), newId));
  assert.throws(() => checkBranch({ ...target(), name: 'main' }, newId));
  assert.throws(() => checkBackup({ ...backup(), pvc_size: RESTORE.bytes + 1 }, instant));
});
test('all five nonsecret connection metadata records must decode before the first reset', async () => {
  const f = fixture(), original = f.options.api.list;
  f.options.api.list = async path => {
    const rows = await original(path);
    if (path === `/branches/${RESTORE.target}/roles`) rows[4].access_host_url = 'aws.connect.psdb.cloud:5432';
    return rows;
  };
  const report = await runNativeRestore(f.options);
  assert.ok(report.blockers.includes('restored_credential_identity_invalid'));
  assert.equal(f.calls.filter(call => call.endsWith('/reset')).length, 0);
});
for (const [field, value] of [['ready', false], ['expired', true], ['deleted_at', time(0)],
  ['with_replication', false], ['inherited_roles', ['unexpected-authority']]]) {
  test(`post-reset ${field} drift fails closed without repeating the reset`, async () => {
    const f = fixture(), original = f.options.api.request;
    f.options.api.request = async (path, options) => {
      const result = await original(path, options);
      return path.endsWith('/reset') ? { ...result, [field]: value } : result;
    };
    const report = await runNativeRestore(f.options);
    assert.equal(report.qualificationOutcome, 'FAILED'); assert.equal(report.credentialActions.length, 0);
    assert.equal(f.calls.filter(call => call.endsWith('/reset')).length, 1);
    assert.equal(report.recoveryAcceptance, 'NOT_CERTIFIED');
  });
}
test('role-class checks accept only the exact observed setup baseline and strict application-role baseline', () => {
  const sourceRows = roleRows(RESTORE.sourceId);
  const source = new Map(sourceRows.map(row => [row.base_username, row]));
  assert.equal(checkedRoles(sourceRows, RESTORE.sourceId).size, ROLE_NAMES.length);
  assert.equal(checkedRoles(roleRows(), newId, source).size, ROLE_NAMES.length);

  const wrongSetupReplication = roleRows(); wrongSetupReplication[0].with_replication = false;
  assert.throws(() => checkedRoles(wrongSetupReplication, newId), error => {
    assert.equal(error.code, 'copied_role_metadata_invalid');
    assert.equal(error.safeDiagnostic.role.roleClass, 'setup');
    assert.deepEqual(error.safeDiagnostic.role.fields.withReplication,
      { present: true, type: 'BOOLEAN', expected: true, observed: false, matches: false });
    return true;
  });
  const privilegedApplication = roleRows(); privilegedApplication[1].with_replication = true;
  assert.throws(() => checkedRoles(privilegedApplication, newId), error => {
    assert.equal(error.safeDiagnostic.role.roleClass, 'application');
    assert.equal(error.safeDiagnostic.role.fields.withReplication.matches, false);
    return true;
  });
  const malformedInheritance = roleRows(); malformedInheritance[0].inherited_roles = { password: 'synthetic-password-canary' };
  assert.throws(() => checkedRoles(malformedInheritance, newId), error => {
    const diagnostic = JSON.stringify(error.safeDiagnostic);
    assert.equal(error.safeDiagnostic.role.fields.inheritedRoles.type, 'OBJECT');
    assert.equal(error.safeDiagnostic.role.fields.inheritedRoles.matches, false);
    assert.doesNotMatch(diagnostic, /synthetic-password-canary/);
    return true;
  });
  const missingBaseUsername = roleRows(); delete missingBaseUsername[0].base_username;
  assert.throws(() => checkedRoles(missingBaseUsername, newId), error => {
    const inventory = error.safeDiagnostic.role.inventory;
    assert.equal(error.safeDiagnostic.role.candidateCount, 0);
    assert.equal(inventory.rowCount, ROLE_NAMES.length);
    assert.equal(inventory.recognizedBaseUsernameCounts[RESTORE.setup], 0);
    assert.equal(inventory.recognizedRoutedUsernameCounts[RESTORE.setup], 1);
    assert.deepEqual(inventory.recognizedIdentityRows[0], { role: RESTORE.setup, idSyntaxValid: true,
      baseUsernamePresent: false, baseUsernameType: 'MISSING', baseUsernameMatches: false,
      routedUsernameMatches: true, branchIdMatches: true, branchNameMatches: true, databaseNameMatches: true });
    assert.doesNotMatch(JSON.stringify(error.safeDiagnostic), /synthetic-password-never-output/);
    return true;
  });
  const changedInheritance = roleRows(); changedInheritance[0].inherited_roles.push('unexpected_role');
  assert.throws(() => checkedRoles(changedInheritance, newId, source), error => error.code === 'copied_role_authority_changed');
});

test('raw REST role discovery preserves documented identities across pages and reissued API IDs', async t => {
  // Synthetic REST fixtures, not provider observations: https://planetscale.com/docs/api/reference/list_roles
  const sourceRows = roleRows(RESTORE.sourceId).map((row, index) => ({ ...row,
    id: `sourceapi${index}`, name: 'synthetic display label', default: index === 0 }));
  const targetRows = roleRows().map((row, index) => ({ ...row,
    id: `copiedapi${index}`, name: 'different synthetic display label', default: index === 0 }));
  const cases = [
    ['reissued IDs', rows => rows, null],
    ['empty inventory', () => [], 'copied_role_metadata_invalid', 0],
    ['missing base username', rows => { delete rows[0].base_username; return rows; }, 'copied_role_metadata_invalid', 0],
    ['null base username', rows => { rows[0].base_username = null; return rows; }, 'copied_role_metadata_invalid', 0],
    ['routed base username', rows => { rows[0].base_username += `.${newId}`; return rows; }, 'copied_role_metadata_invalid', 0],
    ['wrong routing suffix', rows => { rows[0].username = `${RESTORE.setup}.${RESTORE.sourceId}`; return rows; }, 'copied_role_metadata_invalid', 1],
    ['double routing suffix', rows => { rows[0].username += `.${newId}`; return rows; }, 'copied_role_metadata_invalid', 1],
    ['wrong branch', rows => { rows[0].branch.id = RESTORE.sourceId; return rows; }, 'copied_role_metadata_invalid', 1],
    ['role pending', rows => { rows[0].ready = false; return rows; }, 'copied_role_metadata_invalid', 1],
    ['duplicate base identity', rows => [...rows, { ...rows[0], id: 'duplicateapi' }], 'copied_role_metadata_invalid', 2],
    ['inheritance drift', rows => { rows[0].inherited_roles = []; return rows; }, 'copied_role_authority_changed', 1],
    ['duplicate API ID', rows => { rows[1].id = rows[0].id; return rows; }, 'provider_inventory_incomplete'],
  ];
  for (const [label, change, expectedCode, candidateCount] of cases) await t.test(label, async () => {
    const rows = change(structuredClone(targetRows)), calls = [];
    const api = new RestoreApi('syntheticid:synthetic-value', async (rawUrl, options) => {
      const url = new URL(rawUrl), page = Number(url.searchParams.get('page'));
      calls.push(rawUrl); assert.equal(options.method, 'GET');
      assert.equal(url.searchParams.get('per_page'), '100');
      assert.equal(url.searchParams.has('q'), false); assert.equal(url.searchParams.has('status'), false);
      const source = url.pathname.endsWith('/main/roles');
      assert.ok(source || url.pathname.endsWith(`/branches/${RESTORE.target}/roles`));
      const data = source ? sourceRows : rows;
      const next = page === 1 && data.length > 3 ? 2 : null;
      return Response.json({ type: 'list', current_page: page, per_page: 100, total_count: data.length,
        total_pages: data.length > 3 ? 2 : 1, next_page: next,
        next_page_url: next ? 'https://untrusted.invalid/ignored' : null,
        data: data.slice((page - 1) * 3, page * 3) });
    });
    const source = checkedRoles(await api.list('/branches/main/roles'), RESTORE.sourceId);
    const run = async () => checkedRoles(await api.list(`/branches/${RESTORE.target}/roles`), newId, source);
    if (expectedCode) await assert.rejects(run, error => {
      assert.equal(error.code, expectedCode);
      if (candidateCount !== undefined) assert.equal(error.safeDiagnostic.role.candidateCount, candidateCount);
      if (label === 'empty inventory') assert.equal(error.safeDiagnostic.role.inventory.rowCount, 0);
      if (label === 'missing base username') {
        assert.equal(error.safeDiagnostic.role.inventory.rowCount, ROLE_NAMES.length);
        assert.equal(error.safeDiagnostic.role.inventory.recognizedRoutedUsernameCounts[RESTORE.setup], 1);
      }
      assert.doesNotMatch(JSON.stringify(error.safeDiagnostic ?? {}), /synthetic-value|synthetic display label/);
      return true;
    });
    else {
      const discovered = await run();
      assert.equal(discovered.get(RESTORE.setup).id, 'copiedapi0');
      assert.notEqual(discovered.get(RESTORE.setup).id, source.get(RESTORE.setup).id);
      assert.equal(discovered.get(RESTORE.setup).base_username, RESTORE.setup);
      assert.equal(discovered.get(RESTORE.setup).username, `${RESTORE.setup}.${newId}`);
      assert.equal(calls.length, 4);
    }
    assert.ok(calls.every(url => url.startsWith(apiBase)));
  });
});

test('restored SQL role contract pins observed setup flags and memberships while keeping app flags strict', () => {
  const roles = ROLE_NAMES.map(rolname => ({ rolname, ...ROLE_SQL_SECURITY_BASELINE[rolname], rolinherit: true, rolcanlogin: true }));
  const members = ROLE_SQL_MEMBERSHIP_BASELINE.map(({ role, member }) => ({ role, member, grantor: 'postgres',
    admin_option: false, inherit_option: true, set_option: true }));
  assert.doesNotThrow(() => assertRestoreRoleSqlBaseline(roles, members));

  for (const key of ['rolsuper', 'rolbypassrls', 'rolcreaterole', 'rolcreatedb', 'rolreplication']) {
    const altered = roles.map(row => ({ ...row }));
    altered[1][key] = !ROLE_SQL_SECURITY_BASELINE[RESTORE.runtime][key];
    assert.throws(() => assertRestoreRoleSqlBaseline(altered, members), /restored_role_security_contract_invalid/,
      `application role drift in ${key} must block`);
  }
  const setupDrift = roles.map(row => ({ ...row })); setupDrift[0].rolsuper = true;
  assert.throws(() => assertRestoreRoleSqlBaseline(setupDrift, members), /restored_role_security_contract_invalid/);
  for (const name of ROLE_NAMES) {
    const nonLogin = roles.map(row => ({ ...row })); nonLogin.find(row => row.rolname === name).rolcanlogin = false;
    assert.throws(() => assertRestoreRoleSqlBaseline(nonLogin, members), /restored_role_security_contract_invalid/,
      `${name} must remain login-enabled`);
    const missingLogin = roles.map(row => ({ ...row })); delete missingLogin.find(row => row.rolname === name).rolcanlogin;
    assert.throws(() => assertRestoreRoleSqlBaseline(missingLogin, members), /restored_role_security_contract_invalid/,
      `${name} must include an explicit login flag`);
  }
  assert.throws(() => assertRestoreRoleSqlBaseline(roles, members.slice(1)), /restored_role_security_contract_invalid/);
  assert.throws(() => assertRestoreRoleSqlBaseline(roles, [...members, { ...members[0], role: RESTORE.runtime }]),
    /restored_role_security_contract_invalid/);
});

test('pinned manual cleanup proof rejects missing, altered and appended evidence bytes', () => {
  const root = new URL('../../docs/evidence/production-cutover/0021-restore-evidence/', import.meta.url);
  const qualification = fs.readFileSync(new URL('artifacts/qualification-40212030891.json', root));
  const receipt = fs.readFileSync(new URL('manual-cleanup-40212030891.json', root));
  const proof = assertPinnedManualCleanupProof(qualification, receipt);
  assert.equal(proof.targetId, 'gnbnmpsu7r5k'); assert.equal(proof.cleanupMode, 'MANUAL');
  assert.equal(proof.recoveryAcceptance, 'NOT_CERTIFIED'); assert.equal(proof.artifactCredentialActionCount, 0);
  for (const [reportBytes, receiptBytes] of [[undefined, receipt], [qualification, undefined],
    [Buffer.concat([qualification, Buffer.from(' ')]), receipt], [qualification, Buffer.concat([receipt, Buffer.from(' ')])],
    [Buffer.from(JSON.stringify({ ...JSON.parse(qualification), credentialActions: [{ outcome: 'UNKNOWN' }] })), receipt],
    [Buffer.from(JSON.stringify({ ...JSON.parse(qualification), backupId: 'syntheticreplacementbackup', targetName: 'synthetic-replacement-target' })), receipt],
    [qualification, Buffer.from(JSON.stringify({ ...JSON.parse(receipt), targetBeforeDeletion: { ...JSON.parse(receipt).targetBeforeDeletion,
      name: 'synthetic-replacement-target' } }))],
    [qualification, Buffer.from(JSON.stringify({ ...JSON.parse(receipt), manualCleanup: { outcome: 'not-proven' } }))]]) {
    assert.throws(() => assertPinnedManualCleanupProof(reportBytes, receiptBytes), /prior_manual_cleanup_file_hash_mismatch/);
  }
});

test('old target identity reappearing under another name blocks create without mutations', async () => {
  const f = fixture('previous_target_reappeared');
  const report = await runNativeRestore(f.options);
  assert.ok(report.blockers.includes('preexisting_target_refused'));
  assert.deepEqual(report.providerMutations, []); assert.deepEqual(report.credentialActions, []);
  assert.ok(f.calls.every(value => !/^(POST|PATCH|DELETE) /.test(value)));
});

test('the run-12 target reappearing under a different name blocks a new paid restore', async () => {
  const f = fixture(), list = f.options.api.list;
  f.options.api.list = path => path === '/branches' ? [{ id: 'p0behfjbhkp1', name: 'different-name' }] : list(path);
  const report = await runNativeRestore(f.options);
  assert.deepEqual(report.blockers, ['preexisting_target_refused']);
  assert.deepEqual(report.providerMutations, []); assert.deepEqual(report.credentialActions, []);
});

test('GitHub preconditions reconcile only the four pinned prior runs with complete evidence', async () => {
  const env = { ...environment(), GH_TOKEN: password, GITHUB_SHA: sha, GITHUB_REF: 'refs/heads/main', REF_PROTECTED: 'true',
    GITHUB_REPOSITORY_ID: '1010752912', GITHUB_REPOSITORY: 'fixture-owner/Lythaus', GITHUB_RUN_ATTEMPT: '1' };
  const workflowPath = '.github/workflows/planetscale-native-restore-check.yml';
  const cancelledSha = '43829abc3424a88a22826695bbfdc7be4a116e62';
  const failedSha = '96ff66fa5c28c9780ce72ee23a40cd846372d6bd';
  const manuallyDeletedSha = '9447561658c139f1e9e48cedad66b2f035661fb9';
  const pinnedHuman = JSON.parse(fs.readFileSync(new URL(
    '../../docs/evidence/production-cutover/0021-restore-evidence/artifacts/qualification-40212030891.json', import.meta.url))).reviewWindow.operator;
  const cancelledRun = () => ({ id: 40184823787, run_number: 7, workflow_id: 394786946, path: workflowPath,
    head_sha: cancelledSha, head_branch: 'main', event: 'workflow_dispatch', run_attempt: 1, status: 'completed', conclusion: 'cancelled',
    display_title: `Native restore execute ${cancelledSha}`, name: `Native restore execute ${cancelledSha}`,
    repository: { id: 1010752912, full_name: env.GITHUB_REPOSITORY },
    head_repository: { id: 1010752912, full_name: env.GITHUB_REPOSITORY }, pull_requests: [] });
  const cancelledJob = () => ({ id: 121143288424, run_id: 40184823787, run_attempt: 1, head_sha: cancelledSha,
    name: 'Qualify isolated native restore without cleanup', status: 'completed', conclusion: 'cancelled',
    runner_id: 0, runner_name: '', runner_group_id: 0, steps: [] });
  const failedRun = () => ({ id: 40193991312, run_number: 8, workflow_id: 394786946, path: workflowPath,
    head_sha: failedSha, head_branch: 'main', event: 'workflow_dispatch', run_attempt: 1, status: 'completed', conclusion: 'failure',
    display_title: `Native restore execute ${failedSha}`, name: `Native restore execute ${failedSha}`,
    repository: { id: 1010752912, full_name: env.GITHUB_REPOSITORY },
    head_repository: { id: 1010752912, full_name: env.GITHUB_REPOSITORY }, pull_requests: [] });
  const failedStepNames = [
    'Set up job', 'Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'Require exact protected main before loading dependencies or credentials',
    'Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    'Run npm ci --ignore-scripts --no-audit', 'Run fixed-target runner using only existing protected access',
    'Finalize immutable qualification evidence without provider access', 'Summarize retained target and review deadlines',
    'Upload immutable qualification evidence',
    'Post Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    'Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'Complete job',
  ];
  const failedConclusions = ['success','success','success','success','success','failure','success','success','success','skipped','success','success'];
  const failedNumbers = [1,2,3,4,5,6,7,8,9,17,18,19];
  const failedJob = () => ({ id: 121170799629, run_id: 40193991312, run_attempt: 1, head_sha: failedSha,
    name: 'Qualify isolated native restore without cleanup', status: 'completed', conclusion: 'failure', runner_id: 101,
    runner_name: 'GitHub Actions 1000000000', runner_group_id: 1,
    steps: failedStepNames.map((name, index) => ({ name, number: failedNumbers[index], status: 'completed', conclusion: failedConclusions[index] })) });
  const failedArtifact = () => ({ id: 12599287272,
    name: `native-restore-qualification-${failedSha}-40193991312`, size_in_bytes: 1925,
    digest: 'sha256:16d38d9bb99249074c62cb19a95baf6f6cd1d35f5feb98da054ca7afc07d03ac', expired: false,
    created_at: '2026-10-25T12:41:37Z', expires_at: '2026-11-01T12:41:36Z',
    workflow_run: { id: 40193991312, repository_id: 1010752912, head_sha: failedSha } });
  const manuallyDeletedRun = () => ({ ...failedRun(), id: 40212030891, run_number: 9, head_sha: manuallyDeletedSha,
    display_title: `Native restore execute ${manuallyDeletedSha}`, name: `Native restore execute ${manuallyDeletedSha}` });
  const manuallyDeletedJob = () => ({ ...failedJob(), id: 121225106539, run_id: 40212030891, head_sha: manuallyDeletedSha });
  const manuallyDeletedArtifact = () => ({ ...failedArtifact(), id: 12606067757,
    name: `native-restore-qualification-${manuallyDeletedSha}-40212030891`, size_in_bytes: 3199,
    digest: 'sha256:50b3e7d7a2354c0d5d190872a5d77cec7d2fd7f3d2ea1cec404d731cb0655e7a',
    created_at: '2026-10-25T16:39:28Z', expires_at: '2026-11-01T16:39:28Z',
    workflow_run: { id: 40212030891, repository_id: 1010752912, head_sha: manuallyDeletedSha } });
  const planRuns = [sha, 'b'.repeat(40)].map((headSha, index) => ({ id: 50 + index, workflow_id: 394786946,
    path: workflowPath, head_sha: headSha, head_branch: 'main', event: 'workflow_dispatch',
    display_title: `Native restore plan ${headSha}` }));
  const fixtureFetch = (overrides = {}) => {
    const reads = [], run12 = syntheticRun12Metadata(env.GITHUB_REPOSITORY);
    const fetcher = async (url, options = {}) => {
      reads.push({ url, method: options.method ?? 'GET' });
      const parsed = new URL(url), pathname = parsed.pathname;
      const suffix = url.slice(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}`.length);
      if (run12.responses.has(suffix)) return Response.json(await run12.read(suffix));
      if (pathname.endsWith('/branches/main')) return Response.json({ protected: true, commit: { sha: overrides.mainSha ?? sha } });
      if (pathname.endsWith(`/actions/runs/${env.GITHUB_RUN_ID}/approvals`)) return Response.json(overrides.currentApprovals
        ?? [{ state: 'approved', user: { type: overrides.bot ? 'Bot' : 'User', login: 'owner' }, environments: [{ name: 'production' }] }]);
      if (pathname.includes('/actions/workflows/') && pathname.endsWith('/runs')) {
        const runs = overrides.history ? [...overrides.history, ...(overrides.omitRun12 ? [] : [run12.run])]
          : [...planRuns, cancelledRun(), failedRun(), manuallyDeletedRun(), ...(overrides.omitRun12 ? [] : [run12.run])];
        return Response.json({ total_count: overrides.historyCount ?? runs.length, workflow_runs: runs });
      }
      if (pathname.endsWith('/actions/runs/40184823787/approvals')) return Response.json(overrides.priorApprovals ?? []);
      if (pathname.endsWith('/actions/runs/40184823787/jobs')) return Response.json({ total_count: overrides.jobCount ?? 1,
        jobs: Object.hasOwn(overrides, 'jobs') ? overrides.jobs : [cancelledJob()] });
      if (pathname.endsWith('/actions/runs/40184823787/artifacts')) return Response.json({ total_count: overrides.artifactCount ?? 0,
        artifacts: Object.hasOwn(overrides, 'artifacts') ? overrides.artifacts : [] });
      if (pathname.endsWith('/actions/runs/40184823787')) return Response.json(overrides.malformedRun
        ? null : { ...cancelledRun(), ...(overrides.run ?? {}) });
      if (pathname.endsWith('/actions/runs/40193991312/jobs')) return Response.json({ total_count: overrides.failedJobCount ?? 1,
        jobs: Object.hasOwn(overrides, 'failedJobs') ? overrides.failedJobs : [failedJob()] });
      if (pathname.endsWith('/actions/runs/40193991312/artifacts')) return Response.json({ total_count: overrides.failedArtifactCount ?? 1,
        artifacts: Object.hasOwn(overrides, 'failedArtifacts') ? overrides.failedArtifacts : [failedArtifact()] });
      if (pathname.endsWith('/actions/runs/40193991312')) return Response.json(overrides.malformedFailedRun
        ? null : { ...failedRun(), ...(overrides.failedRun ?? {}) });
      if (pathname.endsWith('/actions/runs/40212030891/jobs')) return Response.json({ total_count: overrides.manualJobCount ?? 1,
        jobs: Object.hasOwn(overrides, 'manualJobs') ? overrides.manualJobs : [manuallyDeletedJob()] });
      if (pathname.endsWith('/actions/runs/40212030891/approvals')) return Response.json(overrides.manualApprovals
        ?? [{ state: 'approved', user: { type: 'User', login: pinnedHuman }, environments: [{ name: 'production' }] }]);
      if (pathname.endsWith('/actions/runs/40212030891/artifacts')) return Response.json({ total_count: overrides.manualArtifactCount ?? 1,
        artifacts: Object.hasOwn(overrides, 'manualArtifacts') ? overrides.manualArtifacts : [manuallyDeletedArtifact()] });
      if (pathname.endsWith('/actions/runs/40212030891')) return Response.json({ ...manuallyDeletedRun(), ...(overrides.manualRun ?? {}) });
      if (pathname === `/repos/${env.GITHUB_REPOSITORY}`) return Response.json({ id: 1010752912, full_name: env.GITHUB_REPOSITORY });
      throw new Error(`unexpected GitHub read ${pathname}`);
    };
    return { fetcher, reads };
  };
  const good = fixtureFetch();
  const readiness = await githubReadiness(env, good.fetcher, true);
  assert.equal(readiness.executionHistoryReconciliation.pinnedExecutions.length, 4);
  assert.equal(readiness.executionHistoryReconciliation.pinnedExecutions[3].runId, '40360605402');
  assert.equal(readiness.executionHistoryReconciliation.pinnedExecutions[3].recoveryAcceptance, 'NOT_CERTIFIED');
  assert.deepEqual({ ...readiness.executionHistoryReconciliation,
    pinnedExecutions: readiness.executionHistoryReconciliation.pinnedExecutions.slice(0, 3) }, { status: 'PINNED_PRIOR_EXECUTIONS_RECONCILED',
    workflowPath, workflowId: 394786946, pinnedExecutions: [
      { status: 'PINNED_PRE_RUNNER_CANCELLATION_RECONCILED', workflowPath, workflowId: 394786946,
        runId: '40184823787', runNumber: 7, runAttempt: 1, headSha: cancelledSha, event: 'workflow_dispatch', conclusion: 'cancelled',
        jobId: 121143288424, runnerAssigned: false, stepCount: 0, approvalCount: 0, artifactCount: 0 },
      { status: 'PINNED_PRECREATE_FAILURE_RECONCILED', workflowPath, workflowId: 394786946,
        runId: '40193991312', runNumber: 8, runAttempt: 1, headSha: failedSha, event: 'workflow_dispatch', conclusion: 'failure',
        jobId: 121170799629, failedStepNumber: 6, blocker: 'copied_role_metadata_invalid', artifactId: 12599287272,
        artifactDigest: 'sha256:16d38d9bb99249074c62cb19a95baf6f6cd1d35f5feb98da054ca7afc07d03ac',
        artifactProviderMutationCount: 0, artifactCredentialActionCount: 0, artifactTargetCreated: false,
        artifactState: 'NO_TARGET_CREATED', artifactCount: 1 },
      { status: 'PINNED_MANUALLY_DELETED_FAILURE_RECONCILED', workflowPath, workflowId: 394786946,
        runId: '40212030891', runNumber: 9, runAttempt: 1, headSha: manuallyDeletedSha, event: 'workflow_dispatch', conclusion: 'failure',
        jobId: 121225106539, artifactId: 12606067757,
        artifactDigest: 'sha256:50b3e7d7a2354c0d5d190872a5d77cec7d2fd7f3d2ea1cec404d731cb0655e7a',
        targetId: 'gnbnmpsu7r5k', qualificationSha256: '4046d7fe58325fdfbf8c150b4c96260559391318dc16ed6eefa8831328d9e618',
        manualReceiptSha256: 'eeb8e95eb43990739722bf65da07cb6b249f687828d281593529d12cc1a4bccf',
        cleanupMode: 'MANUAL', cleanupOutcome: 'TARGET_ABSENT_VERIFIED', recoveryAcceptance: 'NOT_CERTIFIED',
        artifactProviderMutationCount: 1, artifactCredentialActionCount: 0, manualOperator: pinnedHuman },
    ] });
  assert.ok(good.reads.every(row => row.method === 'GET'));
  const noPrior = fixtureFetch({ history: planRuns });
  await assert.rejects(() => githubReadiness(env, noPrior.fetcher, true), /prior_execution_requires_manual_reconciliation/);
  for (const [label, overrides] of [
    ['main changed', { mainSha: 'b'.repeat(40) }], ['bot approval', { bot: true }],
    ['wrong run id', { run: { id: 40184823788 } }], ['wrong workflow', { run: { workflow_id: 1 } }],
    ['wrong path', { run: { path: '.github/workflows/other.yml' } }], ['wrong SHA', { run: { head_sha: 'c'.repeat(40) } }],
    ['wrong branch', { run: { head_branch: 'release' } }], ['wrong event', { run: { event: 'push' } }],
    ['wrong run number', { run: { run_number: 8 } }], ['wrong name', { run: { name: 'Native restore plan other' } }],
    ['malformed run detail', { malformedRun: true }], ['wrong attempt', { run: { run_attempt: 2 } }],
    ['not terminal cancellation', { run: { status: 'in_progress', conclusion: null } }],
    ['wrong conclusion', { run: { conclusion: 'failure' } }], ['wrong title', { run: { display_title: 'Native restore plan something' } }],
    ['wrong repository', { run: { repository: { id: 2, full_name: env.GITHUB_REPOSITORY } } }],
    ['prior approval', { priorApprovals: [{ state: 'approved' }] }], ['job inventory incomplete', { jobCount: 2 }],
    ['missing jobs', { jobs: undefined }],
    ['wrong job id', { jobs: [{ ...cancelledJob(), id: 1 }] }], ['wrong job run', { jobs: [{ ...cancelledJob(), run_id: 7 }] }],
    ['wrong job attempt', { jobs: [{ ...cancelledJob(), run_attempt: 2 }] }], ['wrong job SHA', { jobs: [{ ...cancelledJob(), head_sha: 'd'.repeat(40) }] }],
    ['job not cancelled', { jobs: [{ ...cancelledJob(), conclusion: 'failure' }] }], ['runner assigned', { jobs: [{ ...cancelledJob(), runner_id: 7 }] }],
    ['runner name present', { jobs: [{ ...cancelledJob(), runner_name: 'runner' }] }],
    ['missing steps', { jobs: [{ ...cancelledJob(), steps: undefined }] }], ['started step', { jobs: [{ ...cancelledJob(), steps: [{ name: 'checkout' }] }] }],
    ['artifact present', { artifactCount: 1, artifacts: [{ id: 1 }] }], ['artifact inventory incomplete', { artifactCount: 1 }],
    ['missing artifacts', { artifacts: undefined }], ['history count mismatch', { historyCount: 99 }], ['history over limit', { historyCount: 101 }],
    ['unclassifiable history', { history: [...planRuns, cancelledRun(), failedRun(), manuallyDeletedRun(), { ...planRuns[0], id: 99, display_title: 'unexpected' }] }],
    ['pinned history title mismatch', { history: [...planRuns, { ...cancelledRun(), display_title: `Native restore plan ${cancelledSha}` }, failedRun(), manuallyDeletedRun()] }],
    ['pinned history SHA mismatch', { history: [...planRuns, { ...cancelledRun(), head_sha: 'e'.repeat(40) }, failedRun(), manuallyDeletedRun()] }],
    ['second execute run', { history: [...planRuns, cancelledRun(), failedRun(), manuallyDeletedRun(), { ...failedRun(), id: 40193991313 }] }],
    ['missing manually deleted run', { history: [...planRuns, cancelledRun(), failedRun()] }],
    ['missing reviewed cleanup run', { omitRun12: true }],
    ['failed run SHA mismatch', { failedRun: { head_sha: 'f'.repeat(40) } }],
    ['failed run event mismatch', { failedRun: { event: 'push' } }],
    ['failed run attempt mismatch', { failedRun: { run_attempt: 2 } }],
    ['failed run not terminal', { failedRun: { status: 'in_progress', conclusion: null } }],
    ['failed run workflow mismatch', { failedRun: { workflow_id: 1 } }],
    ['failed job inventory mismatch', { failedJobCount: 2 }],
    ['failed job identity mismatch', { failedJobs: [{ ...failedJob(), id: 99 }] }],
    ['failed job missing steps', { failedJobs: [{ ...failedJob(), steps: undefined }] }],
    ['failure step changed', { failedJobs: [{ ...failedJob(), steps: failedJob().steps.map(step =>
      step.number === 6 ? { ...step, conclusion: 'success' } : step) }] }],
    ['extra job step', { failedJobs: [{ ...failedJob(), steps: [...failedJob().steps, { name: 'extra', number: 20, status: 'completed', conclusion: 'success' }] }] }],
    ['artifact inventory empty', { failedArtifactCount: 0, failedArtifacts: [] }],
    ['artifact digest mismatch', { failedArtifacts: [{ ...failedArtifact(), digest: 'sha256:' + '0'.repeat(64) }] }],
    ['artifact expired', { failedArtifacts: [{ ...failedArtifact(), expired: true }] }],
    ['artifact source mismatch', { failedArtifacts: [{ ...failedArtifact(), workflow_run: { ...failedArtifact().workflow_run, head_sha: 'f'.repeat(40) } }] }],
    ['manual run SHA mismatch', { manualRun: { head_sha: '0'.repeat(40) } }],
    ['manual run rerun', { manualRun: { run_attempt: 2 } }],
    ['manual run provenance mismatch', { manualRun: { path: '.github/workflows/other.yml' } }],
    ['manual run not failed', { manualRun: { conclusion: 'success' } }],
    ['manual production approval missing', { manualApprovals: [] }],
    ['manual production approval wrong user', { manualApprovals: [{ state: 'approved', user: { type: 'User', login: 'other' }, environments: [{ name: 'production' }] }] }],
    ['manual job inventory incomplete', { manualJobCount: 2 }],
    ['manual job missing steps', { manualJobs: [{ ...manuallyDeletedJob(), steps: undefined }] }],
    ['manual job runner missing', { manualJobs: [{ ...manuallyDeletedJob(), runner_id: 0 }] }],
    ['manual upload failed', { manualJobs: [{ ...manuallyDeletedJob(), steps: manuallyDeletedJob().steps.map(step =>
      step.number === 9 ? { ...step, conclusion: 'failure' } : step) }] }],
    ['manual artifact absent', { manualArtifactCount: 0, manualArtifacts: [] }],
    ['manual artifact replaced', { manualArtifacts: [{ ...manuallyDeletedArtifact(), id: 1 }] }],
    ['manual artifact expired', { manualArtifacts: [{ ...manuallyDeletedArtifact(), expired: true }] }],
    ['manual artifact hash changed', { manualArtifacts: [{ ...manuallyDeletedArtifact(), digest: 'sha256:' + '0'.repeat(64) }] }],
  ]) {
    const candidate = fixtureFetch(overrides);
    await assert.rejects(() => githubReadiness(env, candidate.fetcher, true), undefined, label);
    assert.ok(candidate.reads.every(row => row.method === 'GET'), `${label} must remain read-only`);
  }
  let proofReads = 0;
  const changesBeforeCreate = async (url, options) => {
    if (new URL(url).pathname.endsWith('/actions/runs/40212030891/artifacts') && ++proofReads === 2) {
      return Response.json({ total_count: 1, artifacts: [{ ...manuallyDeletedArtifact(), digest: 'sha256:' + '0'.repeat(64) }] });
    }
    return good.fetcher(url, options);
  };
  const runner = fixture(); runner.options.environment = env;
  runner.options.assertMain = () => githubReadiness(env, changesBeforeCreate, true);
  const blocked = await runNativeRestore(runner.options);
  assert.ok(blocked.blockers.includes('prior_manual_cleanup_artifact_mismatch'));
  assert.deepEqual(blocked.providerMutations, []); assert.deepEqual(blocked.credentialActions, []);
  assert.ok(runner.calls.every(value => !/^(POST|PATCH|DELETE) /.test(value)));
  await assert.rejects(() => githubReadiness({ ...env, GITHUB_RUN_ATTEMPT: '2' }, fixtureFetch().fetcher, true));
});

test('SQL sessions prove identity and roll back; authority failure never reaches DDL', async () => {
  const calls = []; const raw = restoredConnection({ ...roleRows()[0], password, access_host_url: 'aws.connect.psdb.cloud' }, newId, RESTORE.setup);
  const factory = () => ({ connect: async () => {}, end: async () => {}, query: async sql => {
    calls.push(sql);
    if (sql.includes('current_setting')) return { rows: [{ database: 'postgres', username: RESTORE.setup, session: RESTORE.setup, read_only: 'on', version: '170005' }] };
    if (sql.includes('pg_available_extension_versions')) return { rows: extensionPlanRows().map(row => ({ ...row, can_set_owner: false })) };
    return { rows: [], command: sql };
  } });
  await assert.rejects(() => inspectExtensionAuthority(raw, newId, factory, undefined, extensionSpecifications()), /missing_extension_install_authority_unproven/);
  assert.equal(calls.at(-1), 'ROLLBACK'); assert.ok(!calls.some(sql => sql.startsWith('CREATE')));
  await assert.rejects(() => readOnly(raw, RESTORE.sourceId, RESTORE.setup, () => {}, factory));
  await assert.rejects(() => installMissingExtensions(raw, newId, ['postgis'], factory));
});
test('lost extension COMMIT acknowledgment never retries or attempts a committed rollback', async () => {
  const calls = [], raw = restoredConnection({ ...roleRows()[0], password, access_host_url: 'aws.connect.psdb.cloud' }, newId, RESTORE.setup); let installed = false;
  const factory = () => ({ connect: async () => {}, end: async () => {}, query: async sql => {
    calls.push(sql); if (sql === 'COMMIT') throw new Error(password);
    if (sql.startsWith('CREATE EXTENSION')) installed = true;
    if (sql.includes('pg_available_extension_versions')) return { rows: extensionPlanRows(installed ? [] : ['unaccent']) };
    return { rows: [{ database: 'postgres', username: RESTORE.setup }] };
  } });
  await assert.rejects(() => installMissingExtensions(raw, newId, ['unaccent'], factory, undefined, extensionSpecifications()), error => error.extensionOutcomeUnknown === true && !error.message.includes(password));
  assert.equal(calls.filter(sql => sql === 'CREATE EXTENSION "unaccent" WITH SCHEMA "public" VERSION \'1.0\'').length, 1); assert.ok(!calls.includes('ROLLBACK'));
});
test('SQL phase cancellation closes the active connection before returning and never retries a possibly committed extension', async () => {
  const raw = restoredConnection({ ...roleRows()[0], password, access_host_url: 'aws.connect.psdb.cloud' }, newId, RESTORE.setup);
  for (const ddl of [false, true]) {
    const controller = new AbortController(), calls = []; let rejectPending, closed = false, installed = false;
    const factory = () => ({ connect: async () => {}, end: async () => { calls.push('END'); closed = true; rejectPending?.(controller.signal.reason); },
      query: async sql => {
        calls.push(sql);
        if (sql.startsWith('CREATE EXTENSION')) installed = true;
        if (sql.includes('pg_available_extension_versions')) return { rows: extensionPlanRows(installed ? [] : ['unaccent']) };
        if (sql.includes('current_setting')) return { rows: [{ database: 'postgres', username: RESTORE.setup, session: RESTORE.setup, read_only: 'on', version: '170005' }] };
        if (sql === 'COMMIT' || sql === 'SYNTHETIC_SLOW_READ') {
          return new Promise((resolve, reject) => { rejectPending = reject; controller.abort(new Error('synthetic-deadline')); });
        }
        return { rows: [{ database: 'postgres', username: RESTORE.setup }], command: sql };
      } });
    const work = ddl ? installMissingExtensions(raw, newId, ['unaccent'], factory, controller.signal, extensionSpecifications())
      : readOnly(raw, newId, RESTORE.setup, client => client.query('SYNTHETIC_SLOW_READ'), factory, controller.signal);
    await assert.rejects(() => work, error => ddl ? error.extensionOutcomeUnknown === true : error.message === 'synthetic-deadline');
    assert.equal(closed, true); assert.equal(calls.filter(sql => sql === 'END').length, 1);
    assert.equal(calls.filter(sql => sql === 'COMMIT').length, ddl ? 1 : 0); assert.equal(calls.includes('ROLLBACK'), false);
  }
});
test('application smoke cancellation disposes its Worker runtime before returning', async () => {
  const controller = new AbortController(); let rejectPending, disposed = false;
  const connections = Object.fromEntries(['runtime','admin','jobs','privacy'].map(name => [name,
    restoredConnection({ ...roleRows().find(row => row.base_username === RESTORE[name]), password, access_host_url: 'aws.connect.psdb.cloud' }, newId, RESTORE[name])]));
  const runtime = () => ({ getWorker: async () => new Promise((resolve, reject) => {
    rejectPending = reject; controller.abort(new Error('synthetic-runtime-deadline'));
  }), dispose: async () => { disposed = true; rejectPending?.(controller.signal.reason); } });
  await assert.rejects(() => runRestoreSmoke(connections, newId, baseline(), {}, runtime, controller.signal));
  assert.equal(disposed, true);
  await assert.rejects(() => buildRestoreSmoke(controller.signal));
});
test('in-flight build cancellation disposes its context before returning', async () => {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(new Error('synthetic-build-deadline')), 5);
  try { await assert.rejects(() => buildRestoreSmoke(controller.signal)); }
  finally { clearTimeout(timer); }
  assert.equal(controller.signal.aborted, true);
});
test('actual isolated Worker bundles build before spending; main and crossed credentials are rejected before workerd starts', async () => {
  const scripts = await buildRestoreSmoke(); assert.deepEqual(Object.keys(scripts), ['public','admin','jobs']);
  assert.ok(Object.values(scripts).every(value => value.length > 1000));
  await assert.rejects(() => runRestoreSmoke({ runtime: environment().PLANETSCALE_SCHEMA_READ_DATABASE_URL }, RESTORE.sourceId, baseline(), scripts), /smoke_target_mismatch/);
});
test('main-only verifier and release gates stay intact; new workflow has no scheduled or push mutation trigger', () => {
  const source = fs.readFileSync('scripts/ci/verify-planetscale-production-schema.mjs', 'utf8');
  assert.match(source, /if \(!emitContract && branch !== 'main'\)/);
  const workflow = fs.readFileSync('.github/workflows/planetscale-native-restore-check.yml', 'utf8');
  assert.match(workflow, /workflow_dispatch:/); assert.match(workflow, /default: false/); assert.match(workflow, /environment: production/);
  assert.doesNotMatch(workflow, /^  (schedule|push|pull_request):/m);
});
