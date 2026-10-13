import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  inspectJobsHyperdriveOrigin,
  JOBS_HYPERDRIVE_TARGET,
} from '../ci/inspect-jobs-hyperdrive-origin.mjs';

const token = 'synthetic-token-never-a-provider-credential';
const username = 'pscale_api_fixture.branchfixture';
const secret = 'synthetic-provider-secret-must-not-appear';
const responseFor = (result) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, result }),
});
const config = () => ({
  id: JOBS_HYPERDRIVE_TARGET.hyperdriveId,
  name: JOBS_HYPERDRIVE_TARGET.configName,
  origin: {
    user: username,
    password: secret,
    connection_string: 'postgres://' + username + ':' + secret + '@fixture.invalid/postgres',
  },
  token: secret,
  unrelated: { password: secret },
});

test('one fixed GET yields only the approved target identity and username', async () => {
  const calls = [];
  const receipt = await inspectJobsHyperdriveOrigin({
    token,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return responseFor(config());
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url,
    'https://api.cloudflare.com/client/v4/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0/hyperdrive/configs/442bb04b99004cb38c6974ec031d65ee');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(calls[0].options.headers, {
    authorization: 'Bearer ' + token,
    accept: 'application/json',
  });
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.deepEqual(receipt, { ...JOBS_HYPERDRIVE_TARGET, originUsername: username });
  const encoded = JSON.stringify(receipt);
  for (const forbidden of [secret, token, 'password', 'connection_string', 'postgres://']) {
    assert.equal(encoded.includes(forbidden), false);
  }
});

for (const status of [401, 403]) {
  test('HTTP ' + status + ' stops after one request without reading or echoing its body', async () => {
    let calls = 0;
    let bodyReads = 0;
    await assert.rejects(inspectJobsHyperdriveOrigin({
      token,
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: false,
          status,
          json: async () => { bodyReads += 1; return { password: secret }; },
        };
      },
    }), { message: 'hyperdrive_read_http_' + status });
    assert.equal(calls, 1);
    assert.equal(bodyReads, 0);
  });
}

test('transport failures and invalid JSON never expose provider error text', async () => {
  await assert.rejects(inspectJobsHyperdriveOrigin({
    token,
    fetchImpl: async () => { throw new Error(secret); },
  }), { message: 'hyperdrive_read_transport_failed' });
  await assert.rejects(inspectJobsHyperdriveOrigin({
    token,
    fetchImpl: async () => ({
      ok: true,
      json: async () => { throw new Error(secret); },
    }),
  }), { message: 'hyperdrive_read_invalid_json' });
});

for (const field of ['id', 'name']) {
  test('a different provider ' + field + ' cannot produce a receipt', async () => {
    const other = config();
    other[field] = 'unapproved-target';
    await assert.rejects(inspectJobsHyperdriveOrigin({
      token,
      fetchImpl: async () => responseFor(other),
    }), { message: 'hyperdrive_target_not_verified' });
  });
}

test('API failure envelopes cannot produce a receipt', async () => {
  await assert.rejects(inspectJobsHyperdriveOrigin({
    token,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ success: false, result: config(), errors: [{ message: secret }] }),
    }),
  }), { message: 'hyperdrive_target_not_verified' });
});

for (const value of [undefined, secret, username + '\n' + secret, 'postgres://' + secret]) {
  test('unexpected usernames fail closed without echoing the value: ' + typeof value, async () => {
    const other = config();
    other.origin.user = value;
    await assert.rejects(inspectJobsHyperdriveOrigin({
      token,
      fetchImpl: async () => responseFor(other),
    }), { message: 'hyperdrive_origin_username_invalid' });
  });
}

test('missing credentials make no request and CLI produces no receipt', async () => {
  let called = false;
  await assert.rejects(inspectJobsHyperdriveOrigin({
    token: '',
    fetchImpl: async () => { called = true; },
  }), { message: 'cloudflare_token_missing' });
  assert.equal(called, false);
  const cli = spawnSync(process.execPath, [
    new URL('../ci/inspect-jobs-hyperdrive-origin.mjs', import.meta.url).pathname,
  ], { env: { CLOUDFLARE_API_TOKEN: '' }, encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.equal(cli.stdout, '');
  assert.equal(cli.stderr, 'Jobs Hyperdrive origin diagnostic failed: cloudflare_token_missing\n');
});

test('manual workflow keeps the existing token in its sole read step behind production protection', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/jobs-hyperdrive-origin-diagnostic.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /\b(pull_request|push|schedule):/);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /^    environment: production$/m);
  assert.match(workflow, /test "\$GITHUB_REF" = refs\/heads\/main/);
  assert.match(workflow, /test "\$REF_PROTECTED" = true/);
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$EXPECTED_SOURCE_SHA"/);
  assert.match(workflow, /test "\$\(git rev-parse FETCH_HEAD\)" = "\$EXPECTED_SOURCE_SHA"/);
  assert.deepEqual([...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m => m[1]), ['CLOUDFLARE_API_TOKEN']);
  assert.equal((workflow.match(/CLOUDFLARE_API_TOKEN:/g) ?? []).length, 1);
  assert.doesNotMatch(workflow, /continue-on-error|if: always|curl|wrangler|PLANETSCALE|PSCALE_ROLE/);
  assert.match(workflow, /path: \$\{\{ runner.temp \}\}\/jobs-hyperdrive-origin\.json/);
  const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /node --test scripts\/tests\/jobs-hyperdrive-origin\.test\.mjs/);
});
