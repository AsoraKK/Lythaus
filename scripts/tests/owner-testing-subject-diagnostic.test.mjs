import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { waitForAuthAcceptanceEvidence } from '../ci/wait-for-auth-acceptance-evidence.mjs';

const iso = (milliseconds) => new Date(milliseconds).toISOString();

test('same-run wait returns only after the exact Keeper observer reports PASSED', async () => {
  let now = Date.parse('2026-11-09T12:00:00.000Z');
  let polls = 0;
  let guards = 0;
  const sleeps = [];
  const result = await waitForAuthAcceptanceEvidence({
    expiresAt: iso(now + 3 * 60_000),
    now: () => now,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); now += milliseconds; },
    guard: async () => { guards += 1; },
    pollIntervalMs: 30_000,
    minimumRunRemainingMs: 30_000,
    collect: async () => {
      polls += 1;
      return polls < 3
        ? { exitCode: 2, status: 'HUMAN_ACCEPTANCE_REQUIRED' }
        : { exitCode: 0, status: 'PASSED' };
    },
  });
  assert.deepEqual(result, { status: 'PASSED', observations: 3 });
  assert.deepEqual(sleeps, [30_000, 30_000]);
  assert.equal(guards, 3);
});

test('same-run wait aborts before collecting acceptance when Admin candidate leaves zero traffic', async () => {
  let polls = 0;
  await assert.rejects(waitForAuthAcceptanceEvidence({
    expiresAt: '2026-11-09T13:00:00.000Z',
    now: () => Date.parse('2026-11-09T12:00:00.000Z'),
    guard: async () => {
      polls += 1;
      if (polls === 2) throw new Error('owner_testing_admin_candidate_received_traffic_during_acceptance_wait');
    },
    collect: async () => ({ exitCode: 2, status: 'HUMAN_ACCEPTANCE_REQUIRED' }),
    sleep: async () => {},
  }), /received_traffic_during_acceptance_wait/);
  assert.equal(polls, 2);
});

test('Cloudflare status subprocess receives only its runtime token and non-secret runtime context', () => {
  const source = fs.readFileSync('scripts/ci/wait-for-auth-acceptance-evidence.mjs', 'utf8');
  const guardSource = source.split('      collect: async () =>')[0];
  assert.match(source, /env: \{\s*PATH: process\.env\.PATH[\s\S]*?CLOUDFLARE_API_TOKEN: process\.env\.CLOUDFLARE_API_TOKEN[\s\S]*?CLOUDFLARE_ACCOUNT_ID: process\.env\.CLOUDFLARE_ACCOUNT_ID[\s\S]*?\n\s*\},/);
  assert.doesNotMatch(guardSource, /env: process\.env/);
});

test('same-run wait fails closed on any observer response other than human-pending or PASSED', async () => {
  await assert.rejects(waitForAuthAcceptanceEvidence({
    expiresAt: '2026-11-09T13:00:00.000Z',
    collect: async () => ({ exitCode: 1, status: 'BLOCKED' }),
    now: () => Date.parse('2026-11-09T12:00:00.000Z'),
    sleep: async () => assert.fail('unexpected sleep'),
  }), /auth_acceptance_observer_failed_closed/);
});

test('same-run wait stops before Keeper expiry without producing acceptance proof', async () => {
  let now = Date.parse('2026-11-09T12:00:00.000Z');
  const result = await waitForAuthAcceptanceEvidence({
    expiresAt: iso(now + 55_000),
    collect: async () => ({ exitCode: 2, status: 'HUMAN_ACCEPTANCE_REQUIRED' }),
    now: () => now,
    sleep: async (milliseconds) => { now += milliseconds; },
    pollIntervalMs: 30_000,
    minimumRunRemainingMs: 30_000,
  });
  assert.deepEqual(result, {
    status: 'BLOCKED',
    reason: 'auth_acceptance_run_expiring_before_completion',
    observations: 2,
  });
});

test('same-run wait rejects a PASSED observer response returned after Keeper expiry', async () => {
  const expiresAt = '2026-11-09T12:01:00.000Z';
  const result = await waitForAuthAcceptanceEvidence({
    expiresAt,
    now: () => Date.parse('2026-11-09T12:01:00.001Z'),
    collect: async () => ({ exitCode: 0, status: 'PASSED' }),
  });
  assert.deepEqual(result, {
    status: 'BLOCKED',
    reason: 'auth_acceptance_run_expired_before_observation',
    observations: 1,
  });
});

test('same-run wait rejects non-canonical expiry timestamps', async () => {
  await assert.rejects(waitForAuthAcceptanceEvidence({
    expiresAt: '2026-11-09T12:01:00+00:00',
    collect: async () => assert.fail('must reject invalid expiry before observing'),
  }), /auth_acceptance_wait_configuration_invalid/);
});

test('release contract combines owner exception and diagnostic only in a dedicated mode', () => {
  const production = fs.readFileSync('.github/workflows/production-release.yml', 'utf8');
  const workers = fs.readFileSync('.github/workflows/native-workers-deploy.yml', 'utf8');
  assert.match(production, /owner_testing_subject_diagnostic_exception/);
  assert.match(production, /owner_testing_recovery_exception: \$\{\{ inputs\.release_mode == 'owner_testing_native_recovery_exception' \|\| inputs\.release_mode == 'owner_testing_subject_diagnostic_exception' \}\}/);
  assert.match(production, /enable_subject_diagnostic: \$\{\{ inputs\.release_mode == 'automatic_subject_diagnostic' \|\| inputs\.release_mode == 'force_auth_critical_subject_diagnostic' \|\| inputs\.release_mode == 'owner_testing_subject_diagnostic_exception' \}\}/);
  assert.match(workers, /owner_testing_subject_diagnostic:[\s\S]*default: false/);
  const dispatch = workers.slice(0, workers.indexOf('workflow_call:'));
  assert.doesNotMatch(dispatch, /owner_testing_subject_diagnostic/);
});

test('combined mode preserves the full native acceptance gate and uses same-run rollback on failure', () => {
  const workers = fs.readFileSync('.github/workflows/native-workers-deploy.yml', 'utf8');
  assert.match(workers, /wait-for-auth-acceptance-evidence\.mjs/);
  assert.match(workers, /AUTH_ACCEPTANCE_EXPIRES_AT/);
  assert.match(workers, /OWNER_TESTING_SUBJECT_DIAGNOSTIC/);
  assert.match(workers, /SUBJECT_DIAGNOSTIC_EXPIRES_AT/);
  assert.match(workers, /ROLLBACK_STATE=PRESERVED_FOR_ACCEPTANCE/);
  assert.match(workers, /if \[\[ "\$OWNER_TESTING_DEPLOYMENT" == true && "\$OWNER_TESTING_SUBJECT_DIAGNOSTIC" != true \]\]; then/);
  assert.match(workers, /if \[\[ "\$OWNER_TESTING_SUBJECT_DIAGNOSTIC" == true \]\]; then[\s\S]*wait-for-auth-acceptance-evidence\.mjs/);
  assert.match(workers, /PRODUCT_ACCEPTANCE - Run authenticated acceptance against public candidate[\s\S]*OWNER_TESTING_SUBJECT_DIAGNOSTIC/);
  assert.match(workers, /if component_changed coordinator && \[\[ "\$OWNER_TESTING_DEPLOYMENT" != true \|\| "\$OWNER_TESTING_SUBJECT_DIAGNOSTIC" == true \]\]/);
  assert.match(workers, /verify-subject-diagnostic-expiry\.mjs/);
  assert.match(workers, /rollback_components_json=\$rollback_components/);
});
