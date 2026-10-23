import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { RESTORE, ROLE_NAMES, ACTIONS, CREATE_TARGET_BODY, RestoreApi, RestoreFailure, approvalRecord, checkBackup, checkBranch,
  checkedRoles, apiBase } from '../ci/planetscale-native-restore-contract.mjs';
import { runNativeRestore, githubReadiness } from '../ci/planetscale-native-restore-check.mjs';
import { restoredConnection, readOnly, inspectExtensionAuthority, installMissingExtensions } from '../ci/planetscale-native-restore-verifier.mjs';
import { buildRestoreSmoke, runRestoreSmoke } from '../ci/planetscale-native-restore-smoke.mjs';
import { branchQualifiedDatabaseTarget } from '../ci/planetscale-0021-target-identity.mjs';

const instant = Date.parse('2026-10-23T17:00:00Z');
const sha = 'a'.repeat(40), newId = 'newrestore123', password = 'synthetic-secret-never-output';
const environment = () => ({ RELEASE_SHA: sha, RESTORE_CHECK_EXECUTE: 'true', GITHUB_RUN_ID: '12345',
  PLANETSCALE_SCHEMA_READ_DATABASE_URL: `postgresql://pscale_api_qodocjs6vgrb.${RESTORE.sourceId}:${password}@aws.connect.psdb.cloud/postgres?sslmode=verify-full`,
  RESTORE_CHECK_APPROVAL_JSON: JSON.stringify({ releaseSha: sha, backupId: RESTORE.backupId, target: RESTORE.target,
    maximumUsd: 5, estimatedSubtotalUsd: 0.04, taxAndFeeAllowanceUsd: 1, recoveryPointAcknowledged: true,
    reference: 'owner-specific-approval-reference', manualOperator: 'owner', expiresAt: '2026-10-23T21:00:00Z',
    actions: ACTIONS, roles: ROLE_NAMES }) });
const roleRows = (id = newId) => ROLE_NAMES.map((name, index) => ({ id: `role${index}`, base_username: name,
  username: `${name}.${id}`, database_name: 'postgres', ready: true, expired: false, deleted_at: null, disabled_at: null,
  dropped_at: null, expires_at: null, with_replication: false, inherited_roles: ['pg_read_all_settings'],
  branch: { id, name: id === RESTORE.sourceId ? 'main' : RESTORE.target, deleted_at: null } }));
const target = () => ({ id: newId, name: RESTORE.target, created_at: '2026-10-23T17:00:00Z', deleted_at: null,
  default: false, kind: 'postgresql', restored_from_branch: { id: RESTORE.sourceId }, deletion_protected: false,
  cluster_name: RESTORE.cluster, cluster_architecture: 'aarch64', region: { slug: RESTORE.region }, replicas: 0,
  minimum_storage_bytes: RESTORE.bytes, maximum_storage_bytes: RESTORE.bytes, ready: true, state: 'ready', frozen: false });
const backup = () => ({ id: RESTORE.backupId, database_branch: { id: RESTORE.sourceId, name: 'main', deleted_at: null },
  state: 'success', deleted_at: null, protected: false, completed_at: '2026-10-23T14:29:11.907Z',
  expires_at: '2026-10-25T14:25:02.690Z', pvc_size: RESTORE.bytes, uncompressed_size: 53237514, restored_branches: [] });
const baseline = () => ({ catalogSha256: 'b'.repeat(64), schemaFingerprint: 'c'.repeat(64), relationCount: 108,
  schemaVersion: '0020_auth_recovery_delivery.sql', approvedPrivilegeChecks: 17, extensionCount: 3 });

function fixture(mode = '') {
  const calls = [], checkpoints = [], b = backup(); let created = false, deleted = false, resets = 0;
  const api = {
    authority: async () => { calls.push('authority'); if (mode === 'authority_denied') throw new RestoreFailure('provider_access_denied', 'DENIED'); },
    list: async path => {
      calls.push(`LIST ${path}`);
      if (path === '/branches') return mode === 'preexisting' ? [target()] : [];
      const rows = roleRows(path.includes('/main/') ? RESTORE.sourceId : newId);
      if (mode === 'copied_role_mismatch' && !path.includes('/main/')) rows[2].base_username = 'unexpected';
      return rows;
    },
    request: async (path, options = {}) => {
      const method = options.method ?? 'GET'; calls.push(`${method} ${path}`);
      if (method === 'PATCH') { assert.deepEqual(options.body, { protected: true }); b.protected = true; return b; }
      if (method === 'POST' && path === '/branches') {
        assert.equal(options.body.backup_id, RESTORE.backupId); assert.equal(options.body.storage.maximum_storage_bytes, RESTORE.bytes);
        assert.equal(options.body.create_database_if_missing, false); created = true;
        if (mode === 'unknown_create') throw new RestoreFailure('provider_transport_failed', 'UNKNOWN_MUTATION_OUTCOME');
        b.restored_branches = [{ id: newId, name: RESTORE.target }];
        return { ...target(), ...(mode === 'wrong_config' ? { replicas: 2 } : {}) };
      }
      if (method === 'DELETE') {
        assert.equal(path, `/branches/${RESTORE.target}`); assert.equal(created, true);
        if (mode === 'cleanup_failed') throw new RestoreFailure('provider_access_denied', 'DENIED');
        deleted = true;
        if (mode === 'unknown_delete') throw new RestoreFailure('provider_transport_failed', 'UNKNOWN_MUTATION_OUTCOME');
        return null;
      }
      if (method === 'POST' && path.endsWith('/reset')) {
        resets++;
        if (mode === 'partial_reset' && resets === 2) throw new RestoreFailure('provider_transport_failed', 'UNKNOWN_MUTATION_OUTCOME');
        const row = roleRows().find(item => path.includes(`/${item.id}/reset`));
        return { ...row, password, access_host_url: 'aws.connect.psdb.cloud' };
      }
      if (path === '/branches/main') return { id: RESTORE.sourceId, name: 'main', kind: 'postgresql', default: true, deleted_at: null, ready: true };
      if (path.endsWith(`/backups/${RESTORE.backupId}`)) {
        if (mode === 'stale') b.completed_at = '2026-10-22T14:00:00Z';
        if (mode === 'binding_mismatch' && created) b.restored_branches = [{ id: 'other', name: RESTORE.target }];
        return b;
      }
      if (path === `/branches/${RESTORE.target}`) return deleted && options.absent ? null : target();
      throw new Error(`unexpected synthetic path ${path}`);
    },
  };
  const options = { environment: environment(), api, now: () => instant, assertMain: async () => { calls.push('main'); },
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
  return { calls, checkpoints, options };
}

test('fixed restore exercises five copied credentials, verifies both baselines, and cleans only acknowledged new ID', async () => {
  const f = fixture(); const report = await runNativeRestore(f.options);
  assert.equal(report.status, 'TARGET_CHECKS_PASSED_REVIEW_REQUIRED');
  assert.equal(report.cleanup, 'DELETED_AND_READBACK_VERIFIED'); assert.equal(report.createdTargetId, newId);
  assert.equal(report.credentialActions.length, 5); assert.equal(report.sourceBaseline.approvedPrivilegeChecks, 17);
  assert.equal(report.recoveryAcceptance, 'NOT_CERTIFIED'); assert.equal(report.deploymentAuthorized, false);
  assert.equal(f.calls.filter(value => value.startsWith('POST /branches')).length, 6);
  assert.equal(f.calls.filter(value => value.startsWith('DELETE')).length, 1);
  assert.ok(f.calls.indexOf('extension_authority') < f.calls.indexOf(`POST /branches/${RESTORE.target}/roles/role1/reset`));
  assert.equal(JSON.stringify(f.checkpoints).includes(password), false);
  assert.doesNotMatch(JSON.stringify(f.checkpoints), /connectionString|postgresql:\/\/|access_host_url/);
});

for (const [mode, blocker, cleanup] of [
  ['authority_denied','provider_access_denied','NOT_NEEDED'], ['preexisting','preexisting_target_refused','NOT_NEEDED'],
  ['stale','backup_stale_or_test_window_too_short','NOT_NEEDED'],
  ['unknown_create','provider_transport_failed','UNBOUND_CREATE_OUTCOME_MANUAL_RECONCILIATION_REQUIRED'],
  ['copied_role_mismatch','copied_role_missing_or_ambiguous','DELETED_AND_READBACK_VERIFIED'],
  ['extension_denied','missing_extension_install_authority_unproven','DELETED_AND_READBACK_VERIFIED'],
  ['catalog_mismatch','restored_catalog_registry_acl_or_grants_mismatch','DELETED_AND_READBACK_VERIFIED'],
  ['partial_reset','provider_transport_failed','DELETED_AND_READBACK_VERIFIED'],
  ['wrong_config','created_target_identity_or_configuration_changed','DELETED_AND_READBACK_VERIFIED'],
  ['binding_mismatch','backup_to_new_target_binding_unproven','FAILED_OR_UNCERTAIN_MANUAL_OPERATOR_REQUIRED'],
  ['cleanup_failed','cleanup_deletion_not_confirmed','FAILED_OR_UNCERTAIN_MANUAL_OPERATOR_REQUIRED'],
]) test(`fails closed without mutation retry: ${mode}`, async () => {
  const f = fixture(mode), report = await runNativeRestore(f.options);
  assert.ok(report.blockers.includes(blocker), JSON.stringify(report)); assert.equal(report.cleanup, cleanup);
  const mutations = f.calls.filter(value => /^(POST|PATCH|DELETE) /.test(value));
  assert.equal(new Set(mutations).size, mutations.length);
  if (['authority_denied','preexisting','stale'].includes(mode)) assert.equal(mutations.length, 0);
  if (mode === 'unknown_create') assert.equal(mutations.filter(value => value.startsWith('DELETE')).length, 0);
});

test('plan mode performs no SQL, reset, protection, creation or cleanup', async () => {
  const f = fixture(); f.options.environment.RESTORE_CHECK_EXECUTE = 'false';
  const report = await runNativeRestore(f.options);
  assert.equal(report.status, 'PLAN_ONLY_OWNER_ACTIONS_AND_LIVE_QUALIFICATION_REQUIRED');
  assert.ok(!f.calls.some(value => /^(SQL|POST|PATCH|DELETE)/.test(value)));
});
test('lost DELETE acknowledgment is reconciled read-only, never repeated', async () => {
  const f = fixture('unknown_delete'), report = await runNativeRestore(f.options);
  assert.equal(report.cleanup, 'DELETED_READBACK_VERIFIED_ACK_UNCERTAIN');
  assert.equal(f.calls.filter(value => value.startsWith('DELETE')).length, 1);
});
test('only proven missing named extensions are installed', async () => {
  const f = fixture('missing_extensions'); assert.equal((await runNativeRestore(f.options)).status, 'TARGET_CHECKS_PASSED_REVIEW_REQUIRED');
  assert.equal(f.calls.filter(value => value.startsWith('INSTALL')).length, 1);
});
test('missing, stale, wrong-target, broader-role and unbounded tax/budget records block before any API call', async () => {
  for (const change of [() => undefined, record => ({ ...record, maximumUsd: 6 }), record => ({ ...record, taxAndFeeAllowanceUsd: 0 }),
    record => ({ ...record, estimatedSubtotalUsd: 5 }), record => ({ ...record, target: 'main' }),
    record => ({ ...record, roles: [...ROLE_NAMES, 'postgres'] }), record => ({ ...record, expiresAt: '2026-10-23T18:00:00Z' })]) {
    const f = fixture(), record = JSON.parse(f.options.environment.RESTORE_CHECK_APPROVAL_JSON);
    f.options.environment.RESTORE_CHECK_APPROVAL_JSON = JSON.stringify(change(record));
    const report = await runNativeRestore(f.options); assert.equal(report.status, 'BLOCKED'); assert.equal(f.calls.length, 0);
  }
});
test('deadline reserves cleanup time and changed protected main blocks before spending', async () => {
  const f = fixture(); let counter = 0;
  f.options.now = () => instant + (counter++ > 0 ? 116 * 60000 : 0);
  assert.ok((await runNativeRestore(f.options)).blockers.includes('test_deadline_cleanup_reserve_reached'));
  const second = fixture(); second.options.assertMain = async () => { throw new RestoreFailure('current_protected_main_changed'); };
  const report = await runNativeRestore(second.options); assert.equal(report.providerMutations.length, 0);
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
test('GitHub preconditions enforce immutable repository, main, attempt, named human production review and no prior execute', async () => {
  const env = { ...environment(), GH_TOKEN: password, GITHUB_SHA: sha, GITHUB_REF: 'refs/heads/main', REF_PROTECTED: 'true',
    GITHUB_REPOSITORY_ID: '1010752912', GITHUB_REPOSITORY: 'AsoraKK/Lythaus', GITHUB_RUN_ATTEMPT: '1' };
  const fetcher = mode => async url => Response.json(url.endsWith('/branches/main') ? { protected: true, commit: { sha: mode === 'main' ? 'b'.repeat(40) : sha } }
    : url.endsWith('/approvals') ? [{ state: 'approved', user: { type: mode === 'bot' ? 'Bot' : 'User', login: 'owner' }, environments: [{ name: 'production' }] }]
      : url.includes('/runs?') ? { total_count: mode === 'prior' ? 1 : 0, workflow_runs: mode === 'prior' ? [{ id: 1, display_title: `Native restore execute ${sha}` }] : [] }
        : { id: 1010752912, full_name: env.GITHUB_REPOSITORY });
  await githubReadiness(env, fetcher(''), true);
  for (const mode of ['main','bot','prior']) await assert.rejects(() => githubReadiness(env, fetcher(mode), true));
  await assert.rejects(() => githubReadiness({ ...env, GITHUB_RUN_ATTEMPT: '2' }, fetcher(''), true));
});

test('SQL sessions prove identity and roll back; authority failure never reaches DDL', async () => {
  const calls = []; const raw = restoredConnection({ ...roleRows()[0], password, access_host_url: 'aws.connect.psdb.cloud' }, newId, RESTORE.setup);
  const factory = () => ({ connect: async () => {}, end: async () => {}, query: async sql => {
    calls.push(sql);
    if (sql.includes('current_setting')) return { rows: [{ database: 'postgres', username: RESTORE.setup, session: RESTORE.setup, read_only: 'on', version: '170005' }] };
    if (sql.includes('pg_available_extensions')) return { rows: ['pgcrypto','pg_trgm','unaccent'].map(name => ({ name, installed_version: null,
      can_create_database: false, can_create_schema: false, trusted: true })) };
    return { rows: [], command: sql };
  } });
  await assert.rejects(() => inspectExtensionAuthority(raw, newId, factory), /missing_extension_install_authority_unproven/);
  assert.equal(calls.at(-1), 'ROLLBACK'); assert.ok(!calls.some(sql => sql.startsWith('CREATE')));
  await assert.rejects(() => readOnly(raw, RESTORE.sourceId, RESTORE.setup, () => {}, factory));
  await assert.rejects(() => installMissingExtensions(raw, newId, ['postgis'], factory));
});
test('lost extension COMMIT acknowledgment never retries or attempts a committed rollback', async () => {
  const calls = [], raw = restoredConnection({ ...roleRows()[0], password, access_host_url: 'aws.connect.psdb.cloud' }, newId, RESTORE.setup);
  const factory = () => ({ connect: async () => {}, end: async () => {}, query: async sql => {
    calls.push(sql); if (sql === 'COMMIT') throw new Error(password);
    return { rows: [{ database: 'postgres', username: RESTORE.setup }] };
  } });
  await assert.rejects(() => installMissingExtensions(raw, newId, ['unaccent'], factory), error => error.extensionOutcomeUnknown === true && !error.message.includes(password));
  assert.equal(calls.filter(sql => sql === 'CREATE EXTENSION "unaccent"').length, 1); assert.ok(!calls.includes('ROLLBACK'));
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
