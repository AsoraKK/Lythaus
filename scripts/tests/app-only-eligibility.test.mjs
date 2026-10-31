import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  REVIEWED_APP_INPUTS,
  REUSED_WORKER_NAMES,
  assertReviewedEntries,
  assertReviewedAppSource,
  assertReviewedPublicContract,
  assertOnlyReviewedContractExtension,
  normalizeAppPagesSnapshot,
  assertAppPagesBaselineUnchanged,
  assertAppPagesCandidateBound,
  assertCapturedWorkersUnchanged,
  assertServingWorkersUnchanged,
  normalizeServingWorkers,
} from '../release/app-only-eligibility.mjs';

const source = 'a'.repeat(40);
const created = '2026-10-29T10:00:00.000Z';
const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
];
const extraId = '55555555-5555-4555-8555-555555555555';

function observations() {
  return Object.fromEntries(Object.entries(REUSED_WORKER_NAMES).map(([component, workerName], index) => [component, {
    workerName,
    deployment: { versions: [{ version_id: ids[index], percentage: 100 }] },
    versions: [{ id: ids[index], annotations: { 'workers/tag': source }, created_on: created }],
  }]));
}

test('reviewed input inventory accepts exact blob, tree, and mode identities', () => {
  assert.doesNotThrow(() => assertReviewedEntries(structuredClone(REVIEWED_APP_INPUTS)));
  assert.ok(Object.isFrozen(REVIEWED_APP_INPUTS.lib));
});

test('the pinned CI successor only adds the synthetic app-only browser regression', () => {
  const predecessor = execFileSync('git', ['show', 'fee93bdb60e782507d8f27b6811b536d4fe14422:.github/workflows/ci.yml'], { encoding: 'utf8' });
  const current = readFileSync('.github/workflows/ci.yml', 'utf8');
  const addition = '      - name: Verify app-only browser acceptance against a synthetic API\n'
    + '        env:\n          APP_ONLY_AUTH_SYNTHETIC_ARTIFACT: ${{ github.workspace }}/build/web\n'
    + '        run: node --test --test-timeout=120000 scripts/tests/app-only-auth.browser.mjs\n';
  assert.ok(current.includes(addition));
  assert.equal(current.replace(addition, ''), predecessor);
  const currentBlob = execFileSync('git', ['hash-object', '.github/workflows/ci.yml'], { encoding: 'utf8' }).trim();
  assert.equal(currentBlob, REVIEWED_APP_INPUTS['.github/workflows/ci.yml'][2]);
  for (const file of ['scripts/ci/app-only-auth-browser.mjs', 'scripts/release/app-only-auth-network-policy.mjs', 'scripts/tests/app-only-auth.browser.mjs']) {
    const blob = execFileSync('git', ['hash-object', file], { encoding: 'utf8' }).trim();
    assert.equal(blob, REVIEWED_APP_INPUTS[file][2], file);
  }
});

test('missing, additional, changed, or symlinked app inputs fail closed', () => {
  for (const mutate of [
    entries => delete entries.lib,
    entries => { entries.unreviewed = ['100644', 'blob', 'a'.repeat(40)]; },
    entries => { entries.lib[2] = 'b'.repeat(40); },
    entries => { entries['pubspec.yaml'][0] = '120000'; },
    entries => { entries.web[1] = 'blob'; },
    entries => { entries['.github/workflows/ci.yml'][2] = 'c'.repeat(40); },
    entries => { entries['scripts/tests/flutter-auth.browser.mjs'][2] = 'd'.repeat(40); },
    entries => { entries['scripts/ci/app-only-auth-browser.mjs'][2] = 'f'.repeat(40); },
    entries => { entries.test[2] = 'e'.repeat(40); },
  ]) {
    const entries = structuredClone(REVIEWED_APP_INPUTS);
    mutate(entries);
    assert.throws(() => assertReviewedEntries(entries), /reviewed app input/);
  }
});

test('git inspection rejects invalid candidate or Public source identifiers', () => {
  assert.throws(() => assertReviewedAppSource('.', 'main'), /full commit SHA/);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.throws(() => assertReviewedPublicContract('.', head, 'HEAD'), /full commit SHA/);
  assert.throws(() => assertReviewedPublicContract('.', 'a'.repeat(40), 'b'.repeat(40)), /not an available commit/);
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  assert.throws(() => assertReviewedAppSource('.', tree), /not an available commit/);
});

function contracts() {
  const live = { openapi: '3.0.3', paths: { '/posts': { get: { responses: { 200: { description: 'OK' } } } } },
    components: { schemas: { Post: { type: 'object' } }, parameters: {}, responses: {}, securitySchemes: {} } };
  const candidate = structuredClone(live);
  for (const target of ['comment', 'post']) {
    for (const suffix of ['', '/emotion', '/quality']) candidate.paths[`/feedback/${target}/{targetId}${suffix}`] = {};
  }
  for (const name of ['ContributionEmotion', 'ContributionFeedbackChange', 'ContributionFeedbackError', 'ContributionFeedbackSummary',
    'ContributionFeedbackTarget', 'ContributionQuality', 'EmotionFeedbackRequest', 'QualityFeedbackRequest']) candidate.components.schemas[name] = {};
  for (const name of ['feedbackIdempotencyKey', 'targetId']) candidate.components.parameters[name] = {};
  for (const name of ['FeedbackError', 'FeedbackIdempotencyConflict']) candidate.components.responses[name] = {};
  return { live, candidate };
}

test('contract comparison allows only the reviewed dormant feedback extension', () => {
  const { live, candidate } = contracts();
  assert.doesNotThrow(() => assertOnlyReviewedContractExtension(live, candidate));
});

test('contract comparison rejects removals, changed existing behavior, and unexpected additions', () => {
  for (const mutate of [
    value => { delete value.paths['/posts']; },
    value => { value.paths['/posts'].get.responses[200].description = 'Changed'; },
    value => { value.paths['/unreviewed'] = {}; },
    value => { delete value.paths['/feedback/post/{targetId}']; },
    value => { value.components.schemas.Post.type = 'string'; },
    value => { value.components.schemas.Unreviewed = {}; },
    value => { delete value.components.responses.FeedbackError; },
    value => { value.components.newCategory = {}; },
    value => { value.openapi = '3.1.0'; },
  ]) {
    const { live, candidate } = contracts(); mutate(candidate);
    assert.throws(() => assertOnlyReviewedContractExtension(live, candidate), /contract/);
  }
  const { live, candidate } = contracts();
  delete live.components.responses;
  delete candidate.components.responses;
  assert.throws(() => assertOnlyReviewedContractExtension(live, candidate), /component category missing/);
});

test('four single-version serving observations retain source and version provenance', () => {
  const workers = normalizeServingWorkers(observations());
  assert.deepEqual(Object.keys(workers).sort(), Object.keys(REUSED_WORKER_NAMES).sort());
  assert.deepEqual(workers.public, { workerName: REUSED_WORKER_NAMES.public, versionId: ids[0], sourceSha: source, createdAt: created, percentage: 100 });
  assert.deepEqual(assertServingWorkersUnchanged(observations(), observations()), workers);
});

test('zero-traffic staged versions do not disguise or change the serving version', () => {
  const before = observations(), after = observations();
  after.public.deployment.versions.push({ version_id: extraId, percentage: 0 });
  assert.deepEqual(assertServingWorkersUnchanged(before, after), normalizeServingWorkers(before));
  after.public.deployment.versions[1].percentage = 1;
  after.public.deployment.versions[0].percentage = 99;
  after.public.versions.push({ id: extraId, annotations: { 'workers/tag': source }, created_on: created });
  assert.throws(() => assertServingWorkersUnchanged(before, after), /exactly one 100% serving version/);
});

test('wrong Worker, missing Worker, and extra Worker cannot substitute for an observation', () => {
  for (const mutate of [
    value => { value.public.workerName = REUSED_WORKER_NAMES.admin; },
    value => { delete value.coordinator; },
    value => { value.other = {}; },
  ]) {
    const value = observations(); mutate(value);
    assert.throws(() => normalizeServingWorkers(value), /identity|inventory/);
  }
});

test('missing, duplicate, or conflicting exact-version metadata is rejected', () => {
  for (const mutate of [
    value => { value.public.versions = []; },
    value => { value.public.versions.push(structuredClone(value.public.versions[0])); },
    value => { delete value.public.versions[0].created_on; },
    value => { delete value.public.versions[0].annotations; },
    value => { value.public.deployment.versions[0].source_sha = 'b'.repeat(40); },
  ]) {
    const value = observations(); mutate(value);
    assert.throws(() => normalizeServingWorkers(value), /provenance|metadata/);
  }
});

test('source, timestamp, or version drift blocks the comparison', () => {
  for (const mutate of [
    value => { value.admin.versions[0].annotations['workers/tag'] = 'b'.repeat(40); },
    value => { value.jobs.versions[0].created_on = '2026-10-29T10:01:00.000Z'; },
    value => { value.coordinator.deployment.versions[0].version_id = extraId; value.coordinator.versions[0].id = extraId; },
  ]) {
    const before = observations(), after = observations(); mutate(after);
    assert.throws(() => assertServingWorkersUnchanged(before, after), /changed during app-only release/);
  }
});

test('captured provider snapshots must be well formed, ordered and unchanged', () => {
  const before = { schemaVersion: 1, startedAt: '2026-10-29T09:59:59.000Z', capturedAt: '2026-10-29T10:00:00.000Z', workers: normalizeServingWorkers(observations()) };
  const after = structuredClone(before);
  after.startedAt = '2026-10-29T10:00:59.000Z';
  after.capturedAt = '2026-10-29T10:01:00.000Z';
  assert.deepEqual(assertCapturedWorkersUnchanged(before, after), before.workers);
  for (const mutate of [
    value => { value.schemaVersion = 2; },
    value => { value.startedAt = '2026-10-29T09:59:00.000Z'; },
    value => { value.capturedAt = '2026-10-29T10:00:58.000Z'; },
    value => { value.workers.public.sourceSha = 'b'.repeat(40); },
    value => { value.workers.admin.extra = true; },
    value => { delete value.workers.jobs; },
  ]) {
    const changed = structuredClone(after); mutate(changed);
    assert.throws(() => assertCapturedWorkersUnchanged(before, changed), /invalid|order|changed|unexpected|inventory/);
  }
});

test('invalid version IDs or traffic fail even for staged entries', () => {
  for (const mutation of [
    { version_id: 'not-a-uuid', percentage: 0 },
    { version_id: extraId, percentage: -1 },
    { version_id: ids[0], percentage: 0 },
  ]) {
    const value = observations(); value.public.deployment.versions.push(mutation);
    assert.throws(() => normalizeServingWorkers(value), /invalid version|duplicate/);
  }
});

const projectId = '99999999-9999-4999-8999-999999999999';
function appPages(sha, deploymentId) {
  return { success: true, result: { id: projectId, name: 'lythaus-web', production_branch: 'main',
    canonical_deployment: { id: deploymentId, project_id: projectId, project_name: 'lythaus-web',
      environment: 'production', is_skipped: false, latest_stage: { name: 'deploy', status: 'success' }, url: `https://${deploymentId.slice(0, 8)}.lythaus-web.pages.dev`,
      deployment_trigger: { metadata: { branch: 'main', commit_dirty: false, commit_hash: sha } } } } };
}

test('app Pages rollback snapshot is bound to the exact production project and deployment', () => {
  const before = normalizeAppPagesSnapshot(appPages(source, ids[0]), 'main');
  const candidate = normalizeAppPagesSnapshot(appPages('b'.repeat(40), ids[1]), 'main');
  assert.doesNotThrow(() => assertAppPagesBaselineUnchanged(before, structuredClone(before)));
  assert.doesNotThrow(() => assertAppPagesCandidateBound(before, candidate, structuredClone(candidate), 'b'.repeat(40)));
  assert.throws(() => assertAppPagesBaselineUnchanged(before, candidate), /baseline changed/);
  assert.throws(() => assertAppPagesCandidateBound(before, candidate, before, 'b'.repeat(40)), /not the current bound deployment/);
  assert.throws(() => assertAppPagesCandidateBound(before, before, before, source), /not the current bound deployment/);
  assert.throws(() => assertAppPagesCandidateBound(before, { ...candidate, deploymentUrl: before.deploymentUrl },
    { ...candidate, deploymentUrl: before.deploymentUrl }, 'b'.repeat(40)), /not the current bound deployment/);
});

test('noncanonical, dirty, incomplete, or preview Pages deployments fail closed', () => {
  for (const mutate of [
    value => { value.result.name = 'another-app'; },
    value => { value.result.id = 'invalid'; },
    value => { value.result.production_branch = 'preview'; },
    value => { value.result.canonical_deployment.project_id = ids[3]; },
    value => { value.result.canonical_deployment.environment = 'preview'; },
    value => { value.result.canonical_deployment.latest_stage.status = 'active'; },
    value => { value.result.canonical_deployment.deployment_trigger.metadata.commit_dirty = true; },
    value => { value.result.canonical_deployment.deployment_trigger.metadata.commit_hash = 'main'; },
    value => { value.result.canonical_deployment.url = 'https://example.invalid'; },
  ]) {
    const value = appPages(source, ids[0]); mutate(value);
    assert.throws(() => normalizeAppPagesSnapshot(value, 'main'), /Pages deployment is unverified/);
  }
});

test('another Pages deployment with the same commit is not a rollback target', () => {
  const before = normalizeAppPagesSnapshot(appPages(source, ids[0]), 'main');
  const sameSha = normalizeAppPagesSnapshot(appPages(source, ids[2]), 'main');
  assert.throws(() => assertAppPagesBaselineUnchanged(before, sameSha), /baseline changed/);
  const candidate = normalizeAppPagesSnapshot(appPages('b'.repeat(40), ids[1]), 'main');
  const candidateSameSha = normalizeAppPagesSnapshot(appPages('b'.repeat(40), ids[2]), 'main');
  assert.throws(() => assertAppPagesCandidateBound(before, candidate, candidateSameSha, 'b'.repeat(40)), /not the current bound deployment/);
});
