import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { requireCompleteTextReviewTests, TEXT_REVIEW_SUITES } from '../ci/run-text-review-tests.mjs';

test('required native CI executes every text evidence, link, account and queue regression', () => {
  const ci = parse(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['test:text-review'], 'node scripts/ci/run-text-review-tests.mjs');
  const job = ci.jobs.native_runtime;
  assert.equal(job.if, undefined); assert.ok(!job['continue-on-error']);
  const steps = job.steps.filter(step => step.run?.trim() === 'npm run test:text-review');
  assert.equal(steps.length, 1); assert.equal(steps[0].if, undefined); assert.ok(!steps[0]['continue-on-error']);
  for (const suffix of ['text-review-evidence.test.mjs', 'text-review-runtime.test.mjs', 'text-review-queue.workerd.mjs'])
    assert.ok(TEXT_REVIEW_SUITES.some(file => file.endsWith(suffix)));
  assert.ok(TEXT_REVIEW_SUITES.includes('packages/authenticity/tests/text-review-evidence.test.mjs'));
  assert.ok(TEXT_REVIEW_SUITES.includes('apps/lythaus-jobs/tests/text-review-evidence.test.mjs'));
  const publication = readFileSync(new URL('../ci/run-publication-pg17.mjs', import.meta.url), 'utf8');
  assert.equal(publication.split('apps/lythaus-jobs/tests/post-moderation.workerd.mjs').length - 1, 1);
  assert.ok(job.steps.some(step => step.run?.trim() === 'npm run test:publication:pg17' && !step.if && !step['continue-on-error']));
});

const receipt = '# tests 2\n# pass 2\n# fail 0\n# skipped 0\n# cancelled 0\n# todo 0\n';
test('required acceptance rejects empty, skipped, failing and partial runs', () => {
  requireCompleteTextReviewTests(receipt);
  for (const invalid of ['', receipt.replace('tests 2', 'tests 0'), receipt.replace('pass 2', 'pass 1'),
    ...['fail', 'skipped', 'cancelled', 'todo'].map(name => receipt.replace(`${name} 0`, `${name} 1`))])
    assert.throws(() => requireCompleteTextReviewTests(invalid));
});
