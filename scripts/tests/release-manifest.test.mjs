import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

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
  assert.equal(manifest.planetscale.latestMigration, '0015_production_auth_acceptance_coordinator.sql');
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
