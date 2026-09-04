import assert from 'node:assert/strict';
import test from 'node:test';

import { RELEASE_STATES, transitionReleaseState } from '../ci/transition-release-state.mjs';
import { transitionFailureState } from '../ci/write-failure-domain-evidence.mjs';

const at = '2026-09-03T00:00:00.000Z';

test('five-gate release state transitions are explicit and ordered', () => {
  let history = [];
  for (const state of [
    'PREFLIGHT',
    'INFRASTRUCTURE_VERIFIED',
    'CANDIDATE_READY',
    'PRODUCT_ACCEPTANCE_NOT_REQUIRED',
    'ACTIVATED',
    'VERIFIED',
  ]) history = transitionReleaseState(history, state, at);
  assert.deepEqual(history.map(({ state }) => state), [
    'PREFLIGHT',
    'INFRASTRUCTURE_VERIFIED',
    'CANDIDATE_READY',
    'PRODUCT_ACCEPTANCE_NOT_REQUIRED',
    'ACTIVATED',
    'VERIFIED',
  ]);
  assert.ok(RELEASE_STATES.includes(history.at(-1).state));
});

test('auth-critical acceptance and rollback transitions remain fail-closed', () => {
  let history = transitionReleaseState([], 'PREFLIGHT', at);
  history = transitionReleaseState(history, 'INFRASTRUCTURE_VERIFIED', at);
  history = transitionReleaseState(history, 'CANDIDATE_READY', at);
  history = transitionReleaseState(history, 'PRODUCT_ACCEPTANCE_REQUIRED', at);
  history = transitionReleaseState(history, 'PRODUCT_ACCEPTANCE_PASSED', at);
  history = transitionReleaseState(history, 'ACTIVATED', at);
  assert.throws(() => transitionReleaseState(history, 'PRODUCT_ACCEPTANCE_NOT_REQUIRED', at), /invalid release state transition/);
  history = transitionReleaseState(history, 'BLOCKED', at);
  history = transitionReleaseState(history, 'ROLLED_BACK', at);
  assert.equal(history.at(-1).state, 'ROLLED_BACK');
  assert.throws(() => transitionReleaseState(history, 'ACTIVATED', at), /invalid release state transition/);
});

test('a release cannot skip the source preflight state', () => {
  assert.throws(() => transitionReleaseState([], 'CANDIDATE_READY', at), /must start at PREFLIGHT/);
});

test('verified and rolled-back states are terminal', () => {
  let verified = transitionReleaseState([], 'PREFLIGHT', at);
  verified = transitionReleaseState(verified, 'INFRASTRUCTURE_VERIFIED', at);
  verified = transitionReleaseState(verified, 'CANDIDATE_READY', at);
  verified = transitionReleaseState(verified, 'PRODUCT_ACCEPTANCE_NOT_REQUIRED', at);
  verified = transitionReleaseState(verified, 'ACTIVATED', at);
  verified = transitionReleaseState(verified, 'VERIFIED', at);
  assert.throws(() => transitionReleaseState(verified, 'BLOCKED', at), /invalid release state transition/);

  let rolledBack = transitionReleaseState([], 'PREFLIGHT', at);
  rolledBack = transitionReleaseState(rolledBack, 'INFRASTRUCTURE_VERIFIED', at);
  rolledBack = transitionReleaseState(rolledBack, 'CANDIDATE_READY', at);
  rolledBack = transitionReleaseState(rolledBack, 'PRODUCT_ACCEPTANCE_NOT_REQUIRED', at);
  rolledBack = transitionReleaseState(rolledBack, 'ACTIVATED', at);
  rolledBack = transitionReleaseState(rolledBack, 'ROLLED_BACK', at);
  assert.throws(() => transitionReleaseState(rolledBack, 'BLOCKED', at), /invalid release state transition/);
});

test('failure evidence preserves an already terminal release state', () => {
  const verified = [{ state: 'VERIFIED', at }];
  assert.deepEqual(transitionFailureState(verified), { state: 'VERIFIED', history: verified });

  const rolledBack = [{ state: 'ROLLED_BACK', at }];
  assert.deepEqual(transitionFailureState(rolledBack), { state: 'ROLLED_BACK', history: rolledBack });
});
