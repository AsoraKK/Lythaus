import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RESTORE } from '../ci/planetscale-native-restore-contract.mjs';
import { RECORD_PATH, artifactPath, sha256, QUALIFICATION_WORKFLOW, CLEANUP_WORKFLOW } from '../ci/planetscale-native-restore-evidence.mjs';
import { pendingReceipt, pendingName } from '../ci/planetscale-native-restore-cleanup.mjs';
import { REQUIRED_0021_RESTORE_SCOPE, hash0021RestoreEvidenceRecord } from '../ci/planetscale-0021-only-contract.mjs';
import { proveUnmergedCleanupContext, unmergedCleanupAttestation } from '../ci/planetscale-native-restore-unmerged-cleanup-prototype.mjs';

export const start = Date.parse(RESTORE.backupCompletedAt) + 90 * 60000;
export const time = minutes => new Date(start + minutes * 60000).toISOString();
export const codeSha = 'a'.repeat(40), evidenceSha = 'b'.repeat(40), targetId = 'newrestore123';
export const repository = 'SyntheticOwner/Lythaus', repositoryId = 1010752912;
export const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const gitSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

export function fixture(outcome = 'PASSED', { qualifiedSha = codeSha, reviewedSha = evidenceSha } = {}) {
  const codeSha = qualifiedSha; let evidenceSha = reviewedSha;
  const report = { phase: 'qualification', mode: 'execute', runId: '12345', sourceMainSha: codeSha,
    startedAt: time(0), finishedAt: time(20), sourceBranchId: RESTORE.sourceId, backupId: RESTORE.backupId,
    targetName: RESTORE.target, createdTargetId: targetId, state: 'TARGET_RETAINED_PENDING_REVIEW',
    cleanup: 'TARGET_RETAINED_PENDING_REVIEW', qualificationOutcome: outcome, recoveryAcceptance: 'NOT_CERTIFIED',
    creation: { acknowledged: true, id: targetId, name: RESTORE.target, sourceBranchId: RESTORE.sourceId,
      createdAt: time(1), kind: 'postgresql', default: false },
    providerMutations: [{ action: 'create_fixed_restore', outcome: 'ACKNOWLEDGED' }],
    cleanupPermit: { workflowId: 42, runNumber: 2 }, approvalExpiresAt: time(120),
    qualificationStopAt: time(20), escalationAt: time(45), reviewByAt: time(60),
    cleanupStartByAt: time(105), cleanupDeadlineAt: time(120),
    reviewWindow: { reviewer: 'reviewer', operator: 'owner' } };
  if (outcome === 'PASSED') report.verifiedAt = time(20);
  const record = { schemaVersion: 'lythaus-0021-restore-evidence-v1', sourceBranch: { id: RESTORE.sourceId, name: 'main' },
    selectedBackupId: RESTORE.backupId, restoredBranch: { id: targetId, name: RESTORE.target,
      state: outcome === 'PASSED' ? 'ready' : 'retained', createdAt: time(1) },
    verifiedAt: time(20), artifactPath: artifactPath(report.runId), verifiedScope: [],
    unresolvedGates: [...REQUIRED_0021_RESTORE_SCOPE],
    review: { reviewedAt: time(45), reviewedBy: 'reviewer', reference: 'synthetic-exact-unmerged-review' },
    nativeRestoreCleanup: { schemaVersion: 'native-restore-cleanup-intent-v1', state: 'DELETE_PENDING',
      qualificationSha: codeSha, qualificationRunId: report.runId, qualificationWorkflowId: 394786946,
      targetId, workflowId: 42, runNumber: 2, artifactId: 51, artifactArchiveSha256: 'd'.repeat(64), evidenceOutcome: outcome } };
  const evidence = { record, report };
  const env = { RELEASE_SHA: codeSha, EVIDENCE_SHA: evidenceSha, EVIDENCE_PR: '999', REVIEW_COMMENT_ID: '88',
    QUALIFICATION_RUN_ID: report.runId, GITHUB_RUN_ID: '23456', GITHUB_RUN_NUMBER: '2', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_REPOSITORY: repository, PENDING_ARTIFACT_ID: '52', PENDING_ARTIFACT_DIGEST: 'e'.repeat(64) };
  const calls = [], checkpoints = [], overrides = new Map(), blobOverrides = new Map(), fileModes = new Map();
  let deleted = false, clock = start + 65 * 60000;
  const fileBytes = () => new Map([[RECORD_PATH, evidence.recordBytes], [artifactPath(report.runId), evidence.bytes], ...blobOverrides]);
  const blobFiles = () => [...fileBytes()].map(([filename, bytes]) => ({ filename, status: 'added', sha: gitSha(bytes) }));
  const treeData = () => {
    const root = new Map(), trees = new Map();
    for (const [filename, bytes] of fileBytes()) {
      let entries = root; const parts = filename.split('/');
      for (const part of parts.slice(0, -1)) {
        if (!entries.has(part)) entries.set(part, new Map());
        entries = entries.get(part);
      }
      entries.set(parts.at(-1), { mode: fileModes.get(filename) ?? '100644', type: 'blob', sha: gitSha(bytes) });
    }
    const visit = entries => {
      const tree = [...entries].map(([name, entry]) => entry instanceof Map
        ? { path: name, mode: '040000', type: 'tree', sha: visit(entry) } : { path: name, ...entry });
      const sha = createHash('sha1').update(JSON.stringify(tree)).digest('hex');
      trees.set(sha, { sha, tree, truncated: false }); return sha;
    };
    return { sha: visit(root), trees };
  };
  const response = suffix => {
    if (suffix === '/pulls/999') return { number: 999, state: 'open', merged: false, changed_files: 2,
      head: { sha: evidenceSha, repo: { id: repositoryId, full_name: repository } },
      base: { sha: codeSha, ref: 'main', repo: { id: repositoryId, full_name: repository } },
      ciStatus: 'pending', ciElapsedMinutes: 45 };
    if (suffix === `/compare/${codeSha}...${evidenceSha}`) return { merge_base_commit: { sha: codeSha },
      status: 'ahead', ahead_by: 1, files: blobFiles() };
    if (suffix === `/git/commits/${evidenceSha}`) return { sha: evidenceSha, tree: { sha: treeData().sha } };
    if (suffix.startsWith('/git/trees/')) return treeData().trees.get(suffix.split('/').at(-1));
    if (suffix.startsWith('/git/blobs/')) {
      const bytes = [...fileBytes().values()].find(value => gitSha(value) === suffix.split('/').at(-1));
      assert.ok(bytes); return { sha: gitSha(bytes), size: bytes.length, encoding: 'base64', content: bytes.toString('base64') };
    }
    if (suffix === '/issues/comments/88') return { id: 88, user: { type: 'User', login: 'reviewer' },
      issue_url: `https://api.github.com/repos/${repository}/issues/999`,
      body: unmergedCleanupAttestation(evidenceSha, record, report), created_at: time(46), updated_at: time(46) };
    if (suffix === `/actions/runs/${report.runId}`) return { id: Number(report.runId), workflow_id: 394786946,
      head_sha: codeSha, head_branch: 'main', path: QUALIFICATION_WORKFLOW, event: 'workflow_dispatch', run_attempt: 1,
      status: 'completed', conclusion: outcome === 'PASSED' ? 'success' : 'failure',
      repository: { id: repositoryId, full_name: repository }, head_repository: { id: repositoryId } };
    if (suffix === `/actions/runs/${report.runId}/jobs?per_page=100`) return { total_count: 1,
      jobs: [{ run_id: Number(report.runId), run_attempt: 1, head_sha: codeSha,
        name: 'Qualify isolated native restore without cleanup', status: 'completed',
        steps: [{ name: 'Upload immutable qualification evidence', conclusion: 'success' }] }] };
    if (suffix === '/actions/artifacts/51') return { id: 51, name: `native-restore-qualification-${codeSha}-${report.runId}`,
      workflow_run: { id: Number(report.runId), repository_id: repositoryId, head_sha: codeSha },
      expired: false, digest: `sha256:${'d'.repeat(64)}`, size_in_bytes: 1000 };
    if (suffix === '/actions/artifacts/52') return { id: 52, workflow_run: { id: Number(env.GITHUB_RUN_ID) },
      name: pendingName(report, record.nativeRestoreCleanup), expired: false,
      digest: `sha256:${'e'.repeat(64)}`, size_in_bytes: 500 };
    if (suffix === `/actions/runs/${env.GITHUB_RUN_ID}`) return { id: Number(env.GITHUB_RUN_ID), workflow_id: 42,
      head_sha: codeSha, head_branch: 'main', path: CLEANUP_WORKFLOW, event: 'workflow_dispatch', run_attempt: 1,
      run_number: 2, repository: { id: repositoryId } };
    if (suffix.endsWith('/approvals')) return [{ state: 'approved', user: { type: 'User', login: 'owner' },
      environments: [{ name: 'production' }] }];
    throw Error(`unexpected synthetic GitHub read ${suffix}`);
  };
  const read = async suffix => {
    calls.push(`GITHUB ${suffix}`); const original = response(suffix), override = overrides.get(suffix);
    return structuredClone(override ? override(structuredClone(original)) : original);
  };
  const api = { authority: async () => { calls.push('AUTHORITY'); }, list: async () => { calls.push('LIST'); return []; },
    request: async (suffix, options = {}) => {
      const method = options.method ?? 'GET'; calls.push(`${method} ${suffix}`);
      if (method === 'DELETE') { deleted = true; return null; }
      assert.equal(method, 'GET');
      if (suffix === `/branches/${RESTORE.target}`) return deleted ? null : { id: targetId, name: RESTORE.target,
        created_at: time(1), deleted_at: null, default: false, kind: 'postgresql', deletion_protected: false,
        restored_from_branch: { id: RESTORE.sourceId } };
      if (suffix === `/branches/main/backups/${RESTORE.backupId}`) return { id: RESTORE.backupId,
        database_branch: { id: RESTORE.sourceId, name: 'main' }, protected: true,
        restored_branches: [{ id: targetId, name: RESTORE.target }] };
      throw Error('unexpected synthetic provider read');
    } };
  const options = { env, evidence, evidenceHead: evidenceSha, read, api, now: () => clock,
    assertMain: async () => { calls.push('MAIN'); assert.equal(env.RELEASE_SHA, codeSha); },
    checkpoint: receipt => checkpoints.push(receipt), sleep: async milliseconds => { clock += milliseconds; },
    proveContext: proveUnmergedCleanupContext };
  const refresh = () => {
    evidence.bytes = encode(report); record.evidenceSha256 = sha256(evidence.bytes);
    record.recordSha256 = hash0021RestoreEvidenceRecord(record); evidence.recordBytes = encode(record);
    env.CLEANUP_APPROVAL_JSON = JSON.stringify({ action: 'delete_only_original_acknowledged_target_once',
      cleanupSha: codeSha, evidenceSha, qualificationRunId: report.runId, targetId,
      recordSha256: record.recordSha256, operator: 'owner', maximumUsd: 5,
      reference: 'synthetic-separate-owner-deletion-consent', expiresAt: time(119) });
    options.pendingBytes = encode(pendingReceipt({ report, record, creation: report.creation,
      intent: record.nativeRestoreCleanup }, env));
    options.downloadedPending = options.pendingBytes; options.downloadedQualification = evidence.bytes;
  };
  refresh();
  return { report, record, evidence, env, options, calls, checkpoints, overrides, blobOverrides, fileModes, refresh,
    setClock: value => { clock = value; }, setDeleted: value => { deleted = value; },
    setEvidenceSha: value => { evidenceSha = value; env.EVIDENCE_SHA = value; options.evidenceHead = value; refresh(); } };
}
