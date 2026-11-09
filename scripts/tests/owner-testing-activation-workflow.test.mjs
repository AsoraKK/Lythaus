import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';

const workersText = fs.readFileSync('.github/workflows/native-workers-deploy.yml', 'utf8');
const activationText = fs.readFileSync('.github/workflows/native-workers-owner-testing-activate.yml', 'utf8');
const workers = parse(workersText);
const activation = parse(activationText);

test('subject-diagnostic release has separate production approvals in one dependent run', () => {
  assert.equal(workers.on.workflow_call.inputs.owner_testing_subject_diagnostic.type, 'boolean');
  assert.equal(workers.jobs.deploy.environment, 'production');
  assert.deepEqual(workers.jobs.activate.needs, ['deploy']);
  assert.match(workers.jobs.activate.if, /owner_testing_subject_diagnostic == true/);
  assert.match(workers.jobs.activate.if, /needs\.deploy\.result == 'success'/);
  assert.equal(activation.jobs.activate.environment, 'production');
  assert.equal(activation.on.workflow_call.inputs.release_sha.type, 'string');
  assert.equal(activation.on.workflow_call.inputs.activation_handoff_json.type, 'string');
  assert.match(workers.on.workflow_call.outputs.admin_worker_status.value, /jobs\.activate\.outputs\.admin_worker_status/);
});

test('activation waits until stage and Keeper completion and restores temporary acceptance routing first', () => {
  const stageSteps = workers.jobs.deploy.steps;
  const waitIndex = stageSteps.findIndex(step => step.name?.includes('Collect generated candidate auth acceptance evidence'));
  const restoreIndex = stageSteps.findIndex(step => step.name === 'Restore acceptance-only Coordinator before activation approval');
  const handoffIndex = stageSteps.findIndex(step => step.name === 'Create exact same-run activation handoff');
  const stageActivationIndex = stageSteps.findIndex(step => step.name === 'Activate exact candidate Worker versions (ACTIVATION gate; changed components only)');
  assert.ok(waitIndex >= 0 && restoreIndex > waitIndex && handoffIndex > restoreIndex);
  assert.match(stageSteps[stageActivationIndex].if, /owner_testing_subject_diagnostic != true/);
  assert.match(stageSteps[stageSteps.findIndex(step => step.name === 'Restore acceptance-only Coordinator before activation approval')].run,
    /assert-owner-testing-rollback-safe\.mjs[\s\S]*manage-cloudflare-worker-route\.mjs restore[\s\S]*versions deploy[\s\S]*assertRollbackStateMatchesBaseline/);
  const activationSteps = activation.jobs.activate.steps;
  const indices = [
    activationSteps.findIndex(step => step.name === 'Validate same-run first-attempt handoff after activation approval'),
    activationSteps.findIndex(step => step.name === 'Revalidate exact candidate versions and source tags'),
    activationSteps.findIndex(step => step.name === 'Revalidate final production and diagnostic runway gates after approval'),
    activationSteps.findIndex(step => step.name === 'Reverify fresh recovery readiness and exact owner exception after approval'),
    activationSteps.findIndex(step => step.name === 'Capture and compare live Workers and routes immediately before activation'),
    activationSteps.findIndex(step => step.name === 'Activate exact Admin and Coordinator candidates after second approval'),
  ];
  assert.ok(indices.every(index => index >= 0));
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
});

test('staging keeps Admin at zero traffic and activation rechecks the exact diagnostic runway', () => {
  const stage = workers.jobs.deploy.steps.find(step => step.name === 'Stage candidate Worker versions at zero traffic (CANDIDATE gate; changed components only)');
  assert.match(stage.run, /\$\{ADMIN_WORKER_VERSION_ID\}@0/);
  assert.match(stage.run, /wait-for-owner-testing-admin-zero-traffic\.mjs/);
  const acceptance = workers.jobs.deploy.steps.find(step => step.name === 'PRODUCT_ACCEPTANCE - Collect generated candidate auth acceptance evidence');
  assert.match(acceptance.run, /wait-for-auth-acceptance-evidence\.mjs/);
  assert.match(acceptance.env.CLOUDFLARE_API_TOKEN, /owner_testing_subject_diagnostic == true && secrets\.CLOUDFLARE_API_TOKEN/);
  assert.equal(acceptance.env.CLOUDFLARE_ACCOUNT_ID, 'e5b7ae46e04698f507b7e4b3d4ef1af0');
  assert.match(acceptance.run, /wait-for-auth-acceptance-evidence\.mjs/);
  const finalGate = activation.jobs.activate.steps.find(step => step.name === 'Revalidate final production and diagnostic runway gates after approval');
  assert.match(finalGate.run, /verify-subject-diagnostic-expiry\.mjs/);
  assert.match(finalGate.run, /validate:production-gates:final/);
});

test('diagnostic and activation timeouts preserve the three-hour cap and 40-minute runway', () => {
  assert.match(workers.jobs.deploy['timeout-minutes'], /owner_testing_subject_diagnostic == true && 105 \|\| 35/);
  assert.equal(activation.jobs.activate['timeout-minutes'], 35);
  const maxPolicyMinutes = 180;
  const requiredRunwayMinutes = 40;
  assert.equal(105 + 35 + requiredRunwayMinutes, maxPolicyMinutes);
});

test('activation handoff has exact same-run and first-attempt checks without carrying secret values', () => {
  const handoffStep = workers.jobs.deploy.steps.find(step => step.name === 'Create exact same-run activation handoff');
  for (const forbidden of ['TOKEN', 'SECRET', 'PASSWORD']) {
    assert.equal(Object.keys(handoffStep.env).some(name => name.includes(forbidden)), false);
  }
  assert.equal(handoffStep.env.GITHUB_RUN_ID, '${{ github.run_id }}');
  assert.equal(handoffStep.env.GITHUB_RUN_ATTEMPT, '${{ github.run_attempt }}');
  assert.match(activation.jobs.activate.steps.find(step => step.name === 'Validate same-run first-attempt handoff after activation approval').run,
    /validate-owner-testing-activation-handoff\.mjs/);
  assert.match(activation.jobs.activate.steps.find(step => step.name === 'Reverify fresh recovery readiness and exact owner exception after approval').env.PLANETSCALE_OWNER_RECOVERY_EXCEPTION_JSON,
    /vars\.PLANETSCALE_OWNER_RECOVERY_EXCEPTION_JSON/);
  assert.match(activation.jobs.activate.steps.find(step => step.name === 'Reverify fresh recovery readiness and exact owner exception after approval').env.PLANETSCALE_API_TOKEN,
    /secrets\.PLANETSCALE_API_TOKEN/);
});

test('partial rollback has a server-state comparison before route or version restore', () => {
  const rollback = activation.jobs.activate.steps.find(step => step.name === 'Safely roll back partial activation only from known in-run states');
  assert.match(rollback.if, /failure\(\) \|\| cancelled\(\)/);
  assert.match(rollback.run, /block_rollback_without_verified_live_state\(\)/);
  assert.match(rollback.run, /ROLLBACK_STATE=BLOCKED_UNVERIFIED_LIVE_STATE/);
  assert.match(rollback.run, /ACTIVATION_STATE=BLOCKED/);
  assert.doesNotMatch(rollback.run, /\|\|\s*exit 2/);
  assert.ok(rollback.run.indexOf('prepare-acceptance-rollback-snapshot.mjs capture')
    < rollback.run.indexOf('assert-owner-testing-rollback-safe.mjs'));
  assert.ok(rollback.run.indexOf('assert-owner-testing-rollback-safe.mjs')
    < rollback.run.indexOf('manage-cloudflare-worker-route.mjs restore'));
  assert.match(rollback.run, /BLOCKED_EXTERNAL_DRIFT/);
});

