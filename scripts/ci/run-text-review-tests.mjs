import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const TEXT_REVIEW_SUITES = [
  'packages/authenticity/tests/text-review-evidence.test.mjs',
  'apps/lythaus-jobs/tests/text-review-evidence.test.mjs',
  'apps/lythaus-jobs/tests/text-review-runtime.test.mjs',
  'apps/lythaus-jobs/tests/text-review-queue.workerd.mjs',
  'scripts/tests/text-review-ci.test.mjs',
];

export function requireCompleteTextReviewTests(output) {
  const tests = output.match(/^# tests ([1-9][0-9]*)$/m)?.[1];
  assert.ok(tests, 'text review acceptance must execute tests');
  assert.match(output, new RegExp(`^# pass ${tests}$`, 'm'), 'all text review tests must pass');
  for (const metric of ['fail', 'skipped', 'cancelled', 'todo']) assert.match(output, new RegExp(`^# ${metric} 0$`, 'm'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let output = '';
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', '--test', '--test-reporter=tap',
      '--test-concurrency=1', '--test-timeout=60000', ...TEXT_REVIEW_SUITES], { stdio: ['inherit', 'pipe', 'inherit'] });
    child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
    child.once('error', reject); child.once('exit', (status, signal) => resolve(signal ? 1 : status ?? 1));
  });
  assert.equal(code, 0, 'text review acceptance process must succeed');
  requireCompleteTextReviewTests(output);
}
