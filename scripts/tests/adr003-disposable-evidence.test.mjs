import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { hasDisposableReceipt, prepareFixtureBoundKeeper, validateDisposableContentEvidence } from '../ci/adr003-disposable-evidence.mjs';

const context = { releaseSha: 'a'.repeat(40), sourceSha: 'b'.repeat(40),
  versionId: '22222222-2222-4222-8222-222222222222', runId: '12345', runAttempt: '1' };
const receipt = () => ({ schema: 'lythaus-adr003-disposable-content-v1', status: 'PASSED',
  runtime: 'workerd-pg17', target: 'disposable-loopback', releaseSha: context.releaseSha,
  workerSourceSha: context.sourceSha, binding: 'version', workerVersionId: context.versionId, runId: context.runId, runAttempt: context.runAttempt,
  cases: ['A11', 'A12', 'A13'].map(id => ({ id, outcome: 'passed' })) });

test('disposable evidence requires all cases and exact release, live source, version and run', () => {
  assert.equal(validateDisposableContentEvidence(receipt(), context).status, 'PASSED');
  for (const changes of [{ status: 'BLOCKED' }, { target: 'production' }, { runtime: 'mock' },
    { releaseSha: 'c'.repeat(40) }, { workerSourceSha: 'c'.repeat(40) },
    { workerVersionId: '33333333-3333-4333-8333-333333333333' }, { runId: '12346' }, { runAttempt: '2' },
    { binding: 'release-source', workerVersionId: null },
    { cases: [{ id: 'A11', outcome: 'passed' }, { id: 'A12', outcome: 'passed' }, { id: 'A13', outcome: 'blocked' }] },
    { cases: [{ id: 'A11', outcome: 'passed' }, { id: 'A11', outcome: 'passed' }, { id: 'A13', outcome: 'passed' }] },
    { cases: [] }]) {
    assert.throws(() => validateDisposableContentEvidence({ ...receipt(), ...changes }, context), /evidence_invalid/);
  }
});

test('source-bound proof is accepted only for a Worker built from the release source', () => {
  const sourceContext = { ...context, sourceSha: context.releaseSha };
  const sourceReceipt = { ...receipt(), workerSourceSha: context.releaseSha, binding: 'release-source', workerVersionId: null };
  assert.equal(validateDisposableContentEvidence(sourceReceipt, sourceContext).binding, 'release-source');
  assert.throws(() => validateDisposableContentEvidence(sourceReceipt, context), /evidence_invalid/);
});

test('Actions never falls back to localhost without a receipt', () => {
  assert.throws(() => hasDisposableReceipt({ GITHUB_ACTIONS: 'true', ADR003_API_BASE_URL: 'http://127.0.0.1:8787/api' }), /evidence_required/);
  assert.equal(hasDisposableReceipt({ ADR003_API_BASE_URL: 'http://127.0.0.1:8787/api' }), false);
});

test('invalid or missing fixture evidence causes zero Keeper operations', async () => {
  let calls = 0;
  const args = { releaseSha: context.releaseSha, worker: { sourceSha: context.sourceSha, versionId: context.versionId },
    runId: context.runId, runAttempt: context.runAttempt, start: async () => { calls++; return 'created'; } };
  for (const raw of [undefined, '{}', JSON.stringify({ ...receipt(), runAttempt: '2' })]) {
    await assert.rejects(() => prepareFixtureBoundKeeper({ ...args, raw }), /evidence_invalid/);
  }
  assert.equal(calls, 0);
  assert.equal(await prepareFixtureBoundKeeper({ ...args, raw: JSON.stringify(receipt()) }), 'created');
  assert.equal(calls, 1);
});

test('production harness requires protected receipt and retains every localhost write guard', () => {
  const harness = readFileSync('scripts/ci/run-adr003-authenticated-acceptance.mjs', 'utf8');
  assert.match(harness, /event\?\.inputs\?\.release_mode !== 'app_only'\) return false/);
  assert.match(harness, /GITHUB_WORKFLOW_REF.*production-release\.yml@refs\/heads\/main/);
  assert.match(harness, /validateDisposableContentEvidence/);
  for (const id of ['A11', 'A12', 'A13']) {
    const start = harness.indexOf(`await runCase('${id}'`), end = harness.indexOf('\n}));', start);
    assert.ok(start > 0 && end > start);
    assert.match(harness.slice(start, end), new RegExp(`disposableContentCase\\('${id}'\\)`));
    assert.match(harness.slice(start, end), /requireLocalContentFixtureTarget\(apiBase\)/);
  }
  const workflow = readFileSync('.github/workflows/canonical-app-only-release.yml', 'utf8');
  const fixtureWorkflow = readFileSync('.github/workflows/adr003-disposable-content.yml', 'utf8');
  assert.match(workflow, /needs: \[capture_fixture_source, disposable_content\]/);
  assert.match(fixtureWorkflow, /git merge-base --is-ancestor "\$FIXTURE_SOURCE_SHA" "\$RELEASE_SHA"/);
  assert.match(fixtureWorkflow, /--adr003-content[\s\S]*?emit-adr003-fixture-receipt/);
  assert.match(workflow, /workerCapture\.workers\.public\.sourceSha == \$receipt\.workerSourceSha/);
  assert.match(workflow, /workerCapture\.workers\.public\.versionId == \$receipt\.workerVersionId/);
});
