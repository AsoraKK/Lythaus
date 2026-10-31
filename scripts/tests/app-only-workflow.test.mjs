import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const parent = readFileSync('.github/workflows/production-release.yml', 'utf8');
const child = readFileSync('.github/workflows/canonical-app-only-release.yml', 'utf8');
const web = readFileSync('.github/workflows/deploy-alpha-web.yml', 'utf8');
const section = (value, start, end) => value.slice(value.indexOf(start), value.indexOf(end, value.indexOf(start) + start.length));

test('app-only runs behind the canonical preflight and inherits the existing release lock', () => {
  const job = section(parent, '\n  app_only:', '\n  production_smoke:');
  assert.match(job, /needs: \[preflight, provider_evidence\]/);
  assert.match(job, /inputs\.release_mode == 'app_only'/);
  assert.doesNotMatch(job, /concurrency:/);
  assert.match(job, /uses: \.\/\.github\/workflows\/canonical-app-only-release\.yml/);
  assert.match(parent, /group: lythaus-canonical-production-release/);
  assert.match(parent, /previous_production_run_id: \$\{\{ steps\.prior_run\.outputs\.previous_production_run_id \}\}/);
  assert.match(parent, /app_pages_serving_proof_json: \$\{\{ fromJSON\(inputs\.release_resume_context_json\)\.app_pages_serving_proof_json \|\| '' \}\}/);
  const dispatch = section(parent, '\n  workflow_dispatch:', '\npermissions:');
  assert.doesNotMatch(dispatch, /previous_production_run_id:/);
  assert.match(dispatch, /release_resume_context_json:[\s\S]*default: '\{\}'/);
  assert.equal((dispatch.match(/^      [a-z0-9_]+:/gm) ?? []).length, 10, 'workflow_dispatch stays within GitHub\'s ten-input limit');
});

test('app-only transaction preserves real acceptance, live compatibility, and recovery readiness', () => {
  assert.match(child, /workflow_call:/);
  assert.doesNotMatch(child, /workflow_dispatch:/);
  const prepare = section(child, '\n  prepare:', '\n  web:');
  for (const required of ['validate:production-gates:predeploy', 'waitlist-turnstile.mjs resolve',
    'provision-cloudflare-email-lifecycle.mjs --verify-existing', 'verify-cloudflare-hyperdrive-targets.mjs',
    'prepare-app-only-release.mjs', 'probe-production-workers.mjs',
    'collect-auth-acceptance-evidence.mjs', 'npm run acceptance:adr003', 'app-only-browser-acceptance.mjs',
    'validate:production-gates:final', 'recheck-app-only-release.mjs']) {
    assert.ok(prepare.includes(required), required);
  }
  assert.doesNotMatch(prepare, /verify-planetscale-production-schema\.mjs|verify-production-recovery-readiness\.mjs/);
  assert.doesNotMatch(prepare, /continue-on-error:\s*true|OWNER_TESTING_DEPLOYMENT:\s*['"]?true|OWNER_TESTING_RECOVERY_EXCEPTION:\s*['"]?true/);
  assert.doesNotMatch(child, /wrangler[^\n]*(?:versions deploy|pages deploy|secret put)|materialize-authenticity|configure-authenticity/);
  assert.match(section(child, '\n  web:', '\n  finalize:'), /needs: prepare[\s\S]*uses: \.\/\.github\/workflows\/deploy-alpha-web\.yml/);
  assert.match(section(child, '\n  web:', '\n  finalize:'), /app_only_preparation_json: \$\{\{ needs\.prepare\.outputs\.preparation_json \}\}/);
  assert.match(child, /APP_PAGES_SERVING_PROOF_JSON: \$\{\{ inputs\.app_pages_serving_proof_json \}\}/);
  assert.match(child, /Consume the one-use serving proof before deployment[\s\S]*?Preserve the consumed serving-proof receipt/);
  assert.match(child, /retention-days: 30/);
  const pageRecovery = section(web, '- name: Require fresh protected native recovery evidence', '- name: Recheck app-only Pages serving evidence');
  assert.match(pageRecovery, /if: inputs\.target_environment == 'production'/);
  assert.match(pageRecovery, /node scripts\/ci\/verify-production-recovery-readiness\.mjs/);
  assert.doesNotMatch(pageRecovery, /app_only_requested|Database restore evidence is not claimed/);
  assert.ok(web.indexOf('Recheck app-only acceptance and live dependencies immediately before activation') < web.indexOf('Require fresh protected native recovery evidence'));
  assert.ok(web.indexOf('Require fresh protected native recovery evidence') < web.indexOf('Deploy immutable Pages artifact'));
  const parentRecovery = section(parent, '- name: Require fresh protected native recovery and public independent recovery readiness', '- name: Resolve the exact prior canonical run for app-only reuse');
  assert.doesNotMatch(parentRecovery, /if: inputs\.release_mode != 'app_only'/);
  assert.match(parent, /Upload sanitized persistent recovery readiness\s+if: always\(\)/);
  const servingGate = section(web, '- name: Recheck app-only Pages serving evidence', '- name: Deploy immutable Pages artifact');
  assert.match(servingGate, /if: inputs\.target_environment == 'production' && github\.event_name == 'workflow_dispatch' && inputs\.release_mode == 'app_only'/);
  assert.match(servingGate, /RELEASE_MODE.*app_only/);
  assert.match(servingGate, /node scripts\/ci\/recheck-app-only-serving-proof\.mjs/);
  assert.doesNotMatch(servingGate, /require-app-pages-serving-proof/);
  const deploymentVerification = section(web, '- name: Verify exact Pages deployment evidence', '- name: Write web deployment evidence');
  assert.match(deploymentVerification, /APP_ONLY_PREPARATION_JSON: \$\{\{ inputs\.app_only_preparation_json \}\}/);
  assert.match(deploymentVerification, /verify-pages-deployment\.mjs/);
  assert.match(child, /always\(\) && needs\.prepare\.result == 'success'/);
  assert.match(child, /finalize-app-only-release\.mjs/);
  const sharedRollback = readFileSync('scripts/ci/rollback-pages-deployment.mjs', 'utf8');
  assert.match(sharedRollback, /\/deployments\/\$\{encodeURIComponent\(deploymentId\)\}\/rollback/);
  assert.doesNotMatch(sharedRollback, /app-pages-serving-proof|serving.identity.unverified/);
  assert.match(readFileSync('scripts/ci/rollback-app-only-pages-deployment.mjs', 'utf8'), /rollbackAppOnlyPagesDeployment/);
});

test('ordinary component deploys are excluded for app-only and its manifest is evidence-bound', () => {
  for (const [start, end] of [['\n  marketing:', '\n  web:'], ['\n  web:', '\n  admin:'],
    ['\n  admin:', '\n  workers:'], ['\n  workers:', '\n  app_only:']]) {
    assert.match(section(parent, start, end), /inputs\.release_mode != 'app_only'/);
  }
  assert.match(parent, /prepare-app-only-manifest-env\.mjs/);
  assert.match(parent, /resolve-app-only-failure-domain\.mjs/);
  assert.match(parent, /steps\.app_only_state\.outputs\.history_json \|\| steps\.verified_state\.outputs\.history_json/);
  const providerJob = section(parent, '\n  provider_evidence:', '\n  marketing:');
  assert.match(providerJob, /test "\$CLOUDFLARE_STATUS" = VERIFIED[\s\S]*?test "\$PLANETSCALE_STATUS" = VERIFIED/);
  const appOnlyJob = section(parent, '\n  app_only:', '\n  production_smoke:');
  assert.match(appOnlyJob, /needs\.provider_evidence\.outputs\.cloudflare_status == 'VERIFIED'/);
  assert.match(appOnlyJob, /needs\.provider_evidence\.outputs\.planetscale_status == 'VERIFIED'/);
  assert.match(child, /app_pages_serving_proof_json: \{ required: true, type: string \}/);
  assert.match(readFileSync('scripts/ci/finalize-app-only-release.mjs', 'utf8'), /rollbackAppOnlyPagesDeployment/);
  assert.match(child, /\n  finalize:[\s\S]*?APP_ONLY_CANONICAL: \$\{\{ github\.workflow_ref == format\('[^\n]+/);
  assert.doesNotMatch(readFileSync('scripts/ci/rollback-pages-deployment.mjs', 'utf8'), /readFileSync\(arg\('--app-only-serving-proof-context'/);
});
