import assert from 'node:assert/strict';
import test from 'node:test';
import { collectWorkflowActionPinFailures, findUnpinnedActions } from '../validate-workflow-action-pins.mjs';

test('workflow action pin validator rejects mutable tags', () => {
  assert.deepEqual(
    findUnpinnedActions('- uses: actions/checkout@v4\n- uses: actions/setup-node@0123456789012345678901234567890123456789\n'),
    ['<workflow>: actions/checkout@v4 is not pinned to a 40-character commit SHA'],
  );
});

test('all repository workflows use immutable action references', () => {
  assert.deepEqual(collectWorkflowActionPinFailures(), []);
});
