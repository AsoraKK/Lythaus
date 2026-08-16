import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const turnstile = fs.readFileSync('scripts/cloudflare/waitlist-turnstile.mjs', 'utf8');
const materializer = fs.readFileSync('scripts/ci/materialize-public-waitlist-deploy.mjs', 'utf8');
const probe = fs.readFileSync('scripts/ci/probe-public-waitlist-candidate.mjs', 'utf8');
const liveProbe = fs.readFileSync('scripts/ci/probe-live-public-waitlist.mjs', 'utf8');
const restoreDeployment = fs.readFileSync('scripts/ci/restore-worker-deployment.mjs', 'utf8');
const hyperdriveProof = fs.readFileSync('scripts/ci/verify-cloudflare-hyperdrive-targets.mjs', 'utf8');
const cutover = fs.readFileSync('.github/workflows/deploy-public-waitlist.yml', 'utf8');
const marketing = fs.readFileSync('.github/workflows/deploy-marketing-preview.yml', 'utf8');

test('waitlist operational helpers parse under the pinned Node runtime', () => {
  for (const path of ['scripts/ci/probe-live-public-waitlist.mjs', 'scripts/ci/restore-worker-deployment.mjs']) {
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${path} failed node --check: ${result.stderr}`);
  }
});

test('Turnstile provisioning is exact, idempotent, and secret-safe', () => {
  assert.match(turnstile, /Lythaus Website Waitlist/);
  assert.match(turnstile, /lythaus\.co/);
  assert.match(turnstile, /www\.lythaus\.co/);
  assert.match(turnstile, /expectedMode = 'managed'/);
  assert.match(turnstile, /clearance_level: 'no_clearance'/);
  assert.match(turnstile, /multiple production waitlist Turnstile widgets/);
  assert.match(turnstile, /TURNSTILE_SECRET_FILE/);
  assert.doesNotMatch(turnstile, /console\.log\([^\n]*secret/);
});

test('public materializer keeps full authenticated acceptance fail closed', () => {
  assert.match(materializer, /0013_marketing_waitlist\.sql/);
  assert.match(materializer, /TURNSTILE_REQUIRED/);
  assert.match(materializer, /lythaus\.co,www\.lythaus\.co/);
  assert.match(materializer, /AUTHENTICATED_ACCEPTANCE_PROVEN/);
  assert.match(materializer, /must not falsely assert full authenticated acceptance/);
});

test('candidate probe proves the route exists without writing a signup', () => {
  assert.match(probe, /candidate-probe@example\.invalid/);
  assert.match(probe, /turnstileToken: ''/);
  assert.match(probe, /Cloudflare-Workers-Version-Overrides/);
  assert.match(probe, /routeProbe\.status === 400/);
  assert.match(probe, /turnstile_required/);
  assert.match(probe, /attempts <= 6/);
  assert.match(probe, /candidate_contract_not_observed/);
  assert.match(probe, /observedError/);
  assert.match(probe, /fs\.writeFileSync\(evidencePath/);
  assert.match(probe, /private, no-store/);
  assert.match(probe, /access-control-allow-origin/);
});

test('live probe tolerates bounded activation propagation without weakening the contract', () => {
  assert.match(liveProbe, /candidate-probe@example\.invalid/);
  assert.match(liveProbe, /attempt <= 6/);
  assert.match(liveProbe, /setTimeout\(resolve, 2_000\)/);
  assert.match(liveProbe, /status === 400/);
  assert.match(liveProbe, /turnstile_required/);
  assert.match(liveProbe, /private, no-store/);
  assert.match(liveProbe, /https:\/\/lythaus\.co/);
  assert.match(liveProbe, /correlationIdPresent/);
  assert.match(liveProbe, /live_contract_not_observed/);
  assert.match(liveProbe, /PRODUCTION_LIVE_EVIDENCE_PATH/);
});

test('forced restore is limited to captured state after explicit candidate validation', () => {
  assert.match(restoreDeployment, /EXPECTED_CANDIDATE_VERSION_ID/);
  assert.match(restoreDeployment, /ROLLBACK_SPECS/);
  assert.match(restoreDeployment, /CURRENT_DEPLOYMENT_PATH/);
  assert.match(restoreDeployment, /expected candidate is not present in the current deployment/);
  assert.match(restoreDeployment, /current deployment contains an unexpected version/);
  assert.match(restoreDeployment, /endpoint\.searchParams\.set\('force', 'true'\)/);
  assert.match(restoreDeployment, /strategy: 'percentage'/);
  assert.match(restoreDeployment, /sameDeployment\(restoredVersions, rollbackVersions\)/);
  assert.doesNotMatch(restoreDeployment, /console\.log\([^\n]*apiToken/);
});

test('protected cutover verifies database, preserves secrets, stages at zero traffic, and has guarded rollback', () => {
  assert.match(cutover, /environment: production/);
  assert.match(cutover, /Require exact reviewed current main SHA/);
  assert.match(cutover, /PSCALE_ROLE_IDENTIFIERS: \$\{\{ secrets\.PSCALE_ROLE_IDENTIFIERS \}\}/);
  assert.match(cutover, /verify-planetscale-production-schema\.mjs/);
  assert.match(cutover, /verify-cloudflare-hyperdrive-targets\.mjs/);
  assert.match(cutover, /PII_ENCRYPTION_KEY_V1 PII_HMAC_KEY_V1/);
  assert.match(cutover, /waitlist-turnstile\.mjs ensure/);
  assert.match(cutover, /--secrets-file/);
  assert.match(cutover, /--env=""/);
  assert.match(cutover, /Stage public Worker candidate at zero traffic/);
  assert.match(cutover, /\$\{PUBLIC_WORKER_VERSION_ID\}@0/);
  assert.match(cutover, /exact 100\/0 staging deployment/);
  assert.match(cutover, /probe-public-waitlist-candidate\.mjs/);
  assert.match(cutover, /probe-live-public-waitlist\.mjs/);
  assert.match(cutover, /Cloudflare control plane does not report the exact candidate at 100%/);
  assert.match(cutover, /Restore exact pre-waitlist public Worker deployment/);
  assert.match(cutover, /approved Cloudflare secret-drift code 10220/);
  assert.match(cutover, /restore-worker-deployment\.mjs/);
  assert.doesNotMatch(cutover, /PLANETSCALE_DEVELOPMENT_SCHEMA_READ_DATABASE_URL/);
  assert.doesNotMatch(cutover, /PLANETSCALE_API_TOKEN/);
  assert.doesNotMatch(cutover, /CLOUDFLARE_AUDIT_API_TOKEN/);

  const proofStart = cutover.indexOf('- name: Prove Hyperdrive targets PlanetScale main');
  const proofEnd = cutover.indexOf('- name: Verify production schema and waitlist grants read-only');
  assert.ok(proofStart >= 0 && proofEnd > proofStart, 'Hyperdrive proof step must remain explicit');
  const proofStep = cutover.slice(proofStart, proofEnd);
  assert.match(proofStep, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(proofStep, /CLOUDFLARE_AUDIT_API_TOKEN/);
  assert.match(cutover.slice(proofEnd), /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);

  const upload = cutover.indexOf('- name: Upload immutable public Worker candidate');
  const stage = cutover.indexOf('- name: Stage public Worker candidate at zero traffic');
  const candidateProbe = cutover.indexOf('- name: Probe candidate without production traffic');
  const activate = cutover.indexOf('- name: Activate exact public Worker candidate');
  const live = cutover.indexOf('- name: Verify live route fails closed after activation propagation');
  const rollback = cutover.indexOf('- name: Roll back public Worker on failure');
  assert.ok(upload >= 0 && stage > upload && candidateProbe > stage && activate > candidateProbe && live > activate && rollback > live,
    'candidate must be uploaded, staged at 0%, probed, activated, live-probed, then remain rollback-protected');
  const stageStep = cutover.slice(stage, candidateProbe);
  assert.match(stageStep, /PUBLIC_WORKER_DEPLOYED=true/);
  assert.match(stageStep, /\$\{PUBLIC_WORKER_VERSION_ID\}@0/);
  assert.match(stageStep, /rollback_specs\[0\]/);
  const rollbackStep = cutover.slice(rollback, cutover.indexOf('- name: Remove temporary Turnstile secret material'));
  assert.match(rollbackStep, /wrangler versions deploy/);
  assert.match(rollbackStep, /grep -Eq '10220'/);
  assert.match(rollbackStep, /EXPECTED_CANDIDATE_VERSION_ID="\$PUBLIC_WORKER_VERSION_ID"/);

  assert.match(hyperdriveProof, /manifest\.expectedMainOriginFingerprint/);
  assert.match(hyperdriveProof, /observedFingerprint === mainFingerprint/);
  assert.match(hyperdriveProof, /sanitizeCloudflareErrors/);
  assert.match(hyperdriveProof, /lookupStatus: lookup\.response\.status/);
  assert.match(hyperdriveProof, /listStatus: list\.response\.status/);
  assert.match(hyperdriveProof, /nameMatches/);
  assert.match(hyperdriveProof, /expectedConfigName/);
  assert.doesNotMatch(hyperdriveProof, /PLANETSCALE_DEVELOPMENT_SCHEMA_READ_DATABASE_URL/);
  assert.doesNotMatch(hyperdriveProof, /PLANETSCALE_API_TOKEN/);
  const typesCheck = cutover.indexOf('wrangler types --check');
  const materialize = cutover.indexOf('materialize-public-waitlist-deploy.mjs');
  assert.ok(typesCheck >= 0 && materialize >= 0 && typesCheck < materialize, 'Wrangler types must be checked before deployment-only config materialization');
});

test('production marketing resolves the public sitekey from Cloudflare and validates the root file consistently', () => {
  assert.match(marketing, /PUBLIC_API_BASE_URL: https:\/\/api\.lythaus\.co/);
  assert.match(marketing, /waitlist-turnstile\.mjs resolve/);
  assert.match(marketing, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
  assert.match(marketing, /waitlist_signup/);
  assert.match(marketing, /name="_root"/);
  assert.match(marketing, /preview-pages\/\$\{name\}\.html/);
  assert.match(marketing, /preview-pages\/_root\.html/);
  assert.doesNotMatch(marketing, /\$\{name:-root\}/);
  assert.doesNotMatch(marketing, /vars\.PUBLIC_TURNSTILE_SITE_KEY/);
});
