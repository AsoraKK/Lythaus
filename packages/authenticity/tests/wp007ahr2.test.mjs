import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import {
  assertWp007ahr2BoundedCost,
  assertWp007ahr2ExecutionAuthorization,
  estimateWp007ahr2BaseCostUsd,
  estimateWp007ahr2MaximumCostUsd,
  WP007AHR2_AUTHORIZED_CALLS,
  WP007AHR2_EXECUTION_AUTHORIZATION_SHA256,
  WP007AHR2_HISTORICAL_FREEZE_SHA256,
  WP007AHR2_MAX_ATTEMPTS,
  WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD,
  WP007AHR2_MODEL_PRICING,
} from '../src/wp007ahr2.ts';
import {
  assertExecutionAuthorization,
  evaluateBoundedCost,
  runWp007ahr2Preflight,
  WP007AHR2_AUTHORIZATION_PATH,
} from '../../../scripts/authenticity/wp007ahr2-preflight.mjs';
import { runWp007ah } from '../../../scripts/authenticity/wp007ah-cloudflare-holdouts.mjs';
import { WP007AHR_FREEZE_SHA256, WP007AHR_REPOSITORY, WP007AHR_TRUSTED_REF } from '../../../scripts/authenticity/wp007ahr-preflight.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'wp007ah-cloudflare-holdout.yml');
const workflow = await readFile(workflowPath, 'utf8');

test('HR2 authorization preserves the historical scientific freeze and exact bounded cost', async () => {
  assert.equal(WP007AHR2_HISTORICAL_FREEZE_SHA256, WP007AHR_FREEZE_SHA256);
  assert.equal(WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD, 1);
  assert.equal(WP007AHR2_AUTHORIZED_CALLS, 80);
  assert.equal(WP007AHR2_MAX_ATTEMPTS, 160);
  assert.equal(estimateWp007ahr2BaseCostUsd(), 0.080704);
  assert.equal(estimateWp007ahr2MaximumCostUsd(), 0.17);
  assert.equal(Object.keys(WP007AHR2_MODEL_PRICING).length, 2);
  const authorization = JSON.parse(await readFile(path.join(repositoryRoot, WP007AHR2_AUTHORIZATION_PATH), 'utf8'));
  assert.doesNotThrow(() => assertWp007ahr2ExecutionAuthorization(authorization));
  assert.equal(authorization.changesScientificFreeze, false);
  assert.equal(authorization.authorizationSha256, WP007AHR2_EXECUTION_AUTHORIZATION_SHA256);
});

test('bounded cost authorization rejects over-cap projections and free allocation is not required', () => {
  assert.doesNotThrow(() => assertWp007ahr2BoundedCost({ estimatedMaxCostUsd: 0.17, requestedCapUsd: 1 }));
  assert.throws(() => assertWp007ahr2BoundedCost({ estimatedMaxCostUsd: 1.01, requestedCapUsd: 1 }), /exceeds_owner_cap/u);
  assert.throws(() => assertWp007ahr2BoundedCost({ estimatedMaxCostUsd: 0.17, requestedCapUsd: 0 }), /requested_cost_cap_invalid/u);
  const cost = evaluateBoundedCost();
  assert.equal(cost.status, 'BOUNDED_COST_AUTHORIZED');
  assert.equal(cost.projectedMaxCostUsd, 0.17);
  assert.equal(cost.freeAllocationRequired, false);
});

test('HR2 preflight still requires trusted main, auth, rights, and exact authorization', async () => {
  const common = {
    ref: WP007AHR_TRUSTED_REF,
    repository: WP007AHR_REPOSITORY,
    expectedFreezeSha256: WP007AHR_FREEZE_SHA256,
    expectedAuthorizationSha256: WP007AHR2_EXECUTION_AUTHORIZATION_SHA256,
    rootDir: repositoryRoot,
  };
  const missing = await runWp007ahr2Preflight({ ...common, token: '', accountId: '', fetchImpl: async () => { throw new Error('must_not_call'); } });
  assert.equal(missing.status, 'AUTH_BLOCKED');
  assert.equal(missing.authStatus, 'REQUIRED_SECRET_MISSING');
  assert.equal(missing.generationCalls, 0);
  const authorized = await runWp007ahr2Preflight({
    ...common,
    token: 'test-token-not-persisted',
    accountId: 'account-for-test',
    fetchImpl: async (url, init) => {
      assert.equal(init.method, 'GET');
      const parsed = new URL(url);
      const requested = parsed.searchParams.get('model') ?? parsed.searchParams.get('search');
      const modelId = ['@cf/black-forest-labs/flux-1-schnell', '@cf/black-forest-labs/flux-2-klein-4b'].find((model) => model.endsWith(String(requested))) ?? requested;
      if (parsed.pathname.endsWith('/models/schema')) {
        return { ok: true, status: 200, json: async () => ({ success: true, result: { input: { type: 'object', additionalProperties: true }, output: { type: 'object', additionalProperties: true } } }) };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, result: [{ id: `internal-${modelId}`, name: modelId }] }) };
    },
  });
  assert.equal(authorized.status, 'PASS');
  assert.equal(authorized.passed, true);
  assert.equal(authorized.authStatus, 'PASS');
  assert.equal(authorized.rightsStatus, 'PASS');
  assert.equal(authorized.costStatus, 'BOUNDED_COST_AUTHORIZED');
  assert.equal(authorized.projectedMaxCostUsd, 0.17);
  assert.equal(authorized.executionAuthorizationVerified, true);
  assert.equal(authorized.freeAllocationVerified, false);
});

test('HR2 workflow is manual, trusted-main-only, least-privilege, and cost-amended without mutable scientific inputs', () => {
  const document = YAML.parse(workflow);
  assert.deepEqual(Object.keys(document.on), ['workflow_dispatch']);
  assert.equal(document.permissions.contents, 'read');
  assert.match(workflow, /execution_authorization_sha256/u);
  assert.match(workflow, /BOUNDED_COST_AUTHORIZED/u);
  assert.match(workflow, /--max-paid-cost 1\.00/u);
  assert.match(workflow, /refs\/heads\/main/u);
  assert.match(workflow, /github\.ref/u);
  assert.match(workflow, /github\.sha/u);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/u);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID/u);
  assert.doesNotMatch(workflow, /free_allocation_verified|FREE_ALLOCATION_CONFIRMED|FREE_ALLOCATION_UNVERIFIED/u);
  assert.doesNotMatch(workflow, /contents:\s*write|git\s+push|github\.token|GITHUB_TOKEN/u);
  assert.doesNotMatch(workflow, /(?:push|pull_request|pull_request_target|schedule|repository_dispatch|workflow_run):/mu);
  assert.doesNotMatch(workflow, /(?:SPAI|PatchCraft|Vision Observer|Judge|CLIP|DINO|EF2|EF5)/iu);
  assert.match(workflow, /EXECUTE_FROZEN_WP007AH/u);
  assert.match(workflow, /87982112412059bd1615bd2d36ee9cf8ad72828b4042cb93839d725b6b533514/u);
  assert.match(workflow, /eaa403c2a5519bcc130a33062ef1f4bbb67ba724eb9b003f57c3e609400d91ab/u);
  assert.match(workflow, /retention-days: 1/u);
});

test('authorization confirmation and artifact path are exact', async () => {
  await assert.rejects(() => assertExecutionAuthorization({ rootDir: repositoryRoot, expectedAuthorizationSha256: 'wrong' }), /authorization_confirmation_invalid/u);
  await assert.doesNotReject(() => assertExecutionAuthorization({ rootDir: repositoryRoot, expectedAuthorizationSha256: WP007AHR2_EXECUTION_AUTHORIZATION_SHA256 }));
  assert.equal(WP007AHR2_AUTHORIZATION_PATH, 'research/wp007ahr2/execution-authorization.json');
});

test('bounded runner executes only the complete frozen two-model plan', async () => {
  await assert.rejects(() => runWp007ah({
    executionAuthorizationSha256: WP007AHR2_EXECUTION_AUTHORIZATION_SHA256,
    maxPaidCost: WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD,
    model: '@cf/black-forest-labs/flux-1-schnell',
  }), /model_override_forbidden/u);
});

test('HR2 amendment report records no generation or detector output', async () => {
  const plan = JSON.parse(await readFile(path.join(repositoryRoot, 'research', 'wp007ahr2', 'wp007ahr2-plan.json'), 'utf8'));
  const report = await readFile(path.join(repositoryRoot, 'research', 'wp007ahr2', 'wp007ahr2-final-report.md'), 'utf8');
  assert.equal(plan.generationPerformed, false);
  assert.equal(plan.scientificFreezeChanged, false);
  assert.match(report, /WP007AHR2_STAGE = COST_AMENDMENT_PR_READY/u);
  assert.match(report, /GENERATION_DISPATCHED = FALSE/u);
  assert.match(report, /DETECTOR_INFERENCE_RUN = FALSE/u);
});
