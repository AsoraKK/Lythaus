import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const productionRelease = fs.readFileSync('.github/workflows/production-release.yml', 'utf8');
const nativeWorkers = fs.readFileSync('.github/workflows/native-workers-deploy.yml', 'utf8');
const policy = fs.readFileSync('apps/lythaus-admin-api/src/solo-recovery/diagnostic-policy.ts', 'utf8');
const generatedDefault = fs.readFileSync('apps/lythaus-admin-api/src/solo-recovery/diagnostic-policy.generated.ts', 'utf8');
const readOnlyRuntime = fs.readFileSync('.github/workflows/admin-runtime-target-pass-fail.yml', 'utf8');

test('diagnostic remains disabled by default and only canonical production release can opt in', () => {
  assert.match(generatedDefault, /COMPILED_SUBJECT_DIAGNOSTIC_POLICY:[\s\S]*= null/);
  assert.match(policy, /validateSubjectDiagnosticPolicy/);
  const dispatchInputs = productionRelease.match(/^  workflow_dispatch:\n    inputs:\n([\s\S]*?)(?=^permissions:)/m)?.[1] ?? '';
  assert.equal([...dispatchInputs.matchAll(/^      [a-z_]+:$/gm)].length, 10);
  assert.doesNotMatch(dispatchInputs, /enable_subject_diagnostic/);
  for (const mode of ['automatic', 'automatic_subject_diagnostic', 'force_auth_critical', 'force_auth_critical_subject_diagnostic', 'owner_testing', 'owner_testing_native_recovery_exception', 'owner_testing_subject_diagnostic_exception']) {
    assert.match(dispatchInputs, new RegExp(`^\\s*- ${mode}$`, 'm'));
  }
  assert.match(productionRelease, /enable_subject_diagnostic: \$\{\{ inputs\.release_mode == 'automatic_subject_diagnostic' \|\| inputs\.release_mode == 'force_auth_critical_subject_diagnostic' \|\| inputs\.release_mode == 'owner_testing_subject_diagnostic_exception' \}\}/);
  assert.doesNotMatch(productionRelease, /inputs\.release_mode != 'automatic'/);
  assert.match(productionRelease, /FORCE_AUTH_CRITICAL: \$\{\{ inputs\.release_mode == 'force_auth_critical' \|\| inputs\.release_mode == 'force_auth_critical_subject_diagnostic' \|\| inputs\.release_mode == 'owner_testing' \|\| inputs\.release_mode == 'owner_testing_native_recovery_exception' \|\| inputs\.release_mode == 'owner_testing_subject_diagnostic_exception' \}\}/);
  assert.doesNotMatch(productionRelease, /FORCE_AUTH_CRITICAL: \$\{\{[^\n]*automatic_subject_diagnostic/);
  const nativeDispatchInputs = nativeWorkers.split('  workflow_call:')[0];
  assert.doesNotMatch(nativeDispatchInputs, /enable_subject_diagnostic/);
  assert.match(nativeWorkers.split('  workflow_call:')[1], /enable_subject_diagnostic:[\s\S]*default: false/);
});

test('enablement stays auth-critical, requires Admin candidate, and rejects owner-testing mode', () => {
  assert.match(productionRelease, /Require an Admin auth-critical candidate for the subject diagnostic[\s\S]*RELEASE_CLASS[\s\S]*AUTH_CRITICAL_RELEASE[\s\S]*owner_testing_native_recovery_exception[\s\S]*index\("admin"\)/);
  assert.match(nativeWorkers, /Require exact-candidate acceptance for the subject diagnostic[\s\S]*AUTH_CRITICAL_RELEASE[\s\S]*OWNER_TESTING_DEPLOYMENT[\s\S]*index\("admin"\)/);
});

test('captured policy is ephemeral, exact-candidate expiry is persisted, and activation checks it', () => {
  const capture = nativeWorkers.indexOf('node --experimental-strip-types scripts/ci/prepare-subject-diagnostic-policy.mjs\n');
  const upload = nativeWorkers.indexOf('upload_candidate "$admin_config" ADMIN');
  assert.ok(capture >= 0 && capture < upload);
  assert.match(nativeWorkers, /PLANETSCALE_API_TOKEN: \$\{\{ inputs\.enable_subject_diagnostic == true && secrets\.PLANETSCALE_API_TOKEN \|\| '' \}\}/);
  assert.match(nativeWorkers, /PSCALE_ROLE_IDENTIFIERS: .*inputs\.enable_subject_diagnostic == true.*secrets\.PSCALE_ROLE_IDENTIFIERS/);
  assert.match(nativeWorkers, /PRODUCT_INTEGRITY_ACCESS_TEAM_DOMAIN: .*inputs\.enable_subject_diagnostic == true.*vars\.PRODUCT_INTEGRITY_ACCESS_TEAM_DOMAIN/);
  assert.match(nativeWorkers, /diagnostic_policy_backup[\s\S]*cp \"\$diagnostic_policy_backup\" \"\$diagnostic_policy_module\"/);
  assert.match(nativeWorkers, /subjectDiagnosticExpiresAt/);
  assert.match(nativeWorkers, /SUBJECT_DIAGNOSTIC_EXPIRES_AT=\$diagnostic_expiry/);
  const activation = nativeWorkers.slice(nativeWorkers.indexOf('- name: Activate exact candidate Worker versions'));
  const expiryCheck = activation.indexOf('verify-subject-diagnostic-expiry.mjs');
  const firstDeploy = activation.indexOf('versions deploy');
  assert.ok(expiryCheck >= 0 && expiryCheck < firstDeploy, 'expiry and candidate binding must pass before any Worker deployment');
  assert.match(nativeWorkers, /The diagnostic window cannot cover Keeper acceptance and the resumed release/);
});

test('private human selector is scoped to protected inspection and Admin candidate staging', () => {
  for (const workflow of [nativeWorkers, readOnlyRuntime]) {
    assert.match(workflow, /environment: production/);
    assert.equal(workflow.match(/secrets\.LYTHAUS_NEW_CORE_OWNER_EMAIL/g)?.length, 1);
  }
  assert.match(readOnlyRuntime, /if: inputs\.inspect_subject_recovery == true[\s\S]*?prepare-subject-diagnostic-policy\.mjs --inspect/);
  assert.doesNotMatch(readOnlyRuntime, /--stage-human|versions upload|versions deploy/);
  const stage = nativeWorkers.split('- name: Stage the privately approved human')[1].split('- name:')[0];
  assert.match(stage, /enable_subject_diagnostic == true && inputs\.acceptance_run_id == ''/);
  assert.match(stage, /changed_components_json, '"admin"'\)/);
  assert.match(stage, /prepare-subject-diagnostic-policy\.mjs --stage-human/);
  const adminUploads = nativeWorkers.split('\n').filter(line => line.includes('upload_candidate ') && line.includes('"$admin_secrets_file"'));
  assert.equal(adminUploads.length,1);
  assert.match(adminUploads[0], /upload_candidate "\$admin_config" ADMIN/);
  const stageAdmin = nativeWorkers.match(/if component_changed admin; then\n\s*admin_upload=[\s\S]*?upload_candidate "\$admin_config" ADMIN[^\n]*/);
  assert.ok(stageAdmin);
  assert.match(stageAdmin[0],/--prepare-admin-upload "\$admin_secrets_file" --release-admin-worker/);
  assert.match(nativeWorkers, /Remove ephemeral production secret files[\s\S]*?if: always\(\)[\s\S]*?admin-diagnostic-human\.json[\s\S]*?admin-diagnostic-candidate\.json/);
});
