import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFrozenArtifacts,
  assertTrustedMain,
  assertExecutionConfirmation,
  runModelRoutePreflight,
  WP007AHR_REPOSITORY,
  WP007AHR_TRUSTED_REF,
  WP007AHR_FREEZE_SHA256,
  WP007AHR_EXECUTION_CONFIRMATION,
} from './wp007ahr-preflight.mjs';
import {
  assertWp007ahr2BoundedCost,
  assertWp007ahr2ExecutionAuthorization,
  estimateWp007ahr2MaximumCostUsd,
  WP007AHR2_EXECUTION_AUTHORIZATION_SHA256,
  WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD,
  WP007AHR2_OFFICIAL_COST_SOURCES,
} from '../../packages/authenticity/src/wp007ahr2.ts';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const WP007AHR2_AUTHORIZATION_PATH = 'research/wp007ahr2/execution-authorization.json';

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function loadExecutionAuthorization(rootDir = REPOSITORY_ROOT) {
  return readJson(path.join(rootDir, WP007AHR2_AUTHORIZATION_PATH));
}

export async function assertExecutionAuthorization({ rootDir = REPOSITORY_ROOT, expectedAuthorizationSha256 }) {
  if (expectedAuthorizationSha256 !== WP007AHR2_EXECUTION_AUTHORIZATION_SHA256) throw new Error('wp007ahr2_authorization_confirmation_invalid');
  const authorization = await loadExecutionAuthorization(rootDir);
  assertWp007ahr2ExecutionAuthorization(authorization);
  return authorization;
}

export function evaluateBoundedCost() {
  const projectedMaxCostUsd = estimateWp007ahr2MaximumCostUsd();
  assertWp007ahr2BoundedCost({ estimatedMaxCostUsd: projectedMaxCostUsd });
  return {
    status: 'BOUNDED_COST_AUTHORIZED',
    projectedMaxCostUsd,
    maxIncrementalPaidCostUsd: WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD,
    freeAllocationVerified: false,
    freeAllocationRequired: false,
    costMethod: 'FROZEN_CALL_COUNT_PLUS_ONE_PREDECLARED_TRANSPORT_RETRY_AT_CURRENT_DOCUMENTED_UNIT_PRICES_CEILING_TO_CENT',
    officialSources: [...WP007AHR2_OFFICIAL_COST_SOURCES],
  };
}

export async function runWp007ahr2Preflight({
  mode = 'preflight',
  confirm = '',
  expectedFreezeSha256 = '',
  expectedAuthorizationSha256 = '',
  ref = process.env.GITHUB_REF,
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.CLOUDFLARE_API_TOKEN,
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  fetchImpl = globalThis.fetch,
  rootDir = REPOSITORY_ROOT,
} = {}) {
  const summary = {
    schemaVersion: 'lythaus-wp007ahr2-preflight-v1',
    mode,
    passed: false,
    authStatus: 'NOT_REACHED',
    modelRouteStatus: 'NOT_REACHED',
    costStatus: 'NOT_REACHED',
    rightsStatus: 'NOT_REACHED',
    executionAuthorizationVerified: false,
    freeAllocationVerified: false,
    credentialsPrinted: false,
    generationCalls: 0,
    imagesGenerated: 0,
    detectorInferenceRun: false,
    modelTrainingRun: false,
    transformationsRun: false,
    mediaCommittedToGit: false,
    productionChanged: false,
  };
  try {
    assertTrustedMain({ ref, repository });
    assertExecutionConfirmation({ mode, confirm, expectedFreezeSha256 });
    if (expectedFreezeSha256 !== WP007AHR_FREEZE_SHA256) throw new Error('wp007ahr2_freeze_confirmation_invalid');
    await assertExecutionAuthorization({ rootDir, expectedAuthorizationSha256 });
    summary.executionAuthorizationVerified = true;
    const frozen = await assertFrozenArtifacts(rootDir);
    summary.rightsStatus = 'PASS';
    summary.freezeSha256 = frozen.freezeHash;
    summary.executionAuthorizationSha256 = expectedAuthorizationSha256;
  } catch (error) {
    summary.status = 'PROTOCOL_INVALID';
    summary.failure = String(error?.message ?? error);
    return summary;
  }

  if (!token || !accountId) {
    summary.authStatus = 'REQUIRED_SECRET_MISSING';
    summary.costStatus = 'NOT_REACHED_BECAUSE_AUTH_BLOCKED';
    summary.status = 'AUTH_BLOCKED';
    return summary;
  }
  const auth = await runModelRoutePreflight({ token, accountId, fetchImpl });
  summary.authStatus = auth.authStatus;
  summary.modelRouteStatus = auth.modelRouteStatus;
  summary.modelSchema = auth.modelSchemas;
  summary.modelCatalog = auth.modelCatalog;
  summary.catalogStatus = auth.catalogStatus;
  if (auth.authStatus !== 'PASS') {
    summary.costStatus = 'NOT_REACHED_BECAUSE_AUTH_BLOCKED';
    summary.status = 'AUTH_BLOCKED';
    return summary;
  }
  if (auth.modelRouteStatus !== 'PASS') {
    summary.costStatus = 'NOT_REACHED_BECAUSE_MODEL_ROUTE_BLOCKED';
    summary.status = auth.modelRouteStatus;
    return summary;
  }

  const cost = evaluateBoundedCost();
  summary.costStatus = cost.status;
  summary.projectedMaxCostUsd = cost.projectedMaxCostUsd;
  summary.maxIncrementalPaidCostUsd = cost.maxIncrementalPaidCostUsd;
  summary.freeAllocationVerified = false;
  summary.costEvidence = cost.costMethod;
  summary.costOfficialSources = cost.officialSources;
  summary.passed = true;
  summary.status = 'PASS';
  return summary;
}

function parseArgs(argv) {
  const options = { mode: 'preflight', confirm: '', expectedFreezeSha256: '', expectedAuthorizationSha256: '', output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--mode') options.mode = argv[++index];
    else if (argument === '--confirm') options.confirm = argv[++index];
    else if (argument === '--expected-freeze-sha256') options.expectedFreezeSha256 = argv[++index];
    else if (argument === '--execution-authorization-sha256') options.expectedAuthorizationSha256 = argv[++index];
    else if (argument === '--output') options.output = path.resolve(argv[++index]);
    else throw new Error(`unknown_argument:${argument}`);
  }
  return options;
}

async function writeWorkflowOutputs(summary) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = [
    `passed=${summary.passed === true}`,
    `auth_status=${summary.authStatus}`,
    `model_route_status=${summary.modelRouteStatus}`,
    `cost_status=${summary.costStatus}`,
    `projected_max_cost_usd=${summary.projectedMaxCostUsd ?? ''}`,
    `rights_status=${summary.rightsStatus}`,
    `execution_authorization_verified=${summary.executionAuthorizationVerified === true}`,
  ];
  await appendFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, 'utf8');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const summary = await runWp007ahr2Preflight({
      mode: options.mode,
      confirm: options.confirm,
      expectedFreezeSha256: options.expectedFreezeSha256,
      expectedAuthorizationSha256: options.expectedAuthorizationSha256,
    });
    if (options.output) await writeFile(options.output, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await writeWorkflowOutputs(summary);
    console.log(JSON.stringify({
      status: summary.status ?? (summary.passed ? 'PASS' : 'BLOCKED'),
      authStatus: summary.authStatus,
      modelRouteStatus: summary.modelRouteStatus,
      costStatus: summary.costStatus,
      projectedMaxCostUsd: summary.projectedMaxCostUsd ?? null,
      rightsStatus: summary.rightsStatus,
      executionAuthorizationVerified: summary.executionAuthorizationVerified,
      generationCalls: 0,
      imagesGenerated: 0,
      credentialsPrinted: false,
    }));
    if (summary.passed !== true) process.exitCode = 1;
  } catch (error) {
    console.error(`WP007AHR2_STATUS=PROTOCOL_INVALID:${String(error?.message ?? error)}`);
    process.exitCode = 1;
  }
}
