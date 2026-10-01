import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const version = '11111111-1111-4111-8111-111111111111';
const publicVersion = '22222222-2222-4222-8222-222222222222';
const wrongVersion = '33333333-3333-4333-8333-333333333333';
const releaseSha = 'a'.repeat(40);
const fingerprint = 'd60ce56eda3165e4c21e880e594700b92425b75b0e6eec963caf75fc72d8c1e0';
const credentials = ['fixture-readiness-secret', 'fixture-access-id', 'fixture-access-secret'];

function runProbe(t, scenario, worker = 'lythaus-admin-api-development') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-worker-probe-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'probe.json');
  const requests = path.join(directory, 'requests.json');
  const fixture = path.join(directory, 'fetch.mjs');
  fs.writeFileSync(fixture, `
    import fs from 'node:fs';
    const scenario = process.env.PROBE_FIXTURE_SCENARIO;
    const requests = [];
    globalThis.fetch = async (url, options) => {
      if (!['https://admin-api.lythaus.co', 'https://api.lythaus.co'].includes(new URL(url).origin)) throw new Error('Unexpected fixture destination');
      if (options.method && options.method !== 'GET') throw new Error('Unexpected fixture mutation');
      requests.push({ path: new URL(url).pathname, headers: Object.fromEntries(options.headers) });
      fs.writeFileSync(process.env.PROBE_FIXTURE_REQUESTS, JSON.stringify(requests));
      const readiness = String(url).endsWith('/internal/readiness/database-identity');
      if (!readiness) return new Response('{}', { status: 200 });
      const body = {
        workerVersionId: '${version}', releaseTag: '${releaseSha}',
        emailBinding: { bindingVerified: true, publicWorkerVersion: '${publicVersion}' },
        databaseEnvironment: 'main', branchFingerprint: 'unknown',
        schemaFingerprint: '${fingerprint}', relationCount: 103,
        identityContactEmails: true, budgetLedgerApplied: true,
        schemaVersion: '0020_auth_recovery_delivery.sql', roleClass: 'login_non_superuser',
        readiness: 'pass', readyForAuthentication: false,
        secret: process.env.DATABASE_READINESS_TOKEN, mailbox: 'fixture@example.invalid',
      };
      if (scenario === 'wrong-version') body.workerVersionId = '${wrongVersion}';
      if (scenario === 'wrong-tag') body.releaseTag = 'b'.repeat(40);
      if (scenario === 'missing-version') delete body.workerVersionId;
      if (scenario === 'missing-tag') delete body.releaseTag;
      if (scenario === 'wrong-public') body.emailBinding.publicWorkerVersion = '${wrongVersion}';
      if (scenario === 'unverified-public') body.emailBinding.bindingVerified = false;
      if (scenario === 'redaction') {
        body.workerVersionId = process.env.CF_ACCESS_CLIENT_SECRET;
        body.releaseTag = process.env.DATABASE_READINESS_TOKEN;
        body.emailBinding.publicWorkerVersion = process.env.CF_ACCESS_CLIENT_ID;
      }
      const status = scenario === 'unauthorized' ? 401 : scenario === 'forbidden' ? 403 : 200;
      const cfRay = scenario === 'redaction' ? process.env.CF_ACCESS_CLIENT_SECRET : '1234567890abcdef-FRA';
      return new Response(JSON.stringify(body), { status, headers: { 'cf-ray': cfRay } });
    };
  `);
  const result = spawnSync(process.execPath, ['--import', fixture, 'scripts/ci/probe-production-workers.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_READINESS_TOKEN: credentials[0], CF_ACCESS_CLIENT_ID: credentials[1], CF_ACCESS_CLIENT_SECRET: credentials[2],
      RELEASE_SHA: releaseSha, EXPECTED_WORKER_SOURCE_SHA: releaseSha,
      EXPECTED_DATABASE_SCHEMA_FINGERPRINT: fingerprint, EXPECTED_DATABASE_RELATION_COUNT: '103',
      EXPECTED_DATABASE_SCHEMA_VERSION: '0020_auth_recovery_delivery.sql',
      REQUIRE_BUDGET_MIGRATION: 'true', HYPERDRIVE_VERIFIED_MAIN: 'true', AUTHENTICATED_ACCEPTANCE_PROVEN: 'false',
      PRODUCTION_WORKER_SCOPE: worker, PRODUCTION_WORKER_VERSION_ID: version, PUBLIC_WORKER_VERSION_ID: publicVersion,
      PRODUCTION_PUBLIC_API_BASE_URL: 'https://api.lythaus.co', PRODUCTION_ADMIN_API_BASE_URL: 'https://admin-api.lythaus.co',
      PRODUCTION_WORKER_EVIDENCE_PATH: output, PROBE_FIXTURE_REQUESTS: requests, PROBE_FIXTURE_SCENARIO: scenario,
    },
    encoding: 'utf8',
  });
  const text = fs.readFileSync(output, 'utf8');
  for (const secret of [...credentials, 'fixture@example.invalid']) {
    assert.ok(!`${text}${result.stdout}${result.stderr}`.includes(secret), 'probe evidence and output must exclude credentials and mailbox content');
  }
  return { result, evidence: JSON.parse(text), requests: JSON.parse(fs.readFileSync(requests, 'utf8')) };
}

test('matching Admin identity preserves sanitized observations and both exact override entries', (t) => {
  const { result, evidence, requests } = runProbe(t, 'matching');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(evidence.status, 'pass');
  const observation = evidence.requests.at(-1);
  assert.deepEqual(observation.expected, { workerVersionId: version, releaseTag: releaseSha, publicWorkerVersion: publicVersion });
  assert.equal(observation.observed.workerVersionId, version);
  assert.equal(observation.observed.releaseTag, releaseSha);
  assert.equal(observation.httpStatus, 200);
  assert.equal(observation.cfRay, '1234567890abcdef-FRA');
  assert.equal(observation.service, 'lythaus-admin-api-development');
  assert.equal(observation.path, '/internal/readiness/database-identity');
  for (const request of requests) {
    assert.equal(request.headers['cloudflare-workers-version-overrides'], `lythaus-admin-api-development="${version}", lythaus-public-api-development="${publicVersion}"`);
    assert.equal(request.headers['cf-access-client-id'], credentials[1]);
    assert.equal(request.headers['cf-access-client-secret'], credentials[2]);
  }
  assert.equal(requests.at(-1).headers.authorization, `Bearer ${credentials[0]}`);
});

for (const scenario of ['wrong-version', 'wrong-tag', 'missing-version', 'missing-tag']) {
  test(`${scenario} fails closed and preserves identity before rejecting the candidate`, (t) => {
    const { result, evidence, requests } = runProbe(t, scenario);
    assert.equal(result.status, 1);
    assert.equal(evidence.status, 'fail');
    assert.match(evidence.failure, /exact reviewed Worker version/);
    assert.equal(evidence.requests.at(-1).httpStatus, 200);
    assert.equal(evidence.workers.length, 0);
    assert.equal(requests.length, 2, 'identity mismatches are not blindly retried');
    const observed = evidence.requests.at(-1).observed;
    assert.equal(observed.workerVersionId, scenario === 'missing-version' ? null : scenario === 'wrong-version' ? wrongVersion : version);
    assert.equal(observed.releaseTag, scenario === 'missing-tag' ? null : scenario === 'wrong-tag' ? 'b'.repeat(40) : releaseSha);
  });
}

for (const [scenario, status] of [['unauthorized', 401], ['forbidden', 403]]) {
  test(`HTTP ${status} authentication rejection preserves metadata and is not retried`, (t) => {
    const { result, evidence, requests } = runProbe(t, scenario);
    assert.equal(result.status, 1);
    assert.equal(evidence.status, 'fail');
    assert.match(evidence.failure, new RegExp(`HTTP ${status}`));
    assert.equal(evidence.requests.at(-1).httpStatus, status);
    assert.equal(evidence.requests.at(-1).cfRay, '1234567890abcdef-FRA');
    assert.equal(requests.length, 2);
    assert.equal(evidence.workers.length, 0);
  });
}

for (const scenario of ['wrong-public', 'unverified-public']) {
  test(`${scenario} keeps the private Public candidate binding check fail-closed`, (t) => {
    const { result, evidence } = runProbe(t, scenario);
    assert.equal(result.status, 1);
    assert.match(evidence.failure, /Admin private email binding/);
    assert.equal(evidence.requests.at(-1).observed.workerVersionId, version);
    assert.equal(evidence.workers.length, 0);
  });
}

test('unexpected body fields and invalid identity/Ray fields cannot leak credentials', (t) => {
  const { result, evidence } = runProbe(t, 'redaction');
  assert.equal(result.status, 1);
  assert.equal(evidence.requests.at(-1).observed.workerVersionId, null);
  assert.equal(evidence.requests.at(-1).observed.releaseTag, null);
  assert.equal(evidence.requests.at(-1).observed.emailBinding.publicWorkerVersion, null);
  assert.equal(evidence.requests.at(-1).cfRay, null);
});

test('matching Public probe pins only its own version and preserves its identity checks', (t) => {
  const { result, evidence, requests } = runProbe(t, 'matching', 'lythaus-public-api-development');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(evidence.workers[0].workerVersionId, version);
  for (const { headers } of requests) {
    assert.equal(headers['cloudflare-workers-version-overrides'], `lythaus-public-api-development="${version}"`);
    assert.equal(headers['cf-access-client-secret'], undefined);
  }
});
