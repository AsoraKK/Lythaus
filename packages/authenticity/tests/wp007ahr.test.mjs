import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { assertNoPrivateArtifactKeys, stableArtifactHash } from '../src/wp007a.ts';
import {
  assertExecutionConfirmation,
  assertFrozenArtifacts,
  assertTrustedMain,
  evaluateFreeAllocation,
  modelCatalogUrl,
  runPreflight,
  WP007AHR_EXECUTION_CONFIRMATION,
  WP007AHR_EXPECTED_HISTORICAL_MAIN_SHA,
  WP007AHR_FREEZE_SHA256,
  WP007AHR_HISTORICAL_FINGERPRINT,
  WP007AHR_PROMPT_SELECTION_SHA256,
  WP007AHR_REPOSITORY,
  WP007AHR_TRUSTED_REF,
} from '../../../scripts/authenticity/wp007ahr-preflight.mjs';
import { buildTransferManifest } from '../../../scripts/authenticity/wp007ahr-build-transfer-manifest.mjs';
import { relativeCacheId } from '../../../scripts/authenticity/wp007ah-cloudflare-holdouts.mjs';
import { findUnpinnedActions } from '../../../scripts/validate-workflow-action-pins.mjs';
import { WP007AH_MODEL_IDS, WP007AH_MODEL_ROLES } from '../src/wp007ah.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'wp007ah-cloudflare-holdout.yml');
const workflow = (await readFile(workflowPath, 'utf8'));

test('WP007A-HR preserves the merged historical baseline and frozen artifacts', async () => {
  assert.equal(WP007AHR_EXPECTED_HISTORICAL_MAIN_SHA, '71fc02ff9eaefc1be3d30940b2efe5c5496ba6ee');
  assert.equal(WP007AHR_REPOSITORY, ['As', 'oraKK', '/Lythaus'].join(''));
  assert.equal(WP007AHR_TRUSTED_REF, 'refs/heads/main');
  assert.equal(WP007AHR_FREEZE_SHA256, '87982112412059bd1615bd2d36ee9cf8ad72828b4042cb93839d725b6b533514');
  assert.equal(WP007AHR_PROMPT_SELECTION_SHA256, '6c17bf38a30e9d7c987107a97aaab48626b684535ce61dd239652654d2535cb8');
  assert.equal(WP007AHR_HISTORICAL_FINGERPRINT, '1efd1254953a3551ed4664eea5fe0dbec3cb21e674f468df04c079202077e495');
  await assert.doesNotReject(() => assertFrozenArtifacts(repositoryRoot));
});

test('trusted-main and execute confirmation gates are exact', () => {
  assert.doesNotThrow(() => assertTrustedMain({ ref: 'refs/heads/main', repository: WP007AHR_REPOSITORY }));
  assert.throws(() => assertTrustedMain({ ref: 'refs/heads/agent', repository: WP007AHR_REPOSITORY }), /untrusted_ref/u);
  assert.throws(() => assertExecutionConfirmation({ mode: 'execute', confirm: 'wrong', expectedFreezeSha256: WP007AHR_FREEZE_SHA256 }), /confirmation_invalid/u);
  assert.throws(() => assertExecutionConfirmation({ mode: 'execute', confirm: WP007AHR_EXECUTION_CONFIRMATION, expectedFreezeSha256: 'wrong' }), /freeze_confirmation_invalid/u);
  assert.doesNotThrow(() => assertExecutionConfirmation({ mode: 'execute', confirm: WP007AHR_EXECUTION_CONFIRMATION, expectedFreezeSha256: WP007AHR_FREEZE_SHA256 }));
});

test('workflow is manual-only, main-ref restricted, minimally permissioned, and pinned', () => {
  const document = YAML.parse(workflow);
  assert.deepEqual(Object.keys(document.on), ['workflow_dispatch']);
  assert.equal(document.permissions.contents, 'read');
  assert.match(workflow, /ref: refs\/heads\/main/u);
  assert.match(workflow, /github\.ref/u);
  assert.match(workflow, /github\.sha/u);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/u);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID/u);
  assert.match(workflow, /retention-days: 1/u);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|pull_request_target|schedule|repository_dispatch|workflow_run):/mu);
  assert.doesNotMatch(workflow, /contents:\s*write/u);
  assert.doesNotMatch(workflow, /git\s+push/u);
  assert.doesNotMatch(workflow, /(?:github\.token|GITHUB_TOKEN)/u);
  assert.doesNotMatch(workflow, /(?:SPAI|PatchCraft|Vision Observer|Judge|CLIP|DINO|EF2|EF5)/iu);
  assert.deepEqual(findUnpinnedActions(workflow), []);
});

test('only the frozen two models, roles, training state, and prompt selection are used', () => {
  const plan = JSON.parse(readFileSync(path.join(repositoryRoot, 'research', 'wp007ahr', 'wp007ahr-plan.json'), 'utf8'));
  assert.deepEqual([...WP007AH_MODEL_IDS], [
    '@cf/black-forest-labs/flux-1-schnell',
    '@cf/black-forest-labs/flux-2-klein-4b',
  ]);
  assert.equal(WP007AH_MODEL_ROLES[WP007AH_MODEL_IDS[0]], 'SEALED_GENERATOR_HOLDOUT');
  assert.equal(WP007AH_MODEL_ROLES[WP007AH_MODEL_IDS[1]], 'FUTURE_RESERVE');
  assert.equal(plan.frozenGenerationPlan.promptCount, 40);
  assert.deepEqual(plan.frozenGenerationPlan.modelIds, [...WP007AH_MODEL_IDS]);
  assert.match(workflow, /87982112412059bd1615bd2d36ee9cf8ad72828b4042cb93839d725b6b533514/u);
});

test('missing secrets fail before any Cloudflare request', async () => {
  let calls = 0;
  const result = await runPreflight({
    ref: WP007AHR_TRUSTED_REF,
    repository: WP007AHR_REPOSITORY,
    token: '',
    accountId: '',
    fetchImpl: async () => { calls += 1; throw new Error('must_not_call'); },
    rootDir: repositoryRoot,
  });
  assert.equal(result.authStatus, 'REQUIRED_SECRET_MISSING');
  assert.equal(result.costStatus, 'NOT_REACHED_BECAUSE_AUTH_BLOCKED');
  assert.equal(result.generationCalls, 0);
  assert.equal(calls, 0);
});

test('authenticated schema check is authoritative and catalog diagnostics remain read-only', async () => {
  const calls = [];
  const result = await runPreflight({
    ref: WP007AHR_TRUSTED_REF,
    repository: WP007AHR_REPOSITORY,
    token: 'test-token-not-persisted',
    accountId: 'account-for-test',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const parsed = new URL(url);
      const requested = parsed.searchParams.get('model') ?? parsed.searchParams.get('search');
      const modelId = WP007AH_MODEL_IDS.find((model) => model.endsWith(String(requested))) ?? requested;
      if (parsed.pathname.endsWith('/models/schema')) {
        return { ok: true, status: 200, json: async () => ({ success: true, result: { input: { type: 'object', additionalProperties: true }, output: { type: 'object', additionalProperties: true } } }) };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, result: [{ id: `internal-${modelId}`, name: modelId }] }) };
    },
    rootDir: repositoryRoot,
  });
  assert.equal(result.authStatus, 'PASS');
  assert.equal(result.costStatus, 'FREE_ALLOCATION_UNVERIFIED');
  assert.equal(result.freeAllocationVerified, false);
  assert.equal(result.passed, false);
  assert.equal(result.modelRouteStatus, 'PASS');
  assert.equal(result.catalogStatus, 'CATALOG_MATCH');
  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ init }) => init.method === 'GET'));
  assert.ok(calls.every(({ url }) => url.startsWith('https://api.cloudflare.com/client/v4/accounts/')));
  assert.equal(modelCatalogUrl('account-for-test', WP007AH_MODEL_IDS[0]).includes('/ai/models/search?'), true);
  assert.equal(new URL(modelCatalogUrl('account-for-test', WP007AH_MODEL_IDS[0])).searchParams.get('search'), 'flux-1-schnell');
  assert.equal(evaluateFreeAllocation().status, 'FREE_ALLOCATION_UNVERIFIED');
});

test('transfer manifest hashes only external-cache media and carries no secrets or detector fields', async () => {
  const cache = await mkdtemp(path.join(os.tmpdir(), 'wp007ahr-transfer-'));
  try {
    await writeFile(path.join(cache, 'cloudflare-generation-manifest.json'), `${JSON.stringify({
      schemaVersion: 'lythaus-wp007ah-cloudflare-generation-manifest-v1',
      generationStatus: 'MATERIALIZED',
      requested: { FLUX_1_SCHNELL: 40, FLUX_2_KLEIN_4B: 40, total: 80 },
      records: [],
      failures: [],
      detectorInferenceRun: false,
      modelTrainingRun: false,
      transformationsRun: false,
      mediaCommittedToGit: false,
    }, null, 2)}\n`, 'utf8');
    await writeFile(path.join(cache, 'not-an-image.txt'), 'safe metadata\n', 'utf8');
    const result = await buildTransferManifest({
      cachePath: cache,
      environment: {
        GITHUB_WORKFLOW_PATH: '.github/workflows/wp007ah-cloudflare-holdout.yml',
        GITHUB_WORKFLOW_COMMIT: 'workflow-commit',
        GITHUB_RUN_ID: '123',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: 'run-commit',
        WP007AHR_EXPECTED_FREEZE_SHA256: WP007AHR_FREEZE_SHA256,
      },
    });
    assert.deepEqual(result.hashes, []);
    const metadata = JSON.parse(await readFile(path.join(cache, 'run-metadata.json'), 'utf8'));
    assertNoPrivateArtifactKeys(metadata);
    assert.equal(metadata.mediaCommittedToGit, false);
    assert.equal(stableArtifactHash(result.transferManifest.records), stableArtifactHash([]));
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
});

test('generated cache IDs use one logical prefix and transfer hashes verify Flux.2 records', async () => {
  const cache = await mkdtemp(path.join(os.tmpdir(), 'wp007ahr-transfer-record-'));
  try {
    const filePath = path.join(cache, 'wp007ah-cloudflare', 'FLUX_2_KLEIN_4B', 'sample.png');
    const imageBytes = Buffer.from('wp007ahr-transfer-fixture', 'utf8');
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, imageBytes);
    assert.equal(relativeCacheId(cache, filePath), 'wp007ah-cloudflare/FLUX_2_KLEIN_4B/sample.png');
    const record = {
      sampleId: 'WP007AH_FLUX_2_KLEIN_4B_PROMPT_001',
      sourceFamilyId: 'WP007AH-FLUX_2_KLEIN_4B-PROMPT_001',
      provider: 'CLOUDFLARE_WORKERS_AI',
      generatorModelId: WP007AH_MODEL_IDS[1],
      generatorFamily: 'FLUX_2_KLEIN_4B',
      generatorVersion: null,
      generationRoute: 'CLOUDFLARE_WORKERS_AI_BFL_PARTNER_ROUTE',
      promptBankVersion: 'LYTHAUS_EF3_PROMPT_BANK_V1',
      promptId: 'PROMPT_001',
      seed: 'NOT_SUPPORTED',
      generationParameters: {},
      generatedAt: '2026-09-14T00:00:00.000Z',
      file: {
        sha256: createHash('sha256').update(imageBytes).digest('hex'),
        width: 1024,
        height: 1024,
        format: 'PNG',
        byteSize: imageBytes.byteLength,
        cacheId: 'wp007ah-cloudflare/FLUX_2_KLEIN_4B/sample.png',
      },
      truthAxes: {
        physicalCameraAcquisition: 'FALSE',
        syntheticDepictedContent: 'TRUE',
        localManipulation: 'FALSE',
        digitalCapture: 'TRUE',
        screenRecapture: 'FALSE',
      },
      rightsAuditId: 'WP007AH_CLOUDFLARE_BFL_ROUTE_2026-09-14',
      trainingEligibility: 'EVALUATION_ONLY',
      evaluationEligibility: 'AUTHORIZED_FOR_BOUNDED_HOLDOUT_ONLY',
      benchmarkRole: WP007AH_MODEL_ROLES[WP007AH_MODEL_IDS[1]],
      limitations: [],
    };
    await writeFile(path.join(cache, 'cloudflare-generation-manifest.json'), `${JSON.stringify({
      schemaVersion: 'lythaus-wp007ah-cloudflare-generation-manifest-v1',
      generationStatus: 'MATERIALIZED',
      requested: { FLUX_1_SCHNELL: 40, FLUX_2_KLEIN_4B: 40, total: 80 },
      records: [record],
      failures: [],
      detectorInferenceRun: false,
      modelTrainingRun: false,
      transformationsRun: false,
      mediaCommittedToGit: false,
    }, null, 2)}\n`, 'utf8');
    const result = await buildTransferManifest({ cachePath: cache });
    assert.equal(result.hashes.length, 1);
    assert.equal(result.transferManifest.records[0].cacheId, record.file.cacheId);
    assert.equal(result.transferManifest.records[0].sha256, record.file.sha256);
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
});

test('no workflow or tracked research artifact commits source media', () => {
  const tracked = execFileSync('git', ['ls-files', 'research/wp007ahr', '.github/workflows/wp007ah-cloudflare-holdout.yml'], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.doesNotMatch(tracked, /\.(?:png|jpe?g|webp|gif|avif)$/imu);
  const report = requireReport();
  assert.match(report, /WP007AHR_STAGE = WORKFLOW_PR_READY/u);
  assert.match(report, /GENERATION_DISPATCHED = FALSE/u);
});

function requireReport() {
  return readFileSync(path.join(repositoryRoot, 'research', 'wp007ahr', 'wp007ahr-final-report.md'), 'utf8');
}
