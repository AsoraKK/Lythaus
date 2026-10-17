import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { buildPlanetScaleTargetIdentity } from '../ci/planetscale-0021-target-identity.mjs';

const root = process.cwd();
const workflowPath = path.join(root, '.github/workflows/planetscale-production-migrations.yml');
const workflowSource = fs.readFileSync(workflowPath, 'utf8');

function jobBlock(name) {
  const marker = `  ${name}:`;
  const start = workflowSource.indexOf(marker);
  assert.notEqual(start, -1, `missing job ${name}`);
  const next = /^  [a-zA-Z0-9_-]+:/gm;
  next.lastIndex = start + marker.length;
  const match = next.exec(workflowSource);
  return workflowSource.slice(start, match?.index ?? workflowSource.length);
}

test('keeps all-migrations as the default and scopes plan and execution to explicit 0021 selection', () => {
  assert.match(workflowSource, /migration_scope:[\s\S]*?type: choice\s+default: all-migrations\s+options:\s+- all-migrations\s+- 0021-only/);
  assert.match(jobBlock('migrate'), /if: inputs\.migration_scope != '0021-only'/);
  assert.match(jobBlock('plan-0021-only'), /if: inputs\.migration_scope == '0021-only'/);
  assert.match(jobBlock('plan-0021-only'), /environment: production/);
  assert.match(jobBlock('execute-0021-only'), /if: inputs\.migration_scope == '0021-only' && inputs\.execute_0021 == true && needs\.plan-0021-only\.outputs\.ready == 'true'/);
  assert.match(jobBlock('execute-0021-only'), /environment: production/);
});

test('plan job has no administrative database credential and executor has no service-token role creation path', () => {
  const planText = jobBlock('plan-0021-only');
  assert.doesNotMatch(planText, /PLANETSCALE_ADMIN_DATABASE_URL/);
  assert.match(planText, /PLANETSCALE_SCHEMA_READ_DATABASE_URL/);
  assert.match(planText, /PLANETSCALE_API_TOKEN/);
  const executionText = jobBlock('execute-0021-only');
  assert.match(executionText, /PLANETSCALE_ADMIN_DATABASE_URL/);
  assert.doesNotMatch(executionText, /PLANETSCALE_SERVICE_TOKEN/);
  assert.doesNotMatch(executionText, /apply-planetscale-production-migrations/);
  assert.doesNotMatch(executionText, /reconcile-planetscale-schema-verifier/);
});

test('workflow passes the plan boolean unchanged and executor accepts true while false blocks before DB access', () => {
  const executionText = jobBlock('execute-0021-only');
  assert.ok(executionText.includes('PLANETSCALE_0021_PLAN_READY: ${{ steps.plan.outputs.ready }}'));
  assert.ok(executionText.includes('PLANETSCALE_0021_PLAN_TARGET_IDENTITY: ${{ steps.plan.outputs.target_identity }}'));
  const executor = 'scripts/ci/apply-planetscale-0021-only.mjs';
  const common = {
    PATH: process.env.PATH ?? '',
    PLANETSCALE_0021_EXECUTION_APPROVED: 'approved',
    PSCALE_BRANCH_NAME: 'main',
  };
  const blocked = spawnSync(process.execPath, [executor], {
    cwd: root, encoding: 'utf8', env: { ...common, PLANETSCALE_0021_PLAN_READY: 'false' }, timeout: 15_000,
  });
  assert.equal(blocked.status, 1);
  assert.equal(JSON.parse(blocked.stdout).failureCode, 'read_only_plan_not_ready');

  const plannedTarget = buildPlanetScaleTargetIdentity({
    organization: 'lythaus',
    database: 'lythaus-core',
    branchName: 'main',
    branchId: 'branch123',
    originFingerprint: 'a'.repeat(64),
  });
  const accepted = spawnSync(process.execPath, [executor], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...common,
      PLANETSCALE_0021_PLAN_READY: 'true',
      PLANETSCALE_0021_PLAN_TARGET_IDENTITY: JSON.stringify(plannedTarget),
    },
    timeout: 15_000,
  });
  assert.equal(accepted.status, 1);
  assert.equal(JSON.parse(accepted.stdout).failureCode, 'PLANETSCALE_ADMIN_DATABASE_URL_missing');
});

test('local plan without read-only credentials emits blockers and performs no provider work', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/planetscale-0021-only-plan.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', CI: 'true', RELEASE_SHA: 'a'.repeat(40) },
    timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.databaseWrites, false);
  assert.equal(report.providerMutations, false);
  assert.equal(report.readyForProtectedExecutionReview, false);
  assert.equal(report.executionEligibility, 'blocked_pending_owner_decision');
  assert.ok(report.blockers.includes('0021_cutover_owner_decision_pending'));
  assert.ok(report.blockers.includes('PLANETSCALE_API_TOKEN_missing_for_read_branch_and_backup_evidence'));
});

test('read-only plan and gated executor use exact scoped operations', () => {
  const plan = fs.readFileSync(path.join(root, 'scripts/ci/planetscale-0021-only-plan.mjs'), 'utf8');
  const executor = fs.readFileSync(path.join(root, 'scripts/ci/apply-planetscale-0021-only.mjs'), 'utf8');
  assert.match(plan, /method: 'GET'/);
  assert.match(plan, /SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY/);
  assert.doesNotMatch(plan, /INSERT INTO|ALTER TABLE|CREATE INDEX|POST|DELETE/);
  assert.match(executor, /PLANETSCALE_0021_EXECUTION_APPROVED !== 'approved'/);
  assert.match(executor, /beforeApply: async/);
  assert.match(executor, /classifyLocked0021State\(lockedRegistry, lockedStage\.state\)/);
  assert.match(executor, /lockedState\.action === 'RECOVER_MARKER'/);
  assert.match(executor, /recordCanonical0021RegistryMarker\(client, migration/);
  assert.doesNotMatch(executor, /applyGrants|PLANETSCALE_SERVICE_TOKEN|create.*role/i);
});
