import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const releaseSha = 'a'.repeat(40);

function runFinal(overrides = {}) {
  return spawnSync(process.execPath, ['scripts/validate-production-gates.mjs', '--phase', 'final'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      RELEASE_SHA: releaseSha,
      HYPERDRIVE_VERIFIED_MAIN: 'true',
      DATABASE_IDENTITY_VERIFIED: 'true',
      BUDGET_ENFORCEMENT_VERIFIED: 'true',
      AUTHENTICATED_ACCEPTANCE_PROVEN: 'true',
      ...overrides,
    },
  });
}

test('final production gates use exact-run evidence for runtime-required gates', () => {
  const result = runFinal();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Validated production gate manifest for final/);
});

test('final production gates fail closed when exact-run evidence is absent', () => {
  const result = runFinal({ DATABASE_IDENTITY_VERIFIED: 'false' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DATABASE_IDENTITY_VERIFIED=true is required from this exact deployment run/);
});

test('owner testing permits deployment only with auth acceptance explicitly pending and no run', () => {
  const result = runFinal({
    OWNER_TESTING_DEPLOYMENT: 'true',
    AUTHENTICATED_ACCEPTANCE_PROVEN: 'false',
    AUTH_ACCEPTANCE_STATUS: 'OWNER_TEST_PENDING',
    AUTH_ACCEPTANCE_RUN_ID: '',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('owner testing cannot claim acceptance or skip other final production gates', () => {
  const claimed = runFinal({
    OWNER_TESTING_DEPLOYMENT: 'true',
    AUTHENTICATED_ACCEPTANCE_PROVEN: 'true',
    AUTH_ACCEPTANCE_STATUS: 'PASSED',
    AUTH_ACCEPTANCE_RUN_ID: '22222222-2222-4222-8222-222222222222',
  });
  assert.notEqual(claimed.status, 0);
  assert.match(claimed.stderr, /owner-testing deployment must remain AUTH_CRITICAL_RELEASE with pending, unrun authentication acceptance/);

  const missingDatabaseEvidence = runFinal({
    OWNER_TESTING_DEPLOYMENT: 'true',
    AUTHENTICATED_ACCEPTANCE_PROVEN: 'false',
    AUTH_ACCEPTANCE_STATUS: 'OWNER_TEST_PENDING',
    AUTH_ACCEPTANCE_RUN_ID: '',
    DATABASE_IDENTITY_VERIFIED: 'false',
  });
  assert.notEqual(missingDatabaseEvidence.status, 0);
  assert.match(missingDatabaseEvidence.stderr, /DATABASE_IDENTITY_VERIFIED=true is required/);
});

test('owner-test pending evidence cannot leak into a normal release', () => {
  const result = runFinal({
    OWNER_TESTING_DEPLOYMENT: 'false',
    AUTHENTICATED_ACCEPTANCE_PROVEN: 'true',
    AUTH_ACCEPTANCE_STATUS: 'OWNER_TEST_PENDING',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OWNER_TEST_PENDING requires explicit OWNER_TESTING_DEPLOYMENT=true/);
});

test('deployment identity derives canonical database values and Access JWKS without stale release variables', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/validate-product-integrity-deploy-identity.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PRODUCT_INTEGRITY_DATABASE_SCHEMA_FINGERPRINT: '',
      PRODUCT_INTEGRITY_DATABASE_RELATION_COUNT: '',
      PRODUCT_INTEGRITY_ACCESS_TEAM_DOMAIN: 'lythaus-test.cloudflareaccess.com',
      PRODUCT_INTEGRITY_ACCESS_AUDIENCES: 'audience_one_123,audience_two_456',
      PRODUCT_INTEGRITY_ACCESS_JWKS_URL: '',
      PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAATestTurnstileSiteKey12345',
      PRODUCT_INTEGRITY_EXTERNAL_BACKUP_HEALTHCHECK_URL: '',
      MATERIALIZE_PRODUCT_INTEGRITY_DEPLOY_CONFIGS: 'false',
    },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Validated canonical post-0020 deployment identity/);

  const materializer = fs.readFileSync(path.join(root, 'scripts/ci/validate-product-integrity-deploy-identity.mjs'), 'utf8');
  const jobsConfig = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/wrangler.jsonc'), 'utf8');
  assert.doesNotMatch(materializer, /PRODUCT_INTEGRITY_DATABASE_SCHEMA_FINGERPRINT/);
  assert.doesNotMatch(materializer, /PRODUCT_INTEGRITY_DATABASE_RELATION_COUNT/);
  assert.doesNotMatch(materializer, /PRODUCT_INTEGRITY_ACCESS_JWKS_URL/);
  assert.doesNotMatch(materializer, /PRODUCT_INTEGRITY_EXTERNAL_BACKUP_HEALTHCHECK_URL/);
  assert.match(materializer, /cdn-cgi\/access\/certs/);
  assert.doesNotMatch(jobsConfig, /EXTERNAL_BACKUP_HEALTHCHECK_URL/);
});
