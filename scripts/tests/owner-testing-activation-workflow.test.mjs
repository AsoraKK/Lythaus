import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { ACCEPTANCE_ROLLBACK_SNAPSHOT_SCHEMA } from '../release/acceptance-rollback-snapshot.mjs';
import { createOwnerTestingActivationHandoff } from '../release/owner-testing-activation-handoff.mjs';

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

test('validated rollback snapshot crosses the actual GitHub environment step boundary', () => {
  const steps = activation.jobs.activate.steps;
  const validateIndex = steps.findIndex(step => step.name === 'Validate same-run first-attempt handoff after activation approval');
  const materializeIndex = steps.findIndex(step => step.name === 'Materialize validated rollback snapshot for following steps');
  assert.ok(validateIndex >= 0 && materializeIndex === validateIndex + 1);
  assert.match(steps[validateIndex].run, /validate-owner-testing-activation-handoff\.mjs/);
  assert.doesNotMatch(steps[validateIndex].run, /ROLLBACK_SNAPSHOT_JSON/);
  assert.match(steps[materializeIndex].run, /test -n "\$ROLLBACK_SNAPSHOT_JSON"/);

  const releaseSha = 'a'.repeat(40);
  const versionId = digit => `${digit}`.repeat(8) + '-1111-4111-8111-' + `${digit}`.repeat(12);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
  const versions = {
    public: { versionId: versionId('1'), sourceSha: 'b'.repeat(40), status: 'REUSED_PRODUCTION', provenance: 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION' },
    admin: { versionId: versionId('2'), sourceSha: releaseSha, status: 'NEW_CANDIDATE', provenance: 'BUILT_FROM_RELEASE_SHA' },
    jobs: { versionId: versionId('3'), sourceSha: 'c'.repeat(40), status: 'REUSED_PRODUCTION', provenance: 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION' },
    coordinator: { versionId: versionId('4'), sourceSha: releaseSha, status: 'NEW_CANDIDATE', provenance: 'BUILT_FROM_RELEASE_SHA' },
  };
  const dependencies = Object.fromEntries(Object.entries(versions).map(([key, value]) => [key, {
    workerName: ({ public: 'lythaus-public-api-development', admin: 'lythaus-admin-api-development', jobs: 'lythaus-jobs-development', coordinator: 'lythaus-auth-acceptance-coordinator-development' })[key],
    ...value,
  }]));
  dependencies.subjectDiagnosticExpiresAt = expiresAt;
  const rollbackSnapshot = {
    schemaVersion: ACCEPTANCE_ROLLBACK_SNAPSHOT_SCHEMA,
    workers: Object.fromEntries(['public', 'admin', 'jobs', 'coordinator'].map((component, index) => [component, { versions: [{ versionId: versionId(`${index + 5}`), percentage: 100 }] }])),
    routes: {
      adminApi: { id: 'admin-route', pattern: 'admin.lythaus.co/api/admin/*', script: 'lythaus-admin-api-development' },
      coordinator: { id: 'coordinator-route', pattern: 'admin.lythaus.co/api/admin/production-auth-acceptance/*', script: 'lythaus-auth-acceptance-coordinator-development' },
    },
  };
  const handoff = createOwnerTestingActivationHandoff({
    runId: '987654321012', runAttempt: 1, releaseSha, releaseClass: 'AUTH_CRITICAL_RELEASE',
    ownerTesting: true, recoveryException: true, subjectDiagnostic: true,
    changedComponents: ['admin', 'coordinator'], workerVersions: versions,
    acceptanceStatus: 'PASSED', acceptanceRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    acceptanceExpiresAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
    candidateDependencies: dependencies,
    diagnosticNotBefore: Math.floor(Date.now() / 1000) - 60,
    diagnosticExpiresAt: expiresAt, rollbackSnapshot,
    infrastructure: { hyperdriveVerifiedMain: true, databaseIdentityVerified: true, budgetEnforcementVerified: true, planetscaleGrantsVerified: true },
    releaseStateHistory: [{ state: 'PRODUCT_ACCEPTANCE_PASSED', at: new Date().toISOString() }],
  });

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-handoff-step-boundary-'));
  const githubEnv = path.join(temp, 'github-env');
  const baseEnv = {
    ...process.env,
    GITHUB_ENV: githubEnv,
    RUNNER_TEMP: temp,
    GITHUB_RUN_ID: handoff.runId,
    GITHUB_RUN_ATTEMPT: String(handoff.runAttempt),
    RELEASE_SHA: handoff.releaseSha,
    OWNER_TESTING_ACTIVATION_HANDOFF_JSON: JSON.stringify(handoff),
  };
  const parseGithubEnv = () => {
    const text = fs.readFileSync(githubEnv, 'utf8');
    const values = {};
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length;) {
      if (!lines[index]) { index += 1; continue; }
      const delimiterEntry = lines[index].match(/^([A-Za-z_][A-Za-z0-9_]*)<<(.+)$/);
      if (delimiterEntry) {
        const [, name, delimiter] = delimiterEntry;
        const valueLines = [];
        index += 1;
        while (index < lines.length && lines[index] !== delimiter) valueLines.push(lines[index++]);
        assert.equal(lines[index], delimiter, `GitHub environment delimiter for ${name} closes`);
        values[name] = valueLines.join('\n');
        index += 1;
        continue;
      }
      const assignment = lines[index].match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (assignment) values[assignment[1]] = assignment[2];
      index += 1;
    }
    return values;
  };
  try {
    const validated = spawnSync('bash', ['-euo', 'pipefail', '-c', steps[validateIndex].run], { cwd: process.cwd(), env: baseEnv, encoding: 'utf8' });
    assert.equal(validated.status, 0, validated.stderr);
    const nextStepEnv = parseGithubEnv();
    assert.deepEqual(JSON.parse(nextStepEnv.ROLLBACK_SNAPSHOT_JSON), rollbackSnapshot);
    const materialized = spawnSync('bash', ['-euo', 'pipefail', '-c', steps[materializeIndex].run], {
      cwd: process.cwd(), env: { ...baseEnv, ...nextStepEnv }, encoding: 'utf8',
    });
    assert.equal(materialized.status, 0, materialized.stderr);
    const finalEnv = parseGithubEnv();
    assert.equal(finalEnv.ROLLBACK_ARTIFACTS_PROVEN, 'true');
    assert.deepEqual(JSON.parse(fs.readFileSync(finalEnv.ACCEPTANCE_ROLLBACK_SNAPSHOT_PATH, 'utf8')), rollbackSnapshot);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
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

