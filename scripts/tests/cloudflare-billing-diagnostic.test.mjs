import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { inspectBillingHistory } from '../cloudflare/inspect-billing-history.mjs';

const token = 'synthetic-token-never-a-provider-credential';
const privateValue = 'private-canary-must-not-appear';
const invoiceUrl = 'https://invoice.invalid/' + privateValue;
const responseFor = (result) => new Response(JSON.stringify({ success: true, result }));
const charge = (overrides = {}) => ({
  type: 'charge', currency: 'usd', amount: 5,
  description: 'PlanetScale ' + privateValue,
  id: privateValue, invoice_id: privateValue, external_invoice_id: privateValue,
  source_invoice_id: privateValue, receipt_id: privateValue, source: privateValue,
  hosted_invoice_url: invoiceUrl, email: privateValue + '@fixture.invalid',
  tax: { rate: 15, amount: 0.75 }, amount_to_pay: 5.75,
  ...overrides,
});

test('one fixed GET uses only the supplied token and emits a strict redacted projection', async () => {
  const calls = [];
  const result = await inspectBillingHistory({ token, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return responseFor([charge(), charge({ description: 'Unrelated account product', amount: 999 })]);
  } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.cloudflare.com/client/v4/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0/billing/history?page=1&per_page=20');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.deepEqual(calls[0].options.headers, { authorization: 'Bearer ' + token, accept: 'application/json' });
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.deepEqual(Object.keys(result).sort(), ['access', 'currencies', 'limitations', 'planetscaleMentionedCharges', 'taxEvidence']);
  assert.equal(result.access, 'success');
  assert.deepEqual(result.currencies, ['USD']);
  assert.deepEqual(result.planetscaleMentionedCharges, [{ currency: 'USD', amount: 5 }]);
  assert.equal(result.taxEvidence, 'not_available_from_documented_history_fields');
  for (const forbidden of [privateValue, token, invoiceUrl, '999', '5.75', '0.75', '"description":', 'invoice_id', 'amount_to_pay']) {
    assert.equal(JSON.stringify(result).includes(forbidden), false, forbidden);
  }
});

test('history is bounded and neither paginated nor summed', async () => {
  let calls = 0;
  const result = await inspectBillingHistory({ token, fetchImpl: async () => {
    calls += 1;
    return new Response(JSON.stringify({ success: true,
      result: Array.from({ length: 20 }, () => charge()),
      result_info: { total_count: 9000, page: 1, per_page: 20 } }));
  } });
  assert.equal(calls, 1);
  assert.equal(result.planetscaleMentionedCharges.length, 3);
  assert.deepEqual(result.planetscaleMentionedCharges, Array.from({ length: 3 }, () => ({ currency: 'USD', amount: 5 })));
  assert.match(result.limitations.join(' '), /must not be summed/);
  assert.match(result.limitations.join(' '), /cannot quote a prospective restore/);
});

test('ambiguous and malformed amounts or currency cannot become pricing evidence', async () => {
  const result = await inspectBillingHistory({ token, fetchImpl: async () => responseFor([
    charge({ amount: '5' }), charge({ amount: null }), charge({ amount: Infinity }),
    charge({ currency: privateValue }), charge({ currency: 'ZZZ' }), charge({ currency: 'USD\n' }),
    charge({ type: 'payment' }), charge({ type: privateValue }), charge({ description: 'NotPlanetScale' }),
    charge({ description: 'PlanetScale' + 'x'.repeat(4096) }), null,
    charge({ currency: 'eur', amount: -0.5 }),
  ]) });
  assert.equal(result.access, 'success');
  assert.deepEqual(result.currencies, ['EUR', 'USD']);
  assert.deepEqual(result.planetscaleMentionedCharges, [{ currency: 'EUR', amount: -0.5 }]);
  assert.equal(JSON.stringify(result).includes(privateValue), false);
});

test('empty or unrelated history establishes access without implying free service or a quote', async () => {
  for (const items of [[], [charge({ description: 'Unrelated account product' })]]) {
    const result = await inspectBillingHistory({ token, fetchImpl: async () => responseFor(items) });
    assert.equal(result.access, 'success');
    assert.deepEqual(result.planetscaleMentionedCharges, []);
    assert.match(result.limitations.join(' '), /completeness are not established/);
    assert.match(result.limitations.join(' '), /tax inclusion and tax rates are not established/);
    assert.match(result.limitations.join(' '), /Token names and successful token verification do not prove Billing Read/);
  }
});

for (const status of [401, 403, 429, 500, 302]) {
  test('HTTP ' + status + ' reads no body and makes no retry', async () => {
    let calls = 0;
    const result = await inspectBillingHistory({ token, fetchImpl: async () => {
      calls += 1;
      return { ok: false, status, get body() { throw new Error(privateValue); } };
    } });
    assert.equal(calls, 1);
    assert.equal(result.access, [401, 403].includes(status) ? 'denied' : 'unknown');
    assert.deepEqual(result.currencies, []);
    assert.deepEqual(result.planetscaleMentionedCharges, []);
    assert.equal(JSON.stringify(result).includes(privateValue), false);
  });
}

test('transport, timeout and redirect exceptions cannot leak provider text', async () => {
  let calls = 0;
  const result = await inspectBillingHistory({ token, fetchImpl: async () => {
    calls += 1;
    throw new Error(token + privateValue + invoiceUrl);
  } });
  assert.equal(calls, 1);
  assert.equal(result.access, 'unknown');
  assert.equal(JSON.stringify(result).includes(privateValue), false);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test('invalid, failed and oversized success bodies cannot establish access or leak content', async () => {
  const bodies = [privateValue, JSON.stringify({ success: false, errors: [{ message: privateValue }], result: [charge()] }),
    JSON.stringify({ result: [charge()] }), JSON.stringify({ success: true, result: {} }),
    JSON.stringify({ success: true, result: Array.from({ length: 21 }, () => charge()) }),
    JSON.stringify({ success: true, result: [], ignored: privateValue.repeat(50000) })];
  for (const body of bodies) {
    const result = await inspectBillingHistory({ token, fetchImpl: async () => new Response(body) });
    assert.equal(result.access, 'unknown');
    assert.deepEqual(result.currencies, []);
    assert.deepEqual(result.planetscaleMentionedCharges, []);
    assert.equal(JSON.stringify(result).includes(privateValue), false);
  }
});

test('a partial body failure omits all provider content', async () => {
  const body = new ReadableStream({ start(controller) { controller.error(new Error(privateValue)); } });
  const result = await inspectBillingHistory({ token, fetchImpl: async () => new Response(body) });
  assert.equal(result.access, 'unknown');
  assert.equal(JSON.stringify(result).includes(privateValue), false);
});

test('missing or malformed tokens make no request; the CLI fails closed with sanitized JSON', async () => {
  for (const value of [undefined, '', ' ', 42, token + '\n']) {
    let calls = 0;
    const result = await inspectBillingHistory({ token: value, fetchImpl: async () => { calls += 1; } });
    assert.equal(result.access, 'not_attempted');
    assert.equal(calls, 0);
  }
  const cli = spawnSync(process.execPath, [new URL('../cloudflare/inspect-billing-history.mjs', import.meta.url).pathname],
    { env: { CLOUDFLARE_API_TOKEN: '' }, encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.equal(cli.stderr, '');
  assert.equal(JSON.parse(cli.stdout).access, 'not_attempted');
});

test('the actual CLI preserves sanitized JSON and exit status for success, denial and local failure', () => {
  const fixtures = [
    { code: 'globalThis.fetch = async () => new Response(' + JSON.stringify(JSON.stringify({ success: true, result: [charge()] })) + ');', access: 'success', status: 0 },
    { code: 'globalThis.fetch = async () => new Response(' + JSON.stringify(privateValue) + ', {status: 403});', access: 'denied', status: 1 },
    { code: 'globalThis.fetch = async () => new Response("not-json");', access: 'unknown', status: 1 },
    { code: 'globalThis.fetch = async () => { throw new Error(' + JSON.stringify(privateValue) + '); };', access: 'unknown', status: 1 },
    { code: 'globalThis.fetch = async () => null;', access: 'unknown', status: 1 },
  ];
  for (const fixture of fixtures) {
    const cli = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(fixture.code),
      new URL('../cloudflare/inspect-billing-history.mjs', import.meta.url).pathname],
    { env: { CLOUDFLARE_API_TOKEN: token }, encoding: 'utf8' });
    assert.equal(cli.status, fixture.status);
    assert.equal(cli.stderr, '');
    assert.equal(JSON.parse(cli.stdout).access, fixture.access);
    assert.equal(cli.stdout.includes(privateValue), false);
    assert.equal(cli.stdout.includes(token), false);
  }
});

test('the actual source guard rejects stale main, changed checkout and invalid dispatch inputs without provider access', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/cloudflare-billing-diagnostic.yml', import.meta.url), 'utf8');
  const guard = workflow.split('      - name: Require protected main and exact reviewed source\n')[1]
    .split('        run: |\n')[1].split('      - uses:')[0]
    .split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const gitStub = 'git() { case "$*" in "rev-parse HEAD") printf "%s\\n" "$FAKE_HEAD";; "rev-parse FETCH_HEAD") printf "%s\\n" "$FAKE_REMOTE";; "fetch --no-tags --depth=1 origin main") return 0;; *) return 1;; esac; }\n';
  const sha = 'a'.repeat(40);
  const baseEnv = { GITHUB_REF: 'refs/heads/main', REF_PROTECTED: 'true',
    EXPECTED_SOURCE_SHA: sha, GITHUB_SHA: sha, FAKE_HEAD: sha, FAKE_REMOTE: sha };
  const cases = [
    { changes: {}, status: 0 },
    { changes: { GITHUB_REF: 'refs/heads/candidate' }, status: 1 },
    { changes: { REF_PROTECTED: 'false' }, status: 1 },
    { changes: { EXPECTED_SOURCE_SHA: 'main' }, status: 1 },
    { changes: { EXPECTED_SOURCE_SHA: '$(exit 0)' }, status: 1 },
    { changes: { GITHUB_SHA: 'b'.repeat(40) }, status: 1 },
    { changes: { FAKE_HEAD: 'b'.repeat(40) }, status: 1 },
    { changes: { FAKE_REMOTE: 'b'.repeat(40) }, status: 1 },
  ];
  for (const fixture of cases) {
    const result = spawnSync('/bin/bash', ['-c', gitStub + guard],
      { env: { ...baseEnv, ...fixture.changes }, encoding: 'utf8', timeout: 1000 });
    assert.equal(result.status, fixture.status, JSON.stringify(fixture.changes));
    assert.equal(result.stdout, '');
  }
});

test('manual production workflow binds only the existing token in the final read step', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/cloudflare-billing-diagnostic.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /\b(pull_request|push|schedule|workflow_run|workflow_call):/);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /^    environment: production$/m);
  assert.match(workflow, /github.repository == 'AsoraKK\/Lythaus' && github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /test "\$REF_PROTECTED" = true/);
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$EXPECTED_SOURCE_SHA"/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SOURCE_SHA"/);
  assert.match(workflow, /test "\$\(git rev-parse FETCH_HEAD\)" = "\$EXPECTED_SOURCE_SHA"/);
  assert.deepEqual([...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m => m[1]), ['CLOUDFLARE_API_TOKEN']);
  assert.equal((workflow.match(/CLOUDFLARE_API_TOKEN:/g) ?? []).length, 1);
  assert.doesNotMatch(workflow, /continue-on-error|if: always|upload-artifact|wrangler|PLANETSCALE|PSCALE_ROLE|GITHUB_OUTPUT|GITHUB_ENV/);
  assert.match(workflow, /set -euo pipefail\n          node scripts\/cloudflare\/inspect-billing-history.mjs \| tee -a "\$GITHUB_STEP_SUMMARY"/);
  const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /node --test scripts\/tests\/cloudflare-billing-diagnostic\.test\.mjs/);
});
