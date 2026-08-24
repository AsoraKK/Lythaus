import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-release.yml', 'utf8');
const webWorkflow = readFileSync('.github/workflows/deploy-alpha-web.yml', 'utf8');
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

test('production release models private-plan compensating governance', () => {
  assert.doesNotMatch(workflow, /REF_PROTECTED/);
  assert.match(workflow, /test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /required_approving_review_count\s*>=\s*1/);
  assert.match(workflow, /UNAVAILABLE_BY_PLAN/);
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
  assert.doesNotMatch(workflow, /REF_PROTECTED/);
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

test('production Pages deployment is protected separately from dev-scoped synthetic smoke credentials', () => {
  assert.match(workflow, /target_environment: production/);
  assert.match(webWorkflow, /deploy-and-smoke:[\s\S]*environment: \$\{\{ inputs\.target_environment == 'production' && 'production'/);
  assert.match(webWorkflow, /browser-smoke:[\s\S]*environment: dev/);
  assert.match(webWorkflow, /RUNTIME_AUTH_EMAIL: \$\{\{ secrets\.MVP_SMOKE_EMAIL \}\}/);
  assert.match(webWorkflow, /RUNTIME_AUTH_PASSWORD: \$\{\{ secrets\.MVP_SMOKE_PASSWORD \}\}/);
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
