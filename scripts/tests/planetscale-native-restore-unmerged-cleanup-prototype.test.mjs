import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RESTORE, RestoreFailure } from '../ci/planetscale-native-restore-contract.mjs';
import { RECORD_PATH, artifactPath, sha256,
  verifyReviewedEvidence } from '../ci/planetscale-native-restore-evidence.mjs';
import { deleteReviewedTarget } from '../ci/planetscale-native-restore-cleanup.mjs';
import { assess0021RestoreEvidence } from '../ci/planetscale-0021-only-contract.mjs';
import { read0021RestoreEvidenceRecord } from '../ci/planetscale-0021-restore-evidence-loader.mjs';
import { CLEANUP_PROTOTYPE_ACTIVE, CLEANUP_PROTOTYPE_STATUS, proveUnmergedCleanupContext } from '../ci/planetscale-native-restore-unmerged-cleanup-prototype.mjs';

import { fixture, start, time, codeSha, evidenceSha, repository } from './planetscale-native-restore-unmerged-cleanup-fixture.mjs';

const deletes = f => f.calls.filter(call => call.startsWith('DELETE ')).length;
const blocked = async f => {
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.state, 'BLOCKED_WITHOUT_DELETE'); assert.equal(result.providerMutations, false);
  assert.equal(result.recoveryCertified, false); assert.equal(deletes(f), 0); return result;
};

test('prototype is inactive and default cleanup still rejects unmerged evidence', async () => {
  assert.equal(CLEANUP_PROTOTYPE_STATUS, 'OWNER_APPROVAL_REQUIRED'); assert.equal(CLEANUP_PROTOTYPE_ACTIVE, false);
  const f = fixture(); delete f.options.proveContext;
  await blocked(f);
  await assert.rejects(() => verifyReviewedEvidence({ env: f.env, evidenceSha, prNumber: '999',
    commentId: '88', evidence: f.evidence, read: f.options.read }), /reviewed_evidence_commit_mismatch/);
  for (const filename of ['planetscale-native-restore-check.yml', 'planetscale-native-restore-cleanup.yml']) {
    const workflow = fs.readFileSync(new URL(`../../.github/workflows/${filename}`, import.meta.url), 'utf8');
    assert.doesNotMatch(workflow, /unmerged-cleanup-prototype|proveUnmergedCleanupContext|proveContext/);
  }
  const entrypoint = fs.readFileSync(new URL('../ci/planetscale-native-restore-cleanup.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(entrypoint.slice(entrypoint.indexOf('async function main()')), /proveContext|proveUnmergedCleanupContext/);
});

for (const outcome of ['PASSED', 'FAILED']) test(`unmerged ${outcome} qualification permits exactly one containment DELETE while CI is pending 45 minutes`, async () => {
  const f = fixture(outcome), originalBytes = Buffer.from(f.evidence.bytes);
  const context = await proveUnmergedCleanupContext({ ...f.options, now: f.options.now() });
  assert.equal(context.evidence, f.evidence); assert.equal(context.prototypeStatus, 'OWNER_APPROVAL_REQUIRED');
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.state, 'DELETED_AND_READBACK_VERIFIED'); assert.equal(deletes(f), 1);
  assert.equal(result.deletionVerified, true); assert.equal(result.recoveryCertified, false);
  assert.equal(f.checkpoints[0].state, 'DELETE_PENDING'); assert.deepEqual(f.evidence.bytes, originalBytes);
  assert.equal(f.report.qualificationOutcome, outcome); assert.equal(f.report.recoveryAcceptance, 'NOT_CERTIFIED');
  assert.equal(f.calls.some(call => /checks|status/.test(call)), false);
  assert.ok(f.calls.indexOf('GITHUB /actions/artifacts/52') < f.calls.findIndex(call => call.startsWith('DELETE ')));
});

for (const [label, mutate] of [
  ['unacknowledged creation', f => { f.report.creation.acknowledged = false; f.refresh(); }],
  ['uncertain creation', f => { f.report.creation.acknowledged = false; f.report.providerMutations[0].outcome = 'UNKNOWN_MUTATION_OUTCOME'; f.refresh(); }],
  ['wrong repository', f => f.overrides.set('/pulls/999', row => ({ ...row, head: { ...row.head, repo: { id: 3 } } }))],
  ['wrong workflow', f => f.overrides.set('/actions/runs/12345', row => ({ ...row, workflow_id: 3 }))],
  ['wrong run', f => f.overrides.set('/actions/runs/12345', row => ({ ...row, id: 7 }))],
  ['rerun', f => f.overrides.set('/actions/runs/12345', row => ({ ...row, run_attempt: 2 }))],
  ['wrong qualification SHA', f => f.overrides.set('/actions/runs/12345', row => ({ ...row, head_sha: 'f'.repeat(40) }))],
  ['wrong artifact ID', f => f.overrides.set('/actions/artifacts/51', row => ({ ...row, id: 7 }))],
  ['wrong artifact run', f => f.overrides.set('/actions/artifacts/51', row => ({ ...row, workflow_run: { ...row.workflow_run, id: 7 } }))],
  ['wrong artifact SHA', f => f.overrides.set('/actions/artifacts/51', row => ({ ...row, workflow_run: { ...row.workflow_run, head_sha: 'f'.repeat(40) } }))],
  ['wrong archive digest', f => f.overrides.set('/actions/artifacts/51', row => ({ ...row, digest: `sha256:${'f'.repeat(64)}` }))],
  ['changed uploaded bytes', f => { f.options.downloadedQualification = Buffer.from('{}'); }],
  ['changed PR qualification bytes', f => f.blobOverrides.set(artifactPath(f.report.runId), Buffer.from('{}'))],
  ['symlink data file', f => f.fileModes.set(RECORD_PATH, '120000')],
  ['executable data file', f => f.fileModes.set(RECORD_PATH, '100755')],
  ['wrong Git commit', f => f.overrides.set(`/git/commits/${evidenceSha}`, row => ({ ...row, sha: 'f'.repeat(40) }))],
  ['moved PR head', f => f.overrides.set('/pulls/999', row => ({ ...row, head: { ...row.head, sha: 'f'.repeat(40) } }))],
  ['non-descendant PR', f => f.overrides.set(`/compare/${codeSha}...${evidenceSha}`, row => ({ ...row, merge_base_commit: { sha: 'f'.repeat(40) } }))],
  ['third changed file', f => f.overrides.set(`/compare/${codeSha}...${evidenceSha}`, row => ({ ...row, files: [...row.files, { filename: 'scripts/evil.mjs', status: 'added' }] }))],
  ['substituted executable file', f => f.overrides.set(`/compare/${codeSha}...${evidenceSha}`, row => ({ ...row, files: [row.files[0], { ...row.files[1], filename: 'scripts/evil.mjs' }] }))],
  ['duplicate data file', f => f.overrides.set(`/compare/${codeSha}...${evidenceSha}`, row => ({ ...row, files: [row.files[0], row.files[0]] }))],
  ['edited attestation', f => f.overrides.set('/issues/comments/88', row => ({ ...row, updated_at: time(47) }))],
  ['wrong human', f => f.overrides.set('/issues/comments/88', row => ({ ...row, user: { type: 'User', login: 'different' } }))],
  ['bot attestation', f => f.overrides.set('/issues/comments/88', row => ({ ...row, user: { type: 'Bot', login: 'reviewer' } }))],
  ['late attestation', f => f.overrides.set('/issues/comments/88', row => ({ ...row, created_at: time(61), updated_at: time(61) }))],
  ['wrong attestation artifact', f => f.overrides.set('/issues/comments/88', row => ({ ...row, body: row.body.replace(f.record.evidenceSha256, 'f'.repeat(64)) }))],
  ['attestation copied from another issue', f => f.overrides.set('/issues/comments/88', row => ({ ...row, issue_url: `https://api.github.com/repos/${repository}/issues/1000` }))],
  ['consumed permit', f => { f.env.GITHUB_RUN_NUMBER = '3'; }],
  ['changed pending upload', f => f.overrides.set('/actions/artifacts/52', row => ({ ...row, digest: `sha256:${'f'.repeat(64)}` }))],
  ['changed pending intent bytes', f => { f.options.downloadedPending = Buffer.from('{}'); }],
  ['missing pending upload', f => { delete f.env.PENDING_ARTIFACT_ID; }],
  ['missing owner consent', f => { delete f.env.CLEANUP_APPROVAL_JSON; }],
  ['missing production review', f => f.overrides.set('/actions/runs/23456/approvals', () => [])],
  ['missing qualification review', f => f.overrides.set('/actions/runs/12345/approvals', () => [])],
  ['changed cleanup source', f => { f.env.RELEASE_SHA = 'f'.repeat(40); f.options.assertMain = async () => {}; }],
  ['main drift', f => { f.options.assertMain = async () => { throw new RestoreFailure('current_protected_main_changed'); }; }],
  ['expired cleanup token', f => { f.options.api.authority = async () => { throw new RestoreFailure('existing_token_lifetime_insufficient_or_unverifiable'); }; }],
  ['target ID drift', f => { const request = f.options.api.request; f.options.api.request = async (p, o) => { const row = await request(p, o); return p === `/branches/${RESTORE.target}` ? { ...row, id: 'replacementid' } : row; }; }],
  ['target creation-time drift', f => { const request = f.options.api.request; f.options.api.request = async (p, o) => { const row = await request(p, o); return p === `/branches/${RESTORE.target}` ? { ...row, created_at: time(2) } : row; }; }],
  ['target source drift', f => { const request = f.options.api.request; f.options.api.request = async (p, o) => { const row = await request(p, o); return p === `/branches/${RESTORE.target}` ? { ...row, restored_from_branch: { id: 'othersource' } } : row; }; }],
  ['target protection enabled', f => { const request = f.options.api.request; f.options.api.request = async (p, o) => { const row = await request(p, o); return p === `/branches/${RESTORE.target}` ? { ...row, deletion_protected: true } : row; }; }],
  ['backup binding drift', f => { const request = f.options.api.request; f.options.api.request = async (p, o) => { const row = await request(p, o); return p.includes('/backups/') ? { ...row, restored_branches: [] } : row; }; }],
  ['cleanup starts at 105 minutes', f => f.setClock(start + 105 * 60000)],
  ['cleanup reaches deadline reserve', f => f.setClock(start + 119 * 60000)],
]) test(`unmerged prototype rejects ${label} without DELETE`, async () => { const f = fixture(); mutate(f); await blocked(f); });

for (const change of ['head', 'comment']) test(`a ${change} change after the pending checkpoint prevents DELETE`, async () => {
  const f = fixture(); f.options.checkpoint = receipt => {
    if (receipt.state !== 'DELETE_PENDING') return;
    if (change === 'head') f.overrides.set('/pulls/999', row => ({ ...row, head: { ...row.head, sha: 'f'.repeat(40) } }));
    else f.overrides.set('/issues/comments/88', row => ({ ...row, updated_at: time(47) }));
  }; await blocked(f);
});

test('a moved PR head during the final protected-main recheck prevents DELETE', async () => {
  const f = fixture(); let checks = 0;
  f.options.assertMain = async () => {
    if (++checks === 2) f.overrides.set('/pulls/999', row => ({ ...row, head: { ...row.head, sha: 'f'.repeat(40) } }));
  };
  await blocked(f);
});

test('action-time owner consent expiry remains enforced after pending evidence', async () => {
  const f = fixture(), consent = JSON.parse(f.env.CLEANUP_APPROVAL_JSON);
  consent.expiresAt = time(66); f.env.CLEANUP_APPROVAL_JSON = JSON.stringify(consent);
  f.options.checkpoint = receipt => { if (receipt.state === 'DELETE_PENDING') f.setClock(start + 66 * 60000); };
  assert.ok((await blocked(f)).blockers.includes('cleanup_owner_approval_binding_invalid'));
});

test('consent expiry during the final PR verification await blocks DELETE', async () => {
  const f = fixture(), read = f.options.read, consent = JSON.parse(f.env.CLEANUP_APPROVAL_JSON); let pending = false;
  consent.expiresAt = time(66); f.env.CLEANUP_APPROVAL_JSON = JSON.stringify(consent);
  f.options.checkpoint = receipt => { if (receipt.state === 'DELETE_PENDING') pending = true; };
  f.options.read = async suffix => {
    const result = await read(suffix);
    if (pending && suffix === '/issues/comments/88') f.setClock(start + 66 * 60000);
    return result;
  };
  assert.ok((await blocked(f)).blockers.includes('cleanup_owner_approval_binding_invalid'));
});

test('target replacement during the final PR verification await blocks DELETE', async () => {
  const f = fixture(), read = f.options.read, request = f.options.api.request; let pending = false, replaced = false;
  f.options.checkpoint = receipt => { if (receipt.state === 'DELETE_PENDING') pending = true; };
  f.options.read = async suffix => {
    const result = await read(suffix); if (pending && suffix === '/issues/comments/88') replaced = true; return result;
  };
  f.options.api.request = async (p, o) => {
    const row = await request(p, o);
    return replaced && p === `/branches/${RESTORE.target}` ? { ...row, id: 'replacementid' } : row;
  };
  assert.ok((await blocked(f)).blockers.includes('created_target_ownership_changed'));
});

test('CI that never resolves is not queried and cannot postpone the original cleanup cutoff', async () => {
  const f = fixture(); f.setClock(start + 104 * 60000);
  f.overrides.set('/pulls/999', row => ({ ...row, ciStatus: 'pending', ciWillComplete: false }));
  const result = await deleteReviewedTarget(f.options);
  assert.equal(result.deletionVerified, true); assert.equal(deletes(f), 1);
  assert.equal(f.calls.some(call => /checks|status/.test(call)), false);
  const late = fixture(); late.setClock(start + 105 * 60000);
  late.overrides.set('/pulls/999', row => ({ ...row, ciStatus: 'pending', ciWillComplete: false }));
  assert.ok((await blocked(late)).blockers.includes('cleanup_start_window_missed'));
});

test('uncertain DELETE is followed only by readback and never retried', async () => {
  const f = fixture(), request = f.options.api.request;
  f.options.api.request = async (p, o = {}) => {
    if (o.method === 'DELETE') { f.calls.push(`DELETE ${p}`); throw new RestoreFailure('provider_transport_failed', 'UNKNOWN_MUTATION_OUTCOME'); }
    return request(p, o);
  };
  const result = await deleteReviewedTarget(f.options), mutation = f.calls.findIndex(call => call.startsWith('DELETE '));
  assert.equal(result.state, 'DELETE_OUTCOME_UNCERTAIN_READ_ONLY_RECONCILIATION_REQUIRED');
  assert.equal(deletes(f), 1); assert.equal(result.deletionVerified, false); assert.equal(result.recoveryCertified, false);
  assert.ok(f.calls.slice(mutation + 1).every(call => call.startsWith('GET ')));
  f.env.GITHUB_RUN_ID = '23457'; f.env.GITHUB_RUN_NUMBER = '3';
  f.overrides.set('/actions/runs/23457', row => ({ ...row, run_number: 3 }));
  const retry = await deleteReviewedTarget(f.options);
  assert.equal(retry.state, 'BLOCKED_WITHOUT_DELETE'); assert.equal(deletes(f), 1);
  assert.ok(retry.blockers.includes('cleanup_permit_consumed_or_wrong_run_number'));
});

test('FAILED qualification cannot pass the unchanged release evidence assessment', () => {
  const f = fixture('FAILED');
  const result = assess0021RestoreEvidence({ record: f.record, evidenceArtifact: { path: f.record.artifactPath,
    bytes: f.evidence.bytes, sha256: sha256(f.evidence.bytes) }, sourceBranch: { id: RESTORE.sourceId },
    backup: { id: RESTORE.backupId, completed_at: time(-60), expires_at: time(1440) },
    selectedBackupId: RESTORE.backupId, now: f.options.now() });
  assert.equal(result.ok, false); assert.ok(result.blockers.includes('restore_evidence_has_unresolved_gates'));
  assert.ok(result.blockers.includes('restore_evidence_scope_missing:effective_runtime_privileges'));
});

test('release loader cannot consume evidence committed only to an unmerged branch', t => {
  const f = fixture(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-unmerged-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' });
  const commit = message => git(['-c', 'user.name=Local Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', message]);
  git(['init', '--initial-branch=main']); fs.writeFileSync(path.join(root, 'baseline'), 'synthetic\n');
  git(['add', 'baseline']); commit('Synthetic main'); git(['switch', '-c', 'evidence']);
  for (const [relative, bytes] of [[RECORD_PATH, f.evidence.recordBytes], [artifactPath(f.report.runId), f.evidence.bytes]]) {
    const destination = path.join(root, relative); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes);
  }
  git(['add', 'docs']); commit('Synthetic unmerged evidence'); git(['switch', 'main']);
  assert.equal(read0021RestoreEvidenceRecord(RESTORE.backupId, root).record, null);
});
