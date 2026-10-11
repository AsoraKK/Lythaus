import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { assertEvaluationHead } from '../../../../scripts/ci/validate-posting-feedback-evaluation.mjs';

test('CI receipt requires the exact reviewed source head and rejects missing or malformed identities', () => {
  const head = 'a'.repeat(40);
  assertEvaluationHead(head, head, true);
  assertEvaluationHead(head);
  for (const [actual, expected, ci] of [[head, 'b'.repeat(40), true], [head, undefined, true],
    ['not-a-sha', head, false], [head, 'main', false]])
    assert.throws(() => assertEvaluationHead(actual, expected, ci), /evaluation_ci_head_mismatch/);
});

test('allocated CI executes the offline suite at the PR source head without privileged triggers or secrets', async () => {
  const source = await readFile(new URL('../../../../.github/workflows/posting-feedback-evaluation.yml', import.meta.url), 'utf8');
  const workflow = parseDocument(source).toJS();
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  const job = workflow.jobs.posting_feedback_evaluation;
  assert.equal(job.permissions, undefined);
  assert.equal(job.steps[0].with.ref, '${{ github.event.pull_request.head.sha || github.sha }}');
  const step = job.steps.find(item => item.name === 'Validate offline evaluation at source head');
  assert.equal(step.env.EXPECTED_SOURCE_SHA, '${{ github.event.pull_request.head.sha || github.sha }}');
  assert.equal(step.run, 'node --experimental-strip-types scripts/ci/validate-posting-feedback-evaluation.mjs');
  assert.equal(source.includes('secrets.'), false);
  assert.equal(source.includes('continue-on-error'), false);
});
