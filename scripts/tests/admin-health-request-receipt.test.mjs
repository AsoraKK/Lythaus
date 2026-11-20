import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { traceAdminHealth } from '../ci/admin-health-request-receipt.mjs';

const env = { GITHUB_REPOSITORY_ID: '1010752912', GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true',
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1', CLOUDFLARE_API_TOKEN: 'test-input' };
const reference = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
const inputs = { health_denial_correlation: reference, health_observed_before_utc: '2026-11-01T12:00:00Z' };
const now = Date.parse('2026-11-01T13:00:00Z');
const version = '14f1b832-5f0e-45a3-a031-7fe775d53109';
const deployment = { id: '620ceda7-a4d8-4c20-99cb-b3f58ff18e20', created_on: '2026-10-27T20:31:12Z',
  versions: [{ version_id: version, percentage: 100 }] };
const deployments = (rows = [deployment]) => ({ success: true, result: { deployments: rows } });
function catalog(fields = { attributes: 'Json', message: 'String' }) {
  const types = { accountTag: 'String', scriptName: 'String', timestamp: 'DateTime', ...fields };
  return { datasets: [{ name: 'logs.workersLogs', columns: Object.entries(types)
    .map(([name, data_type]) => ({ name, data_type })) }] };
}
const aggregate = (matched = 4) => ({ data: [{ matched }] });

async function run(replies, overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), ...init });
    const result = replies[calls.length - 1];
    assert.notEqual(result, undefined, 'unexpected extra provider request');
    return result instanceof Response ? result : Response.json(result);
  };
  const receipt = await traceAdminHealth({ env, inputs, now, fetchImpl, ...overrides });
  assert.ok(calls.length <= replies.length);
  assert.doesNotMatch(JSON.stringify(receipt), /sensitive-fixture|test-input|aaaaaaaa-1111/);
  return { calls, receipt };
}

test('inspects the pinned deployment and the selected catalog, then only counts the correlated health event', async () => {
  const { calls, receipt } = await run([deployments(), catalog(), aggregate()]);
  assert.deepEqual(receipt, { status: 'sampled_health_event_observed', pinnedDeploymentCoveredWindow: true, sampledHealthEventMatched: true });
  assert.deepEqual(calls.map(c => [c.method, c.url.pathname]), [
    ['GET', '/client/v4/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0/workers/scripts/lythaus-admin-api-development/deployments'],
    ['GET', '/client/v4/analytics/sql/introspection'], ['POST', '/client/v4/analytics/sql'],
  ]);
  assert.ok(calls.every(c => c.url.origin === 'https://api.cloudflare.com' && c.redirect === 'error'));
  assert.deepEqual(Object.fromEntries(calls[1].url.searchParams), {
    account_tag: 'e5b7ae46e04698f507b7e4b3d4ef1af0', dataset_name: 'logs.workersLogs', include_columns: 'true',
  });
  const { query, params } = JSON.parse(calls[2].body);
  assert.match(query, /^SELECT COUNT\(\*\) AS matched FROM logs\.workersLogs\nWHERE accountTag = \$account AND scriptName = \$worker AND timestamp >= \$start AND timestamp <= \$end\nAND \(/);
  assert.doesNotMatch(query, /;|headers|cookies|aaaaaaaa|event\.request|SELECT\s+\*/i);
  assert.match(query, /attributes\['correlationId'\] = \$reference AND attributes\['route'\] = \$route/);
  assert.match(query, /message LIKE \$referenceFragment AND message LIKE \$routeFragment AND message LIKE \$serviceFragment/);
  assert.equal(params.reference, reference);
  assert.equal(params.worker, 'lythaus-admin-api-development');
  assert.equal(params.route, '/api/admin/health');
  assert.equal(params.error, 'admin_role_required');
  assert.equal(params.start, '2026-11-01T11:00:00.000Z');
  assert.equal(params.end, '2026-11-01T12:00:00.000Z');
});

test('provider JSON and serialized representations produce a boolean, never an inferred exact request count', async () => {
  for (const [fields, expected] of [[{ attributes: 'Json' }, 'attributes'], [{ body: 'String' }, 'body'], [{ message: 'String' }, 'message']]) {
    const { calls, receipt } = await run([deployments(), catalog(fields), aggregate('4')]);
    assert.equal(receipt.sampledHealthEventMatched, true);
    assert.ok(JSON.parse(calls[2].body).query.includes(expected));
  }
  const { receipt } = await run([deployments(), catalog(), aggregate(0)]);
  assert.deepEqual(receipt, { status: 'no_sampled_match', pinnedDeploymentCoveredWindow: true, sampledHealthEventMatched: false });
});

test('invalid context, overlapping modes, unsafe references and invalid observation windows perform no reads', async () => {
  const bad = [
    { env: { ...env, GITHUB_REF_PROTECTED: 'false' } }, { env: { ...env, GITHUB_REF: 'refs/heads/test' } },
    { env: { ...env, GITHUB_REPOSITORY_ID: '0' } }, { env: { ...env, GITHUB_RUN_ATTEMPT: '2' } },
    { env: { ...env, GITHUB_EVENT_NAME: 'push' } }, { env: { ...env, CLOUDFLARE_API_TOKEN: '' } },
    { inputs: { ...inputs, inspect_subject_recovery: 'true' } }, { inputs: { ...inputs, health_denial_correlation: '%sensitive-fixture' } },
    ...['2026-11-31T12:00:00Z', '2026-11-01T14:00:00Z', '2026-10-23T12:00:00Z', ''].map(end =>
      ({ inputs: { ...inputs, health_observed_before_utc: end } })),
  ];
  for (const input of bad) assert.equal((await run([], input)).receipt.status, 'input_unavailable');
});

test('different, overlapping, ambiguous or split deployments stop before querying logs', async () => {
  const invalid = [
    [{ ...deployment, id: 'unrelated' }], [{ ...deployment, versions: [{ version_id: 'other', percentage: 100 }] }],
    [{ ...deployment, versions: [{ version_id: version, percentage: 20 }, { version_id: 'other', percentage: 80 }] }],
    [deployment, { ...deployment, created_on: '2026-11-01T11:30:00Z' }], [deployment, deployment],
    [{ ...deployment, created_on: 'invalid' }], [],
  ];
  for (const rows of invalid) assert.equal((await run([deployments(rows)])).receipt.status, 'serving_window_unverified');
});

test('reports the exact provider stage and status without outputting error bodies or falling back', async () => {
  for (const [earlier, status, stage] of [[[], 401, 'deployments'], [[deployments()], 403, 'dataset'], [[deployments(), catalog()], 400, 'aggregate']]) {
    const failure = new Response('sensitive-fixture', { status });
    const { receipt } = await run([...earlier, failure]);
    assert.equal(receipt.status, stage + '_http_error');
    assert.equal(receipt.httpStatus, status);
    assert.equal(receipt.sampledHealthEventMatched, null);
  }
  for (const result of [catalog({ untrusted: 'String' }), { datasets: [{ name: 'events.httpRequests', columns: [] }] }]) {
    assert.equal((await run([deployments(), result])).receipt.status, 'dataset_columns_unavailable');
  }
  const invalid = [aggregate(-1), aggregate(true), aggregate(''), { data: [] }, { data: [{ matched: 1, other: 'sensitive-fixture' }] },
    { data: [{ matched: 1 }], errors: ['sensitive-fixture'] }];
  for (const value of invalid) assert.equal((await run([deployments(), catalog(), value])).receipt.status, 'aggregate_result_unverified');
  for (const value of [new Response('sensitive-fixture'), new Response('x'.repeat(270000))]) {
    assert.equal((await run([deployments(), catalog(), value])).receipt.status, 'aggregate_read_unverified');
  }
});

test('the reference is an exclusive dispatch mode under the existing production gate', () => {
  const workflow = readFileSync('.github/workflows/admin-runtime-target-pass-fail.yml', 'utf8');
  assert.match(workflow, /on:\n  workflow_dispatch:/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main' && github\.ref_protected/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /Run ephemeral read-only comparison\n\s+if: inputs.health_denial_correlation == '' && inputs.health_observed_before_utc == ''/);
  const step = workflow.slice(workflow.indexOf('- name: Trace one ordinary Admin health response'));
  assert.match(step, /inputs.health_denial_correlation != '' \|\| inputs.health_observed_before_utc != ''/);
  assert.deepEqual([...step.matchAll(/secrets\.(\w+)/g)].map(m => m[1]), ['CLOUDFLARE_API_TOKEN']);
  assert.doesNotMatch(step, /upload-artifact|psql|wrangler|GITHUB_OUTPUT|\$\{\{\s*inputs/);
});
