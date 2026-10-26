import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { RESTORE, ROLE_NAMES, ACTIONS, RestoreApi, RestoreCleanupApi, RestoreFailure, CREATE_TARGET_BODY, apiBase } from '../ci/planetscale-native-restore-contract.mjs';
import { runNativeRestore } from '../ci/planetscale-native-restore-check.mjs';
import { branchQualifiedDatabaseTarget } from '../ci/planetscale-0021-target-identity.mjs';
import { REQUIRED_0021_RESTORE_SCOPE, hash0021RestoreEvidenceRecord } from '../ci/planetscale-0021-only-contract.mjs';
import { QUALIFICATION_WORKFLOW, CLEANUP_WORKFLOW, RECORD_PATH, artifactPath, sha256, readTrackedEvidence,
  validateCleanupEvidence, reviewAttestation, inspectCleanupReservation, finalizeQualificationEvidence, githubRead } from '../ci/planetscale-native-restore-evidence.mjs';
import { proveCleanupContext, pendingReceipt, pendingName, deleteReviewedTarget, reconcileReviewedTarget,
  observeOwnedTarget } from '../ci/planetscale-native-restore-cleanup.mjs';

const start = Date.parse(RESTORE.backupCompletedAt) + 90 * 60000, instant = start + 35 * 60000;
const time = minutes => new Date(start + minutes * 60000).toISOString();
const targetId = 'newrestore123', qualificationSha = 'a'.repeat(40), evidenceSha = 'b'.repeat(40), cleanupSha = evidenceSha;
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const branch = () => ({ id: targetId, name: RESTORE.target, created_at: time(1), deleted_at: null,
  default: false, kind: 'postgresql', restored_from_branch: { id: RESTORE.sourceId }, deletion_protected: false });

function fixture() {
  const report = { phase: 'qualification', runId: '12345', sourceMainSha: qualificationSha, startedAt: time(0),
    finishedAt: time(20), verifiedAt: time(20), sourceBranchId: RESTORE.sourceId, backupId: RESTORE.backupId,
    targetName: RESTORE.target, createdTargetId: targetId, state: 'TARGET_RETAINED_PENDING_REVIEW',
    cleanup: 'TARGET_RETAINED_PENDING_REVIEW', qualificationOutcome: 'PASSED', recoveryAcceptance: 'NOT_CERTIFIED',
    creation: { acknowledged: true, id: targetId, name: RESTORE.target, sourceBranchId: RESTORE.sourceId,
      createdAt: time(1), kind: 'postgresql', default: false },
    providerMutations: [{ action: 'create_fixed_restore', outcome: 'ACKNOWLEDGED' }],
    cleanupPermit: { workflowId: 42, runNumber: 1 }, approvalExpiresAt: time(120),
    qualificationStopAt: time(20), escalationAt: time(45), reviewByAt: time(60), cleanupStartByAt: time(105), cleanupDeadlineAt: time(120),
    reviewWindow: { reviewer: 'owner', operator: 'owner' } };
  const record = { schemaVersion: 'lythaus-0021-restore-evidence-v1', sourceBranch: { id: RESTORE.sourceId, name: 'main' },
    selectedBackupId: RESTORE.backupId, restoredBranch: { id: targetId, name: RESTORE.target, state: 'ready', createdAt: time(1) },
    verifiedAt: time(20), artifactPath: artifactPath(report.runId), verifiedScope: ['backup_binding'],
    unresolvedGates: REQUIRED_0021_RESTORE_SCOPE.filter(scope => scope !== 'backup_binding'),
    review: { reviewedAt: time(25), reviewedBy: 'owner', reference: 'owner-reviewed-canonical-evidence' },
    nativeRestoreCleanup: { schemaVersion: 'native-restore-cleanup-intent-v1', state: 'DELETE_PENDING',
      qualificationSha, qualificationRunId: report.runId, qualificationWorkflowId: 41,
      targetId, workflowId: 42, runNumber: 1, artifactId: 51, artifactArchiveSha256: 'd'.repeat(64), evidenceOutcome: 'PASSED' } };
  const evidence = { report, record };
  const env = { RELEASE_SHA: cleanupSha, EVIDENCE_SHA: evidenceSha, EVIDENCE_PR: '999', REVIEW_COMMENT_ID: '88',
    QUALIFICATION_RUN_ID: report.runId, GITHUB_RUN_ID: '23456', GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_REPOSITORY: 'SyntheticOwner/Lythaus', PENDING_ARTIFACT_ID: '52', PENDING_ARTIFACT_DIGEST: 'e'.repeat(64) };
  const calls = [], checkpoints = [], overrides = new Map(); let deleted = false;
  const read = async suffix => {
    calls.push(`GITHUB ${suffix}`);
    if (overrides.has(suffix)) return structuredClone(overrides.get(suffix));
    if (suffix === '/pulls/999') return { state: 'closed', merged: true, merge_commit_sha: evidenceSha,
      head: { repo: { id: 1010752912 }, sha: 'f'.repeat(40) }, base: { repo: { id: 1010752912 }, ref: 'main' } };
    if (suffix === `/compare/${qualificationSha}...${evidenceSha}` || suffix === `/compare/${qualificationSha}...${cleanupSha}`)
      return { merge_base_commit: { sha: qualificationSha }, files: [RECORD_PATH, artifactPath(report.runId)].map(filename => ({ filename, status: 'added' })) };
    if (suffix === `/compare/${evidenceSha}...${env.RELEASE_SHA}`) return { merge_base_commit: { sha: evidenceSha }, files: [] };
    if (suffix === '/issues/comments/88') return { user: { type: 'User', login: 'owner' },
      issue_url: 'https://api.github.com/repos/SyntheticOwner/Lythaus/issues/999', body: reviewAttestation(evidenceSha, record, report),
      created_at: time(26), updated_at: time(26) };
    if (suffix === `/actions/runs/${report.runId}`) return { id: Number(report.runId), workflow_id: 41,
      path: QUALIFICATION_WORKFLOW, head_sha: qualificationSha, head_branch: 'main', event: 'workflow_dispatch',
      run_attempt: 1, status: 'completed', repository: { id: 1010752912 } };
    if (suffix === `/actions/runs/${report.runId}/jobs?per_page=100`) return { total_count: 1,
      jobs: [{ name: 'Qualify isolated native restore without cleanup', status: 'completed',
        steps: [{ name: 'Upload immutable qualification evidence', conclusion: 'success' }] }] };
    if (suffix === '/actions/artifacts/51') return { id: 51, workflow_run: { id: Number(report.runId) },
      name: `native-restore-qualification-${qualificationSha}-${report.runId}`, expired: false,
      digest: `sha256:${'d'.repeat(64)}`, size_in_bytes: 1000 };
    if (suffix === '/actions/artifacts/52') return { id: 52, workflow_run: { id: Number(env.GITHUB_RUN_ID) },
      name: pendingName(report, record.nativeRestoreCleanup), expired: false,
      digest: `sha256:${'e'.repeat(64)}`, size_in_bytes: 500 };
    if (suffix === `/actions/runs/${env.GITHUB_RUN_ID}`) return { id: Number(env.GITHUB_RUN_ID), workflow_id: 42,
      head_sha: env.RELEASE_SHA, head_branch: 'main', path: CLEANUP_WORKFLOW, event: 'workflow_dispatch', run_attempt: 1,
      run_number: Number(env.GITHUB_RUN_NUMBER), repository: { id: 1010752912 } };
    if (suffix === `/actions/runs/${env.GITHUB_RUN_ID}/approvals`) return [{ state: 'approved',
      user: { type: 'User', login: 'owner' }, environments: [{ name: 'production' }] }];
    throw new Error(`unexpected synthetic GitHub path ${suffix}`);
  };
  const api = { authority: async () => { calls.push('AUTHORITY'); },
    list: async () => { calls.push('LIST'); return []; },
    request: async (suffix, options = {}) => {
      const method = options.method ?? 'GET'; calls.push(`${method} ${suffix}`);
      if (method === 'DELETE') { assert.equal(suffix, `/branches/${RESTORE.target}`); deleted = true; return null; }
      assert.equal(method, 'GET');
      if (suffix === `/branches/${RESTORE.target}`) return deleted ? null : branch();
      if (suffix === `/branches/main/backups/${RESTORE.backupId}`) return { id: RESTORE.backupId,
        database_branch: { id: RESTORE.sourceId, name: 'main' }, protected: true, restored_branches: [{ id: targetId, name: RESTORE.target }] };
      throw new Error(`unexpected synthetic provider path ${suffix}`);
    } };
  const options = { env, evidence, evidenceHead: evidenceSha, read, assertMain: async () => { calls.push('MAIN'); },
    api, now: () => instant, checkpoint: receipt => checkpoints.push(receipt), sleep: async () => {} };
  const refresh = () => {
    evidence.bytes = encode(report); record.evidenceSha256 = sha256(evidence.bytes);
    record.recordSha256 = hash0021RestoreEvidenceRecord(record); evidence.recordBytes = encode(record);
    env.CLEANUP_APPROVAL_JSON = JSON.stringify({ action: 'delete_only_original_acknowledged_target_once',
      cleanupSha, evidenceSha, qualificationRunId: report.runId, targetId, recordSha256: record.recordSha256,
      operator: 'owner', maximumUsd: 5, reference: 'separate-owner-deletion-consent', expiresAt: time(119) });
    const context = { report, record, creation: report.creation, intent: record.nativeRestoreCleanup };
    options.pendingBytes = encode(pendingReceipt(context, env)); options.downloadedPending = options.pendingBytes;
    options.downloadedQualification = evidence.bytes;
  };
  refresh();
  return { env, evidence, report, record, options, calls, checkpoints, overrides, refresh,
    setDeleted: value => { deleted = value; } };
}
const deletions = f => f.calls.filter(call => call.startsWith('DELETE ')).length;

for (const fault of [null, 'partial_pagination', 'contradictory_identity']) test(`one whole path ${fault ?? 'converges raw REST roles with reissued IDs, preserves immutable evidence and performs reviewed cleanup'}`, async t => {
  const f = fixture(), requests = [], sourceReads = [], resets = []; let clock = start, created = false, targetReads = 0;
  const roleRows = (source, pending = false) => ROLE_NAMES.map((name, index) => ({ id: `${source ? 'sourceapi' : 'targetapi'}${index}`,
    access_host_url: 'aws.connect.psdb.cloud',
    name: 'synthetic display label', base_username: name, username: `${name}.${source ? RESTORE.sourceId : targetId}`,
    database_name: 'postgres', ready: !(pending && index === 0), expired: false, deleted_at: null, disabled_at: null,
    dropped_at: null, expires_at: null, with_replication: index === 0, inherited_roles: [], default: index === 0,
    branch: { id: source ? RESTORE.sourceId : targetId, name: source ? 'main' : RESTORE.target, deleted_at: null } }));
  const target = () => ({ ...branch(), cluster_name: RESTORE.cluster, cluster_architecture: 'aarch64',
    region: { slug: RESTORE.region }, replicas: 0, minimum_storage_bytes: RESTORE.bytes,
    maximum_storage_bytes: RESTORE.bytes, ready: true, state: 'ready', frozen: false });
  const source = { id: RESTORE.sourceId, name: 'main', kind: 'postgresql', default: true, deleted_at: null, ready: true };
  const api = new RestoreApi('syntheticid:synthetic-value', async (url, options) => {
    const parsed = new URL(url), path = parsed.pathname.slice(new URL(apiBase).pathname.length);
    requests.push({ path, method: options.method });
    if (url === apiBase) return Response.json({ id: RESTORE.databaseId, name: RESTORE.database, kind: 'postgresql' });
    if (url.endsWith('/service-tokens/syntheticid')) return Response.json({ id: 'syntheticid', expires_at: time(180),
      service_token_accesses: ['read_database','read_branch','delete_branch','delete_production_branch','read_backups',
        'create_branch','connect_branch','connect_production_branch','restore_production_branch_backup'].map(access => ({
          access, resource_id: RESTORE.databaseId, resource_type: 'Database',
          resource: { id: RESTORE.databaseId, name: RESTORE.database, deleted_at: null } })) });
    if (path === '/branches/main') return Response.json(source);
    if (path.endsWith(`/backups/${RESTORE.backupId}`)) return Response.json({ id: RESTORE.backupId,
      database_branch: { id: RESTORE.sourceId, name: 'main', deleted_at: null }, state: 'success', deleted_at: null,
      protected: true, completed_at: RESTORE.backupCompletedAt, expires_at: time(48 * 60),
      pvc_size: RESTORE.bytes, uncompressed_size: 53237514, restored_branches: created ? [{ id: targetId, name: RESTORE.target }] : [] });
    if (options.method === 'POST' && path === '/branches') {
      assert.deepEqual(JSON.parse(options.body), CREATE_TARGET_BODY);
      created = true; clock = start + 60000; return Response.json(target(), { status: 201 });
    }
    if (path === `/branches/${RESTORE.target}`) return created ? Response.json(target()) : new Response(null, { status: 404 });
    if (path.endsWith('/reset')) {
      assert.ok(targetReads >= 3, 'no reset before all five pass together');
      const role = roleRows(false).find(row => path === `/branches/${RESTORE.target}/roles/${row.id}/reset`);
      assert.ok(role, 'reset uses a discovered target API ID'); resets.push(role.base_username);
      return Response.json({ ...role, password: 'synthetic-password-only', access_host_url: 'aws.connect.psdb.cloud' });
    }
    const page = Number(parsed.searchParams.get('page'));
    let rows;
    if (path === '/branches') rows = created ? [source,target()] : [source];
    else if (path === '/branches/main/roles') rows = roleRows(true);
    else if (path === `/branches/${RESTORE.target}/roles`) {
      if (page === 1) targetReads++;
      rows = roleRows(false, targetReads === 2); if (targetReads === 1) rows.shift();
      if (fault === 'contradictory_identity') rows[0].branch.id = RESTORE.sourceId;
    } else throw new Error('unexpected synthetic request');
    const next = page === 1 && rows.length > 3 ? 2 : null;
    return Response.json({ type: 'list', current_page: page, per_page: 100,
      total_count: rows.length + (fault === 'partial_pagination' && path.endsWith(`${RESTORE.target}/roles`) && page === 2 ? 1 : 0),
      next_page: next, data: rows.slice((page - 1) * 3, page * 3) });
  });
  const sourceUrl = `postgresql://pscale_api_qodocjs6vgrb.${RESTORE.sourceId}:synthetic-password-only@aws.connect.psdb.cloud/postgres?sslmode=verify-full`;
  const env = { RELEASE_SHA: qualificationSha, GITHUB_RUN_ID: '12345', RESTORE_CHECK_EXECUTE: 'true',
    PLANETSCALE_SCHEMA_READ_DATABASE_URL: sourceUrl,
    RESTORE_CHECK_APPROVAL_JSON: JSON.stringify({ releaseSha: qualificationSha, backupId: RESTORE.backupId, target: RESTORE.target,
      maximumUsd: 5, estimatedSubtotalUsd: 0.04, taxAndFeeAllowanceUsd: 1, backupSnapshotAcknowledged: true,
      reference: 'synthetic-owner-approval-reference', manualOperator: 'owner', expiresAt: time(150), actions: ACTIONS, roles: ROLE_NAMES,
      cumulativeBudget: { operator: 'owner', priorQualificationRunId: '40212030891', evidenceSha256: 'e'.repeat(64),
        reference: 'synthetic-owner-reviewed-cost-upper-bound', priorSpendUpperBoundUsd: 0.01, priorRetentionUpperBoundUsd: 0.02,
        priorRetentionEndActionReference: 'synthetic-separate-prior-retention-end-action', priorRetentionEndsAt: time(1380) },
      cleanupPermit: { workflowId: 42, runNumber: 1 }, reviewWindow: { reviewer: 'owner', operator: 'owner', reserved: true,
        availableFrom: time(0), availableUntil: time(150) }, retention: { operator: 'owner', reference: 'synthetic-retention-approval',
        manualEndActionApprovalReference: 'synthetic-end-action', endAction: 'separately_approved_manual_decision_no_automatic_unprotect',
        endsAt: time(1380), decisionBy: time(60), estimatedUsd: 0.01 } }) };
  const baseline = { catalogSha256: 'c'.repeat(64), schemaFingerprint: 'd'.repeat(64), relationCount: 103,
    schemaVersion: '0020_auth_recovery_delivery.sql', approvedPrivilegeChecks: 17, extensionCount: 3,
    extensionSpecifications: ['pg_trgm','pgcrypto','unaccent'].map(extname => ({ extname, extversion: '1.0',
      schema: 'public', owner: 'postgres', extrelocatable: true })) };
  const qualification = await runNativeRestore({ environment: env, api, now: () => clock,
    reviewedOriginFingerprint: branchQualifiedDatabaseTarget(sourceUrl).originFingerprint,
    assertMain: async () => {}, reserveCleanup: async () => ({ workflowId: 42, runNumber: 1 }),
    sleep: async milliseconds => { clock += milliseconds; }, prepareSmoke: async () => ({}),
    readSession: async (_url, id) => { sourceReads.push(id); return baseline; }, extensionAuthority: async () => [],
    smoke: async connections => { assert.equal(Object.keys(connections).length, 4); return { readOnlyDatabaseIdentity: true, distinctRoles: 4 }; } });
  if (fault) {
    assert.equal(qualification.qualificationOutcome, 'FAILED'); assert.deepEqual(resets, []);
    assert.equal(qualification.cleanup, 'TARGET_RETAINED_PENDING_REVIEW');
    assert.equal(requests.filter(row => row.method === 'POST').length, 1);
    assert.equal(qualification.recoveryAcceptance, 'NOT_CERTIFIED');
    return;
  }
  assert.equal(qualification.qualificationOutcome, 'PASSED'); assert.deepEqual(resets, ROLE_NAMES);
  assert.deepEqual(qualification.roleInventoryObservations.map(row => [row.missing.length,row.pending.length]), [[1,0],[0,1],[0,0]]);
  assert.equal(sourceReads.filter(id => id === RESTORE.sourceId).length, 3);
  assert.equal(requests.filter(row => row.method === 'POST').length, 6);
  assert.ok(requests.every(row => !['DELETE','PATCH'].includes(row.method)));
  Object.assign(f.report, qualification); f.record.verifiedAt = qualification.verifiedAt;
  f.record.restoredBranch.createdAt = qualification.creation.createdAt; f.refresh();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-whole-path-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'qualification.json'), f.evidence.bytes, { flag: 'wx' });
  assert.equal(finalizeQualificationEvidence(root, instant), sha256(f.evidence.bytes));
  const before = fs.readFileSync(path.join(root, 'qualification.json'));
  const cleanup = await deleteReviewedTarget(f.options);
  assert.equal(cleanup.state, 'DELETED_AND_READBACK_VERIFIED'); assert.equal(deletions(f), 1);
  assert.equal(cleanup.recoveryCertified, false); assert.equal(qualification.recoveryAcceptance, 'NOT_CERTIFIED');
  assert.deepEqual(fs.readFileSync(path.join(root, 'qualification.json')), before);
});

test('cleanup and reconciliation reject missing or malformed dedicated access even with a valid shared pair', async t => {
  const request = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected provider request'); });
  for (const operation of [deleteReviewedTarget, reconcileReviewedTarget]) {
    for (const token of [undefined, '', 'id-only', ':secret', 'id:', 'id:secret:extra', 'id:secret\n']) {
      const f = fixture(); f.options.api = undefined;
      Object.assign(f.env, { PLANETSCALE_API_TOKEN: 'sharedsynthetic:shared-synthetic-value', PLANETSCALE_RESTORE_API_TOKEN: token });
      await assert.rejects(() => operation(f.options), /existing_service_token_pair_required/);
      assert.equal(f.calls.length, 0); assert.equal(deletions(f), 0);
    }
  }
  assert.equal(request.mock.callCount(), 0);
});
test('dedicated access cannot bypass separate deletion consent; reconciliation uses it only for GET', async t => {
  const f = fixture(), pair = 'restoresynthetic:restore-synthetic-value';
  f.options.api = undefined;
  Object.assign(f.env, { PLANETSCALE_RESTORE_API_TOKEN: pair, PLANETSCALE_API_TOKEN: 'sharedsynthetic:shared-synthetic-value' });
  delete f.env.CLEANUP_APPROVAL_JSON;
  const request = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.method, 'GET'); assert.equal(options.headers.authorization, pair);
    assert.equal(url, `https://api.planetscale.com/v1/organizations/${RESTORE.organization}/databases/${RESTORE.database}/branches/${RESTORE.target}`);
    return Response.json(branch());
  });
  const cleanup = await deleteReviewedTarget(f.options);
  assert.equal(cleanup.state, 'BLOCKED_WITHOUT_DELETE'); assert.equal(cleanup.providerMutations, false);
  assert.ok(cleanup.blockers.includes('separate_cleanup_owner_approval_required')); assert.equal(request.mock.callCount(), 0);
  const reconciliation = await reconcileReviewedTarget(f.options);
  assert.equal(reconciliation.state, 'TARGET_PRESENT_READ_ONLY'); assert.equal(reconciliation.providerMutations, false);
  assert.equal(request.mock.callCount(), 1); assert.equal(deletions(f), 0);
});

test('reviewed tracked evidence and uploaded pending intent precede exactly one DELETE; qualification bytes stay unchanged', async () => {
  const f = fixture(), bytes = Buffer.from(f.evidence.bytes), result = await deleteReviewedTarget(f.options);
  assert.equal(result.state, 'DELETED_AND_READBACK_VERIFIED'); assert.equal(result.deleteAcknowledgment, 'ACKNOWLEDGED');
  assert.equal(result.deletionVerified, true); assert.equal(result.recoveryCertified, false); assert.equal(deletions(f), 1);
  assert.equal(f.checkpoints[0].state, 'DELETE_PENDING');
  assert.ok(f.calls.indexOf('GITHUB /actions/artifacts/52') < f.calls.findIndex(call => call.startsWith('DELETE ')));
  assert.deepEqual(f.evidence.bytes, bytes); assert.equal(f.report.state, 'TARGET_RETAINED_PENDING_REVIEW');
  assert.equal(f.calls.filter(call => /^(POST|PATCH|SQL)/.test(call)).length, 0);
});

for (const boundary of ['provider preflight', 'main recheck', 'pending checkpoint', 'final target read']) {
  test(`expired deletion consent after ${boundary} blocks the final DELETE`, async () => {
    const f = fixture(); let clock = instant;
    const consent = JSON.parse(f.env.CLEANUP_APPROVAL_JSON);
    consent.expiresAt = time(36); f.env.CLEANUP_APPROVAL_JSON = JSON.stringify(consent);
    f.options.now = () => clock;
    if (boundary === 'provider preflight') f.options.api.authority = async () => { clock = start + 36 * 60000; };
    if (boundary === 'main recheck') {
      let checks = 0;
      f.options.assertMain = async () => { if (++checks === 2) clock = start + 36 * 60000; };
    }
    if (boundary === 'pending checkpoint') f.options.checkpoint = receipt => {
      f.checkpoints.push(receipt);
      if (receipt.state === 'DELETE_PENDING') clock = start + 36 * 60000;
    };
    if (boundary === 'final target read') {
      const request = f.options.api.request; let reads = 0;
      f.options.api.request = async (path, options) => {
        const row = await request(path, options);
        if (path === `/branches/${RESTORE.target}` && !options?.method && ++reads === 2) clock = start + 36 * 60000;
        return row;
      };
    }
    const result = await deleteReviewedTarget(f.options);
    assert.equal(result.state, 'BLOCKED_WITHOUT_DELETE');
    assert.equal(result.providerMutations, false); assert.equal(deletions(f), 0);
    assert.ok(result.blockers.includes('cleanup_owner_approval_binding_invalid'));
    assert.equal(result.recoveryCertified, false);
  });
}

test('a pending checkpoint crossing the final deadline reserve blocks DELETE', async () => {
  const f = fixture(); let clock = instant;
  f.options.now = () => clock;
  f.options.checkpoint = receipt => {
    f.checkpoints.push(receipt);
    if (receipt.state === 'DELETE_PENDING') clock = start + 119 * 60000;
  };
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.state, 'BLOCKED_WITHOUT_DELETE');
  assert.equal(result.providerMutations, false); assert.equal(deletions(f), 0);
  assert.ok(result.blockers.includes('cleanup_phase_deadline_expired'));
});

test('the original qualification approval must remain valid at DELETE', async () => {
  const f = fixture(); let clock = instant;
  f.report.approvalExpiresAt = time(36); f.refresh();
  f.options.now = () => clock;
  f.options.checkpoint = receipt => {
    if (receipt.state === 'DELETE_PENDING') clock = start + 36 * 60000;
  };
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.state, 'BLOCKED_WITHOUT_DELETE'); assert.equal(deletions(f), 0);
  assert.ok(result.blockers.includes('cleanup_phase_deadline_expired'));
});

test('protected main is rechecked after the durable pending checkpoint', async () => {
  const f = fixture(); let pending = false;
  f.options.checkpoint = receipt => { if (receipt.state === 'DELETE_PENDING') pending = true; };
  f.options.assertMain = async () => { if (pending) throw new RestoreFailure('current_protected_main_changed'); };
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.state, 'BLOCKED_WITHOUT_DELETE'); assert.equal(deletions(f), 0);
  assert.ok(result.blockers.includes('current_protected_main_changed'));
});

for (const boundary of ['pending checkpoint', 'main recheck']) test(`same-name replacement during ${boundary} blocks DELETE`, async () => {
  const f = fixture(), request = f.options.api.request; let replaced = false, mainChecks = 0;
  f.options.api.request = async (path, options) => {
    const row = await request(path, options);
    return replaced && path === `/branches/${RESTORE.target}` && options?.method !== 'DELETE'
      ? { ...row, id: 'replacementid' } : row;
  };
  if (boundary === 'pending checkpoint') f.options.checkpoint = receipt => { if (receipt.state === 'DELETE_PENDING') replaced = true; };
  else f.options.assertMain = async () => { if (++mainChecks === 2) replaced = true; };
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.state, 'BLOCKED_WITHOUT_DELETE'); assert.equal(deletions(f), 0);
  assert.ok(result.blockers.includes('created_target_ownership_changed'));
});

test('post-DELETE readback converges GET-only under the original deadline without repeating DELETE', async () => {
  const f = fixture(), request = f.options.api.request; let sent = false, reads = 0;
  f.options.api.request = async (path, options = {}) => {
    if (options.method === 'DELETE') sent = true;
    const row = await request(path, options);
    return sent && path === `/branches/${RESTORE.target}` && options.method !== 'DELETE' && ++reads < 3 ? branch() : row;
  };
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.deletionVerified, true); assert.equal(deletions(f), 1);
  assert.deepEqual(result.deletionObservations.map(row => row.state), ['PRESENT','PRESENT','ABSENCE_VERIFIED']);
});

test('post-DELETE replacement is terminal and cannot trigger a second DELETE', async () => {
  const f = fixture(), request = f.options.api.request; let sent = false;
  f.options.api.request = async (path, options = {}) => {
    if (options.method === 'DELETE') sent = true;
    const row = await request(path, options);
    return sent && path === `/branches/${RESTORE.target}` && options.method !== 'DELETE' ? { ...branch(), id: 'replacementid' } : row;
  };
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.deletionVerified, false); assert.equal(deletions(f), 1);
  assert.ok(result.blockers.includes('created_target_ownership_changed'));
});

test('post-DELETE polling cannot create a new cleanup window or issue reads after the original deadline', async () => {
  const f = fixture(), request = f.options.api.request; let sent = false, clock = instant, reads = 0;
  f.options.now = () => clock;
  f.options.sleep = async () => { clock = start + RESTORE.maximumMs; };
  f.options.api.request = async (path, options = {}) => {
    if (options.method === 'DELETE') sent = true;
    const row = await request(path, options);
    if (sent && path === `/branches/${RESTORE.target}` && options.method !== 'DELETE') { reads++; return branch(); }
    return row;
  };
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.deletionVerified, false); assert.equal(deletions(f), 1); assert.equal(reads, 1);
});

for (const [name, change] of [
  ['no human review', f => { f.record.review = null; }],
  ['artifact bytes changed', f => { f.options.downloadedQualification = Buffer.from('{}'); }],
  ['hash mismatch', f => { f.record.evidenceSha256 = 'f'.repeat(64); }],
  ['record hash mismatch', f => { f.record.recordSha256 = 'f'.repeat(64); }],
  ['unacknowledged creation', f => { f.report.creation.acknowledged = false; f.refresh(); }],
  ['discovered target without create acknowledgment', f => { f.report.providerMutations = []; f.refresh(); }],
  ['target ID changed', f => { f.record.restoredBranch.id = 'other'; f.refresh(); }],
  ['source changed', f => { f.report.sourceBranchId = 'other'; f.refresh(); }],
  ['backup changed', f => { f.record.selectedBackupId = 'other'; f.refresh(); }],
  ['qualification SHA changed', f => { f.record.nativeRestoreCleanup.qualificationSha = 'f'.repeat(40); f.refresh(); }],
  ['different cleanup permit', f => { f.record.nativeRestoreCleanup.runNumber = 2; f.refresh(); }],
  ['pending intent not uploaded', f => { delete f.env.PENDING_ARTIFACT_ID; }],
  ['pending bytes changed', f => { f.options.pendingBytes = Buffer.from('{}'); }],
  ['pending downloaded bytes changed', f => { f.options.downloadedPending = Buffer.from('{}'); }],
  ['missing separate irreversible deletion approval', f => { delete f.env.CLEANUP_APPROVAL_JSON; }],
  ['wrong evidence commit', f => { f.options.evidenceHead = 'f'.repeat(40); }],
  ['rerun same run ID', f => { f.env.GITHUB_RUN_ATTEMPT = '2'; }],
  ['new dispatch cannot reuse permit', f => { f.env.GITHUB_RUN_NUMBER = '2'; f.env.GITHUB_RUN_ID = '23457'; f.refresh(); }],
  ['late cleanup start', f => { f.options.now = () => start + 106 * 60000; }],
  ['expired two-hour phase', f => { f.options.now = () => start + 121 * 60000; }],
  ['fabricated extended phase', f => { f.report.cleanupDeadlineAt = time(180); f.refresh(); }],
  ['fake prior cleanup in qualification', f => { f.report.state = 'DELETED_AND_READBACK_VERIFIED'; f.refresh(); }],
]) test(`blocks without DELETE: ${name}`, async () => {
  const f = fixture(); change(f);
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.deletionVerified, false); assert.equal(result.providerMutations, false);
  assert.equal(result.state, 'BLOCKED_WITHOUT_DELETE'); assert.equal(deletions(f), 0);
});

for (const [name, suffix, value] of [
  ['qualification upload failed', '/actions/runs/12345/jobs?per_page=100', { total_count: 1, jobs: [{ name: 'Qualify isolated native restore without cleanup', status: 'completed', steps: [{ name: 'Upload immutable qualification evidence', conclusion: 'failure' }] }] }],
  ['qualification artifact unavailable', '/actions/artifacts/51', {}],
  ['unmerged evidence PR', '/pulls/999', { state: 'open', merged: false, head: { repo: { id: 1010752912 }, sha: evidenceSha } }],
  ['pending upload not durable', '/actions/artifacts/52', {}],
  ['pending upload expired', '/actions/artifacts/52', { id: 52, expired: true }],
  ['unapproved production environment', '/actions/runs/23456/approvals', []],
  ['qualification job still running', '/actions/runs/12345', { status: 'in_progress' }],
  ['reviewed code changed', `/compare/${qualificationSha}...${cleanupSha}`, { merge_base_commit: { sha: qualificationSha }, files: [{ filename: 'scripts/arbitrary.mjs' }] }],
]) test(`missing authoritative proof blocks DELETE: ${name}`, async () => {
  const f = fixture(); f.overrides.set(suffix, value); const result = await deleteReviewedTarget(f.options);
  assert.equal(result.deletionVerified, false); assert.equal(deletions(f), 0);
});

for (const [name, change] of [
  ['edited comment', comment => ({ ...comment, updated_at: time(27) })],
  ['late human review', comment => ({ ...comment, created_at: time(61), updated_at: time(61) })],
  ['bot review', comment => ({ ...comment, user: { type: 'Bot', login: 'owner' } })],
  ['different evidence acknowledgment', comment => ({ ...comment, body: 'Approved' })],
]) test(`exact human review is required: ${name}`, async () => {
  const f = fixture(), comment = await f.options.read('/issues/comments/88');
  f.overrides.set('/issues/comments/88', change(comment));
  const result = await deleteReviewedTarget(f.options); assert.equal(result.deletionVerified, false); assert.equal(deletions(f), 0);
});

test('reviewed failed qualification permits cleanup while all recovery scope stays unresolved', async () => {
  const f = fixture(); f.report.qualificationOutcome = 'FAILED'; f.record.nativeRestoreCleanup.evidenceOutcome = 'FAILED';
  f.record.verifiedScope = []; f.record.unresolvedGates = [...REQUIRED_0021_RESTORE_SCOPE]; f.refresh();
  const result = await deleteReviewedTarget(f.options); assert.equal(result.deletionVerified, true);
  assert.equal(result.recoveryCertified, false); assert.deepEqual(f.record.verifiedScope, []);
  f.record.verifiedScope = ['application_smoke']; f.refresh();
  assert.throws(() => validateCleanupEvidence({ ...f.evidence, qualificationRunId: '12345', now: instant }), /failure_evidence_cannot_certify/);
});

test('lost DELETE acknowledgment and present target remain uncertain; new dispatch cannot issue DELETE', async () => {
  const f = fixture(), original = f.options.api.request;
  f.options.api.request = async (suffix, options = {}) => {
    if (options.method === 'DELETE') { f.calls.push(`DELETE ${suffix}`); throw new RestoreFailure('provider_transport_failed', 'UNKNOWN_MUTATION_OUTCOME'); }
    return original(suffix, options);
  };
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.deletionVerified, false); assert.match(result.state, /UNCERTAIN/); assert.equal(deletions(f), 1);
  f.env.GITHUB_RUN_ID = '23457'; f.env.GITHUB_RUN_NUMBER = '2'; f.refresh();
  const second = await deleteReviewedTarget(f.options); assert.equal(second.providerMutations, false); assert.equal(deletions(f), 1);
  f.setDeleted(true);
  const observed = await reconcileReviewedTarget(f.options);
  assert.equal(observed.state, 'ABSENCE_OBSERVED_READ_ONLY'); assert.equal(observed.providerMutations, false);
  assert.equal(observed.deletionVerified, false); assert.equal(deletions(f), 1);
});
test('lost acknowledgment can be resolved only by independent absence readback, never another DELETE', async () => {
  const f = fixture(), original = f.options.api.request;
  f.options.api.request = async (suffix, options = {}) => {
    const result = await original(suffix, options);
    if (options.method === 'DELETE') throw new RestoreFailure('provider_transport_failed', 'UNKNOWN_MUTATION_OUTCOME');
    return result;
  };
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.state, 'DELETED_READBACK_VERIFIED_ACK_UNCERTAIN'); assert.equal(result.deletionVerified, true);
  assert.equal(deletions(f), 1);
});
test('post-delete backup inventory need not retain a deleted relationship; original binding is proven before DELETE', async () => {
  const f = fixture(), original = f.options.api.request; let attempted = false;
  f.options.api.request = async (suffix, options = {}) => {
    if (options.method === 'DELETE') attempted = true;
    const result = await original(suffix, options);
    return attempted && suffix.includes('/backups/') ? { ...result, restored_branches: [] } : result;
  };
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.deletionVerified, true); assert.equal(result.preDeleteBindingVerified, true); assert.equal(deletions(f), 1);
});

const malformed = [
  ['omitted timestamp', row => { delete row.deleted_at; return row; }],
  ['null timestamp', row => ({ ...row, deleted_at: null })],
  ['malformed timestamp', row => ({ ...row, deleted_at: 'not-a-date' })],
  ['numeric timestamp', row => ({ ...row, deleted_at: 12345 })],
  ['impossible timestamp', row => ({ ...row, deleted_at: '2026-02-30T17:20:00Z' })],
  ['future timestamp', row => ({ ...row, deleted_at: time(40) })],
  ['timestamp before creation', row => ({ ...row, deleted_at: time(0) })],
  ['wrong ID', row => ({ ...row, id: 'other' })],
  ['wrong name', row => ({ ...row, name: 'main' })],
  ['wrong source', row => ({ ...row, restored_from_branch: { id: 'other' } })],
  ['wrong kind', row => ({ ...row, kind: 'mysql' })],
  ['default branch', row => ({ ...row, default: true })],
  ['changed creation time', row => ({ ...row, created_at: time(2) })],
];
for (const [name, change] of malformed) test(`malformed readback cannot certify cleanup: ${name}`, async () => {
  const f = fixture(), original = f.options.api.request; let attempted = false;
  f.options.api.request = async (suffix, options = {}) => {
    if (options.method === 'DELETE') attempted = true;
    if (suffix === `/branches/${RESTORE.target}` && options.absent && attempted)
      return change({ ...branch(), deleted_at: time(30) });
    return original(suffix, options);
  };
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.deletionVerified, false); assert.match(result.state, /UNCERTAIN/); assert.equal(deletions(f), 1);
});
test('explicit exact deletion timestamp succeeds, but incomplete inventory and GET 204 fail closed', async () => {
  const f = fixture(), context = { creation: f.report.creation }, row = { ...branch(), deleted_at: time(30) };
  const api = { request: async suffix => suffix.includes('/backups/') ? { id: RESTORE.backupId,
    database_branch: { id: RESTORE.sourceId, name: 'main' }, restored_branches: [{ id: targetId, name: RESTORE.target }] } : row,
  list: async () => [row] };
  assert.equal((await observeOwnedTarget(api, context, instant, true)).deletionObserved, true);
  api.list = async () => [{ id: targetId, name: RESTORE.target }];
  await assert.rejects(() => observeOwnedTarget(api, context, instant, true), /target_identity_still_present/);
  const transport = new RestoreCleanupApi('fixture-id:fixture-token', async () => new Response(null, { status: 204 }));
  await assert.rejects(() => observeOwnedTarget(transport, context, instant, true), /provider_response_invalid/);
});
test('authority or provider identity changes stop before DELETE', async () => {
  for (const mode of ['authority', 'target', 'backup']) {
    const f = fixture(), original = f.options.api.request;
    if (mode === 'authority') f.options.api.authority = async () => { throw new RestoreFailure('provider_access_denied', 'DENIED'); };
    else f.options.api.request = async (suffix, options) => {
      const row = await original(suffix, options);
      return mode === 'target' && suffix.endsWith(RESTORE.target) ? { ...row, id: 'replacement' }
        : mode === 'backup' && suffix.includes('/backups/') ? { ...row, id: 'different' } : row;
    };
    const result = await deleteReviewedTarget(f.options); assert.equal(result.providerMutations, false); assert.equal(deletions(f), 0);
  }
});

test('canonical evidence must be tracked, regular, committed and byte-identical; upload alone is insufficient', t => {
  const f = fixture(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-reviewed-data-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
  git(['init', '-q']);
  for (const [name, bytes] of [[RECORD_PATH, f.evidence.recordBytes], [artifactPath('12345'), f.evidence.bytes]]) {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  }
  assert.throws(() => readTrackedEvidence(root, '12345'), /not_tracked_regular_file/);
  git(['add', '.']); git(['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'Synthetic reviewed data']);
  assert.deepEqual(readTrackedEvidence(root, '12345').bytes, f.evidence.bytes);
  fs.appendFileSync(path.join(root, artifactPath('12345')), ' ');
  assert.throws(() => readTrackedEvidence(root, '12345'), /worktree_modified/);
  fs.unlinkSync(path.join(root, artifactPath('12345'))); fs.symlinkSync(path.join(root, RECORD_PATH), path.join(root, artifactPath('12345')));
  assert.throws(() => readTrackedEvidence(root, '12345'), /file_invalid/);
});
test('interrupted qualification finalizes once as retained UNKNOWN; final bytes cannot be rewritten by cleanup', t => {
  const f = fixture(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-finalize-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'checkpoint.json'), encode(f.report));
  const digest = finalizeQualificationEvidence(root, instant), bytes = fs.readFileSync(path.join(root, 'qualification.json'));
  const report = JSON.parse(bytes); assert.equal(report.state, 'TARGET_RETAINED_PENDING_REVIEW');
  assert.equal(report.qualificationOutcome, 'UNKNOWN'); assert.equal(report.recoveryAcceptance, 'NOT_CERTIFIED');
  assert.equal(report.qualificationStopAt, time(20)); assert.equal(report.cleanupDeadlineAt, time(120));
  assert.equal(finalizeQualificationEvidence(root, instant + 60000), digest);
  assert.deepEqual(fs.readFileSync(path.join(root, 'qualification.json')), bytes);
});
test('interrupted create without a bound acknowledged target is manual reconciliation, never delete eligibility', t => {
  const cases = [
    { outcome: 'PENDING_OR_UNKNOWN', creation: null, createdTargetId: null },
    { outcome: 'UNKNOWN_MUTATION_OUTCOME', creation: null, createdTargetId: null },
    { outcome: 'ACKNOWLEDGED', creation: null, createdTargetId: 'newrestore123' },
    { outcome: 'ACKNOWLEDGED', creation: { acknowledged: true, id: 'otherTarget', name: RESTORE.target }, createdTargetId: 'newrestore123' },
  ];
  for (const [index, scenario] of cases.entries()) {
    const f = fixture(), root = fs.mkdtempSync(path.join(os.tmpdir(), `restore-create-finalize-${index}-`));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const report = structuredClone(f.report);
    report.creation = scenario.creation;
    report.createdTargetId = scenario.createdTargetId;
    report.state = 'NO_TARGET_CREATED'; report.cleanup = 'NOT_NEEDED';
    report.providerMutations = [{ action: 'create_fixed_restore', outcome: scenario.outcome }];
    fs.writeFileSync(path.join(root, 'checkpoint.json'), encode(report));
    finalizeQualificationEvidence(root, instant);
    const finalized = JSON.parse(fs.readFileSync(path.join(root, 'qualification.json'), 'utf8'));
    assert.equal(finalized.state, 'UNBOUND_CREATE_OUTCOME_MANUAL_RECONCILIATION_REQUIRED');
    assert.equal(finalized.cleanup, 'UNBOUND_CREATE_OUTCOME_MANUAL_RECONCILIATION_REQUIRED');
    assert.equal(finalized.qualificationOutcome, 'UNKNOWN');
    assert.equal(finalized.recoveryAcceptance, 'NOT_CERTIFIED');
    assert.equal(finalized.credentialActions?.length ?? 0, 0);
    assert.equal(finalized.providerMutations.length, 1);
    assert.equal(finalized.creation?.acknowledged === true && finalized.creation.id === finalized.createdTargetId, false);
  }
});
test('provider capabilities separate qualification from deletion; cleanup cannot create, reset or protect', async () => {
  let calls = 0;
  const fetch = async () => { calls++; throw new Error('must never reach provider'); };
  const qualifier = new RestoreApi('fixture-id:fixture-token', fetch), cleanup = new RestoreCleanupApi('fixture-id:fixture-token', fetch);
  await assert.rejects(() => qualifier.request(`/branches/${RESTORE.target}`, { method: 'DELETE' }), /fixed_provider_operation/);
  for (const [suffix, options] of [
    ['/branches', { method: 'POST', body: CREATE_TARGET_BODY }],
    [`/branches/${RESTORE.target}/roles/role0/reset`, { method: 'POST' }],
    [`/branches/main/backups/${RESTORE.backupId}`, { method: 'PATCH', body: { protected: true } }],
    ['/branches/main', { method: 'DELETE' }],
  ]) await assert.rejects(() => cleanup.request(suffix, options), /fixed_provider_operation/);
  assert.equal(calls, 0);
});
test('cleanup reservation rejects incomplete history or recreated workflow identity', async () => {
  const env = {};
  const read = async suffix => suffix.endsWith('.yml') ? { id: 42, path: CLEANUP_WORKFLOW, state: 'active' }
    : { total_count: 1, workflow_runs: [{ run_number: 7 }] };
  assert.deepEqual(await inspectCleanupReservation(env, read), { workflowId: 42, runNumber: 8 });
  await assert.rejects(() => inspectCleanupReservation(env, async suffix => suffix.endsWith('.yml')
    ? { id: 42, path: CLEANUP_WORKFLOW, state: 'active' } : { total_count: 101, workflow_runs: [] }), /history_incomplete/);
});
test('GitHub evidence reads reject redirects and redact transport details', async () => {
  const env = { GITHUB_REPOSITORY: 'SyntheticOwner/Lythaus', GH_TOKEN: 'synthetic-secret' };
  await assert.rejects(() => githubRead(env, '/actions/runs/1', async () => { throw new Error(env.GH_TOKEN); }),
    error => error.code === 'github_evidence_transport_failed' && !error.message.includes(env.GH_TOKEN));
  await assert.rejects(() => githubRead(env, '/actions/runs/1', async () => ({ status: 200, redirected: true })), /evidence_read_failed/);
});
test('workflow phase boundary uploads pending evidence before DELETE and never executes evidence-branch code', () => {
  const qualification = fs.readFileSync(new URL('../../.github/workflows/planetscale-native-restore-check.yml', import.meta.url), 'utf8');
  const cleanup = fs.readFileSync(new URL('../../.github/workflows/planetscale-native-restore-cleanup.yml', import.meta.url), 'utf8');
  assert.match(qualification, /Upload immutable qualification evidence/); assert.doesNotMatch(qualification, /cleanup\.mjs/);
  assert.ok(cleanup.indexOf('Persist pending deletion before any DELETE') < cleanup.indexOf('Delete original acknowledged target once'));
  assert.match(cleanup, /default: reconcile/); assert.doesNotMatch(cleanup, /PLANETSCALE_SCHEMA_READ_DATABASE_URL|working-directory: restore-review/);
  assert.match(cleanup, /persist-credentials: false/); assert.doesNotMatch(cleanup, /contents: write|actions: write/);
  assert.notEqual(qualificationSha, evidenceSha); assert.equal(cleanupSha, evidenceSha);
});
test('only gated restore provider steps receive the dedicated secret; unrelated workflows keep shared access', () => {
  const directory = new URL('../../.github/workflows/', import.meta.url);
  const qualificationName = 'planetscale-native-restore-check.yml', cleanupName = 'planetscale-native-restore-cleanup.yml';
  const qualification = YAML.parse(fs.readFileSync(new URL(qualificationName, directory), 'utf8'));
  const cleanup = YAML.parse(fs.readFileSync(new URL(cleanupName, directory), 'utf8'));
  const key = 'PLANETSCALE_RESTORE_API_TOKEN', value = '${{ secrets.PLANETSCALE_RESTORE_API_TOKEN }}';
  for (const [workflow, job, commands] of [
    [qualification, qualification.jobs.qualify, ['node scripts/ci/planetscale-native-restore-check.mjs']],
    [cleanup, cleanup.jobs.cleanup, ['node scripts/ci/planetscale-native-restore-reviewed-cleanup.mjs delete',
      'node scripts/ci/planetscale-native-restore-reviewed-cleanup.mjs reconcile']],
  ]) {
    assert.equal(job.environment, 'production'); assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
    assert.equal(workflow.env?.[key], undefined); assert.equal(job.env?.[key], undefined);
    const steps = job.steps.filter(step => Object.hasOwn(step.env ?? {}, key));
    assert.deepEqual(steps.map(step => step.run), commands);
    for (const step of steps) assert.equal(step.env[key], value);
    assert.doesNotMatch(JSON.stringify(workflow), /PLANETSCALE_API_TOKEN/);
  }
  assert.equal(qualification.on.workflow_dispatch.inputs.execute.default, false);
  assert.equal(cleanup.on.workflow_dispatch.inputs.mode.default, 'reconcile');
  assert.equal(cleanup.jobs.cleanup.env.CLEANUP_APPROVAL_JSON, '${{ inputs.cleanup_approval_json }}');
  const deletion = cleanup.jobs.cleanup.steps.find(step => step.run === 'node scripts/ci/planetscale-native-restore-reviewed-cleanup.mjs delete');
  assert.equal(deletion.if, "inputs.mode == 'cleanup'");
  const sharedConsumers = ['deploy-alpha-web.yml', 'deploy-control-panel.yml', 'deploy-marketing.yml',
    'native-adr003-acceptance.yml', 'native-budget-acceptance.yml', 'native-workers-deploy.yml',
    'planetscale-account-audit.yml', 'planetscale-cutover-identity-preflight.yml', 'planetscale-production-migrations.yml',
    'planetscale-verifier-stats.yml', 'product-privilege-grants.yml', 'product-privilege-preflight.yml', 'production-release.yml'];
  for (const filename of fs.readdirSync(directory).filter(name => /\.ya?ml$/.test(name))) {
    if ([qualificationName, cleanupName].includes(filename)) continue;
    const source = fs.readFileSync(new URL(filename, directory), 'utf8');
    assert.doesNotMatch(source, /PLANETSCALE_RESTORE_API_TOKEN/, filename);
    if (sharedConsumers.includes(filename)) assert.match(source,
      /PLANETSCALE_API_TOKEN:\s*\$\{\{ secrets\.PLANETSCALE_API_TOKEN \}\}/, filename);
  }
  assert.ok(sharedConsumers.every(filename => fs.existsSync(new URL(filename, directory))));
});
test('qualification work and finalization have independent budgets before escalation; phase locks cannot block each other', () => {
  const qualification = YAML.parse(fs.readFileSync(new URL('../../.github/workflows/planetscale-native-restore-check.yml', import.meta.url), 'utf8'));
  const cleanup = YAML.parse(fs.readFileSync(new URL('../../.github/workflows/planetscale-native-restore-cleanup.yml', import.meta.url), 'utf8'));
  const job = qualification.jobs.qualify;
  const runner = job.steps.find(step => step.name === 'Run fixed-target runner using only existing protected access');
  const finalizer = job.steps.find(step => step.name === 'Finalize immutable qualification evidence without provider access');
  const upload = job.steps.find(step => step.name === 'Upload immutable qualification evidence');
  assert.equal(RESTORE.qualificationStopMs, 20 * 60000); assert.equal(runner['timeout-minutes'], 22);
  assert.equal(finalizer['timeout-minutes'], 2); assert.equal(upload['timeout-minutes'], 2);
  assert.equal(finalizer.if, 'always()'); assert.equal(upload.if, 'always()');
  assert.ok(runner['timeout-minutes'] + finalizer['timeout-minutes'] + upload['timeout-minutes'] < job['timeout-minutes']);
  assert.ok(job.steps.every(step => Number.isInteger(step['timeout-minutes']) && step['timeout-minutes'] > 0));
  assert.ok(job.steps.reduce((total, step) => total + step['timeout-minutes'], 0) < job['timeout-minutes']);
  assert.equal(job['timeout-minutes'], 36); assert.ok(job['timeout-minutes'] * 60000 < RESTORE.escalationMs);
  assert.ok(RESTORE.escalationMs < RESTORE.reviewMs); assert.ok(RESTORE.reviewMs < RESTORE.maximumMs);
  assert.equal(qualification.concurrency.group, 'lythaus-fixed-native-restore-qualification');
  assert.equal(cleanup.concurrency.group, 'lythaus-fixed-native-restore-cleanup');
  assert.notEqual(qualification.concurrency.group, cleanup.concurrency.group);
  assert.equal(qualification.concurrency['cancel-in-progress'], false); assert.equal(cleanup.concurrency['cancel-in-progress'], false);
});
test('cleanup queued past its original start cutoff cannot reset the qualification clock', async () => {
  const f = fixture(), bytes = Buffer.from(f.evidence.bytes);
  f.options.now = () => start + RESTORE.cleanupStartMs;
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.state, 'BLOCKED_WITHOUT_DELETE'); assert.equal(deletions(f), 0);
  assert.equal(f.report.cleanupDeadlineAt, time(120)); assert.deepEqual(f.evidence.bytes, bytes);
});
test('GET-only reconciliation permits late review and later protected code without relaxing any DELETE prerequisite', async () => {
  const f = fixture(); f.record.review.reviewedAt = time(150); f.refresh();
  f.env.RELEASE_SHA = 'c'.repeat(40); f.options.now = () => start + 180 * 60000;
  delete f.env.CLEANUP_APPROVAL_JSON; delete f.env.EVIDENCE_PR; delete f.env.REVIEW_COMMENT_ID;
  const result = await reconcileReviewedTarget(f.options);
  assert.equal(result.state, 'TARGET_PRESENT_READ_ONLY'); assert.equal(result.targetId, targetId);
  assert.equal(result.providerMutations, false); assert.equal(result.deletionVerified, false); assert.equal(deletions(f), 0);
  assert.equal(f.calls.some(call => call.includes('/issues/comments/')), false);
  assert.equal(f.calls.some(call => call.startsWith('GET ') && call.includes('/backups/')), false);
  const deletion = await deleteReviewedTarget(f.options); assert.equal(deletion.state, 'BLOCKED_WITHOUT_DELETE'); assert.equal(deletions(f), 0);
});
test('GET-only reconciliation preserves historical phase metadata without treating it as a new deletion budget', async () => {
  const f = fixture(); delete f.report.qualificationStopAt; f.report.reviewByAt = time(55); f.refresh();
  const observed = await reconcileReviewedTarget(f.options);
  assert.equal(observed.state, 'TARGET_PRESENT_READ_ONLY'); assert.equal(observed.deletionVerified, false);
  const blocked = await deleteReviewedTarget(f.options);
  assert.equal(blocked.state, 'BLOCKED_WITHOUT_DELETE'); assert.equal(deletions(f), 0);
});
for (const [name, change] of [
  ['uncertain original create', f => { f.report.creation.acknowledged = false; f.refresh(); }],
  ['changed downloaded qualification bytes', f => { f.options.downloadedQualification = Buffer.from('{}'); }],
  ['unproven protected-main ancestry', f => { f.overrides.set(`/compare/${evidenceSha}...${f.env.RELEASE_SHA}`, { merge_base_commit: { sha: 'f'.repeat(40) } }); }],
]) test(`read-only reconciliation refuses unproven provenance: ${name}`, async () => {
  const f = fixture(); change(f);
  const result = await reconcileReviewedTarget(f.options);
  assert.equal(result.state, 'TARGET_PRESENT_OR_BINDING_UNCERTAIN'); assert.equal(result.providerMutations, false);
  assert.equal(result.deletionVerified, false); assert.equal(deletions(f), 0);
  assert.equal(f.calls.filter(call => call.startsWith('GET ')).length, 0);
});
