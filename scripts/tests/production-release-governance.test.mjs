import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-release.yml', 'utf8');
const webWorkflow = readFileSync('.github/workflows/deploy-alpha-web.yml', 'utf8');
const workersWorkflow = readFileSync('.github/workflows/native-workers-deploy.yml', 'utf8');
const adr003Workflow = readFileSync('.github/workflows/native-adr003-acceptance.yml', 'utf8');
const adr003Harness = readFileSync('scripts/ci/run-adr003-authenticated-acceptance.mjs', 'utf8');
const runtimeAuth = readFileSync('scripts/release/runtime-authenticated-command.mjs', 'utf8');
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const pagesVerifier = readFileSync('scripts/cloudflare/verify-pages-deployment.mjs', 'utf8');

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

test('ADR-003 uses the canonical API base and keeps mobile acceptance separate', () => {
  assert.match(adr003Workflow, /default: https:\/\/api\.lythaus\.co\/api/);
  assert.match(adr003Workflow, /ADR003_TEST_EMAIL: \$\{\{ secrets\.CODEX_TEST_EMAIL \}\}/);
  assert.match(adr003Workflow, /ADR003_TEST_PASSWORD: \$\{\{ secrets\.CODEX_TEST_PASSWORD \}\}/);
  const a20 = adr003Harness.match(/await runCase\('A20',[\s\S]*?\n\}\);/)?.[0] ?? '';
  assert.match(a20, /ADR003_WEB_EMAIL_ACCEPTED/);
  assert.doesNotMatch(a20, /ADR003_MOBILE_EMAIL_ACCEPTED/);
  assert.match(adr003Harness, /mobileEmailFlow: process\.env\.ADR003_MOBILE_EMAIL_ACCEPTED === 'true'/);
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
  assert.match(adr003Harness, /expectStatus\(result, \[400, 401\], 'refresh_replay'\)/);
  assert.match(adr003Harness, /body\?\.postId[\s\S]*body\?\.id/);
  assert.match(browserSmoke, /clickVisibleText\(page, ocrWorker, 'Continue as guest'\)/);
  assert.match(browserSmoke, /worker\.recognize\(image, \{\}, \{ blocks: true \}\)/);
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

test('Worker readiness secrets are included in each immutable candidate upload', () => {
  assert.doesNotMatch(workersWorkflow, /wrangler@4\.123\.0 secret put DATABASE_READINESS_TOKEN/);
  assert.match(workersWorkflow, /DATABASE_READINESS_TOKEN: \$\{\{ secrets\.DATABASE_READINESS_TOKEN \}\}/);
  assert.match(workersWorkflow, /secrets_file="\$RUNNER_TEMP\/production-cutover\/worker-secrets\.json"/);
  assert.match(workersWorkflow, /--secrets-file "\$secrets_file"/);
  assert.match(workersWorkflow, /trap 'rm -f "\$secrets_file"' EXIT/);
  assert.match(workersWorkflow, /Stage candidate Worker versions at zero traffic/);
  assert.match(workersWorkflow, /versions deploy \$PUBLIC_ROLLBACK_SPECS "\$\{PUBLIC_WORKER_VERSION_ID\}@0"/);
  assert.match(workersWorkflow, /WORKER_STAGED/);
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
