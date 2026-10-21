import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';

const command = 'node --test scripts/tests/owner-recovery-exception.test.mjs scripts/tests/owner-recovery-ci-registration.test.mjs';
const ci = () => parse(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'));

function requireOwnerRecoveryRegistration(workflow) {
  const job = workflow.jobs.native_runtime;
  assert.equal(job.if, undefined);
  assert.ok(!job['continue-on-error']);
  const steps = job.steps.filter(step => step.run?.trim() === command);
  assert.equal(steps.length, 1);
  assert.deepEqual(Object.keys(steps[0]).sort(), ['name', 'run']);
}

test('required native CI runs owner recovery regressions without modifying the frozen package command', () => {
  requireOwnerRecoveryRegistration(ci());
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.ok(!pkg.scripts['test:native-architecture'].includes('owner-recovery'));
});

test('owner recovery CI registration rejects omission, skipping, failure suppression and altered commands', () => {
  for (const mutate of [
    job => { job.if = 'false'; },
    job => { job['continue-on-error'] = true; },
    job => { job.steps = job.steps.filter(step => step.run?.trim() !== command); },
    job => { job.steps.find(step => step.run?.trim() === command).if = 'false'; },
    job => { job.steps.find(step => step.run?.trim() === command)['continue-on-error'] = true; },
    job => { job.steps.find(step => step.run?.trim() === command).run += ' || true'; },
    job => { job.steps.push({ name: 'duplicate', run: command }); },
  ]) {
    const altered = ci();
    mutate(altered.jobs.native_runtime);
    assert.throws(() => requireOwnerRecoveryRegistration(altered));
  }
});
