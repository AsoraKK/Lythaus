import { pathToFileURL } from 'node:url';

export const NEW_CORE_ENVIRONMENT = 'lythaus-new-core-rehearsal';
export const NEW_CORE_PROVISIONING_BRANCH = 'codex/new-core-provisioning';
export const NEW_CORE_REPOSITORY = 'AsoraKK/Lythaus';
export const NEW_CORE_REPOSITORY_ID = '1010752912';
const API_ROOT = 'https://api.github.com';

const BOOTSTRAP_SECRET_NAMES = Object.freeze([
  'LYTHAUS_NEW_CORE_ENVIRONMENT_WRITER_TOKEN',
  'LYTHAUS_NEW_CORE_PROVISIONER_DATABASE_URL',
]);

export const NEW_CORE_OUTPUT_SECRET_NAMES = Object.freeze([
  'LYTHAUS_NEW_CORE_DELIVERY_CANARY',
  'LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL',
  'LYTHAUS_NEW_CORE_ADMIN_DATABASE_URL',
  'LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL',
  'LYTHAUS_NEW_CORE_ROLE_IDENTIFIERS',
]);

function fail(code) {
  throw new Error(code);
}

function reviewerIdentifier(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value)) fail('new_core_reviewer_id_invalid');
  return Number(value);
}

function sourceCommit(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) fail('new_core_approved_source_sha_invalid');
  return value;
}

export function assertNewCoreDispatchContext(environment, sourceSha) {
  if (environment.GITHUB_ACTIONS !== 'true'
    || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || environment.GITHUB_RUN_ATTEMPT !== '1'
    || environment.GITHUB_REPOSITORY !== NEW_CORE_REPOSITORY
    || environment.GITHUB_REPOSITORY_ID !== NEW_CORE_REPOSITORY_ID
    || environment.GITHUB_REF !== `refs/heads/${NEW_CORE_PROVISIONING_BRANCH}`
    || !/^[a-f0-9]{40}$/.test(sourceSha ?? '')
    || environment.GITHUB_SHA !== sourceSha
    || environment.LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA !== sourceSha
    || environment.LYTHAUS_NEW_CORE_REQUESTED_SOURCE_SHA !== sourceSha
    || environment.LYTHAUS_NEW_CORE_REQUESTED_TARGET !== 'lythaus/lythaus-new-core/main'
    || environment.LYTHAUS_NEW_CORE_CONFIRM_ROLES_ONLY !== 'true') {
    fail('new_core_candidate_context_not_approved');
  }
  if (!/^[1-9][0-9]{0,19}$/.test(environment.LYTHAUS_NEW_CORE_DISPATCHER_ID ?? '')
    || environment.GITHUB_ACTOR_ID !== environment.LYTHAUS_NEW_CORE_DISPATCHER_ID
    || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(environment.GITHUB_ACTOR ?? '')
    || environment.GITHUB_ACTOR.toLowerCase() === 'asorakk'
    || environment.GITHUB_TRIGGERING_ACTOR !== environment.GITHUB_ACTOR) {
    fail('new_core_independent_dispatcher_required');
  }
}

export function buildNewCoreEnvironmentPlan({ reviewerId, dispatcherId, sourceSha } = {}) {
  const approvedReviewerId = reviewerIdentifier(reviewerId);
  const approvedDispatcherId = reviewerIdentifier(dispatcherId);
  if (approvedDispatcherId === approvedReviewerId) fail('new_core_independent_dispatcher_required');
  const approvedSourceSha = sourceCommit(sourceSha);
  return {
    environment: {
      name: NEW_CORE_ENVIRONMENT,
      wait_timer: 0,
      prevent_self_review: true,
      reviewers: [{ type: 'User', id: approvedReviewerId }],
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    },
    branchPolicy: { type: 'branch', name: NEW_CORE_PROVISIONING_BRANCH },
    repositoryVariables: [
      { name: 'LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA', value: approvedSourceSha },
      { name: 'LYTHAUS_NEW_CORE_DISPATCHER_ID', value: String(approvedDispatcherId) },
    ],
    variables: [
      { name: 'LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA', value: approvedSourceSha },
      { name: 'LYTHAUS_NEW_CORE_DISPATCHER_ID', value: String(approvedDispatcherId) },
    ],
    bootstrapSecretNames: [...BOOTSTRAP_SECRET_NAMES],
    outputSecretNames: [...NEW_CORE_OUTPUT_SECRET_NAMES],
    existingEnvironmentsModified: false,
    actions: ['create_exact_new_environment', 'add_exact_branch_policy',
      'pin_approved_source_sha', 'pin_independent_dispatcher'],
  };
}

function exactEnvironmentProtection(environment, expectedReviewerId) {
  const rules = environment?.protection_rules;
  if (!Array.isArray(rules) || environment?.name !== NEW_CORE_ENVIRONMENT
    || (environment?.wait_timer !== undefined && environment.wait_timer !== 0)) return false;
  const reviewerRules = rules.filter((rule) => rule?.type === 'required_reviewers');
  const branchRules = rules.filter((rule) => rule?.type === 'branch_policy');
  const waitRules = rules.filter((rule) => rule?.type === 'wait_timer');
  if (reviewerRules.length !== 1 || branchRules.length !== 1 || waitRules.length > 1
    || waitRules.some((rule) => rule.wait_timer !== 0)
    || rules.some((rule) => !['required_reviewers', 'branch_policy', 'wait_timer'].includes(rule?.type))) return false;
  const rule = reviewerRules[0];
  const reviewers = rule?.reviewers;
  if (rule?.type !== 'required_reviewers' || rule?.prevent_self_review !== true
    || !Array.isArray(reviewers) || reviewers.length !== 1) return false;
  const reviewer = reviewers[0];
  const reviewerId = reviewer?.reviewer?.id ?? reviewer?.id;
  const reviewerType = reviewer?.type;
  if (reviewerType !== 'User' || !Number.isSafeInteger(Number(reviewerId)) || Number(reviewerId) <= 0
    || (expectedReviewerId !== null && Number(reviewerId) !== expectedReviewerId)) return false;
  const policy = environment?.deployment_branch_policy;
  return policy?.protected_branches === false && policy?.custom_branch_policies === true;
}

async function boundedJson(response, expectedUrl, expectedStatuses = [200]) {
  if (!response || !expectedStatuses.includes(response.status) || response.redirected === true
    || (response.url && response.url !== expectedUrl)) return { status: response?.status ?? null, value: null };
  if (response.status === 404) return { status: 404, value: null };
  try {
    const announced = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(announced) && announced > 128 * 1024) return { status: response.status, value: null };
    const raw = await response.text();
    if (Buffer.byteLength(raw) > 128 * 1024) return { status: response.status, value: null };
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { status: response.status, value, hasNextLink: /rel\s*=\s*"next"/i.test(response.headers?.get?.('link') ?? '') }
      : { status: response.status, value: null, hasNextLink: false };
  } catch {
    return { status: response.status, value: null, hasNextLink: false };
  }
}

async function ghGet(path, token, fetchImpl) {
  const url = `${API_ROOT}${path}`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
  } catch {
    return { status: null, value: null };
  }
  return boundedJson(response, url, [200, 404]);
}

async function repositoryOwnerId(token, fetchImpl) {
  const repo = await ghGet('/repos/AsoraKK/Lythaus', token, fetchImpl);
  if (repo.status !== 200 || repo.value?.id !== Number(NEW_CORE_REPOSITORY_ID)
    || repo.value?.full_name !== NEW_CORE_REPOSITORY
    || repo.value?.owner?.login !== 'AsoraKK' || repo.value?.owner?.type !== 'User'
    || !Number.isSafeInteger(repo.value?.owner?.id) || repo.value.owner.id <= 0) {
    fail('new_core_github_repository_identity_unverified');
  }
  return repo.value.owner.id;
}

export async function newCoreOwnerReviewerId({ token, fetchImpl = fetch } = {}) {
  if (typeof token !== 'string' || token.length < 20 || /[\s\x00-\x1f\x7f]/.test(token)) {
    fail('new_core_environment_read_token_unavailable');
  }
  return repositoryOwnerId(token, fetchImpl);
}

async function verifyGateMetadata({ token, sourceSha, environment = process.env, fetchImpl = fetch } = {}) {
  assertNewCoreDispatchContext(environment, sourceSha);
  sourceCommit(sourceSha);
  if (typeof token !== 'string' || token.length < 20 || /[\s\x00-\x1f\x7f]/.test(token)) {
    fail('new_core_environment_read_token_unavailable');
  }
  const expectedReviewerId = await repositoryOwnerId(token, fetchImpl);
  if (environment.GITHUB_ACTOR_ID === String(expectedReviewerId)) fail('new_core_independent_dispatcher_required');
  const actor = await ghGet(`/users/${environment.GITHUB_ACTOR}`, token, fetchImpl);
  const permission = await ghGet(`/repos/AsoraKK/Lythaus/collaborators/${environment.GITHUB_ACTOR}/permission`, token, fetchImpl);
  if (actor.status !== 200 || actor.value?.type !== 'User'
    || String(actor.value?.id) !== environment.GITHUB_ACTOR_ID
    || actor.value?.login?.toLowerCase() !== environment.GITHUB_ACTOR.toLowerCase()
    || permission.status !== 200 || !['admin', 'maintain', 'write'].includes(permission.value?.permission)) {
    fail('new_core_dispatcher_write_access_unverified');
  }
  const environmentPath = `/repos/AsoraKK/Lythaus/environments/${NEW_CORE_ENVIRONMENT}`;
  const environmentMetadata = await ghGet(environmentPath, token, fetchImpl);
  if (environmentMetadata.status !== 200 || !exactEnvironmentProtection(environmentMetadata.value, expectedReviewerId)) {
    fail(environmentMetadata.status === 404 ? 'new_core_github_environment_missing' : 'new_core_github_environment_protection_mismatch');
  }
  const branchPolicyPath = `${environmentPath}/deployment-branch-policies`;
  const branchPolicies = await ghGet(`${branchPolicyPath}?per_page=100&page=1`, token, fetchImpl);
  if (branchPolicies.status !== 200 || branchPolicies.hasNextLink
    || !Array.isArray(branchPolicies.value?.branch_policies)
    || branchPolicies.value?.total_count !== branchPolicies.value.branch_policies.length
    || branchPolicies.value.branch_policies.length !== 1
    || branchPolicies.value.branch_policies[0]?.name !== NEW_CORE_PROVISIONING_BRANCH
    || branchPolicies.value.branch_policies[0]?.type !== 'branch') {
    fail('new_core_github_environment_branch_policy_mismatch');
  }
  return {
    verified: true,
    repoIdMatch: true,
    environmentProtectionMatch: true,
    exactBranchPolicy: true,
    soleReviewerIsRepositoryOwner: true,
    preventSelfReview: true,
    independentDispatcherVerified: true,
    dispatcherWriteAccessVerified: true,
  };
}

async function verifyEnvironmentSourcePin({ token, sourceSha, environment, fetchImpl = fetch } = {}) {
  const variablesPath = `/repos/AsoraKK/Lythaus/environments/${NEW_CORE_ENVIRONMENT}/variables?per_page=100&page=1`;
  const variables = await ghGet(variablesPath, token, fetchImpl);
  const rows = variables.value?.variables;
  if (variables.status !== 200 || variables.hasNextLink || !Array.isArray(rows) || rows.length > 100
    || variables.value?.total_count !== rows.length || rows.length !== 2) {
    fail('new_core_github_environment_source_pin_unavailable');
  }
  const approved = rows.filter((row) => row?.name === 'LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA');
  if (approved.length !== 1 || approved[0]?.value !== sourceSha) {
    fail('new_core_github_environment_source_pin_mismatch');
  }
  const dispatcher = rows.filter((row) => row?.name === 'LYTHAUS_NEW_CORE_DISPATCHER_ID');
  if (dispatcher.length !== 1 || dispatcher[0]?.value !== environment.LYTHAUS_NEW_CORE_DISPATCHER_ID) {
    fail('new_core_github_environment_dispatcher_pin_mismatch');
  }
}

function readSecretNames(payload) {
  if (!Array.isArray(payload?.secrets) || payload.secrets.length > 100) fail('new_core_environment_secret_inventory_invalid');
  const names = [];
  for (const secret of payload.secrets) {
    if (typeof secret?.name !== 'string' || !/^LYTHAUS_NEW_CORE_[A-Z0-9_]{1,100}$/.test(secret.name)) {
      fail('new_core_environment_secret_inventory_invalid');
    }
    names.push(secret.name);
  }
  if (new Set(names).size !== names.length) fail('new_core_environment_secret_inventory_invalid');
  return names.sort();
}

export async function verifyNewCoreEnvironmentGate({
  token,
  sourceSha,
  approvedSourceSha,
  environment = process.env,
  fetchImpl = fetch,
} = {}) {
  if (sourceCommit(approvedSourceSha) !== sourceCommit(sourceSha)) fail('new_core_github_repository_source_pin_mismatch');
  const result = await verifyGateMetadata({ token, sourceSha, environment, fetchImpl });
  return { ...result, approvedSourceShaMatch: true };
}

export async function verifyNewCoreEnvironment({
  token,
  sourceSha,
  environment = process.env,
  fetchImpl = fetch,
} = {}) {
  await verifyGateMetadata({ token, sourceSha, environment, fetchImpl });
  await verifyEnvironmentSourcePin({ token, sourceSha, environment, fetchImpl });
  const secretsPath = `/repos/AsoraKK/Lythaus/environments/${NEW_CORE_ENVIRONMENT}/secrets?per_page=100&page=1`;
  const secrets = await ghGet(secretsPath, token, fetchImpl);
  if (secrets.status !== 200 || secrets.hasNextLink
    || secrets.value?.total_count !== secrets.value?.secrets?.length) {
    fail('new_core_github_environment_secret_inventory_unavailable');
  }
  const names = readSecretNames(secrets.value);
  const required = [...BOOTSTRAP_SECRET_NAMES].sort();
  const outputs = [...NEW_CORE_OUTPUT_SECRET_NAMES].sort();
  const existingOutputs = outputs.filter((name) => names.includes(name));
  const unexpected = names.filter((name) => !required.includes(name) && !outputs.includes(name));
  const missingInputs = required.filter((name) => !names.includes(name));
  return {
    verified: missingInputs.length === 0 && unexpected.length === 0 && existingOutputs.length === 0,
    repoIdMatch: true,
    environmentProtectionMatch: true,
    exactBranchPolicy: true,
    approvedSourceShaMatch: true,
    inputSecretCount: required.filter((name) => names.includes(name)).length,
    missingInputSecretCount: missingInputs.length,
    outputSecretCount: existingOutputs.length,
    unexpectedSecretCount: unexpected.length,
    outputSecretsAbsent: existingOutputs.length === 0,
  };
}

export function buildEnvironmentPlanReceipt({ reviewerId, dispatcherId, sourceSha } = {}) {
  const plan = buildNewCoreEnvironmentPlan({ reviewerId, dispatcherId, sourceSha });
  return {
    status: 'PLAN_ONLY_NOT_APPLIED',
    repository: NEW_CORE_REPOSITORY,
    repositoryId: Number(NEW_CORE_REPOSITORY_ID),
    environment: NEW_CORE_ENVIRONMENT,
    branch: NEW_CORE_PROVISIONING_BRANCH,
    approvedSourceShaMatch: true,
    requiredReviewerCount: 1,
    reviewerIdentifierProvided: true,
    distinctDispatcherIdentifierProvided: true,
    preventSelfReview: true,
    distinctDispatcherRequired: true,
    publishingTriggersProvisioning: false,
    administratorBypassControl: 'NOT_EXPOSED_BY_GITHUB_ENVIRONMENT_API',
    waitTimerSeconds: 0,
    exactBranchPolicy: true,
    bootstrapSecretNames: plan.bootstrapSecretNames,
    repositorySourcePinVariableName: 'LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA',
    environmentSourcePinVariableName: 'LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA',
    futureOutputSecretNames: plan.outputSecretNames,
    noExistingEnvironmentChanged: true,
    noProviderMutationsMade: true,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--apply') || args.has('--create')) fail('new_core_environment_plan_is_read_only');
  const sourceSha = process.env.LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA ?? '';
  if (args.has('--verify')) {
    const result = await verifyNewCoreEnvironment({
      token: process.env.LYTHAUS_NEW_CORE_ENVIRONMENT_WRITER_TOKEN,
      sourceSha,
    });
    process.stdout.write(`${JSON.stringify({ status: result.verified ? 'VERIFIED' : 'BLOCKED', ...result })}\n`);
    if (!result.verified) process.exitCode = 1;
    return;
  }
  if (args.has('--verify-gate')) {
    const result = await verifyNewCoreEnvironmentGate({
      token: process.env.GITHUB_TOKEN,
      sourceSha: process.env.GITHUB_SHA,
      approvedSourceSha: process.env.LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA,
    });
    process.stdout.write(`${JSON.stringify({ status: 'VERIFIED', ...result })}\n`);
    return;
  }
  const reviewerId = await newCoreOwnerReviewerId({ token: process.env.GITHUB_TOKEN });
  const receipt = buildEnvironmentPlanReceipt({ reviewerId,
    dispatcherId: process.env.LYTHAUS_NEW_CORE_DISPATCHER_ID, sourceSha });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const code = error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
      ? error.message : 'new_core_environment_operation_failed';
    process.stdout.write(`${JSON.stringify({ status: 'BLOCKED', code, noChangesMade: true })}\n`);
    process.exitCode = 1;
  });
}
