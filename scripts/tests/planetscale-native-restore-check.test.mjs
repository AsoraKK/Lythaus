import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { RESTORE, ROLE_NAMES, ACTIONS, CREATE_TARGET_BODY, RestoreApi, RestoreCleanupApi, RestoreFailure, approvalRecord, checkBackup, checkBranch,
  checkedRoles, apiBase } from '../ci/planetscale-native-restore-contract.mjs';
import { runNativeRestore, githubReadiness } from '../ci/planetscale-native-restore-check.mjs';
import { restoredConnection, readOnly, inspectExtensionAuthority, installMissingExtensions } from '../ci/planetscale-native-restore-verifier.mjs';
import { buildRestoreSmoke, runRestoreSmoke } from '../ci/planetscale-native-restore-smoke.mjs';
import { branchQualifiedDatabaseTarget } from '../ci/planetscale-0021-target-identity.mjs';

const instant = Date.parse('2026-10-25T04:00:00Z');
const sha = 'a'.repeat(40), newId = 'newrestore123', password = 'synthetic-secret-never-output';
const environment = () => ({ RELEASE_SHA: sha, RESTORE_CHECK_EXECUTE: 'true', GITHUB_RUN_ID: '12345',
  PLANETSCALE_SCHEMA_READ_DATABASE_URL: `postgresql://pscale_api_qodocjs6vgrb.${RESTORE.sourceId}:${password}@aws.connect.psdb.cloud/postgres?sslmode=verify-full`,
  RESTORE_CHECK_APPROVAL_JSON: JSON.stringify({ releaseSha: sha, backupId: RESTORE.backupId, target: RESTORE.target,
    maximumUsd: 5, estimatedSubtotalUsd: 0.04, taxAndFeeAllowanceUsd: 1, backupSnapshotAcknowledged: true,
    reference: 'owner-specific-approval-reference', manualOperator: 'owner', expiresAt: '2026-10-25T08:00:00Z',
    actions: ACTIONS, roles: ROLE_NAMES, cleanupPermit: { workflowId: 42, runNumber: 1 },
    reviewWindow: { reviewer: 'owner', operator: 'owner', reserved: true, availableFrom: '2026-10-25T03:00:00Z', availableUntil: '2026-10-25T08:00:00Z' },
    retention: { operator: 'owner', reference: 'finite-retention-approval', manualEndActionApprovalReference: 'manual-decision-approval',
      endAction: 'separately_approved_manual_decision_no_automatic_unprotect', endsAt: '2026-10-26T03:00:00Z',
      decisionBy: '2026-10-25T05:00:00Z', estimatedUsd: 0.01 } }) });
const roleRows = (id = newId) => ROLE_NAMES.map((name, index) => ({ id: `role${index}`, base_username: name,
  username: `${name}.${id}`, database_name: 'postgres', ready: true, expired: false, deleted_at: null, disabled_at: null,
  dropped_at: null, expires_at: null, with_replication: false, inherited_roles: ['pg_read_all_settings'],
  branch: { id, name: id === RESTORE.sourceId ? 'main' : RESTORE.target, deleted_at: null } }));
const target = () => ({ id: newId, name: RESTORE.target, created_at: '2026-10-25T04:00:00Z', deleted_at: null,
  default: false, kind: 'postgresql', restored_from_branch: { id: RESTORE.sourceId }, deletion_protected: false,
  cluster_name: RESTORE.cluster, cluster_architecture: 'aarch64', region: { slug: RESTORE.region }, replicas: 0,
  minimum_storage_bytes: RESTORE.bytes, maximum_storage_bytes: RESTORE.bytes, ready: true, state: 'ready', frozen: false });
const backup = () => ({ id: RESTORE.backupId, database_branch: { id: RESTORE.sourceId, name: 'main', deleted_at: null },
  state: 'success', deleted_at: null, protected: true, completed_at: '2026-10-25T02:33:09.321Z',
  expires_at: '2026-10-27T02:25:02.838Z', pvc_size: RESTORE.bytes, uncompressed_size: 53237514, restored_branches: [] });
const baseline = () => ({ catalogSha256: 'b'.repeat(64), schemaFingerprint: 'c'.repeat(64), relationCount: 108,
  schemaVersion: '0020_auth_recovery_delivery.sql', approvedPrivilegeChecks: 17, extensionCount: 3 });

function fixture(mode = '') {
  const calls = [], checkpoints = [], b = backup(); let created = false, resets = 0;
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
        if (mode === 'stale') b.completed_at = '2026-10-22T14:00:00Z';
        if (mode === 'completion_mismatch') b.completed_at = '2026-10-25T02:34:00Z';
        if (mode === 'binding_mismatch' && created) b.restored_branches = [{ id: 'other', name: RESTORE.target }];
        return b;
      }
      if (path === `/branches/${RESTORE.target}`) return target();
      throw new Error(`unexpected synthetic path ${path}`);
    },
  };
  const options = { environment: environment(), api, now: () => instant, assertMain: async () => { calls.push('main'); },
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
  return { calls, checkpoints, options };
}

test('qualification restores the specified backup snapshot, exercises five copied credentials and retains target for review', async () => {
  const f = fixture(); const report = await runNativeRestore(f.options);
  assert.equal(report.status, 'TARGET_CHECKS_PASSED_REVIEW_REQUIRED');
  assert.equal(report.cleanup, 'TARGET_RETAINED_PENDING_REVIEW'); assert.equal(report.createdTargetId, newId);
  assert.equal(report.state, 'TARGET_RETAINED_PENDING_REVIEW'); assert.equal(report.qualificationOutcome, 'PASSED');
  assert.equal(report.creation.acknowledged, true); assert.equal(report.credentialReferencesDiscarded, true);
  assert.equal(report.backup.restoreMode, 'SPECIFIED_BACKUP_SNAPSHOT');
  assert.equal(report.credentialActions.length, 5); assert.equal(report.sourceBaseline.approvedPrivilegeChecks, 17);
  assert.equal(report.recoveryAcceptance, 'NOT_CERTIFIED'); assert.equal(report.deploymentAuthorized, false);
  assert.equal(f.calls.filter(value => value.startsWith('POST /branches')).length, 6);
  assert.equal(f.calls.filter(value => /^(DELETE|PATCH)/.test(value)).length, 0);
  assert.ok(f.calls.indexOf('extension_authority') < f.calls.indexOf(`POST /branches/${RESTORE.target}/roles/role1/reset`));
  assert.equal(JSON.stringify(f.checkpoints).includes(password), false);
  assert.doesNotMatch(JSON.stringify(f.checkpoints), /connectionString|postgresql:\/\/|access_host_url/);
});

for (const [mode, blocker, cleanup] of [
  ['authority_denied','provider_access_denied','NOT_NEEDED'], ['preexisting','preexisting_target_refused','NOT_NEEDED'],
  ['stale','backup_stale_or_test_window_too_short','NOT_NEEDED'],
  ['completion_mismatch','fixed_backup_completion_changed','NOT_NEEDED'],
  ['unknown_create','provider_transport_failed','UNBOUND_CREATE_OUTCOME_MANUAL_RECONCILIATION_REQUIRED'],
  ['unprotected','protected_backup_with_finite_retention_plan_is_manual_prerequisite','NOT_NEEDED'],
  ['copied_role_mismatch','copied_role_missing_or_ambiguous','TARGET_RETAINED_PENDING_REVIEW'],
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
  if (['authority_denied','preexisting','stale','completion_mismatch','unprotected'].includes(mode)) assert.equal(mutations.length, 0);
  if (mode === 'unknown_create') assert.equal(report.costEscalationRequired, true);
  assert.equal(mutations.filter(value => /^(DELETE|PATCH)/.test(value)).length, 0);
});

test('plan mode performs no SQL, reset, protection, creation or cleanup', async () => {
  const f = fixture(); f.options.environment.RESTORE_CHECK_EXECUTE = 'false';
  const report = await runNativeRestore(f.options);
  assert.equal(report.status, 'PLAN_ONLY_OWNER_ACTIONS_AND_LIVE_QUALIFICATION_REQUIRED');
  assert.ok(!f.calls.some(value => /^(SQL|POST|PATCH|DELETE)/.test(value)));
});
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
  assert.equal(report.authorityDiagnostic.accessRowCount, 9); assert.equal(urls.length, 3);
  assert.deepEqual(report.providerMutations, []); assert.deepEqual(report.credentialActions, []);
});
test('consumed cleanup reservation blocks qualification before spending', async () => {
  const f = fixture(); f.options.reserveCleanup = async () => ({ workflowId: 42, runNumber: 2 });
  const report = await runNativeRestore(f.options);
  assert.ok(report.blockers.includes('cleanup_reservation_not_approved')); assert.equal(f.calls.length, 1);
});
test('only proven missing named extensions are installed', async () => {
  const f = fixture('missing_extensions'); assert.equal((await runNativeRestore(f.options)).status, 'TARGET_CHECKS_PASSED_REVIEW_REQUIRED');
  assert.equal(f.calls.filter(value => value.startsWith('INSTALL')).length, 1);
});
test('missing, stale, wrong-target, broader-role and unbounded tax/budget records block before any API call', async () => {
  for (const change of [() => undefined, record => ({ ...record, maximumUsd: 6 }), record => ({ ...record, taxAndFeeAllowanceUsd: 0 }),
    record => ({ ...record, estimatedSubtotalUsd: 5 }), record => ({ ...record, target: 'main' }),
    record => ({ ...record, roles: [...ROLE_NAMES, 'postgres'] }), record => ({ ...record, expiresAt: '2026-10-23T18:00:00Z' }),
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
    return suffix === `/branches/${RESTORE.target}` && !options?.method ? { ...row, ready: false, state: 'pending' } : row;
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
    'create_branch', 'connect_branch', 'connect_production_branch', 'restore_production_branch_backup'];
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
  assert.equal(evidence.rows[9].resourceMissing, true); assert.equal(evidence.rows[9].resourceIdMissing, true);
  assert.equal(evidence.rows[10].resourceMissing, false); assert.equal(evidence.rows[10].resourceIdMissing, false);
  assert.equal(evidence.rows[11].resourceTypeIsOrganization, true); assert.equal(evidence.rows[11].deletedAtMissing, true);
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
  'create_branch', 'connect_branch', 'connect_production_branch', 'restore_production_branch_backup'];
const authorityRows = () => authorityAccesses.map(access => ({ access, resource_id: RESTORE.databaseId, resource_type: 'Database',
  resource: { id: RESTORE.databaseId, name: RESTORE.database, deleted_at: null } }));
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
test('GitHub preconditions enforce immutable repository, main, attempt, named human production review and no prior execute', async () => {
  const env = { ...environment(), GH_TOKEN: password, GITHUB_SHA: sha, GITHUB_REF: 'refs/heads/main', REF_PROTECTED: 'true',
    GITHUB_REPOSITORY_ID: '1010752912', GITHUB_REPOSITORY: 'fixture-owner/Lythaus', GITHUB_RUN_ATTEMPT: '1' };
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
test('SQL phase cancellation closes the active connection before returning and never retries a possibly committed extension', async () => {
  const raw = restoredConnection({ ...roleRows()[0], password, access_host_url: 'aws.connect.psdb.cloud' }, newId, RESTORE.setup);
  for (const ddl of [false, true]) {
    const controller = new AbortController(), calls = []; let rejectPending, closed = false;
    const factory = () => ({ connect: async () => {}, end: async () => { calls.push('END'); closed = true; rejectPending?.(controller.signal.reason); },
      query: async sql => {
        calls.push(sql);
        if (sql.includes('current_setting')) return { rows: [{ database: 'postgres', username: RESTORE.setup, session: RESTORE.setup, read_only: 'on', version: '170005' }] };
        if (sql === 'COMMIT' || sql === 'SYNTHETIC_SLOW_READ') {
          return new Promise((resolve, reject) => { rejectPending = reject; controller.abort(new Error('synthetic-deadline')); });
        }
        return { rows: [{ database: 'postgres', username: RESTORE.setup }], command: sql };
      } });
    const work = ddl ? installMissingExtensions(raw, newId, ['unaccent'], factory, controller.signal)
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
