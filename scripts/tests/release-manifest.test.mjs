import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { REQUIRED_RELEASE_SCHEMA_VERSION } from '../ci/product-integrity-schema-contract.mjs';

const root = process.cwd();
const releaseSha = '0123456789abcdef0123456789abcdef01234567';

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
