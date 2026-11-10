import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { REQUIRED_RELEASE_SCHEMA_VERSION } from '../ci/product-integrity-schema-contract.mjs';
import { classifyRelease } from '../release/release-classification.mjs';

const root = process.cwd();
const releaseSha = '0123456789abcdef0123456789abcdef01234567';

test('app-only manifest preserves all source changes and fails closed without real bound evidence', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-app-only-manifest-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'release-manifest.json');
  const previous = 'f'.repeat(40);
  const classification = classifyRelease({ changedFiles: ['lib/main.dart', 'apps/lythaus-public-api/src/index.ts'],
    baseSha: previous, forceAuthCritical: true });
  const env = { ...process.env, RELEASE_SHA: releaseSha, PREVIOUS_PRODUCTION_SHA: previous,
    APP_ONLY_RELEASE: 'true', RELEASE_CLASS: classification.releaseClass, FORCE_AUTH_CRITICAL: 'true',
    CHANGED_FILES_JSON: JSON.stringify(classification.changedFiles), CHANGED_COMPONENTS_JSON: JSON.stringify(classification.changedComponents),
    REUSED_COMPONENTS_JSON: JSON.stringify(classification.reusedComponents),
    LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS: 'true', CI: 'false' };
  execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], { env, stdio: 'pipe' });
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.deepEqual(manifest.changedComponents, classification.changedComponents);
  assert.deepEqual(manifest.deployment.changedComponents, ['flutter-web']);
  assert.ok(manifest.deployment.sourceChangesNotDeployed.includes('public'));
  assert.equal(manifest.components.public.status, 'REUSED_PRODUCTION');
  assert.equal(manifest.components['flutter-web'].status, 'NEW_CANDIDATE');
  assert.equal(manifest.productionStatus, 'NO-GO');
  assert.equal(manifest.productionStatusScope, 'APP_ONLY_DEPLOYMENT_ONLY');
  assert.ok(manifest.evidence.unknowns.some(value => value.includes('App-only artifact, real-browser')));
  assert.ok(manifest.evidence.platformLimitations.some(value => value.includes('not a byte-for-byte check')));
  assert.ok(manifest.evidence.platformLimitations.some(value => value.includes('does not certify the full stack')));
  execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], {
    env: { ...env, FORCE_AUTH_CRITICAL: 'false' }, stdio: 'pipe',
  });
  const invalid = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(invalid.productionStatus, 'NO-GO');
  assert.ok(invalid.evidence.unknowns.some(value => value.includes('full auth-critical certification')));
});

test('release manifest records partial provider evidence without inventing live state', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-release-manifest-'));
  const output = path.join(directory, 'release-manifest.json');
  execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], {
    cwd: root,
    env: { ...process.env, RELEASE_SHA: releaseSha, LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS: 'true', CI: 'false' },
    stdio: 'pipe',
  });
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(manifest.schemaVersion, 'lythaus-release-manifest-v2');
  assert.equal(manifest.status, 'NO-GO');
  assert.equal(manifest.productionStatus, 'NO-GO');
  assert.equal(manifest.productionStatusScope, 'CANONICAL_RELEASE');
  assert.equal(manifest.repository.releaseSha, releaseSha);
  assert.equal(manifest.github.nativeBranchProtectionStatus, 'ACTIVE');
  assert.equal(manifest.github.releaseGovernanceCompensatingControls, false);
  assert.equal(manifest.github.previousProductionSha, 'NONE');
  assert.ok(manifest.evidence.platformLimitations.every((value) => !value.includes('native branch protection')));
  assert.equal(manifest.cloudflare.inventoryStatus, 'UNKNOWN/BLOCKED');
  assert.equal(manifest.planetscale.inventoryStatus, 'UNKNOWN/BLOCKED');
  assert.equal(manifest.planetscale.latestMigration, REQUIRED_RELEASE_SCHEMA_VERSION);
  assert.match(manifest.planetscale.migrationSetSha256, /^[a-f0-9]{64}$/);
});

test('release manifest records native and release governance independently', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-release-governance-'));
  const output = path.join(directory, 'release-manifest.json');
  execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], {
    cwd: root,
    env: {
      ...process.env,
      RELEASE_SHA: releaseSha,
      LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS: 'true',
      CI: 'false',
      NATIVE_BRANCH_PROTECTION_STATUS: 'ACTIVE',
      RELEASE_GOVERNANCE_COMPENSATING_CONTROLS: 'VERIFIED',
      CANDIDATE_MERGED_PR_NUMBER: '661',
      CANDIDATE_MERGED_PR_VERIFIED: 'true',
      UNRESOLVED_REVIEW_CONVERSATIONS_VERIFIED: 'true',
      LINEAR_HISTORY_VERIFIED: 'true',
      PREVIOUS_RELEASE_ANCESTRY_VERIFIED: 'true',
      PREVIOUS_PRODUCTION_SHA: 'NONE',
    },
    stdio: 'pipe',
  });
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(manifest.github.nativeBranchProtectionStatus, 'ACTIVE');
  assert.equal(manifest.github.releaseGovernanceCompensatingControls, true);
  assert.equal(manifest.github.candidateMergedPullRequest, 661);
  assert.equal(manifest.github.candidateMergedPrVerified, true);
  assert.equal(manifest.github.previousProductionShaAncestorVerified, true);
});

test('post-0021 manifest keeps independent recovery deferred and blocks public release claims', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-recovery-manifest-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'release-manifest.json');
  const env = { ...process.env, RELEASE_SHA: releaseSha, OWNER_TESTING_DEPLOYMENT: 'true',
    RECOVERY_READINESS_STATUS: 'PASS', INDEPENDENT_RECOVERY_STATUS: 'DEFERRED_BY_OWNER_EXCEPTION',
    LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS: 'true', CI: 'false' };
  execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], { env, stdio: 'pipe' });
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(manifest.planetscale.latestMigration, '0021_media_quarantine_cleanup.sql');
  assert.equal(manifest.status, 'NO-GO');
  assert.equal(manifest.recovery.independentRecoveryStatus, 'DEFERRED_BY_OWNER_EXCEPTION');
  assert.equal(manifest.productionStatusScope, 'OWNER_TESTING');
  assert.equal(manifest.recovery.requiredAfter0021, true);
  assert.deepEqual(manifest.recovery.publicReleaseBlockers, ['independent_recovery_destination']);
  assert.ok(manifest.evidence.unknowns.some(value => value.includes('Independent recovery remains DEFERRED_BY_OWNER_EXCEPTION')));
  assert.throws(() => execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], {
    env: { ...env, OWNER_TESTING_DEPLOYMENT: 'false' }, stdio: 'pipe',
  }), error => /independent recovery exception requires owner testing/.test(String(error.stderr)));
});

test('STANDARD_RELEASE explicitly records that human auth acceptance is not required', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-standard-release-manifest-'));
  const output = path.join(directory, 'release-manifest.json');
  execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], {
    cwd: root,
    env: {
      ...process.env,
      RELEASE_SHA: releaseSha,
      RELEASE_CLASS: 'STANDARD_RELEASE',
      CHANGED_COMPONENTS_JSON: '["marketing"]',
      REUSED_COMPONENTS_JSON: '["admin","control-panel","coordinator","flutter-web","jobs","public"]',
      CHANGED_FILES_JSON: '["apps/marketing-site/src/pages/pricing.astro"]',
      RELEASE_CLASSIFICATION_RULES_VERSION: 'release-classification-v2',
      FORCE_AUTH_CRITICAL: 'false',
      PREVIOUS_PRODUCTION_SHA: 'f'.repeat(40),
      LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS: 'true',
      CI: 'false',
    },
    stdio: 'pipe',
  });
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(manifest.releaseClass, 'STANDARD_RELEASE');
  assert.deepEqual(manifest.changedComponents, ['marketing']);
  assert.equal(manifest.authAcceptance.required, false);
  assert.equal(manifest.authAcceptance.status, 'NOT_REQUIRED');
  assert.equal(manifest.authAcceptance.acceptanceRunId, null);
  assert.equal(manifest.authAcceptance.candidateDependencies, null);
  assert.deepEqual(manifest.source.changedFiles, ['apps/marketing-site/src/pages/pricing.astro']);
  assert.equal(manifest.source.classificationRulesVersion, 'release-classification-v2');
  assert.equal(manifest.source.forceAuthCritical, false);
});

test('release manifest rejects a manual critical-to-standard downgrade', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-manifest-classification-'));
  const output = path.join(directory, 'release-manifest.json');
  let error;
  try {
    execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], {
      cwd: root,
      env: {
        ...process.env,
        RELEASE_SHA: releaseSha,
        RELEASE_CLASS: 'STANDARD_RELEASE',
        CHANGED_COMPONENTS_JSON: '["public"]',
        REUSED_COMPONENTS_JSON: '["admin","control-panel","coordinator","flutter-web","jobs","marketing"]',
        CHANGED_FILES_JSON: '["apps/lythaus-public-api/src/auth/login.ts"]',
        PREVIOUS_PRODUCTION_SHA: 'f'.repeat(40),
        FORCE_AUTH_CRITICAL: 'false',
        LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS: 'true',
        CI: 'false',
      },
      stdio: 'pipe',
    });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error);
  assert.match(String(error.stderr), /does not match deterministic classification/);
});

test('AUTH_CRITICAL_RELEASE cannot claim acceptance without exact dependency evidence', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-critical-release-manifest-'));
  const output = path.join(directory, 'release-manifest.json');
  execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], {
    cwd: root,
    env: {
      ...process.env,
      RELEASE_SHA: releaseSha,
      RELEASE_CLASS: 'AUTH_CRITICAL_RELEASE',
      AUTHENTICATED_ACCEPTANCE_PROVEN: 'true',
      AUTH_ACCEPTANCE_STATUS: 'PASSED',
      AUTH_ACCEPTANCE_RUN_ID: '22222222-2222-4222-8222-222222222222',
      AUTH_ACCEPTANCE_EXPIRES_AT: '2026-09-03T01:00:00.000Z',
      LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS: 'true',
      CI: 'false',
    },
    stdio: 'pipe',
  });
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(manifest.releaseClass, 'AUTH_CRITICAL_RELEASE');
  assert.equal(manifest.authAcceptance.required, true);
  assert.equal(manifest.authAcceptance.status, 'PASSED');
  assert.equal(manifest.status, 'NO-GO');
  assert.ok(manifest.evidence.unknowns.some((value) => value.includes('Exact acceptance candidate/reused dependency evidence')));
});

test('owner-test release remains NO-GO with authentication acceptance pending', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-owner-test-manifest-'));
  const output = path.join(directory, 'release-manifest.json');
  const history = [
    'PREFLIGHT',
    'INFRASTRUCTURE_VERIFIED',
    'CANDIDATE_READY',
    'PRODUCT_ACCEPTANCE_REQUIRED',
    'OWNER_TEST_ACCEPTANCE_PENDING',
    'ACTIVATED',
    'OWNER_TEST_DEPLOYED_UNCERTIFIED',
  ].map((state, index) => ({ state, at: new Date(Date.UTC(2026, 8, 29, 0, 0, index)).toISOString() }));
  execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], {
    cwd: root,
    env: {
      ...process.env,
      RELEASE_SHA: releaseSha,
      RELEASE_CLASS: 'AUTH_CRITICAL_RELEASE',
      OWNER_TESTING_DEPLOYMENT: 'true',
      AUTHENTICATED_ACCEPTANCE_PROVEN: 'false',
      AUTH_ACCEPTANCE_STATUS: 'OWNER_TEST_PENDING',
      AUTH_ACCEPTANCE_RUN_ID: '',
      CHANGED_COMPONENTS_JSON: '["public"]',
      REUSED_COMPONENTS_JSON: '["admin","control-panel","coordinator","flutter-web","jobs","marketing"]',
      RELEASE_STATE: 'OWNER_TEST_DEPLOYED_UNCERTIFIED',
      RELEASE_STATE_HISTORY_JSON: JSON.stringify(history),
      LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS: 'true',
      CI: 'false',
    },
    stdio: 'pipe',
  });
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(manifest.releaseClass, 'AUTH_CRITICAL_RELEASE');
  assert.equal(manifest.status, 'NO-GO');
  assert.equal(manifest.productionStatus, 'NO-GO');
  assert.equal(manifest.readinessStatus, 'owner-test-pending');
  assert.equal(manifest.authAcceptance.required, true);
  assert.equal(manifest.authAcceptance.status, 'OWNER_TEST_PENDING');
  assert.equal(manifest.authAcceptance.acceptanceRunId, null);
  assert.equal(manifest.authAcceptance.ownerTesting.enabled, true);
  assert.equal(manifest.authAcceptance.ownerTesting.status, 'DEPLOYED_UNCERTIFIED');
  assert.deepEqual(manifest.authAcceptance.ownerTesting.deferredComponents, ['coordinator']);
  assert.equal(manifest.candidate.components.coordinator.versionId, null);
  assert.equal(manifest.candidate.components.coordinator.sourceSha, null);
  assert.equal(manifest.candidate.components.coordinator.status, 'DEFERRED_OWNER_TEST');
  assert.equal(manifest.candidate.components.coordinator.provenance, 'OWNER_TEST_DEPLOYMENT_DEFERRED');
});

test('owner diagnostic can record exact same-run acceptance while public readiness remains NO-GO', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-owner-diagnostic-manifest-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'release-manifest.json');
  const diagnosticExpiry = new Date(Math.floor((Date.now() + 90 * 60_000) / 1000) * 1000).toISOString();
  const adminVersion = '11111111-1111-4111-8111-111111111111';
  const coordinatorVersion = '22222222-2222-4222-8222-222222222222';
  const dependencies = {
    public: { workerName: 'lythaus-public-api-development', versionId: '33333333-3333-4333-8333-333333333333', sourceSha: 'f'.repeat(40), status: 'REUSED_PRODUCTION', provenance: 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION' },
    admin: { workerName: 'lythaus-admin-api-development', versionId: adminVersion, sourceSha: releaseSha, status: 'NEW_CANDIDATE', provenance: 'BUILT_FROM_RELEASE_SHA' },
    jobs: { workerName: 'lythaus-jobs-development', versionId: '44444444-4444-4444-8444-444444444444', sourceSha: 'e'.repeat(40), status: 'REUSED_PRODUCTION', provenance: 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION' },
    coordinator: { workerName: 'lythaus-auth-acceptance-coordinator-development', versionId: coordinatorVersion, sourceSha: releaseSha, status: 'NEW_CANDIDATE', provenance: 'BUILT_FROM_RELEASE_SHA' },
    subjectDiagnosticExpiresAt: diagnosticExpiry,
  };
  const history = [
    'PREFLIGHT', 'INFRASTRUCTURE_VERIFIED', 'CANDIDATE_READY', 'PRODUCT_ACCEPTANCE_REQUIRED',
    'PRODUCT_ACCEPTANCE_PASSED', 'ACTIVATED', 'OWNER_TEST_DEPLOYED_UNCERTIFIED',
  ].map((state, index) => ({ state, at: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString() }));
  const env = {
    ...process.env,
    RELEASE_SHA: releaseSha,
    RELEASE_CLASS: 'AUTH_CRITICAL_RELEASE',
    OWNER_TESTING_DEPLOYMENT: 'true',
    OWNER_TESTING_SUBJECT_DIAGNOSTIC: 'true',
    INDEPENDENT_RECOVERY_STATUS: 'DEFERRED_BY_OWNER_EXCEPTION',
    RECOVERY_READINESS_STATUS: 'PASS',
    AUTHENTICATED_ACCEPTANCE_PROVEN: 'true',
    AUTH_ACCEPTANCE_STATUS: 'PASSED',
    AUTH_ACCEPTANCE_RUN_ID: '55555555-5555-4555-8555-555555555555',
    AUTH_ACCEPTANCE_EXPIRES_AT: new Date(Date.now() + 30 * 60_000).toISOString(),
    AUTH_ACCEPTANCE_DEPENDENCIES_JSON: JSON.stringify(dependencies),
    CHANGED_COMPONENTS_JSON: '["admin","coordinator"]',
    REUSED_COMPONENTS_JSON: '["control-panel","flutter-web","jobs","marketing","public"]',
    ADMIN_API_WORKER_VERSION: adminVersion,
    ADMIN_API_WORKER_SOURCE_SHA: releaseSha,
    ADMIN_API_WORKER_STATUS: 'ACTIVATED',
    ADMIN_API_WORKER_PROVENANCE: 'BUILT_FROM_RELEASE_SHA',
    COORDINATOR_WORKER_VERSION: coordinatorVersion,
    COORDINATOR_WORKER_SOURCE_SHA: releaseSha,
    COORDINATOR_WORKER_STATUS: 'ACTIVATED',
    COORDINATOR_WORKER_PROVENANCE: 'BUILT_FROM_RELEASE_SHA',
    PUBLIC_API_WORKER_VERSION: dependencies.public.versionId,
    PUBLIC_API_WORKER_SOURCE_SHA: dependencies.public.sourceSha,
    JOBS_WORKER_VERSION: dependencies.jobs.versionId,
    JOBS_WORKER_SOURCE_SHA: dependencies.jobs.sourceSha,
    RELEASE_STATE: 'OWNER_TEST_DEPLOYED_UNCERTIFIED',
    RELEASE_STATE_HISTORY_JSON: JSON.stringify(history),
    LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS: 'true',
    CI: 'false',
  };
  execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], { cwd: root, env, stdio: 'pipe' });
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(manifest.status, 'NO-GO');
  assert.equal(manifest.productionStatus, 'NO-GO');
  assert.equal(manifest.readinessStatus, 'owner-test-authenticated-uncertified');
  assert.equal(manifest.authAcceptance.status, 'PASSED');
  assert.equal(manifest.authAcceptance.candidateDependenciesVerified, true);
  assert.equal(manifest.authAcceptance.ownerTesting.status, 'DEPLOYED_UNCERTIFIED');
  assert.deepEqual(manifest.authAcceptance.ownerTesting.deferredComponents, []);
  assert.equal(manifest.subjectDiagnostic.enabled, true);
  assert.equal(manifest.subjectDiagnostic.adminVersionId, adminVersion);
  assert.equal(manifest.subjectDiagnostic.adminSourceSha, releaseSha);
  assert.equal(manifest.subjectDiagnostic.expiresAt, diagnosticExpiry);
  assert.equal(manifest.recovery.independentRecoveryStatus, 'DEFERRED_BY_OWNER_EXCEPTION');
  assert.deepEqual(manifest.recovery.publicReleaseBlockers, ['independent_recovery_destination']);

  const expiredExpiry = new Date(Math.floor((Date.now() - 60_000) / 1000) * 1000).toISOString();
  const expiredDependencies = { ...dependencies, subjectDiagnosticExpiresAt: expiredExpiry };
  const expiredOutput = path.join(directory, 'expired-release-manifest.json');
  execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', expiredOutput], {
    cwd: root,
    env: {
      ...env,
      SUBJECT_DIAGNOSTIC_EXPIRES_AT: expiredExpiry,
      AUTH_ACCEPTANCE_DEPENDENCIES_JSON: JSON.stringify(expiredDependencies),
    },
    stdio: 'pipe',
  });
  const expiredManifest = JSON.parse(fs.readFileSync(expiredOutput, 'utf8'));
  assert.equal(expiredManifest.authAcceptance.status, 'PASSED');
  assert.equal(expiredManifest.authAcceptance.candidateDependenciesVerified, true);
  assert.equal(expiredManifest.subjectDiagnostic.status, 'EXPIRED');
  assert.equal(expiredManifest.status, 'NO-GO');
  assert.equal(expiredManifest.productionStatus, 'NO-GO');
  assert.equal(expiredManifest.recovery.independentRecoveryStatus, 'DEFERRED_BY_OWNER_EXCEPTION');
  assert.deepEqual(expiredManifest.recovery.publicReleaseBlockers, ['independent_recovery_destination']);

  const workflow = fs.readFileSync('.github/workflows/production-release.yml', 'utf8');
  const assertion = workflow.split('- name: Assert owner testing remains uncertified')[1].split('\n      - name:')[0]
    .split('run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const assertionDirectory = path.join(directory, 'assertion');
  const manifestDirectory = path.join(assertionDirectory, '.artifacts', 'release');
  fs.mkdirSync(manifestDirectory, { recursive: true });
  const assertionManifest = path.join(manifestDirectory, 'release-manifest.json');
  const summary = path.join(directory, 'summary.md');
  fs.writeFileSync(assertionManifest, JSON.stringify(manifest));
  execFileSync('bash', ['-euo', 'pipefail', '-c', assertion], {
    cwd: assertionDirectory,
    env: { ...process.env, RELEASE_MODE: 'owner_testing_subject_diagnostic_exception', GITHUB_STEP_SUMMARY: summary },
    stdio: 'pipe',
  });
  assert.match(fs.readFileSync(summary, 'utf8'), /exact candidate.*NO-GO.*independent recovery is unresolved/i);
  fs.writeFileSync(assertionManifest, JSON.stringify(expiredManifest));
  execFileSync('bash', ['-euo', 'pipefail', '-c', assertion], {
    cwd: assertionDirectory,
    env: { ...process.env, RELEASE_MODE: 'owner_testing_subject_diagnostic_exception', GITHUB_STEP_SUMMARY: summary },
    stdio: 'pipe',
  });
  assert.match(fs.readFileSync(summary, 'utf8'), /exact candidate.*NO-GO.*independent recovery is unresolved/i);
  for (const tampered of [
    { ...manifest, status: 'GO' },
    { ...manifest, recovery: { ...manifest.recovery, independentRecoveryStatus: 'VERIFIED', publicReleaseBlockers: [] } },
    { ...manifest, authAcceptance: { ...manifest.authAcceptance, candidateDependenciesVerified: false } },
  ]) {
    fs.writeFileSync(assertionManifest, JSON.stringify(tampered));
    assert.throws(() => execFileSync('bash', ['-euo', 'pipefail', '-c', assertion], {
      cwd: assertionDirectory,
      env: { ...process.env, RELEASE_MODE: 'owner_testing_subject_diagnostic_exception', GITHUB_STEP_SUMMARY: summary },
      stdio: 'pipe',
    }));
  }

  assert.throws(() => execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], {
    cwd: root,
    env: { ...env, CHANGED_COMPONENTS_JSON: '["admin"]' },
    stdio: 'pipe',
  }), /requires exactly Admin and coordinator candidates/);
});

test('owner-test mode rejects any acceptance proof or acceptance run', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-owner-test-forged-'));
  const output = path.join(directory, 'release-manifest.json');
  assert.throws(() => execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], {
    cwd: root,
    env: {
      ...process.env,
      RELEASE_SHA: releaseSha,
      RELEASE_CLASS: 'AUTH_CRITICAL_RELEASE',
      OWNER_TESTING_DEPLOYMENT: 'true',
      AUTHENTICATED_ACCEPTANCE_PROVEN: 'true',
      AUTH_ACCEPTANCE_RUN_ID: '22222222-2222-4222-8222-222222222222',
      LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS: 'true',
      CI: 'false',
    },
    stdio: 'pipe',
  }), /owner-testing deployment cannot include or claim an acceptance run/);
});

for (const state of ['ROLLED_BACK', 'BLOCKED']) {
  test(`failed owner-test ${state} publishes a NO-GO manifest with the original blocker`, (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-owner-test-failure-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const outputDirectory = path.join(directory, '.artifacts', 'release');
    fs.mkdirSync(outputDirectory, { recursive: true });
    const output = path.join(outputDirectory, 'release-manifest.json');
    const blocker = { gate: 'CANDIDATE', code: 'admin_candidate_runtime_probe_failed', domain: 'SAFETY_BLOCKER', message: 'Admin candidate readiness or runtime probe failed' };
    const history = ['PREFLIGHT', 'INFRASTRUCTURE_VERIFIED', 'BLOCKED', ...(state === 'ROLLED_BACK' ? ['ROLLED_BACK'] : [])]
      .map((state, index) => ({ state, at: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString() }));
    execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], {
      cwd: root,
      env: {
        ...process.env, RELEASE_SHA: releaseSha, RELEASE_CLASS: 'AUTH_CRITICAL_RELEASE', OWNER_TESTING_DEPLOYMENT: 'true',
        AUTHENTICATED_ACCEPTANCE_PROVEN: 'false', AUTH_ACCEPTANCE_RUN_ID: '',
        RELEASE_STATE: state, RELEASE_STATE_HISTORY_JSON: JSON.stringify(history), ROLLBACK_STATE: state,
        FAILURE_DOMAIN_EVIDENCE_JSON: JSON.stringify([blocker]), LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS: 'true', CI: 'false',
      },
      stdio: 'pipe',
    });
    const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(manifest.state, state);
    assert.equal(manifest.rollback.state, state);
    assert.equal(manifest.status, 'NO-GO');
    assert.equal(manifest.productionStatus, 'NO-GO');
    assert.equal(manifest.authAcceptance.status, 'OWNER_TEST_PENDING');
    assert.equal(manifest.authAcceptance.ownerTesting.status, 'PENDING');
    assert.deepEqual(manifest.failureDomains, [blocker]);
    const workflow = fs.readFileSync('.github/workflows/production-release.yml', 'utf8');
    const assertion = workflow.split('- name: Assert owner testing remains uncertified')[1].split('\n      - name:')[0]
      .split('run: |\n')[1].split('\n').map((line) => line.replace(/^          /, '')).join('\n');
    const summary = path.join(directory, 'summary.md');
    execFileSync('bash', ['-euo', 'pipefail', '-c', assertion], { cwd: directory, env: { ...process.env, GITHUB_STEP_SUMMARY: summary, RELEASE_MODE: 'owner_testing' }, stdio: 'pipe' });
    assert.match(fs.readFileSync(summary, 'utf8'), /did not complete deployment/);
    assert.doesNotMatch(fs.readFileSync(summary, 'utf8'), /smoke checks completed/);
    for (const field of ['status', 'productionStatus']) {
      fs.writeFileSync(output, JSON.stringify({ ...manifest, [field]: 'GO' }));
      assert.throws(() => execFileSync('bash', ['-euo', 'pipefail', '-c', assertion], { cwd: directory, env: { ...process.env, GITHUB_STEP_SUMMARY: summary, RELEASE_MODE: 'owner_testing' }, stdio: 'pipe' }));
    }
    fs.writeFileSync(output, JSON.stringify({ ...manifest, authAcceptance: { ...manifest.authAcceptance, status: 'PASSED' } }));
    assert.throws(() => execFileSync('bash', ['-euo', 'pipefail', '-c', assertion], { cwd: directory, env: { ...process.env, GITHUB_STEP_SUMMARY: summary, RELEASE_MODE: 'owner_testing' }, stdio: 'pipe' }));
    for (const name of ['Create sanitized manifest integrity digest', 'Upload canonical release manifest']) {
      const step = workflow.split('\n  manifest:')[1].split(`- name: ${name}`)[1].split('\n      - name:')[0];
      assert.match(step, /if: always\(\)/);
    }
  });
}

test('release manifest rejects rollback components that were not changed', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-invalid-rollback-components-'));
  const output = path.join(directory, 'release-manifest.json');
  let error;
  try {
    execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], {
      cwd: root,
      env: {
        ...process.env,
        RELEASE_SHA: releaseSha,
        RELEASE_CLASS: 'STANDARD_RELEASE',
        CHANGED_COMPONENTS_JSON: '["marketing"]',
        REUSED_COMPONENTS_JSON: '["admin","control-panel","coordinator","flutter-web","jobs","public"]',
        ROLLBACK_COMPONENTS_JSON: '["marketing","public"]',
        LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS: 'true',
        CI: 'false',
      },
      stdio: 'pipe',
    });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error);
  assert.match(String(error.stderr), /ROLLBACK_COMPONENTS_JSON may contain only changed components/);
});
