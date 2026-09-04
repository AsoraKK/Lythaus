import assert from 'node:assert/strict';
import test from 'node:test';

import { assertExactReleaseRun } from '../ci/verify-exact-release-evidence.mjs';

const releaseSha = 'a'.repeat(40);

test('exact release evidence accepts only the expected successful SHA-bound run', () => {
  const evidence = assertExactReleaseRun({
    id: 123,
    name: 'CodeQL',
    head_sha: releaseSha.toUpperCase(),
    conclusion: 'success',
  }, 'CodeQL', releaseSha);
  assert.deepEqual(evidence, {
    name: 'CodeQL',
    runId: 123,
    headSha: releaseSha.toUpperCase(),
    conclusion: 'success',
  });
});

test('exact release evidence rejects a wrong name, SHA, or conclusion', () => {
  for (const payload of [
    { id: 1, name: 'CI', head_sha: releaseSha, conclusion: 'success' },
    { id: 1, name: 'CodeQL', head_sha: 'b'.repeat(40), conclusion: 'success' },
    { id: 1, name: 'CodeQL', head_sha: releaseSha, conclusion: 'failure' },
  ]) {
    assert.throws(() => assertExactReleaseRun(payload, 'CodeQL', releaseSha), /must be a successful run/);
  }
  assert.throws(
    () => assertExactReleaseRun({ name: 'CodeQL', head_sha: releaseSha, conclusion: 'success' }, 'CodeQL', releaseSha),
    /must be a successful run/,
  );
});
