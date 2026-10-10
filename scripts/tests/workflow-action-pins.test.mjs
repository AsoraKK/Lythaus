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

test('inline comments do not hide mutable action references', () => {
  assert.deepEqual(findUnpinnedActions('- name: Synthetic\n  uses: owner/action@v4 # release tag\n'), [
    '<workflow>: owner/action@v4 is not pinned to a 40-character commit SHA',
  ]);
});

test('quoted pinned references retain their identity and existing local exemptions', () => {
  const sha = '0123456789012345678901234567890123456789';
  assert.deepEqual(findUnpinnedActions(`
- uses: "owner/action@${sha}" # pinned
- uses: 'owner/action@${sha}'
- uses: "./.github/actions/local"
- uses: 'docker://synthetic-image'
`), []);
  assert.deepEqual(findUnpinnedActions('- uses: "owner/action@v4" # tag\n'), [
    '<workflow>: owner/action@v4 is not pinned to a 40-character commit SHA',
  ]);
});

test('nested composite actions cannot escape recursive pin discovery', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'lythaus-action-pins-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  mkdirSync(path.join(root, '.github/actions/family/nested'), { recursive: true });
  writeFileSync(path.join(root, '.github/actions/family/nested/action.yml'), 'runs:\n  using: composite\n  steps:\n    - uses: owner/nested@v4 # tag\n');
  assert.deepEqual(collectWorkflowActionPinFailures(root), [
    '.github/actions/family/nested/action.yml: owner/nested@v4 is not pinned to a 40-character commit SHA',
  ]);
});

test('literal run scripts are not action references', () => {
  assert.deepEqual(findUnpinnedActions('- run: |\n    uses: owner/example@v4\n'), []);
});

test('malformed YAML and non-string references fail closed', () => {
  for (const source of ['- uses: "unterminated\n', '- uses: [owner/action@v4]\n', '- uses: null\n', '- uses: owner/action@v4\n  uses: ./local\n']) {
    assert.ok(findUnpinnedActions(source).length > 0, source);
  }
});

test('YAML aliases and reusable workflow references retain pin validation', () => {
  assert.deepEqual(findUnpinnedActions('reference: &action owner/action@v4\njobs:\n  build:\n    uses: *action\n'), [
    '<workflow>: owner/action@v4 is not pinned to a 40-character commit SHA',
  ]);
  assert.deepEqual(findUnpinnedActions('reference: &action "owner/action@0123456789012345678901234567890123456789"\njobs:\n  build:\n    uses: *action\n'), []);
});
