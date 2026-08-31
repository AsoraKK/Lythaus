import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-release.yml', 'utf8');
const webWorkflow = readFileSync('.github/workflows/deploy-alpha-web.yml', 'utf8');
const workersWorkflow = readFileSync('.github/workflows/native-workers-deploy.yml', 'utf8').replace(/\r\n/g, '\n');
const adr003Workflow = readFileSync('.github/workflows/native-adr003-acceptance.yml', 'utf8');
const adr003Harness = readFileSync('scripts/ci/run-adr003-authenticated-acceptance.mjs', 'utf8');
const runtimeAuth = readFileSync('scripts/release/runtime-authenticated-command.mjs', 'utf8');
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const pagesVerifier = readFileSync('scripts/cloudflare/verify-pages-deployment.mjs', 'utf8');
const publicApiRuntime = readFileSync('apps/lythaus-public-api/src/index.ts', 'utf8');
const coordinatorParentHelper = readFileSync('scripts/ci/ensure-cloudflare-worker-parent.mjs', 'utf8');

const satisfiesGovernance = (protection) => (
  protection.required_status_checks !== null
  && protection.required_status_checks.contexts.length > 0
  && protection.required_pull_request_reviews !== null
  && protection.required_pull_request_reviews.required_approving_review_count === 0
  && (protection.required_pull_request_reviews.require_last_push_approval ?? false) === false
  && protection.enforce_admins.enabled === true
  && protection.required_linear_history.enabled === true
  && protection.allow_force_pushes.enabled === false
  && protection.allow_deletions.enabled === false
  && protection.required_conversation_resolution.enabled === true
);

test('production release requires native branch protection and release governance', () => {
  assert.match(workflow, /REF_PROTECTED/);
  assert.match(workflow, /test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(workflow, /test "\$REF_PROTECTED" = 'true'/);
  assert.doesNotMatch(workflow, /required_approving_review_count\s*>=\s*1/);
  assert.doesNotMatch(workflow, /UNAVAILABLE_BY_PLAN/);
  assert.match(workflow, /native_branch_protection_status=ACTIVE/);
  assert.match(workflow, /release_governance_compensating_controls=VERIFIED/);
});

test('zero approvals pass while approval or last-push requirements fail', () => {
  const base = {
    required_status_checks: { contexts: ['Repository hygiene'] },
    required_pull_request_reviews: {
      required_approving_review_count: 0,
      require_last_push_approval: false,
    },
    enforce_admins: { enabled: true },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    required_conversation_resolution: { enabled: true },
  };

  assert.equal(satisfiesGovernance(base), true);
  assert.equal(
    satisfiesGovernance({
      ...base,
      required_pull_request_reviews: {
        ...base.required_pull_request_reviews,
        required_approving_review_count: 1,
      },
    }),
    false,
  );
  assert.equal(
    satisfiesGovernance({
      ...base,
      required_pull_request_reviews: {
        ...base.required_pull_request_reviews,
        require_last_push_approval: true,
      },
    }),
    false,
  );
  for (const [field, value] of [
    ['enforce_admins', { enabled: false }],
    ['required_linear_history', { enabled: false }],
    ['allow_force_pushes', { enabled: true }],
    ['allow_deletions', { enabled: true }],
    ['required_conversation_resolution', { enabled: false }],
  ]) {
    assert.equal(satisfiesGovernance({ ...base, [field]: value }), false, `${field} must remain enforced`);
  }
});

test('governance retains required checks and destructive-action protections', () => {
  assert.match(workflow, /test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(workflow, /require_successful_run 'CI'/);
  assert.match(workflow, /require_successful_run 'CodeQL'/);
  assert.match(workflow, /require_successful_run 'Dependency review'/);
  assert.match(workflow, /require_successful_run 'Native secret scan'/);
  assert.match(workflow, /git rev-list --min-parents=2/);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /commits\/\$\{RELEASE_SHA\}\/pulls/);
  assert.match(workflow, /reviewThreads/);
  assert.match(workflow, /previous_production_sha/);
  assert.match(workflow, /release-manifest\.sha256/);
});

test('release preflight uses readable Actions evidence and fail-closed fanout', () => {
  assert.match(workflow, /REF_PROTECTED/);
  assert.match(workflow, /get_run\(\)/);
  assert.match(workflow, /actions\/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093/);
  assert.match(workflow, /security-run-evidence-CodeQL-\$\{\{ inputs\.release_sha \}\}/);
  assert.match(workflow, /security-run-evidence-Dependency-review-\$\{\{ inputs\.release_sha \}\}/);
  assert.match(workflow, /security-run-evidence-Native-secret-scan-\$\{\{ inputs\.release_sha \}\}/);
  assert.match(workflow, /require_successful_run 'CodeQL' "\$CODEQL_RUN_ID"/);
  assert.match(workflow, /require_successful_run 'Dependency review' "\$DEPENDENCY_REVIEW_RUN_ID"/);
  assert.match(workflow, /require_successful_run 'Native secret scan' "\$SECRET_SCAN_RUN_ID"/);
  assert.doesNotMatch(workflow, /actions\/runs\/\$\{HISTORICAL_RECONCILIATION_RUN_ID\}\/artifacts/);
  assert.doesNotMatch(workflow, /actions\/artifacts\/\$\{artifact_id\}\/zip/);
  assert.doesNotMatch(workflow, /gh run download/);
  assert.doesNotMatch(workflow, /actions\/runs\?head_sha=/);
  assert.doesNotMatch(workflow, /commits\/\$\{RELEASE_SHA\}\/check-runs/);

  const smokeSection = workflow.match(/\n  production_smoke:[\s\S]*?\n  manifest:/)?.[0] ?? '';
  const manifestSection = workflow.match(/\n  manifest:[\s\S]*/)?.[0] ?? '';
  assert.doesNotMatch(smokeSection, /if: always\(\)/);
  assert.doesNotMatch(manifestSection, /if: always\(\)/);
});

test('the exact CI run publishes the immutable artifact consumed by production release', () => {
  assert.match(ciWorkflow, /actions\/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f/);
  assert.match(ciWorkflow, /name: flutter-web-release/);
  assert.match(ciWorkflow, /path: build\/web/);
  assert.match(ciWorkflow, /if-no-files-found: error/);
});

test('production browser smoke uses production acceptance credentials', () => {
  assert.match(workflow, /target_environment: production/);
  assert.match(workflow, /api_base_url: https:\/\/api\.lythaus\.co\/api/);
  assert.match(webWorkflow, /deploy-and-smoke:[\s\S]*environment: \$\{\{ inputs\.target_environment == 'production' && 'production'/);
  assert.match(webWorkflow, /browser-smoke:[\s\S]*environment: \$\{\{ inputs\.target_environment == 'production' && 'production'/);
  assert.match(webWorkflow, /RUNTIME_AUTH_EMAIL: \$\{\{ inputs\.target_environment == 'production' && secrets\.CODEX_TEST_EMAIL \|\| secrets\.MVP_SMOKE_EMAIL \}\}/);
  assert.match(webWorkflow, /RUNTIME_AUTH_PASSWORD: \$\{\{ inputs\.target_environment == 'production' && secrets\.CODEX_TEST_PASSWORD \|\| secrets\.MVP_SMOKE_PASSWORD \}\}/);
});

test('web authenticated smoke waits for Worker activation', () => {
  assert.match(workflow, /\r?\n  web:\r?\n[\s\S]*?needs: \[preflight, provider_evidence, workers\]/);
  assert.match(workflow, /\r?\n  workers:\r?\n[\s\S]*?needs: \[preflight, provider_evidence\]/);
});

test('ADR-003 uses the canonical API base and keeps mobile acceptance separate', () => {
  assert.match(adr003Workflow, /default: https:\/\/api\.lythaus\.co\/api/);
  assert.doesNotMatch(workflow, /real_email_evidence_json|ADR003_REAL_EMAIL_EVIDENCE_JSON/);
  assert.doesNotMatch(workersWorkflow, /real_email_evidence_json|ADR003_REAL_EMAIL_EVIDENCE_JSON/);
  assert.doesNotMatch(adr003Workflow, /real_email_evidence_json|ADR003_REAL_EMAIL_EVIDENCE_JSON/);
  assert.match(adr003Workflow, /ADR003_AUTH_ACCEPTANCE_EVIDENCE_SOURCE: protected_probe/);
  assert.match(workersWorkflow, /collect-auth-acceptance-evidence\.mjs/);
  assert.match(workersWorkflow, /HUMAN_ACCEPTANCE_REQUIRED/);
  assert.match(workersWorkflow, /\.status == "PASSED"/);
  assert.match(workersWorkflow, /ADR003_CANDIDATE_UPLOADED_AT/);
  assert.match(workersWorkflow, /ADR003_CANDIDATE_STAGED_AT/);
  assert.match(workersWorkflow, /mail\.lythaus\.co/);
  assert.match(workersWorkflow, /cloudflare_email_sending_queue_subscription_observation/);
  assert.match(workersWorkflow, /provider_configuration_missing/);
  assert.match(workersWorkflow, /bounced.*complained.*deferred.*delivered.*failed.*rejected/s);
  assert.match(adr003Workflow, /mail\.lythaus\.co/);
  assert.match(adr003Workflow, /cloudflare_email_sending_queue_subscription_observation/);
  assert.match(adr003Workflow, /provider_configuration_missing/);
  assert.match(adr003Workflow, /bounced.*complained.*deferred.*delivered.*failed.*rejected/s);
  assert.match(adr003Harness, /parseRealEmailAcceptanceEvidence/);
  assert.match(adr003Harness, /ADR003_AUTH_ACCEPTANCE_EVIDENCE_PATH/);
  assert.match(adr003Harness, /ADR003_ACCEPTANCE_RUN_ID/);
  assert.match(adr003Harness, /x-correlation-id/);
  assert.doesNotMatch(adr003Harness, /manualFlag\('ADR003_EMAIL_DELIVERY_ACCEPTED'/);
  assert.doesNotMatch(adr003Harness, /manualFlag\('ADR003_EMAIL_LINK_REPLAY_VERIFIED'/);
  const a20 = adr003Harness.match(/await runCase\('A20',[\s\S]*?\n\}\);/)?.[0] ?? '';
  assert.match(a20, /requireAuthAcceptance/);
  assert.doesNotMatch(a20, /ADR003_MOBILE_EMAIL_ACCEPTED/);
  assert.match(adr003Harness, /mobileEmailFlow: process\.env\.ADR003_MOBILE_EMAIL_ACCEPTED === 'true'/);
});

test('auth evidence sources stay protected and database-query compatible', () => {
  const collector = readFileSync('scripts/ci/collect-auth-acceptance-evidence.mjs', 'utf8');
  assert.match(collector, /protected_probe/);
  assert.match(collector, /read_only_query_artifact/);
  assert.match(collector, /ADR003_AUTH_ACCEPTANCE_QUERY_OUTPUT_PATH/);
  assert.match(collector, /ADR003_AUTH_ACCEPTANCE_EVIDENCE_URL/);
  assert.doesNotMatch(collector, /internal\/readiness\/auth-acceptance/);
  assert.match(collector, /Cloudflare-Workers-Version-Overrides/);
  assert.match(collector, /authorization/);
  assert.match(collector, /CF-Access-Client-Id/);
  assert.match(collector, /auth_acceptance_observer_access_service_token_incomplete/);
  assert.doesNotMatch(collector, /provider_message_id.*SELECT|SELECT.*provider_message_id/i);
});

test('canonical release creates or resumes the Keeper-bound exact candidate', () => {
  const productionWorkflow = readFileSync('.github/workflows/production-release.yml', 'utf8');
  assert.match(workersWorkflow, /acceptance_run_id/);
  assert.match(workersWorkflow, /AUTH_ACCEPTANCE_KEEPER_URL/);
  assert.match(workersWorkflow, /CLOUDFLARE_ACCOUNT_ID: \$cloudflare_account_id/);
  assert.match(workersWorkflow, /AUTH_ACCEPTANCE_PENDING=true/);
  assert.match(workersWorkflow, /production-auth-acceptance\/observer/);
  assert.match(workersWorkflow, /\.status == "completed"/);
  assert.match(workersWorkflow, /JOBS_WORKER_VERSION_ID\}@100/);
  assert.match(workersWorkflow, /CF-Access-Client-Id/);
  assert.match(productionWorkflow, /acceptance_run_id/);
  assert.match(productionWorkflow, /authenticated_acceptance_proven == 'true'/);
});

test('coordinator secret inventory waits for parent propagation and fails closed', () => {
  assert.match(workersWorkflow, /list_coordinator_secrets\(\)/);
  assert.match(workersWorkflow, /for attempt in 1 2 3 4 5/);
  assert.match(workersWorkflow, /allow_empty_parent_inventory/);
  assert.match(workersWorkflow, /\.status == "VERIFIED" and \.deployment\.exists == false/);
  assert.match(workersWorkflow, /printf '\[\]\\n' > "\$output"/);
  assert.match(workersWorkflow, /not found\|does not exist\|10007/);
  assert.match(workersWorkflow, /Coordinator secret inventory returned invalid JSON/);
  assert.match(workersWorkflow, /Coordinator secret inventory failed for a non-propagation reason/);
  assert.match(workersWorkflow, /Coordinator secret inventory remained unavailable after parent bootstrap/);
  const ensureIndex = workersWorkflow.indexOf('node scripts/ci/ensure-cloudflare-worker-parent.mjs');
  const initialInventoryIndex = workersWorkflow.indexOf('list_coordinator_secrets "$coordinator_secret_inventory" true');
  assert.ok(ensureIndex >= 0 && initialInventoryIndex > ensureIndex);
  const uploadIndex = workersWorkflow.indexOf('versions upload --config');
  const postUploadInventoryIndex = workersWorkflow.lastIndexOf('list_coordinator_secrets "$coordinator_secret_inventory"');
  assert.ok(uploadIndex >= 0 && postUploadInventoryIndex > uploadIndex);
  assert.doesNotMatch(workersWorkflow.slice(postUploadInventoryIndex), /allow_empty_parent_inventory.*true/);
});

test('production ADR-003 preserves its login fixture', () => {
  assert.match(workersWorkflow, /ADR003_RUN_DESTRUCTIVE_ACCOUNT_DELETION: 'false'/);
  assert.match(adr003Harness, /outcome: 'skipped', reason: 'account_deletion_not_run_in_production_release'/);
  assert.match(adr003Harness, /results\.every\(\(item\) => item\.outcome === 'passed' \|\| item\.outcome === 'skipped'\)/);
});

test('ADR-003 routes root-scoped readiness separately from public API routes', () => {
  assert.match(adr003Harness, /ADR003_API_BASE_URL must end with \/api/);
  assert.match(adr003Harness, /const apiOrigin = apiBase\.slice\(0, -'\/api'\.length\)/);
  assert.match(adr003Harness, /requestJson\('\/internal\/readiness\/database-identity', \{[\s\S]*baseUrl: apiOrigin/);
  assert.match(adr003Harness, /function requestUrl\(baseUrl, route\)/);
  assert.match(adr003Harness, /normalizedBase\.endsWith\(apiPrefix\)/);
  assert.match(adr003Harness, /normalizedRoute\.slice\(apiPrefix\.length\)/);
  assert.match(adr003Harness, /fetch\(requestUrl\(baseUrl, route\)/);
});

test('candidate ADR-003 acceptance normalizes the protected production API base', () => {
  const candidateAcceptance = workersWorkflow.match(/- name: Run authenticated acceptance against public candidate[\s\S]*?npm run acceptance:adr003/)?.[0] ?? '';
  assert.match(candidateAcceptance, /ADR003_DATABASE_READINESS_EVIDENCE_PATH: \$\{\{ runner\.temp \}\}\/production-cutover\/public-candidate-probe\.json/);
  assert.match(candidateAcceptance, /api_base="\$\{ADR003_API_BASE_URL%\//);
  assert.match(candidateAcceptance, /api_base="\$api_base\/api"/);
  assert.match(candidateAcceptance, /export ADR003_API_BASE_URL="\$api_base"/);
});

test('production browser authentication accepts canonical and legacy token keys', () => {
  assert.match(runtimeAuth, /session\?\.accessToken \|\| session\?\.access_token/);
  assert.match(runtimeAuth, /session\?\.refreshToken \|\| session\?\.refresh_token/);
});

test('production acceptance follows current API semantics and visible guest controls', () => {
  const browserSmoke = readFileSync('scripts/beta-smoke.mjs', 'utf8');
  const workerProbe = readFileSync('scripts/ci/probe-production-workers.mjs', 'utf8');
  assert.match(adr003Harness, /expectStatus\(result, \[400, 401\], 'refresh_replay'\)/);
  assert.match(adr003Harness, /body\?\.postId[\s\S]*body\?\.id/);
  assert.match(browserSmoke, /clickVisibleText\(page, ocrWorker, 'Continue as guest'\)/);
  assert.match(browserSmoke, /worker\.recognize\(image, \{\}, \{ blocks: true \}\)/);
  assert.equal((browserSmoke.match(/Array\.isArray\(parsed\.items\)/g) ?? []).length, 2);
  assert.doesNotMatch(browserSmoke, /parsed\.success === true/);
  assert.match(workerProbe, /routePrefix: '\/api'/);
  assert.match(publicApiRuntime, /url\.pathname === '\/api\/internal\/readiness\/database-identity'/);
  assert.doesNotMatch(browserSmoke, /viewport\.width \/ 2/);
});

test('candidate ADR-003 acceptance consumes the exact proven readiness artifact', () => {
  assert.match(adr003Harness, /ADR003_DATABASE_READINESS_EVIDENCE_PATH/);
  assert.match(adr003Harness, /report\.releaseSha === releaseSha/);
  assert.match(adr003Harness, /worker\.workerVersionId === candidateWorkerVersionId/);
  assert.match(adr003Harness, /worker\.schemaFingerprint === expected\.schemaFingerprint/);
  assert.match(adr003Harness, /worker\.roleClass === 'login_non_superuser'/);
  assert.match(adr003Harness, /worker\.readyForAuthentication === true/);
});

test('candidate readiness does not confuse pre-acceptance state with structural readiness', () => {
  const workerProbe = readFileSync('scripts/ci/probe-production-workers.mjs', 'utf8');
  assert.match(workerProbe, /typeof report\.readyForAuthentication !== 'boolean'/);
  assert.match(workerProbe, /authenticatedAcceptanceProven && report\.readyForAuthentication !== true/);
  assert.match(workerProbe, /typeof body\.readyForAuthentication !== 'boolean'/);
  assert.match(workerProbe, /authenticatedAcceptanceProven && body\.readyForAuthentication !== true/);
  assert.match(adr003Harness, /worker\.readyForAuthentication === true/);
});

test('ADR-003 repeat runs verify existing privacy requests without weakening limits', () => {
  assert.match(adr003Harness, /async function existingPrivacyRequestAcceptance/);
  assert.match(adr003Harness, /result\.response\.status !== 429/);
  assert.match(adr003Harness, /privacy_request_active/);
  assert.match(adr003Harness, /export_cooldown_active/);
  assert.match(adr003Harness, /privacy\/requests\?requestType=/);
  assert.match(adr003Harness, /request\?\.requestType === requestType/);
  assert.match(adr003Harness, /acceptanceNote/);
});

test('candidate uploads preserve legacy secrets and scope new purpose-specific keys', () => {
  const scopedKeyLifecycle = readFileSync('scripts/ci/prepare-scoped-worker-secrets.mjs', 'utf8');
  assert.doesNotMatch(workersWorkflow, /wrangler@4\.123\.0 secret put DATABASE_READINESS_TOKEN/);
  assert.match(workersWorkflow, /DATABASE_READINESS_TOKEN: \$\{\{ secrets\.DATABASE_READINESS_TOKEN \}\}/);
  assert.doesNotMatch(workersWorkflow, /secrets\.PII_ENCRYPTION_KEY_V1|secrets\.PII_HMAC_KEY_V1|secrets\.ACCESS_SUBJECT_HMAC_KEY/);
  assert.match(scopedKeyLifecycle, /TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1/);
  assert.match(scopedKeyLifecycle, /AUTH_ACCEPTANCE_STATE_ENCRYPTION_KEY_V1/);
  assert.match(workersWorkflow, /public-secrets\.json/);
  assert.match(workersWorkflow, /jobs-secrets\.json/);
  assert.match(workersWorkflow, /coordinator-secrets\.json/);
  assert.match(workersWorkflow, /--secrets-file "\$secrets_file"/);
  assert.match(workersWorkflow, /secret list --name lythaus-public-api-development/);
  assert.match(workersWorkflow, /secret list --name lythaus-jobs-development/);
  assert.match(workersWorkflow, /secret list --name lythaus-auth-acceptance-coordinator-development/);
  assert.match(workersWorkflow, /prepare-scoped-worker-secrets\.mjs/);
  assert.match(workersWorkflow, /Prove staged Public and Jobs transactional-email key compatibility/);
  assert.doesNotMatch(workersWorkflow, /openssl rand -base64 32/);
  assert.match(workersWorkflow, /Stage candidate Worker versions at zero traffic/);
  assert.match(workersWorkflow, /versions deploy \$PUBLIC_ROLLBACK_SPECS "\$\{PUBLIC_WORKER_VERSION_ID\}@0"/);
  assert.match(workersWorkflow, /WORKER_STAGED/);
});

test('coordinator parent bootstrap is ordered before inventory and activation', () => {
  const providerPreflight = workersWorkflow.indexOf('Verify production schema read-only');
  const parentEnsure = workersWorkflow.indexOf('node scripts/ci/ensure-cloudflare-worker-parent.mjs\n          list_coordinator_secrets "$coordinator_secret_inventory"');
  const coordinatorInventory = workersWorkflow.indexOf('list_coordinator_secrets "$coordinator_secret_inventory"', parentEnsure);
  const candidateUpload = workersWorkflow.indexOf('versions upload --config "$config" --tag "$RELEASE_SHA"');
  const coordinatorActivation = workersWorkflow.indexOf('versions deploy "${COORDINATOR_WORKER_VERSION_ID}@100"');
  const keeperAcceptance = workersWorkflow.indexOf('Validate or create the exact-candidate Keeper acceptance run');
  const productionActivation = workersWorkflow.indexOf('Activate exact candidate Worker versions');

  assert.ok(providerPreflight >= 0);
  assert.ok(parentEnsure > providerPreflight);
  assert.ok(coordinatorInventory > parentEnsure && coordinatorInventory < parentEnsure + 300);
  assert.match(workersWorkflow, /node scripts\/ci\/ensure-cloudflare-worker-parent\.mjs\n\s+list_coordinator_secrets "\$coordinator_secret_inventory"/);
  assert.ok(candidateUpload > coordinatorInventory);
  assert.ok(coordinatorActivation > candidateUpload);
  assert.ok(keeperAcceptance > coordinatorActivation);
  assert.ok(productionActivation > keeperAcceptance);
  assert.doesNotMatch(workersWorkflow, /wrangler@4\.123\.0 deploy(?:\s|['"])/);
  assert.match(coordinatorParentHelper, /COORDINATOR_PARENT_EXISTED_BEFORE/);
  assert.match(coordinatorParentHelper, /COORDINATOR_PARENT_CREATED/);
  assert.match(workersWorkflow, /COORDINATOR_PREVIOUS_DEPLOYMENT_EXISTS/);
  assert.match(workersWorkflow, /COORDINATOR_ROUTE_TRIGGER_ATTEMPTED/);
  assert.match(workersWorkflow, /coordinator-route-before\.json/);
  const rollback = workersWorkflow.slice(workersWorkflow.indexOf('- name: Roll back partial Worker deployment on failure'));
  assert.ok(rollback.indexOf('AUTH_ACCEPTANCE_PENDING') < rollback.indexOf('COORDINATOR_ROUTE_TRIGGER_ATTEMPTED'));
  assert.match(rollback, /COORDINATOR_ROLLBACK_SPECS/);
  assert.match(rollback, /retaining the harmless parent\/version/);
  assert.match(rollback, /versions deploy \$COORDINATOR_ROLLBACK_SPECS/);
  assert.match(workersWorkflow, /Resolve the existing exact-candidate Worker versions for resume[\s\S]*coordinator-versions\.json/);
});

test('protected coordinator requests retry transient access rejection and fail closed', () => {
  assert.match(workersWorkflow, /coordinator_request\(\) \{[\s\S]*?case "\$status" in[\s\S]*?401\)[\s\S]*?sleep "\$attempt"[\s\S]*?Protected coordinator request failed with HTTP/);
  assert.match(workersWorkflow, /run_json="\$\(coordinator_request GET "\$base\/runs\/\$EXISTING_ACCEPTANCE_RUN_ID"\)"/);
  assert.match(workersWorkflow, /run_json="\$\(coordinator_request POST "\$base\/runs" "\$payload"\)"/);
  assert.doesNotMatch(workersWorkflow, /run_json="\$\(curl --fail[\s\S]*production-auth-acceptance/);
});

test('jobs remain probeable by version evidence without requiring a public hostname', () => {
  const probe = readFileSync('scripts/ci/probe-production-workers.mjs', 'utf8');
  assert.match(probe, /worker: 'lythaus-jobs-development',[\s\S]*probe: false/);
  assert.match(probe, /not_applicable_no_public_route/);
  assert.match(probe, /probe && !baseUrl/);
});

test('candidate probes pin the production database role contract and name mismatches', () => {
  assert.equal((workersWorkflow.match(/EXPECTED_DATABASE_TARGET: main/g) ?? []).length, 3);
  assert.equal((workersWorkflow.match(/EXPECTED_DATABASE_ROLE_CLASS: login_non_superuser/g) ?? []).length, 3);
  assert.match(readFileSync('scripts/ci/probe-production-workers.mjs', 'utf8'), /structural identity probe failed: \$\{mismatches\.join\('\,'\)\}/);
});

test('admin candidate probe authenticates the Access-protected API route', () => {
  const probe = readFileSync('scripts/ci/probe-production-workers.mjs', 'utf8');
  assert.match(probe, /CF-Access-Client-Id/);
  assert.match(probe, /CF-Access-Client-Secret/);
  const adminProbe = workersWorkflow.match(/- name: Probe admin candidate[\s\S]*?run: node scripts\/ci\/probe-production-workers\.mjs/)?.[0] ?? '';
  assert.match(adminProbe, /CF_ACCESS_CLIENT_ID: \$\{\{ secrets\.CF_ACCESS_CLIENT_ID \}\}/);
  assert.match(adminProbe, /CF_ACCESS_CLIENT_SECRET: \$\{\{ secrets\.CF_ACCESS_CLIENT_SECRET \}\}/);
});

test('production smoke authenticates the Access-protected admin API health check', () => {
  const smokeSection = workflow.match(/\n  production_smoke:[\s\S]*?\n  manifest:/)?.[0] ?? '';
  assert.match(smokeSection, /ADMIN_API_URL%\/\}\}\/health|ADMIN_API_URL%\/\}\/health/);
  assert.match(smokeSection, /CF-Access-Client-Id: \$\{CF_ACCESS_CLIENT_ID\}/);
  assert.match(smokeSection, /CF-Access-Client-Secret: \$\{CF_ACCESS_CLIENT_SECRET\}/);
});

test('Pages deployment verification uses the supported inventory page size', () => {
  assert.match(pagesVerifier, /\/deployments\?per_page=25/);
  assert.doesNotMatch(pagesVerifier, /\/deployments\?per_page=100/);
});
