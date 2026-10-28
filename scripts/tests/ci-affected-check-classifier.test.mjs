import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classifyChangedPaths,
  evaluateSelectedResults,
  reportForEvent,
  reportFromEventJson,
  render,
  resolveComparison,
  validateMachineReport,
} from '../ci/report-ci-affected-checks.mjs';

const base = '1'.repeat(40);
const head = '2'.repeat(40);
const tested = '3'.repeat(40);
const ALL_SUITES = [
  'CodeQL JavaScript TypeScript', 'Dependency audit', 'Disabled activity pilot integration',
  'Flutter analyze and test', 'Native Workers and PlanetScale', 'OpenAPI contract',
  'Repository hygiene', 'Web frontends', 'Workflow lint', 'dependency-review', 'scan',
];
const FRONTEND_SUITES = [
  'CodeQL JavaScript TypeScript', 'Dependency audit', 'Repository hygiene',
  'Web frontends', 'dependency-review', 'scan',
];
const prEvent = (overrides = {}) => ({
  pull_request: {
    base: { sha: base },
    head: { sha: head },
    merge_commit_sha: tested,
    ...overrides,
  },
});

function mockGit(diffOutput, options = {}) {
  const calls = [];
  const runner = args => {
    calls.push(args);
    if (options.failOn === args[0]) throw new Error('simulated Git/API failure');
    if (args[0] === 'cat-file') return '';
    if (args[0] === 'rev-list') return options.parents ?? `${tested} ${base} ${head}`;
    if (args[0] === 'diff') return diffOutput;
    throw new Error(`unexpected command: ${args[0]}`);
  };
  return { runner, calls };
}

test('only reviewed marketing frontend paths receive a report-only candidate', () => {
  const report = classifyChangedPaths([
    'apps/marketing-site/src/pages/index.astro',
    'apps/marketing-site/tests/homepage.test.mjs',
    'apps/marketing-site/public/fonts/brand.woff2',
    'apps/marketing-site/package-lock.json',
  ], { eventName: 'pull_request', baseSha: base, headSha: head, testedSha: tested });
  assert.equal(report.recommendation, 'AFFECTED_ONLY_CANDIDATE');
  assert.deepEqual(report.selectedSuites, FRONTEND_SUITES);
  assert.equal(report.fallbackStatus, 'none');
  assert.equal(report.workflowControlChanged, false);
  assert.equal(report.changedFileCount, 4);
  assert.equal(validateMachineReport(report), true);
});

test('shared, generated, operational and cross-project changes retain full validation', () => {
  for (const paths of [
    ['api/openapi/openapi.yaml'],
    ['lib/generated/api_client/lib/src/model/member.dart'],
    ['packages/contracts/src/member.ts'],
    ['packages/db/migrations/001.sql'],
    ['scripts/tests/ci-affected-check-classifier.test.mjs'],
    ['docs/operations/restore.md'],
    ['apps/control-panel/src/member-admin.ts'],
    ['apps/marketing-site/src/page.astro', 'packages/contracts/src/member.ts'],
    ['apps/marketing-site/src/page.astro', '.github/workflows/ci.yml'],
    ['package-lock.json'],
  ]) {
    const report = classifyChangedPaths(paths);
    assert.equal(report.recommendation, 'FULL', paths.join(', '));
    assert.deepEqual(report.selectedSuites, ALL_SUITES);
    assert.equal(report.fallbackStatus, 'required_full');
  }
});

test('unknown, empty, malformed, unsafe and over-limit paths fall back to FULL', () => {
  assert.equal(classifyChangedPaths([]).fallbackStatus, 'fallback_full');
  const unknown = classifyChangedPaths(['new-package/runtime.ts']);
  assert.equal(unknown.recommendation, 'FULL');
  assert.equal(unknown.unknownPathCount, 1);
  for (const path of ['../outside', '/absolute', 'bad\\path']) {
    assert.equal(classifyChangedPaths([path]).fallbackStatus, 'fallback_full');
  }
  const tooMany = Array.from({ length: 5001 }, (_, index) => `apps/marketing-site/src/${index}.astro`);
  assert.match(classifyChangedPaths(tooMany).reasons[0], /file-count limit/);
});

test('filenames with newlines stay data and no-renames captures both rename paths', () => {
  const newlineName = 'apps/marketing-site/src/page\nwith-newline.astro';
  const newlineReport = classifyChangedPaths([newlineName]);
  assert.equal(newlineReport.recommendation, 'AFFECTED_ONLY_CANDIDATE');
  assert.doesNotMatch(render(newlineReport), /with-newline/);

  const { runner, calls } = mockGit('apps/marketing-site/src/old.astro\0apps/marketing-site/src/new.astro\0');
  const renamed = reportForEvent('pull_request', prEvent(), tested, tested, runner);
  assert.equal(renamed.recommendation, 'AFFECTED_ONLY_CANDIDATE');
  assert.equal(renamed.changedFileCount, 2);
  const diffCall = calls.find(args => args[0] === 'diff');
  assert.deepEqual(diffCall.slice(1, 4), ['--no-renames', '--name-only', '-z']);
  assert.deepEqual(diffCall.slice(4), [base, tested]);

  const { runner: mixedRunner } = mockGit('apps/marketing-site/src/old.astro\0packages/contracts/src/new.ts\0');
  assert.equal(reportForEvent('pull_request', prEvent(), tested, tested, mixedRunner).recommendation, 'FULL');

  const deletedFrontend = reportForEvent(
    'pull_request', prEvent(), tested, tested,
    mockGit('apps/marketing-site/src/removed.astro\0').runner,
  );
  assert.equal(deletedFrontend.recommendation, 'AFFECTED_ONLY_CANDIDATE');
  assert.ok(deletedFrontend.selectedSuites.includes('Web frontends'));

  const deletedContract = reportForEvent(
    'pull_request', prEvent(), tested, tested,
    mockGit('packages/contracts/src/removed.ts\0').runner,
  );
  assert.equal(deletedContract.recommendation, 'FULL');
  assert.equal(deletedContract.changedFileCount, 1);
});

test('PR event comparison binds immutable SHAs to the tested synthetic merge tree', () => {
  const comparison = resolveComparison('pull_request', prEvent(), tested, tested);
  assert.equal(comparison.baseSha, base);
  assert.equal(comparison.headSha, head);
  assert.equal(comparison.testedSha, tested);
  assert.equal(comparison.diffBaseSha, base);
  assert.equal(comparison.diffHeadSha, tested);

  const mismatch = resolveComparison('pull_request', prEvent(), '4'.repeat(40), '4'.repeat(40));
  assert.match(mismatch.error, /tested merge SHA/);
  assert.match(resolveComparison('pull_request', prEvent(), tested, '5'.repeat(40)).error, /checked-out HEAD/);
  assert.match(resolveComparison('pull_request', prEvent({ merge_commit_sha: null }), tested, tested).error, /missing or malformed/);
  assert.match(resolveComparison('pull_request', prEvent({ base: { sha: 'short' } }), tested, tested).error, /missing or malformed/);

  const movedBase = { pull_request: { ...prEvent().pull_request, base: { sha: '4'.repeat(40) } } };
  const { runner } = mockGit('apps/marketing-site/src/index.astro\0');
  const moved = reportForEvent('pull_request', movedBase, tested, tested, runner);
  assert.equal(moved.fallbackStatus, 'fallback_full');
  assert.match(moved.reasons[0], /exact base-plus-head/);
});

test('push, release, merge-group and manual events stay on full validation', () => {
  const push = resolveComparison('push', { before: base, after: head }, head, head);
  assert.equal(push.fullRequired, true);
  assert.equal(reportForEvent('push', { before: base, after: head }, head, head).fallbackStatus, 'required_full');
  for (const eventName of ['release', 'merge_group', 'workflow_dispatch', 'pull_request_target']) {
    const report = reportForEvent(eventName, {}, tested, tested);
    assert.equal(report.recommendation, 'FULL');
    assert.equal(report.fallbackStatus, 'required_full');
  }
  assert.ok(resolveComparison('push', { before: '0'.repeat(40), after: head }, head, head).error);
  assert.ok(resolveComparison('push', { before: 'short', after: head }, head, head).error);
});

test('Git errors, malformed or truncated diff streams, and empty diffs fall back', () => {
  const failed = reportForEvent('pull_request', prEvent(), tested, tested, mockGit('', { failOn: 'cat-file' }).runner);
  assert.equal(failed.fallbackStatus, 'fallback_full');
  assert.match(failed.reasons[0], /Git comparison failed/);

  const wrongParents = mockGit('apps/marketing-site/src/index.astro\0', { parents: `${tested} ${base} ${'4'.repeat(40)}` });
  assert.equal(reportForEvent('pull_request', prEvent(), tested, tested, wrongParents.runner).fallbackStatus, 'fallback_full');

  const truncated = reportForEvent('pull_request', prEvent(), tested, tested, mockGit('apps/marketing-site/src/index.astro').runner);
  assert.equal(truncated.fallbackStatus, 'fallback_full');
  assert.match(truncated.reasons[0], /malformed, truncated/);

  const oversized = `${'x'.repeat(2 * 1024 * 1024)}\0`;
  const overLimit = reportForEvent('pull_request', prEvent(), tested, tested, mockGit(oversized).runner);
  assert.equal(overLimit.fallbackStatus, 'fallback_full');
  assert.match(overLimit.reasons[0], /exceeds the reviewed byte limit/);

  const diffFailure = reportForEvent('pull_request', prEvent(), tested, tested, mockGit('', { failOn: 'diff' }).runner);
  assert.equal(diffFailure.fallbackStatus, 'fallback_full');
  assert.match(diffFailure.reasons[0], /Git comparison failed/);

  const empty = reportForEvent('pull_request', prEvent(), tested, tested, mockGit('').runner);
  assert.equal(empty.fallbackStatus, 'fallback_full');
  assert.match(empty.reasons[0], /empty or invalid/);
});

test('malformed event JSON falls back, and the summary contains validated JSON', () => {
  const malformed = reportFromEventJson('pull_request', '{', tested, tested);
  assert.equal(malformed.fallbackStatus, 'fallback_full');
  assert.match(malformed.reasons[0], /malformed JSON/);
  const report = classifyChangedPaths(['apps/marketing-site/src/index.astro'], { baseSha: base, headSha: head, testedSha: tested });
  const rendered = render(report);
  const machineJson = rendered.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(machineJson);
  assert.deepEqual(JSON.parse(machineJson[1]), report);
});

test('bounded baseline path-set replays preserve full rules and one narrow candidate', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/ci-affected-check-history.json', import.meta.url), 'utf8'));
  const csvLines = readFileSync(new URL('../../docs/ci-runner-consumption-sample.csv', import.meta.url), 'utf8').trim().split(/\r?\n/);
  for (const replay of fixture.replays) {
    const row = csvLines.find(line => line.startsWith(`${replay.runId},`));
    assert.ok(row, `baseline run ${replay.runId} is recorded`);
    const columns = row.split(',');
    assert.equal(columns[3], replay.sourceCategory);
    assert.equal(columns[5], replay.eventName);
    assert.equal(columns[6], replay.sourceConclusion);
    assert.equal(columns[7], replay.headSha);
    const report = classifyChangedPaths(replay.changedPaths, {
      eventName: replay.eventName,
      baseSha: replay.baseSha,
      headSha: replay.headSha,
    });
    assert.equal(report.recommendation, replay.expectedRecommendation, `run ${replay.runId}`);
    assert.deepEqual(report.selectedSuites, replay.expectedSelectedSuites, `run ${replay.runId}`);
    assert.equal(report.baseSha, replay.baseSha);
    assert.equal(report.headSha, replay.headSha);
  }
});

test('future result evaluator requires exact, explicit success for every selected suite', () => {
  const selection = classifyChangedPaths(['apps/marketing-site/src/index.astro'], {
    eventName: 'pull_request', baseSha: base, headSha: head, testedSha: tested,
  });
  const passing = selection.selectedSuites.map(name => ({ name, conclusion: 'success', testedSha: tested }));
  assert.deepEqual(evaluateSelectedResults(selection, passing), { passed: true, reasons: [] });

  for (const conclusion of ['failure', 'cancelled', 'skipped', 'neutral', 'timed_out', 'queued']) {
    const changed = passing.map(result => ({ ...result }));
    changed[0].conclusion = conclusion;
    assert.equal(evaluateSelectedResults(selection, changed).passed, false, conclusion);
  }
  assert.equal(evaluateSelectedResults(selection, passing.slice(1)).passed, false, 'missing selected result');
  assert.equal(evaluateSelectedResults(selection, [...passing, { name: 'Flutter analyze and test', conclusion: 'success', testedSha: tested }]).passed, false, 'unexpected extra result');
  assert.equal(evaluateSelectedResults(selection, [passing[0], ...passing]).passed, false, 'duplicate result');
  assert.equal(evaluateSelectedResults(selection, passing.map(result => ({ ...result, testedSha: head }))).passed, false, 'SHA mismatch');
  assert.equal(evaluateSelectedResults(selection, null).passed, false, 'missing result collection');
  assert.equal(evaluateSelectedResults({ ...selection, testedSha: null }, passing).passed, false, 'missing tested SHA');
  assert.equal(evaluateSelectedResults({ ...selection, selectedSuites: [] }, passing).passed, false, 'empty selection');
  assert.equal(evaluateSelectedResults({ ...selection, selectedSuites: ['Made up check'] }, passing).passed, false, 'invalid selection');
  assert.equal(validateMachineReport({ ...selection, selectedSuites: [] }), false);
});
