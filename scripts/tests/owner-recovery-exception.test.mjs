import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assessOwnerRecoveryException, ownerRecoveryContextFromEnvironment, INDEPENDENT_RECOVERY_SCOPE, OWNER_RECOVERY_EXCEPTION_STATUS } from '../ci/owner-recovery-exception.mjs';
import { assessPlanetScaleBackupEvidence, hash0021RestoreEvidenceArtifact, hash0021RestoreEvidenceRecord, REQUIRED_0021_RESTORE_SCOPE } from '../ci/planetscale-0021-only-contract.mjs';

const now = Date.parse('2026-10-21T10:00:00Z');
const releaseSha = 'a'.repeat(40);
const exception = () => ({
  schemaVersion: 'lythaus-owner-recovery-exception-v1', scope: INDEPENDENT_RECOVERY_SCOPE,
  ownerTestingOnly: true, releaseSha, releaseRunId: '123', migrationRunId: '456',
  approvalReference: 'synthetic exact-candidate owner approval',
  approvedAt: '2026-10-21T09:00:00Z', expiresAt: '2026-10-22T09:00:00Z',
});
const context = (purpose = 'migration') => ({
  requested: true, ownerTestingDeployment: true, releaseSha, workflowRunId: purpose === 'migration' ? '456' : '123',
  workflowRunAttempt: '1', purpose, record: exception(),
});
const artifact = {
  path: 'docs/evidence/production-cutover/0021-restore-evidence/artifacts/synthetic-owner-exception.json',
  bytes: Buffer.from('synthetic native restore fixture only\n'),
};
artifact.sha256 = hash0021RestoreEvidenceArtifact(artifact.bytes);
const branch = { id: 'source123', name: 'main', kind: 'postgresql', state: 'ready', ready: true,
  production: true, deleted_at: null, deletion_protected: true };
const backup = { id: 'backup123', state: 'success', created_at: '2026-10-21T08:00:00Z',
  completed_at: '2026-10-21T08:05:00Z', expires_at: '2026-10-22T08:05:00Z', protected: true, deleted_at: null,
  database_branch: { id: branch.id, name: 'main', deleted_at: null } };
function record() {
  const value = {
    schemaVersion: 'lythaus-0021-restore-evidence-v1', sourceBranch: { id: branch.id, name: 'main' },
    selectedBackupId: backup.id, restoredBranch: { id: 'restore123', state: 'ready', createdAt: '2026-10-21T08:10:00Z' },
    verifiedAt: '2026-10-21T08:30:00Z', artifactPath: artifact.path, evidenceSha256: artifact.sha256,
    verifiedScope: REQUIRED_0021_RESTORE_SCOPE.filter(scope => scope !== INDEPENDENT_RECOVERY_SCOPE),
    unresolvedGates: [INDEPENDENT_RECOVERY_SCOPE],
    review: { reviewedAt: '2026-10-21T08:40:00Z', reviewedBy: 'synthetic reviewer', reference: 'synthetic review' },
  };
  value.recordSha256 = hash0021RestoreEvidenceRecord(value);
  return value;
}
function assess(restoreRecord = record(), overrides = {}) {
  return assessPlanetScaleBackupEvidence({ branch, backup, backupId: backup.id, restoreEvidenceRecord: restoreRecord,
    restoreEvidenceArtifact: artifact, ownerRecoveryContext: context(), now, ...overrides });
}

test('strict default keeps independent recovery required even when protected approval exists', () => {
  assert.equal(assessOwnerRecoveryException({ record: exception(), now }).status, 'NOT_REQUESTED');
  const result = assess(record(), { ownerRecoveryContext: {} });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes(`restore_evidence_scope_missing:${INDEPENDENT_RECOVERY_SCOPE}`));
  assert.ok(result.blockers.includes('restore_evidence_has_unresolved_gates'));
});

test('only the two named first-attempt runs can defer independent recovery for the exact SHA', () => {
  for (const purpose of ['migration', 'release']) {
    const result = assessOwnerRecoveryException({ ...context(purpose), now });
    assert.equal(result.ok, true);
    assert.equal(result.status, OWNER_RECOVERY_EXCEPTION_STATUS);
    assert.deepEqual(result.publicReleaseBlockers, [INDEPENDENT_RECOVERY_SCOPE]);
    for (const override of [
      { ownerTestingDeployment: false }, { releaseSha: 'b'.repeat(40) }, { releaseSha: 'main' },
      { workflowRunId: '789' }, { workflowRunAttempt: '2' }, { workflowRunAttempt: undefined }, { purpose: 'other' },
      ...[
        { releaseRunId: '456' }, { migrationRunId: '' }, { schemaVersion: 'other' }, { ownerTestingOnly: false },
        { scope: 'application_smoke' }, { approvalReference: ' ' }, { approvedAt: '2026-10-21T11:00:00Z' },
        { expiresAt: '2026-10-21T10:00:00Z' }, { expiresAt: '2026-10-23T09:00:00Z' },
      ].map(value => ({ record: { ...exception(), ...value } })),
    ]) assert.equal(assessOwnerRecoveryException({ ...context(purpose), now, ...override }).ok, false, JSON.stringify(override));
  }
});

test('exception reports deferred, preserves the unresolved gate and never claims independent verification', () => {
  const result = assess();
  assert.equal(result.ok, true);
  assert.equal(result.restoreEvidence.independentRecovery.status, 'DEFERRED_BY_OWNER_EXCEPTION');
  assert.deepEqual(result.restoreEvidence.unresolvedGates, [INDEPENDENT_RECOVERY_SCOPE]);
  assert.ok(!result.restoreEvidence.verifiedScope.includes(INDEPENDENT_RECOVERY_SCOPE));
  assert.deepEqual(result.restoreEvidence.independentRecovery.publicReleaseBlockers, [INDEPENDENT_RECOVERY_SCOPE]);
  const publicResult = assess(record(), { ownerRecoveryContext: { ...context('release'), ownerTestingDeployment: false } });
  assert.equal(publicResult.ok, false);
  assert.ok(publicResult.blockers.includes('owner_recovery_exception_requires_owner_testing'));
});

test('owner exception cannot waive any native restore scope, review, hash or source/backup protection', () => {
  for (const scope of REQUIRED_0021_RESTORE_SCOPE.filter(value => value !== INDEPENDENT_RECOVERY_SCOPE)) {
    const incomplete = record();
    incomplete.verifiedScope = incomplete.verifiedScope.filter(value => value !== scope);
    incomplete.recordSha256 = hash0021RestoreEvidenceRecord(incomplete);
    assert.equal(assess(incomplete).ok, false, scope);
  }
  for (const edit of [value => { value.review = {}; }, value => { value.evidenceSha256 = 'b'.repeat(64); },
    value => { value.unresolvedGates.push('application_smoke'); }, value => { value.unresolvedGates = []; }]) {
    const incomplete = record();
    edit(incomplete);
    incomplete.recordSha256 = hash0021RestoreEvidenceRecord(incomplete);
    assert.equal(assess(incomplete).ok, false);
  }
  for (const override of [
    { branch: { ...branch, deletion_protected: false } }, { backup: { ...backup, protected: false } },
    { restoreEvidenceArtifact: null }, { backupId: 'different' },
  ]) assert.equal(assess(record(), override).ok, false);
});

test('backup completion and actual restore verification must each remain within 24 hours', () => {
  const oldBackup = { ...backup, created_at: '2026-08-14T08:00:00Z', completed_at: '2026-08-14T08:05:00Z' };
  assert.ok(assess(record(), { backup: oldBackup }).blockers.includes('backup_older_than_24_hours'));
  const oldRestore = record();
  oldRestore.verifiedAt = '2026-10-20T09:59:59Z';
  oldRestore.recordSha256 = hash0021RestoreEvidenceRecord(oldRestore);
  assert.ok(assess(oldRestore).blockers.includes('restore_evidence_older_than_24_hours'));
});

test('protected JSON is only applied with an explicit request and missing or malformed values fail closed', () => {
  const env = { PLANETSCALE_OWNER_RECOVERY_EXCEPTION_JSON: JSON.stringify(exception()), OWNER_TESTING_DEPLOYMENT: 'true',
    OWNER_TESTING_RECOVERY_EXCEPTION: 'true', RELEASE_SHA: releaseSha, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' };
  assert.equal(assessOwnerRecoveryException({ ...ownerRecoveryContextFromEnvironment(env), now }).ok, true);
  assert.equal(assessOwnerRecoveryException({ ...ownerRecoveryContextFromEnvironment({ ...env, PLANETSCALE_OWNER_RECOVERY_EXCEPTION_JSON: '{}' }), now }).ok, false);
  assert.equal(assessOwnerRecoveryException({ ...ownerRecoveryContextFromEnvironment({ ...env, PLANETSCALE_OWNER_RECOVERY_EXCEPTION_JSON: 'invalid' }), now }).ok, false);
  assert.equal(assessOwnerRecoveryException({ ...ownerRecoveryContextFromEnvironment({ ...env, OWNER_TESTING_RECOVERY_EXCEPTION: 'false' }), now }).status, 'NOT_REQUESTED');
});

test('canonical recovery gate fails closed without existing provider access and does no mutations', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/verify-production-recovery-readiness.mjs'], {
    encoding: 'utf8', timeout: 15_000, env: { PATH: process.env.PATH, RELEASE_SHA: releaseSha },
  });
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ready, false);
  assert.equal(report.ok, false);
  assert.equal(report.databaseWrites, false);
  assert.equal(report.providerMutations, false);
  assert.ok(report.blockers.includes('restore_evidence_record_missing_or_invalid'));
});

test('executable release gate accepts only complete native evidence and keeps public independent recovery required', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-recovery-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runGit = args => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  runGit(['init', '--quiet']);
  fs.cpSync('database/planetscale/migrations', path.join(root, 'database/planetscale/migrations'), { recursive: true });
  for (const relative of [
    'scripts/ci/verify-production-recovery-readiness.mjs', 'scripts/ci/planetscale-0021-only-contract.mjs',
    'scripts/ci/planetscale-migration-reconciliation.mjs', 'scripts/ci/planetscale-migration-manifest.mjs',
    'scripts/ci/planetscale-media-quarantine-contract.mjs', 'scripts/ci/owner-recovery-exception.mjs',
    'scripts/ci/planetscale-0021-restore-evidence-loader.mjs', 'scripts/planetscale/service-token-auth.mjs',
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.copyFileSync(relative, path.join(root, relative));
  }
  const recordFile = path.join(root, 'docs/evidence/production-cutover/0021-restore-evidence', `${backup.id}.json`);
  fs.mkdirSync(path.dirname(path.join(root, artifact.path)), { recursive: true });
  fs.writeFileSync(path.join(root, artifact.path), artifact.bytes);
  const preload = path.join(root, 'provider-fixture.mjs');
  fs.writeFileSync(preload, `const NativeDate = Date; globalThis.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [${now}])); } static now() { return ${now}; }
  }; globalThis.fetch = async (url, options) => {
    if (options.method !== 'GET') throw new Error('test forbids mutations');
    if (url === 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core/branches/main') return { ok: true, json: async () => (${JSON.stringify(branch)}) };
    if (url.endsWith('/backups/${backup.id}')) return { ok: true, json: async () => (${JSON.stringify(backup)}) };
    throw new Error('unexpected provider target');
  };`);
  const run = (value, overrides = {}) => {
    value.recordSha256 = hash0021RestoreEvidenceRecord(value);
    fs.writeFileSync(recordFile, JSON.stringify(value));
    runGit(['add', 'docs']);
    const outputFile = path.join(root, 'github-output');
    fs.writeFileSync(outputFile, '');
    const result = spawnSync(process.execPath, ['--import', preload, 'scripts/ci/verify-production-recovery-readiness.mjs'], {
      cwd: root, encoding: 'utf8', timeout: 15_000,
      env: { PATH: process.env.PATH, RELEASE_SHA: releaseSha, PLANETSCALE_API_TOKEN: 'synthetic:fixture',
        PLANETSCALE_PRODUCTION_BACKUP_ID: backup.id, OWNER_TESTING_DEPLOYMENT: 'true', OWNER_TESTING_RECOVERY_EXCEPTION: 'true',
        PLANETSCALE_OWNER_RECOVERY_EXCEPTION_JSON: JSON.stringify(exception()), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1',
        GITHUB_OUTPUT: outputFile, ...overrides },
    });
    assert.ok(result.stdout.trim(), result.stderr);
    return { ...result, report: JSON.parse(result.stdout), outputs: fs.readFileSync(outputFile, 'utf8') };
  };
  const owner = run(record());
  assert.equal(owner.status, 0, owner.stderr);
  assert.equal(owner.report.ready, true);
  assert.match(owner.outputs, /independent_recovery_status=DEFERRED_BY_OWNER_EXCEPTION/);
  assert.deepEqual(owner.report.restoreEvidence.unresolvedGates, [INDEPENDENT_RECOVERY_SCOPE]);
  const publicRelease = run(record(), { OWNER_TESTING_DEPLOYMENT: 'false', OWNER_TESTING_RECOVERY_EXCEPTION: 'false' });
  assert.equal(publicRelease.status, 1, publicRelease.stderr);
  assert.ok(publicRelease.report.blockers.includes(`restore_evidence_scope_missing:${INDEPENDENT_RECOVERY_SCOPE}`));
  assert.match(publicRelease.outputs, /independent_recovery_status=BLOCKED/);
  const complete = record();
  complete.verifiedScope.push(INDEPENDENT_RECOVERY_SCOPE);
  complete.unresolvedGates = [];
  const strict = run(complete, { OWNER_TESTING_DEPLOYMENT: 'false', OWNER_TESTING_RECOVERY_EXCEPTION: 'false' });
  assert.equal(strict.status, 0, strict.stderr);
  assert.equal(strict.report.restoreEvidence.independentRecovery.status, 'VERIFIED');
  const historical = JSON.parse(fs.readFileSync('docs/evidence/production-cutover/0021-restore-evidence/pa4t6j6s07b7.json', 'utf8'));
  const incomplete = run(historical);
  assert.equal(incomplete.status, 1, incomplete.stderr);
  assert.ok(incomplete.report.blockers.includes('restore_evidence_scope_missing:effective_runtime_privileges'));
  assert.ok(incomplete.report.blockers.includes('restore_evidence_scope_missing:application_smoke'));
  assert.ok(incomplete.report.blockers.includes('restore_evidence_review_missing_or_invalid'));
});

test('both scoped migration and persistent release gates use protected exception configuration', () => {
  const migration = fs.readFileSync('.github/workflows/planetscale-production-migrations.yml', 'utf8');
  const release = fs.readFileSync('.github/workflows/production-release.yml', 'utf8');
  const workers = fs.readFileSync('.github/workflows/native-workers-deploy.yml', 'utf8');
  assert.equal(migration.split('PLANETSCALE_OWNER_RECOVERY_EXCEPTION_JSON: ${{ vars.PLANETSCALE_OWNER_RECOVERY_EXCEPTION_JSON }}').length - 1, 3);
  assert.match(release, /default: automatic[\s\S]*?- owner_testing_native_recovery_exception/);
  assert.match(release, /OWNER_TESTING_RECOVERY_EXCEPTION: \$\{\{ inputs\.release_mode == 'owner_testing_native_recovery_exception' \}\}/);
  assert.ok(!release.slice(0, release.indexOf('\npermissions:')).includes('owner_testing_recovery_exception:'));
  const recoveryStep = release.indexOf('Require fresh protected native recovery and public independent recovery readiness');
  assert.ok(release.indexOf('Require current main and exact successful evidence runs') < recoveryStep);
  assert.ok(release.indexOf('Verify native branch protection and release governance evidence') < recoveryStep);
  assert.match(release, /Require fresh protected native recovery and public independent recovery readiness[\s\S]*?verify-production-recovery-readiness\.mjs/);
  assert.match(release, /INDEPENDENT_RECOVERY_STATUS: \$\{\{ needs\.preflight\.outputs\.independent_recovery_status/);
  assert.ok(workers.indexOf('Reverify fresh recovery and bounded owner exception before activation') < workers.indexOf('Activate exact candidate Worker versions'));
  assert.ok(!workers.slice(0, workers.indexOf('  workflow_call:')).includes('owner_testing_recovery_exception'));
  for (const [file, activation] of [['deploy-marketing.yml', 'Deploy exact marketing artifact'],
    ['deploy-control-panel.yml', 'Deploy exact control-panel artifact']]) {
    const pages = fs.readFileSync(`.github/workflows/${file}`, 'utf8');
    assert.ok(pages.indexOf('Require fresh recovery before production Pages activation') < pages.indexOf(activation));
    assert.ok(!pages.slice(0, pages.indexOf('  workflow_call:')).includes('owner_testing_recovery_exception'));
  }
  const webPages = fs.readFileSync('.github/workflows/deploy-alpha-web.yml', 'utf8');
  const webRecovery = webPages.slice(webPages.indexOf('- name: Require fresh protected native recovery evidence'),
    webPages.indexOf('- name: Recheck app-only Pages serving evidence'));
  assert.match(webRecovery, /if: inputs\.target_environment == 'production'/);
  assert.match(webRecovery, /node scripts\/ci\/verify-production-recovery-readiness\.mjs/);
  assert.doesNotMatch(webRecovery, /app_only_requested/);
  const appOnlyServing = webPages.slice(webPages.indexOf('- name: Recheck app-only Pages serving evidence'),
    webPages.indexOf('- name: Deploy immutable Pages artifact'));
  assert.match(appOnlyServing, /inputs\.release_mode == 'app_only'/);
  assert.match(appOnlyServing, /APP_ONLY_CANONICAL/);
  assert.match(appOnlyServing, /node scripts\/ci\/recheck-app-only-serving-proof\.mjs/);
  assert.ok(webPages.indexOf('Require fresh protected native recovery evidence') < webPages.indexOf('Recheck app-only Pages serving evidence'));
  assert.ok(webPages.indexOf('Recheck app-only Pages serving evidence') < webPages.indexOf('Deploy immutable Pages artifact'));
  assert.ok(!webPages.slice(0, webPages.indexOf('  workflow_call:')).includes('owner_testing_recovery_exception'));
});
