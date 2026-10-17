import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

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
  assert.ok(report.blockers.includes('PLANETSCALE_API_TOKEN_missing_for_read_branch_and_backup_evidence'));
  assert.ok(report.blockers.some((item) => item.startsWith('worker_config_allowlist_missing_or_mismatched:')));
});

test('read-only plan and gated executor use exact scoped operations', () => {
  const plan = fs.readFileSync(path.join(root, 'scripts/ci/planetscale-0021-only-plan.mjs'), 'utf8');
  const executor = fs.readFileSync(path.join(root, 'scripts/ci/apply-planetscale-0021-only.mjs'), 'utf8');
  assert.match(plan, /method: 'GET'/);
  assert.match(plan, /SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY/);
  assert.doesNotMatch(plan, /INSERT INTO|ALTER TABLE|CREATE INDEX|POST|DELETE/);
  assert.match(executor, /PLANETSCALE_0021_EXECUTION_APPROVED !== 'approved'/);
  assert.match(executor, /beforeApply: async/);
  assert.match(executor, /exactRegistryPrefix\(lockedRegistry, MIGRATION_0020\)/);
  assert.doesNotMatch(executor, /applyGrants|PLANETSCALE_SERVICE_TOKEN|create.*role/i);
});
