import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const PINS = Object.freeze({
  schemaSha: '050b1d1a3e973b367c28eae9617840e5d4816573',
  executionSha: 'a3da5aa99054c6bd9e284ea716701ed7adaf1801',
  receiptMainSha: '88b3fc02807887ab5281512a51cda6ba675eb593',
  receiptRunId: '44033281502',
  receiptJobId: 133870143448,
  receiptWorkflowId: 420320684,
  environmentId: 18972418184,
  ownerId: 211295889,
  target: 'lythaus/lythaus-new-core/main',
  receiptSha256: '6ebb92b0d970263bfc9fb71e17c9b67a9b25ccb3b3bc2bb5d4a4f8406b6981b3',
});
export const CONTROL_PATHS = Object.freeze([
  '.github/workflows/ci.yml',
  '.github/workflows/lythaus-new-core-schema-install.yml',
  'scripts/ci/lythaus-new-core-schema-install-control.mjs',
  'scripts/tests/lythaus-new-core-schema-install-control.test.mjs',
  'infrastructure/planetscale/lythaus-new-core-preflight-44033281502.receipt.json',
  'docs/runbooks/lythaus-new-core-schema-install-actions.md',
]);
const EXECUTION_PATHS = Object.freeze([
  'scripts/ci/lythaus-new-core-clean-install.mjs',
  'scripts/tests/lythaus-new-core-clean-install.test.mjs',
  'infrastructure/planetscale/lythaus-new-core-clean-install.target.json',
  'docs/runbooks/lythaus-new-core-schema-actions-handoff.md',
]);
export const REPOSITORY = new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1, -1);
const fail = (code) => { throw new Error(code); };

export function verifyDispatch(env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REPOSITORY_ID !== '1010752912'
    || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_REF_PROTECTED !== 'true'
    || env.GITHUB_RUN_ATTEMPT !== '1' || env.GITHUB_ACTOR_ID !== String(PINS.ownerId)
    || env.GITHUB_TRIGGERING_ACTOR !== env.GITHUB_ACTOR
    || !/^[a-f0-9]{40}$/.test(env.REQUESTED_CONTROL_SHA ?? '')
    || env.GITHUB_SHA !== env.REQUESTED_CONTROL_SHA
    || env.REQUESTED_SCHEMA_SHA !== PINS.schemaSha || env.REQUESTED_EXECUTION_SHA !== PINS.executionSha
    || env.PREFLIGHT_RUN_ID !== PINS.receiptRunId || env.REQUESTED_TARGET !== PINS.target
    || env.CONFIRM_SCHEMA_ONLY !== 'true' || env.RUNNER_DEBUG === '1'
    || env.NODE_OPTIONS || env.NODE_DEBUG) fail('schema_control_context_blocked');
}

export function verifyRegistrationDiff(compare) {
  const files = compare?.files;
  if (compare?.status !== 'ahead' || compare.merge_base_commit?.sha !== PINS.receiptMainSha
    || !Array.isArray(files) || files.length === 0 || files.length > CONTROL_PATHS.length
    || files.some((file) => !CONTROL_PATHS.includes(file.filename) || file.previous_filename
      || !['added','modified'].includes(file.status))
    || !files.some((file) => file.filename === '.github/workflows/lythaus-new-core-schema-install.yml')) {
    fail('schema_preflight_receipt_control_code_changed');
  }
}

export function verifyExecutionDiff(compare) {
  if (compare?.status !== 'ahead' || compare.merge_base_commit?.sha !== PINS.schemaSha
    || !Array.isArray(compare.files) || compare.files.length !== EXECUTION_PATHS.length
    || compare.files.some((file) => !EXECUTION_PATHS.includes(file.filename) || file.previous_filename
      || !['added','modified'].includes(file.status))
    || new Set(compare.files.map((file) => file.filename)).size !== EXECUTION_PATHS.length) {
    fail('schema_execution_payload_changed');
  }
}

export function parsePreflightReceipt(log) {
  const expectedSql = ['accessible', 'format_valid', 'target_valid', 'authentication_valid',
    'read_only_enforced', 'scoped_role_valid', 'baseline_valid'].sort();
  const expectedApi = ['accessible', 'format_valid', 'metadata_authorized', 'target_valid', 'managed_role_inventory_valid'].sort();
  const names = ['LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL', 'LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL', 'PLANETSCALE_API_TOKEN'];
  let receipt;
  for (const line of String(log).split('\n')) {
    const index = line.indexOf('{"status":"READ_ONLY_PREFLIGHT_PASS"');
    if (index < 0) continue;
    try {
      const row = JSON.parse(line.slice(index));
      if (receipt && JSON.stringify(row) !== JSON.stringify(receipt)) fail('schema_preflight_receipt_ambiguous');
      receipt = row;
    } catch (error) {
      if (error?.message === 'schema_preflight_receipt_ambiguous') throw error;
    }
  }
  if (!receipt || receipt.schema_candidate !== PINS.schemaSha || receipt.owner_review_verified !== true
    || receipt.schema_write_authorized_by_preflight !== false
    || receipt.approved_schema_main_baseline_unchanged !== false
    || Object.keys(receipt.inputs ?? {}).sort().join(',') !== [...names].sort().join(',')) {
    fail('schema_preflight_receipt_invalid');
  }
  for (const [index, name] of names.entries()) {
    const fields = receipt.inputs[name];
    if (!fields || Object.keys(fields).sort().join(',') !== (index === 2 ? expectedApi : expectedSql).join(',')
      || !Object.values(fields).every((value) => value === true)) fail('schema_preflight_input_not_validated');
  }
  return { receiptVerified: true, schemaSha: receipt.schema_candidate };
}

export function verifyEnvironment(environment, policies) {
  const rules = environment?.protection_rules;
  const reviewers = rules?.filter((rule) => rule.type === 'required_reviewers');
  if (environment?.id !== PINS.environmentId || environment.name !== 'production'
    || rules?.length !== 2 || reviewers?.length !== 1 || reviewers[0].prevent_self_review !== false
    || reviewers[0].reviewers?.length !== 1 || reviewers[0].reviewers[0].type !== 'User'
    || reviewers[0].reviewers[0].reviewer?.id !== PINS.ownerId
    || rules.filter((rule) => rule.type === 'branch_policy').length !== 1
    || environment.deployment_branch_policy?.protected_branches !== false
    || environment.deployment_branch_policy?.custom_branch_policies !== true
    || policies?.total_count !== 1 || policies.branch_policies?.length !== 1
    || policies.branch_policies[0].name !== 'main' || policies.branch_policies[0].type !== 'branch') {
    fail('schema_existing_environment_changed');
  }
}

export function verifyOwnerReview(history) {
  if (!Array.isArray(history) || !history.some((review) => review.state === 'approved'
    && review.user?.id === PINS.ownerId
    && review.environments?.some((item) => item.id === PINS.environmentId))) fail('schema_owner_approval_missing');
}

export function verifyPinnedReceipt(record) {
  const hash = createHash('sha256').update(JSON.stringify(record)).digest('hex');
  if (hash !== PINS.receiptSha256 || record.schemaVersion !== 'lythaus-new-core-preflight-receipt-v1'
    || record.runId !== PINS.receiptRunId || record.jobId !== PINS.receiptJobId
    || record.workflowId !== PINS.receiptWorkflowId || record.controlSha !== PINS.receiptMainSha
    || record.target !== PINS.target) fail('schema_pinned_receipt_changed');
  return parsePreflightReceipt(JSON.stringify(record.report));
}

function readPinnedReceipt() {
  return JSON.parse(fs.readFileSync(new URL('../../infrastructure/planetscale/lythaus-new-core-preflight-44033281502.receipt.json', import.meta.url), 'utf8'));
}

export async function verifyInstallControl({ env, get, receiptRecord = readPinnedReceipt(), requireInstallApproval = false }) {
  verifyDispatch(env);
  const main = await get('branches/main');
  if (main?.protected !== true || main.commit?.sha !== env.REQUESTED_CONTROL_SHA) fail('schema_protected_main_changed');
  const environment = await get('environments/production');
  verifyEnvironment(environment, await get('environments/production/deployment-branch-policies?per_page=100'));
  const run = await get(`actions/runs/${PINS.receiptRunId}`);
  if (String(run?.id) !== PINS.receiptRunId || run.repository?.id !== 1010752912
    || run.workflow_id !== PINS.receiptWorkflowId || run.head_branch !== 'main'
    || run.path !== '.github/workflows/lythaus-new-core-secret-preflight.yml'
    || run.head_sha !== PINS.receiptMainSha || run.event !== 'workflow_dispatch' || run.run_attempt !== 1
    || run.actor?.id !== PINS.ownerId || run.triggering_actor?.id !== PINS.ownerId
    || run.status !== 'completed' || run.conclusion !== 'success') fail('schema_preflight_run_mismatch');
  verifyOwnerReview(await get(`actions/runs/${PINS.receiptRunId}/approvals`));
  const jobs = await get(`actions/runs/${PINS.receiptRunId}/jobs?per_page=100`);
  if (jobs?.total_count !== 2 || jobs.jobs?.length !== 2 || !jobs.jobs.every((job) => job.conclusion === 'success')
    || !jobs.jobs.some((job) => job.id === PINS.receiptJobId
      && job.name === 'Owner-reviewed read-only inspection of existing inputs')) fail('schema_preflight_job_mismatch');
  const receipt = verifyPinnedReceipt(receiptRecord);
  verifyRegistrationDiff(await get(`compare/${PINS.receiptMainSha}...${env.REQUESTED_CONTROL_SHA}`));
  for (const sha of [PINS.schemaSha, PINS.executionSha]) {
    const source = await get(`commits/${sha}`);
    if (source?.sha !== sha) fail('schema_source_unavailable');
  }
  verifyExecutionDiff(await get(`compare/${PINS.schemaSha}...${PINS.executionSha}`));
  if (requireInstallApproval) {
    if (!/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')) fail('schema_install_run_missing');
    verifyOwnerReview(await get(`actions/runs/${env.GITHUB_RUN_ID}/approvals`));
  }
  return { status: 'SCHEMA_CONTROL_VERIFIED', protectedMainSha: env.REQUESTED_CONTROL_SHA,
    schemaSha: PINS.schemaSha, executionSha: PINS.executionSha, preflightRunId: PINS.receiptRunId,
    preflightReceiptReused: receipt.receiptVerified, ownerInstallApprovalVerified: requireInstallApproval,
    providerSecretsAccessed: false, sqlExecuted: false };
}

export function githubReaders() {
  return { get: async (suffix) => {
    try {
      return JSON.parse(execFileSync('gh', ['api', '--method', 'GET', `repos/${REPOSITORY}/${suffix}`], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 25_000, maxBuffer: 8 * 1024 * 1024,
      }));
    } catch { fail('schema_github_metadata_unavailable'); }
  } };
}

async function main() {
  try {
    const mode = process.argv[2];
    if (!['--before-review', '--after-review'].includes(mode)) fail('schema_control_mode_invalid');
    const result = await verifyInstallControl({ env: process.env, ...githubReaders(), requireInstallApproval: mode === '--after-review' });
    if (mode === '--before-review' && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'verified=true\n');
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ status: 'SCHEMA_CONTROL_BLOCKED', code: /^[a-z0-9_]+$/.test(error?.message ?? '')
      ? error.message : 'schema_control_metadata_unavailable' }));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
