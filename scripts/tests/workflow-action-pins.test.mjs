import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

test('named steps and composite actions cannot bypass immutable action pins', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'lythaus-action-pins-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  mkdirSync(path.join(root, '.github/actions/synthetic'), { recursive: true });
  writeFileSync(path.join(root, '.github/workflows/ci.yml'), '- name: Checkout\n  uses: actions/checkout@v4\n');
  writeFileSync(path.join(root, '.github/actions/synthetic/action.yaml'), '- name: Restore\n  uses: actions/cache/restore@v6\n');
  assert.deepEqual(collectWorkflowActionPinFailures(root), [
    '.github/workflows/ci.yml: actions/checkout@v4 is not pinned to a 40-character commit SHA',
    '.github/actions/synthetic/action.yaml: actions/cache/restore@v6 is not pinned to a 40-character commit SHA',
  ]);
});
