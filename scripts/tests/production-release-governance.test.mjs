import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-release.yml', 'utf8');
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

test('production release models solo-founder branch protection', () => {
  assert.match(workflow, /REF_PROTECTED: \$\{\{ github\.ref_protected \}\}/);
  assert.match(workflow, /test "\$REF_PROTECTED" = 'true'/);
  assert.doesNotMatch(workflow, /required_approving_review_count\s*>=\s*1/);
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
  assert.match(workflow, /branch_protection_verified=true/);
});

test('release preflight uses readable Actions evidence and fail-closed fanout', () => {
  assert.match(workflow, /REF_PROTECTED: \$\{\{ github\.ref_protected \}\}/);
  assert.match(workflow, /test "\$REF_PROTECTED" = 'true'/);
  assert.match(workflow, /get_public_run\(\)/);
  assert.match(workflow, /actions\/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093/);
  assert.match(workflow, /security-run-evidence-CodeQL-\$\{\{ inputs\.release_sha \}\}/);
  assert.match(workflow, /security-run-evidence-Dependency-review-\$\{\{ inputs\.release_sha \}\}/);
  assert.match(workflow, /security-run-evidence-Native-secret-scan-\$\{\{ inputs\.release_sha \}\}/);
  assert.match(workflow, /CodeQL\|\$\{CODEQL_RUN_ID\}/);
  assert.match(workflow, /Dependency review\|\$\{DEPENDENCY_REVIEW_RUN_ID\}/);
  assert.match(workflow, /Native secret scan\|\$\{SECRET_SCAN_RUN_ID\}/);
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

test('Pages deployment verification uses the supported inventory page size', () => {
  assert.match(pagesVerifier, /\/deployments\?per_page=25/);
  assert.doesNotMatch(pagesVerifier, /\/deployments\?per_page=100/);
});
