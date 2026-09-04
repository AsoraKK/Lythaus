import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs';
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
  assert.match(smokeSection, /if: always\(\)/);
  assert.match(manifestSection, /if: always\(\)/);
});

test('every production deployment entrypoint remains bound to exact CI and security evidence', () => {
  for (const source of [workersWorkflow, readFileSync('.github/workflows/deploy-marketing.yml', 'utf8'), webWorkflow, readFileSync('.github/workflows/deploy-control-panel.yml', 'utf8')]) {
    assert.match(source, /verify-exact-release-evidence\.mjs/);
  }
  assert.match(workersWorkflow, /ci_run_id:/);
  assert.match(workflow, /ci_run_id: \$\{\{ inputs\.ci_run_id \}\}/);
  assert.match(workflow, /historical_reconciliation_run_id: \$\{\{ inputs\.historical_reconciliation_run_id \}\}/);
});

test('canonical parent reuses exact source evidence without weakening direct dispatch', () => {
  const childWorkflows = [
    ['marketing', readFileSync('.github/workflows/deploy-marketing.yml', 'utf8')],
    ['alpha web', webWorkflow],
    ['control panel', readFileSync('.github/workflows/deploy-control-panel.yml', 'utf8')],
    ['native Workers', workersWorkflow],
  ];
  for (const [, source] of childWorkflows) {
    assert.match(source, /source_evidence_verified:[\s\S]*default: false/);
    assert.match(source, /if: .*source_evidence_verified != true/);
    assert.match(source, /verify-exact-release-evidence\.mjs/);
  }
  for (const [name, source] of childWorkflows) {
    const dispatch = source.slice(source.indexOf('workflow_dispatch:'), source.indexOf('workflow_call:'));
    assert.doesNotMatch(dispatch, /source_evidence_verified:/, `${name} direct dispatch must not accept parent evidence`);
  }
  assert.match(workflow, /source_evidence_verified: true/);
});

test('the exact CI run publishes the immutable artifact consumed by production release', () => {
  assert.match(ciWorkflow, /actions\/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f/);
  assert.match(ciWorkflow, /name: flutter-web-release/);
  assert.match(ciWorkflow, /path: build\/web/);
  assert.match(ciWorkflow, /if-no-files-found: error/);
});

test('browser smoke is opt-in convenience and retains production credentials when requested', () => {
  assert.match(workflow, /target_environment: production/);
  assert.match(workflow, /api_base_url: https:\/\/api\.lythaus\.co\/api/);
  assert.match(webWorkflow, /deploy-and-smoke:[\s\S]*environment: \$\{\{ inputs\.target_environment == 'production' && 'production'/);
  assert.match(webWorkflow, /run_browser_smoke:[\s\S]*default: false/);
  assert.match(webWorkflow, /security_run_ids_json:[\s\S]*default: '\{\}'/);
  assert.match(webWorkflow, /browser-smoke:[\s\S]*if: inputs\.run_browser_smoke == true/);
  assert.match(webWorkflow, /browser-smoke:[\s\S]*environment: \$\{\{ inputs\.target_environment == 'production' && 'production'/);
  assert.match(webWorkflow, /RUNTIME_AUTH_EMAIL: \$\{\{ inputs\.target_environment == 'production' && secrets\.CODEX_TEST_EMAIL \|\| secrets\.MVP_SMOKE_EMAIL \}\}/);
  assert.match(webWorkflow, /RUNTIME_AUTH_PASSWORD: \$\{\{ inputs\.target_environment == 'production' && secrets\.CODEX_TEST_PASSWORD \|\| secrets\.MVP_SMOKE_PASSWORD \}\}/);
  assert.doesNotMatch(workflow, /run_browser_smoke:/);
  assert.match(workflow, /security_run_ids_json:/);
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
  assert.match(workersWorkflow, /test -n "\$PUBLIC_WORKER_CREATED_AT" && test -n "\$ADR003_CANDIDATE_STAGED_AT"/);
  assert.doesNotMatch(workersWorkflow, /test -n "\$PUBLIC_WORKER_CREATED_AT" && test -n "\$CANDIDATE_STAGED_AT"/);
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

test('ADR-003 accepts coordinator-generated UUIDv7 acceptance runs', () => {
  assert.match(adr003Harness, /\[1-8\]\[0-9a-f\]\{3\}/);
  assert.doesNotMatch(adr003Harness, /\[1-5\]\[0-9a-f\]\{3\}/);
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
  assert.match(workersWorkflow, /Existing acceptance run lacks exact candidate dependency provenance; creating a fresh run/);
  assert.match(workersWorkflow, /\.status == "completed"/);
  assert.match(workersWorkflow, /JOBS_WORKER_VERSION_ID\}@100/);
  assert.match(workersWorkflow, /CF-Access-Client-Id/);
  assert.match(productionWorkflow, /acceptance_run_id/);
  assert.match(productionWorkflow, /force_auth_critical/);
  assert.match(productionWorkflow, /changed_components_json/);
  assert.doesNotMatch(productionWorkflow, /authenticated_acceptance_proven == 'true'/);
});

test('STANDARD_RELEASE bypasses human acceptance and reuses an unchanged Coordinator', () => {
  const acceptanceSteps = [
    'Validate or create the exact-candidate Keeper acceptance run (PRODUCT_ACCEPTANCE gate)',
    'PRODUCT_ACCEPTANCE - Collect generated candidate auth acceptance evidence',
    'PRODUCT_ACCEPTANCE - Run authenticated acceptance against public candidate',
    'PRODUCT_ACCEPTANCE - Require generated candidate auth acceptance',
  ];
  for (const name of acceptanceSteps) {
    const start = workersWorkflow.indexOf(`- name: ${name}`);
    const end = workersWorkflow.indexOf('\n      - name:', start + 1);
    const section = workersWorkflow.slice(start, end === -1 ? undefined : end);
    assert.ok(start >= 0, `${name} must remain in the certification plane`);
    assert.match(section, /if:[^\n]*steps\.release_plan\.outputs\.release_class == 'AUTH_CRITICAL_RELEASE'/);
  }
  assert.match(workersWorkflow, /- name: PRODUCT_ACCEPTANCE - Mark standard acceptance not required\n\s+if: steps\.release_plan\.outputs\.release_class == 'STANDARD_RELEASE'/);
  assert.match(workersWorkflow, /if component_changed coordinator; then upload_candidate/);
  assert.match(workersWorkflow, /if component_changed coordinator; then list_coordinator_secrets/);
  assert.match(workersWorkflow, /if component_changed coordinator; then echo "COORDINATOR_WORKER_STATUS=ACTIVATED"/);
  assert.match(workersWorkflow, /SKIP_ACCEPTANCE_COORDINATOR="\$\(if component_changed coordinator; then echo false; else echo true; fi\)"/);
  assert.match(workersWorkflow, /Reverify scoped secret evidence for acceptance resume/);
  assert.match(workersWorkflow, /write-scoped-worker-secret-evidence\.mjs/);
  assert.match(workersWorkflow, /acceptance rollback snapshot/i);
  assert.match(workersWorkflow, /COORDINATOR_WORKER_DEPLOYED=true/);
  assert.match(workersWorkflow, /\$RUNNER_TEMP\/production-cutover\/\$\{component\}-before\.json/);
  const preservedSnapshot = workersWorkflow.slice(
    workersWorkflow.indexOf('- name: Preserve exact acceptance rollback snapshot across human windows'),
    workersWorkflow.indexOf('- name: Reverify scoped secret evidence for acceptance resume'),
  );
  assert.match(preservedSnapshot, /component_changed\(\)/);
  assert.match(preservedSnapshot, /JOBS_WORKER_DEPLOYED=true/);
  assert.match(preservedSnapshot, /COORDINATOR_WORKER_DEPLOYED=true/);
  assert.doesNotMatch(preservedSnapshot, /candidate_dependencies/);
  assert.match(workersWorkflow, /Validate final production gates before activation[\s\S]*RELEASE_CLASS: \$\{\{ steps\.release_plan\.outputs\.release_class \}\}/);
});

test('candidate readiness completes before product acceptance begins', () => {
  const publicProbe = workersWorkflow.indexOf('- name: Probe public candidate without production traffic (CANDIDATE gate)');
  const adminProbe = workersWorkflow.indexOf('- name: Probe admin candidate without production traffic (CANDIDATE gate)');
  const jobsProbe = workersWorkflow.indexOf('- name: Probe jobs candidate without production traffic (CANDIDATE gate)');
  const candidateReady = workersWorkflow.indexOf('- name: Mark candidates ready after candidate probes (CANDIDATE gate)');
  const keeper = workersWorkflow.indexOf('- name: Validate or create the exact-candidate Keeper acceptance run (PRODUCT_ACCEPTANCE gate)');
  const acceptanceObservation = workersWorkflow.indexOf('- name: PRODUCT_ACCEPTANCE - Collect generated candidate auth acceptance evidence');

  assert.ok(publicProbe >= 0 && adminProbe > publicProbe && jobsProbe > adminProbe);
  assert.ok(candidateReady > jobsProbe);
  assert.ok(keeper > candidateReady);
  assert.ok(acceptanceObservation > keeper);
  assert.equal((workersWorkflow.match(/CANDIDATE_STATE=CANDIDATE_READY/g) ?? []).length, 1);
});

test('runtime verification does not depend on certification observer availability', () => {
  assert.doesNotMatch(publicApiRuntime, /AUTH_ACCEPTANCE_PUBLIC_API_URL|production-auth-acceptance\/observer|delivery observer/);
  assert.match(publicApiRuntime, /acceptanceContext\(request, env\)/);
  assert.match(publicApiRuntime, /expires_at > now\(\)/);
});

test('canonical manifest finalizes VERIFIED or BLOCKED after production smoke', () => {
  assert.match(workflow, /- name: Finalize post-activation release state\n\s+id: verified_state\n\s+if: always\(\)/);
  assert.match(workflow, /resolve-release-failure-domain\.mjs/);
  assert.match(workflow, /transition-release-state\.mjs VERIFIED/);
  assert.match(workflow, /transition-release-state\.mjs BLOCKED/);
  assert.match(workflow, /RELEASE_STATE_HISTORY_JSON: \$\{\{ steps\.verified_state\.outputs\.history_json \|\| '\[\]' \}\}/);
});

test('canonical manifest retains the exact deterministic release plan provenance', () => {
  assert.match(workflow, /changed_files_json: \$\{\{ steps\.release_plan\.outputs\.changed_files_json \}\}/);
  assert.match(workflow, /PREVIOUS_PRODUCTION_SHA: \$\{\{ inputs\.previous_production_sha \}\}/);
  assert.match(workflow, /classification_rules_version: \$\{\{ steps\.release_plan\.outputs\.classification_rules_version \}\}/);
  assert.match(workflow, /CHANGED_FILES_JSON: \$\{\{ needs\.preflight\.outputs\.changed_files_json \}\}/);
  assert.match(workflow, /RELEASE_CLASSIFICATION_RULES_VERSION: \$\{\{ needs\.preflight\.outputs\.classification_rules_version \}\}/);
  assert.match(workflow, /FORCE_AUTH_CRITICAL: \$\{\{ needs\.preflight\.outputs\.force_auth_critical \}\}/);
});

test('the canonical v2 manifest has no competing push-triggered manifest workflow', () => {
  assert.equal(fs.existsSync('.github/workflows/release-manifest.yml'), false);
  assert.match(workflow, /build-release-manifest\.mjs/);
});

test('failed or paused Worker releases still export exact candidate metadata', () => {
  const rollback = workersWorkflow.indexOf('- name: Roll back partial Worker deployment on failure');
  const metadata = workersWorkflow.indexOf('- name: Export candidate, reuse, and final activation metadata');
  assert.ok(metadata > rollback, 'final metadata must be collected after rollback/failure handling');
  assert.match(workersWorkflow.slice(metadata), /id: release_metadata\n\s+if: always\(\)/);
  assert.match(workersWorkflow.slice(metadata), /acceptance_run_id=\$\{AUTH_ACCEPTANCE_RUN_ID:-\}/);
  assert.match(workersWorkflow.slice(metadata), /acceptance_dependencies_json=\$\{AUTH_ACCEPTANCE_DEPENDENCIES_JSON:-\}/);
  assert.match(workersWorkflow.slice(metadata), /failure_domain_evidence_json=\$\{FAILURE_DOMAIN_EVIDENCE_JSON:-\[\]\}/);
  assert.match(workersWorkflow.slice(metadata), /rollback_state=\$\{ROLLBACK_STATE:-READY\}/);
});

test('cancelled Worker releases enter failure classification and rollback', () => {
  const failure = workersWorkflow.slice(workersWorkflow.indexOf('- name: Classify release failure domain'), workersWorkflow.indexOf('- name: Export candidate, reuse, and final activation metadata'));
  const cancellationGuards = failure.match(/if: \$\{\{ always\(\) && \(failure\(\) \|\| cancelled\(\)\) \}\}/g) ?? [];
  assert.equal(cancellationGuards.length, 2);
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
  const candidateAcceptance = workersWorkflow.match(/- name: .*Run authenticated acceptance against public candidate[\s\S]*?npm run acceptance:adr003/)?.[0] ?? '';
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

test('staged transactional-email compatibility probe retries transient failures and fails closed', () => {
  const start = workersWorkflow.indexOf('- name: Prove staged Public and Jobs transactional-email key compatibility');
  const end = workersWorkflow.indexOf('- name: Validate or create the exact-candidate Keeper acceptance run', start);
  const probe = workersWorkflow.slice(start, end);

  assert.match(probe, /compatible=false/);
  assert.match(probe, /for attempt in 1 2 3 4 5/);
  assert.match(probe, /--output "\$response"/);
  assert.match(probe, /--write-out '%\{http_code\}'/);
  assert.match(probe, /curl_exit=\$\?/);
  assert.match(probe, /http_status/);
  assert.match(probe, /sleep "\$\(\(attempt \* 2\)\)"/);
  assert.match(probe, /HTTP \$\{http_status\}; failing closed/);
  assert.match(probe, /remained unavailable after bounded retries; failing closed/);
  assert.match(probe, /\.publicWorkerVersionId == \$public/);
  assert.match(probe, /\.jobsWorkerVersionId == \$jobs/);
  assert.match(probe, /\.publicReleaseTag == \$public_sha/);
  assert.match(probe, /\.jobsReleaseTag == \$jobs_sha/);
  assert.match(probe, /lythaus-jobs-development=\\\"\$\{JOBS_WORKER_VERSION_ID\}\\\"/);
  assert.doesNotMatch(probe, /curl --fail/);
});

test('coordinator parent bootstrap is ordered before inventory and activation', () => {
  const infrastructureCapture = workersWorkflow.indexOf('Capture predeployment Worker state');
  const parentEnsure = workersWorkflow.indexOf('node scripts/ci/ensure-cloudflare-worker-parent.mjs --check-only');
  const coordinatorInventory = workersWorkflow.indexOf('list_coordinator_secrets "$coordinator_secret_inventory"', parentEnsure);
  const candidateUpload = workersWorkflow.indexOf('versions upload --config "$config" --tag "$RELEASE_SHA"');
  const coordinatorActivation = workersWorkflow.indexOf('versions deploy "${COORDINATOR_WORKER_VERSION_ID}@100"');
  const keeperAcceptance = workersWorkflow.indexOf('Validate or create the exact-candidate Keeper acceptance run');
  const productionActivation = workersWorkflow.indexOf('Activate exact candidate Worker versions');

  assert.ok(infrastructureCapture >= 0);
  assert.ok(parentEnsure > infrastructureCapture);
  assert.ok(coordinatorInventory > parentEnsure && coordinatorInventory < candidateUpload);
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
  assert.match(workersWorkflow, /prepare-acceptance-rollback-snapshot\.mjs/);
  assert.match(workersWorkflow, /from-run/);
  assert.match(workersWorkflow, /ACCEPTANCE_ROLLBACK_SNAPSHOT_PATH/);
  assert.match(workersWorkflow, /refusing to resume it/);
  const rollback = workersWorkflow.slice(workersWorkflow.indexOf('- name: Roll back partial Worker deployment on failure'));
  assert.ok(rollback.indexOf('AUTH_ACCEPTANCE_PENDING') < rollback.indexOf('COORDINATOR_ROUTE_TRIGGER_ATTEMPTED'));
  assert.match(rollback, /COORDINATOR_ROLLBACK_SPECS/);
  assert.match(rollback, /retaining the harmless parent\/version/);
  assert.match(rollback, /versions deploy \$COORDINATOR_ROLLBACK_SPECS/);
  assert.match(workersWorkflow, /Capture predeployment Worker state[\s\S]*coordinator-before-versions\.json/);
  assert.match(workersWorkflow, /Resolve changed candidates and reused production versions \(CANDIDATE gate\)/);
});

test('release rollback capture preserves serving traffic beside staged candidates', () => {
  const resolver = readFileSync('scripts/ci/resolve-worker-version-state.mjs', 'utf8');
  const capture = workersWorkflow.slice(
    workersWorkflow.indexOf('- name: Capture predeployment Worker state'),
    workersWorkflow.indexOf('- name: Upload immutable public Worker candidate'),
  );
  const rollback = workersWorkflow.slice(workersWorkflow.indexOf('- name: Roll back partial Worker deployment on failure'));

  assert.match(capture, /resolve-worker-version-state\.mjs rollback/);
  assert.match(resolver, /const activeVersions = validatedVersions\.filter/);
  assert.match(resolver, /const zeroTrafficVersions = validatedVersions\.filter/);
  assert.match(resolver, /const activeTrafficTotal = activeVersions\.reduce/);
  assert.match(resolver, /const specs = activeVersions\.map/);
  assert.doesNotMatch(resolver, /percentage <= 0/);
  assert.match(rollback, /versions deploy \$PUBLIC_ROLLBACK_SPECS/);
  assert.match(rollback, /versions deploy \$ADMIN_ROLLBACK_SPECS/);
  assert.match(rollback, /versions deploy \$JOBS_ROLLBACK_SPECS/);
  assert.doesNotMatch(rollback, /versions deploy[^\n]*@0/);
  assert.match(workersWorkflow, /versions deploy \$PUBLIC_ROLLBACK_SPECS "\$\{PUBLIC_WORKER_VERSION_ID\}@0"/);
  assert.match(workersWorkflow, /versions deploy \$ADMIN_ROLLBACK_SPECS "\$\{ADMIN_WORKER_VERSION_ID\}@0"/);
});

test('predeployment provenance fetches exact active versions beyond the recent list', () => {
  assert.match(workersWorkflow, /versions view "\$version_id" --name "\$worker_name" --json/);
  assert.match(workersWorkflow, /merge-worker-version-metadata\.mjs/);
  assert.match(workersWorkflow, /ROLLBACK_ARTIFACTS_PROVEN=true/);
});

test('always-run acceptance checks cannot overwrite an earlier gate failure', () => {
  const start = workersWorkflow.indexOf('- name: PRODUCT_ACCEPTANCE - Require generated candidate auth acceptance');
  const end = workersWorkflow.indexOf('- name: INFRASTRUCTURE - Reverify production schema before activation', start);
  const section = workersWorkflow.slice(start, end);
  assert.match(workersWorkflow, /id: preserve_prior_gate_failure\n\s+if: \$\{\{ failure\(\) && steps\.auth_acceptance_observation\.outcome != 'failure' \}\}/);
  assert.match(section, /PRIOR_GATE_FAILURE:-false.*OBSERVER_OUTCOME.*failure/s);
  assert.match(workersWorkflow, /No complete rollback snapshot was proven; production was left untouched\./);
});

test('Admin-only Worker changes prepare and verify the Admin candidate secret boundary', () => {
  const uploadSegment = workersWorkflow.slice(
    workersWorkflow.indexOf('- name: Upload immutable public Worker candidate'),
    workersWorkflow.indexOf('- name: Resolve changed candidates and reused production versions'),
  );
  assert.match(uploadSegment, /if component_changed public \|\| component_changed admin \|\| component_changed jobs \|\| component_changed coordinator/);
  assert.match(uploadSegment, /if component_changed admin; then upload_candidate apps\/lythaus-admin-api\/wrangler\.jsonc/);
  assert.match(uploadSegment, /verify-scoped-worker-secret-bindings\.mjs/);
  assert.match(workersWorkflow, /if component_changed public \|\| component_changed jobs \|\| component_changed coordinator; then\n\s+test -s "\$scoped_key_evidence"/);
  assert.match(workersWorkflow, /if component_changed public \|\| component_changed admin \|\| component_changed jobs \|\| component_changed coordinator; then\n\s+test -s "\$scoped_binding_evidence"/);
  assert.match(workersWorkflow, /inputs\.acceptance_run_id != ''.*contains\(steps\.release_plan\.outputs\.changed_components_json, '\"admin\"'\)/s);
});

test('parent rollback restores only changed components after downstream failure', () => {
  const rollback = workflow.match(/\n  rollback:[\s\S]*?\n  manifest:/)?.[0] ?? '';
  assert.match(rollback, /needs: \[preflight, provider_evidence, marketing, web, admin, workers, production_smoke\]/);
  assert.match(rollback, /needs\.workers\.result == 'success'/);
  assert.match(rollback, /Download exact predeployment rollback snapshots/);
  assert.match(rollback, /rollback-pages-deployment\.mjs/);
  assert.match(rollback, /PAGES_PRODUCTION_STATE_JSON/);
  for (const component of ['public', 'admin', 'jobs', 'coordinator']) {
    assert.match(rollback, new RegExp(`if component_changed ${component}; then`));
  }
  for (const component of ['marketing', 'flutter-web', 'control-panel']) {
    assert.match(rollback, new RegExp(`if component_changed ${component} && \\[\\[`));
  }
  assert.match(rollback, /local expected_branch="\$3"/);
  assert.match(rollback, /restore_page flutter-web lythaus-web .*needs\.preflight\.outputs\.web_pages_branch/);
  assert.match(rollback, /ROLLBACK_FAILED=/);
  assert.match(rollback, /component_rollback_failed/);
  assert.match(workflow, /ROLLBACK_RESULT: \$\{\{ needs\.rollback\.result \}\}/);
  assert.match(workflow, /rollback_components_json: \$\{\{ steps\.rollback_finalize\.outputs\.rollback_components_json \}\}/);
});

test('protected coordinator requests retry transient access rejection and fail closed', () => {
  assert.match(workersWorkflow, /base='https:\/\/admin\.lythaus\.co\/api\/admin\/production-auth-acceptance'\n\s+coordinator_response_file="\$RUNNER_TEMP\/production-cutover\/coordinator-request\.json"/);
  assert.match(workersWorkflow, /-H "x-lythaus-readiness-token: \$\{DATABASE_READINESS_TOKEN\}"/);
  assert.match(workersWorkflow, /coordinator_request\(\) \{[\s\S]*?case "\$status" in[\s\S]*?401\)[\s\S]*?sleep "\$attempt"[\s\S]*?Protected coordinator request failed with HTTP/);
  assert.match(workersWorkflow, /run_json="\$\(coordinator_request GET "\$base\/runs\/\$EXISTING_ACCEPTANCE_RUN_ID"\)"/);
  assert.match(workersWorkflow, /EXISTING_ACCEPTANCE_RUN_ID.*\[1-8\]/);
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
  const adminProbeStart = workersWorkflow.indexOf('- name: Probe admin candidate');
  const adminProbeEnd = workersWorkflow.indexOf('\n      - name:', adminProbeStart + 1);
  const adminProbe = workersWorkflow.slice(adminProbeStart, adminProbeEnd === -1 ? undefined : adminProbeEnd);
  assert.match(adminProbe, /CF_ACCESS_CLIENT_ID: \$\{\{ secrets\.CF_ACCESS_CLIENT_ID \}\}/);
  assert.match(adminProbe, /CF_ACCESS_CLIENT_SECRET: \$\{\{ secrets\.CF_ACCESS_CLIENT_SECRET \}\}/);
  assert.match(adminProbe, /export PRODUCTION_WORKER_VERSION_ID="\$ADMIN_WORKER_VERSION_ID"/);
  assert.match(adminProbe, /node scripts\/ci\/probe-production-workers\.mjs/);
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
