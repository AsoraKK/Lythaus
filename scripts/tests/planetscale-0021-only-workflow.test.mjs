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

test('scoped workflow runs 0021 syntax and tests without changing root npm registrations', () => {
  const planText = jobBlock('plan-0021-only');
  const syntaxChecks = [
    'node --check scripts/ci/planetscale-0021-only-contract.mjs',
    'node --check scripts/ci/planetscale-0021-target-identity.mjs',
    'node --check scripts/ci/planetscale-0021-registry-marker.mjs',
    'node --check scripts/ci/planetscale-0021-only-plan.mjs',
    'node --check scripts/ci/apply-planetscale-0021-only.mjs',
    'node --check scripts/ci/planetscale-media-quarantine-migration.mjs',
    'node --check scripts/ci/product-integrity-schema-contract.mjs',
    'node --experimental-strip-types --check packages/db/src/identity.ts',
  ];
  for (const check of syntaxChecks) assert.ok(planText.includes(check), `missing scoped syntax check: ${check}`);
  const existingSuite = planText.indexOf('npm run test:planetscale-production-migrations');
  const scopedSuite = planText.indexOf('node --experimental-strip-types --test scripts/tests/planetscale-0021-only-contract.test.mjs scripts/tests/planetscale-0021-only-workflow.test.mjs');
  assert.ok(existingSuite >= 0);
  assert.ok(scopedSuite > existingSuite, 'the direct scoped suite must follow the unchanged root suite');
  assert.doesNotMatch(planText, /npm run validate:planetscale-0021-only/);

  const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(rootPackage.scripts['test:planetscale-production-migrations'],
    'node --test scripts/tests/planetscale-production-migrations.test.mjs scripts/tests/planetscale-schema-verifier-views.test.mjs');
  assert.equal(Object.hasOwn(rootPackage.scripts, 'validate:planetscale-0021-only'), false);
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

test('both plans and the executor consume approval from protected variables rather than dispatch inputs', () => {
  for (const [job, count] of [['plan-0021-only', 1], ['execute-0021-only', 2]]) {
    const text = jobBlock(job);
    for (const key of ['PLANETSCALE_0021_EXECUTION_APPROVED_SHA', 'PLANETSCALE_0021_EXECUTION_APPROVAL_REFERENCE']) {
      assert.equal(text.split(`${key}: \${{ vars.${key} }}`).length - 1, count);
      assert.equal(text.includes(`\${{ inputs.${key}`), false);
    }
  }
  assert.doesNotMatch(jobBlock('migrate'), /PLANETSCALE_0021_EXECUTION_APPROVED_SHA/);
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
    RELEASE_SHA: 'a'.repeat(40),
    PLANETSCALE_0021_EXECUTION_APPROVED_SHA: 'a'.repeat(40),
    PLANETSCALE_0021_EXECUTION_APPROVAL_REFERENCE: 'synthetic owner execution approval',
  };
  const blocked = spawnSync(process.execPath, [executor], {
    cwd: root, encoding: 'utf8', env: { ...common, PLANETSCALE_0021_PLAN_READY: 'false' }, timeout: 15_000,
  });
  assert.equal(blocked.status, 1);
  assert.equal(JSON.parse(blocked.stdout).failureCode, 'read_only_plan_not_ready');

  const plannedTarget = buildPlanetScaleTargetIdentity({
    provider: { organization: 'lythaus', database: 'lythaus-core', branchName: 'main', branchId: 'branch123' },
    sql: { databaseName: 'postgres', originFingerprint: 'a'.repeat(64) },
  });
  for (const [override, failureCode] of [
    [{ PLANETSCALE_0021_EXECUTION_APPROVED_SHA: '' }, '0021_execution_approved_sha_missing_or_invalid'],
    [{ PLANETSCALE_0021_EXECUTION_APPROVED_SHA: 'b'.repeat(40) }, '0021_execution_approved_sha_does_not_match_release'],
    [{ PLANETSCALE_0021_EXECUTION_APPROVAL_REFERENCE: '' }, '0021_execution_approval_reference_missing'],
    [{ RELEASE_SHA: '' }, 'release_sha_missing_or_invalid'],
  ]) {
    const refused = spawnSync(process.execPath, [executor], {
      cwd: root, encoding: 'utf8', timeout: 15_000,
      env: { ...common, PLANETSCALE_0021_PLAN_READY: 'true', PLANETSCALE_0021_PLAN_TARGET_IDENTITY: JSON.stringify(plannedTarget), ...override },
    });
    assert.equal(refused.status, 1);
    assert.equal(JSON.parse(refused.stdout).failureCode, failureCode);
  }
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
  assert.equal(report.executionEligibility, 'blocked_pending_prerequisites');
  assert.ok(report.blockers.includes('0021_execution_approved_sha_missing_or_invalid'));
  assert.ok(report.blockers.includes('PLANETSCALE_API_TOKEN_missing_for_read_branch_and_backup_evidence'));
});

test('candidate consent alone cannot make a plan ready without backup, budget, catalog and binding proof', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/planetscale-0021-only-plan.mjs'], {
    cwd: root, encoding: 'utf8', timeout: 15_000,
    env: { PATH: process.env.PATH ?? '', CI: 'true', RELEASE_SHA: 'a'.repeat(40), PSCALE_BRANCH_NAME: 'main',
      PLANETSCALE_0021_EXECUTION_APPROVED_SHA: 'a'.repeat(40),
      PLANETSCALE_0021_EXECUTION_APPROVAL_REFERENCE: 'synthetic owner execution approval' },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ownerExecutionConsent.ok, true);
  assert.equal(report.readyForProtectedExecutionReview, false);
  assert.equal(report.costReview.ok, false);
  for (const blocker of ['positive_cost_ceiling_missing_or_invalid', 'PLANETSCALE_API_TOKEN_missing_for_read_branch_and_backup_evidence',
    'PLANETSCALE_SCHEMA_READ_DATABASE_URL_catalog_reconciliation_failed_or_unavailable', 'main_target_identity_evidence_incomplete']) {
    assert.ok(report.blockers.includes(blocker));
  }
  assert.equal(report.hyperdriveOrigins.status, 'unavailable');
  assert.equal(report.databaseWrites, false);
  assert.equal(report.providerMutations, false);
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
  const connectionValidation = executor.indexOf('new Client(adminConnection(');
  const targetValidation = executor.indexOf('const target = await assertConnectedAdminDatabaseTarget(client,');
  assert.ok(connectionValidation >= 0);
  assert.ok(targetValidation > connectionValidation);
  assert.ok(targetValidation < executor.indexOf('const initialRegistry = await readRegistry(client)'));
  assert.ok(targetValidation < executor.indexOf('await applyMediaQuarantineMigration(client'));
  assert.match(executor, /return adminDatabaseConnectionConfig\(raw\)/);
});
