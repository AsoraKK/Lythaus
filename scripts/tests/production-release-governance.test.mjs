import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-release.yml', 'utf8');

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
  assert.match(workflow, /\.required_status_checks != null/);
  assert.match(workflow, /\(\(\.required_status_checks\.contexts \| length\) > 0\)/);
  assert.match(workflow, /\.required_pull_request_reviews != null/);
  assert.match(workflow, /\.required_pull_request_reviews\.required_approving_review_count == 0/);
  assert.match(workflow, /\(\(\.required_pull_request_reviews\.require_last_push_approval \/\/ false\) == false\)/);
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
});

test('governance retains required checks and destructive-action protections', () => {
  const requiredExpressions = [
    /\.enforce_admins\.enabled == true/,
    /\.required_linear_history\.enabled == true/,
    /\.allow_force_pushes\.enabled == false/,
    /\.allow_deletions\.enabled == false/,
    /\.required_conversation_resolution\.enabled == true/,
  ];

  for (const expression of requiredExpressions) assert.match(workflow, expression);
});

test('release preflight uses readable Actions evidence and fail-closed fanout', () => {
  assert.match(workflow, /get_public_run\(\)/);
  assert.match(workflow, /actions\/runs\/\$\{HISTORICAL_RECONCILIATION_RUN_ID\}\/artifacts/);
  assert.match(workflow, /actions\/artifacts\/\$\{artifact_id\}\/zip/);
  assert.match(workflow, /artifact_name="historical-branch-reconciliation-\$\{RELEASE_SHA\}"/);
  assert.match(workflow, /CodeQL\|\$\{CODEQL_RUN_ID\}/);
  assert.match(workflow, /Dependency review\|\$\{DEPENDENCY_REVIEW_RUN_ID\}/);
  assert.match(workflow, /Native secret scan\|\$\{SECRET_SCAN_RUN_ID\}/);
  assert.doesNotMatch(workflow, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/actions\/runs/);
  assert.doesNotMatch(workflow, /gh run download/);
  assert.doesNotMatch(workflow, /actions\/runs\?head_sha=/);
  assert.doesNotMatch(workflow, /commits\/\$\{RELEASE_SHA\}\/check-runs/);

  const smokeSection = workflow.match(/\n  production_smoke:[\s\S]*?\n  manifest:/)?.[0] ?? '';
  const manifestSection = workflow.match(/\n  manifest:[\s\S]*/)?.[0] ?? '';
  assert.doesNotMatch(smokeSection, /if: always\(\)/);
  assert.doesNotMatch(manifestSection, /if: always\(\)/);
});
