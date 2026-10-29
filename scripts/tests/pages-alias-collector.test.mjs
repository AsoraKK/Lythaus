import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { collectPagesAliasEvidence } from '../cloudflare/observe-pages-alias.mjs';

const projectId = 'd00dfa8e-e4e1-47e0-8387-e3bc24de3493';
const deploymentId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const sha = 'a'.repeat(40);
const secret = 'SYNTHETIC_PRIVATE_VALUE_DO_NOT_EMIT';
const token = 'SYNTHETIC_CLOUDFLARE_TOKEN_DO_NOT_EMIT';
const apiPath = '/client/v4/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0/pages/projects/lythaus-web';

function data() {
  const project = { id: projectId, name: 'lythaus-web', production_branch: 'main', subdomain: 'lythaus-web.pages.dev',
    build_config: { web_analytics_token: secret }, env_vars: { KEY: { value: secret } }, nested: [{ secret }] };
  const domain = { name: 'app.lythaus.co', status: 'active', verification_data: { error_message: secret } };
  const deployments = [{ id: deploymentId, project_id: projectId, project_name: 'lythaus-web',
    environment: 'production', is_skipped: false, latest_stage: { name: 'deploy', status: 'success', detail: secret },
    deployment_trigger: { metadata: { branch: 'main', commit_hash: sha, commit_dirty: false, commit_message: secret } },
    url: 'https://11111111.lythaus-web.pages.dev', aliases: ['https://app.lythaus.co'],
    build_config: { web_analytics_token: secret }, env_vars: { TOKEN: { type: 'secret_text', value: secret } } },
  { id: otherId, project_id: projectId, project_name: 'lythaus-web', environment: 'preview', is_skipped: false,
    latest_stage: { name: 'deploy', status: 'success' },
    deployment_trigger: { metadata: { branch: 'feature', commit_hash: sha, commit_dirty: false } },
    url: 'https://22222222.lythaus-web.pages.dev', aliases: ['https://branch.lythaus-web.pages.dev'],
    unrelated: { hidden: [secret] } }];
  return { project, domain, deployments };
}

function clock() {
  let value = Date.parse('2026-10-29T19:00:00.000Z');
  return () => new Date(value += 1000).toISOString();
}

function mockFetch(fixture = data(), alter = ({ body }) => body) {
  const calls = [];
  const fetchImpl = async (rawUrl, options) => {
    const url = new URL(rawUrl);
    assert.equal(url.origin, 'https://api.cloudflare.com');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.authorization, `Bearer ${token}`);
    assert.equal(options.headers.accept, 'application/json');
    assert.ok(options.signal instanceof AbortSignal);
    calls.push(url.pathname + url.search);
    if (url.pathname === apiPath) {
      assert.equal(url.search, '');
      return Response.json(alter({ kind: 'project', body: { success: true, result: fixture.project }, calls }));
    }
    if (url.pathname === `${apiPath}/domains/app.lythaus.co`) {
      assert.equal(url.search, '');
      return Response.json(alter({ kind: 'domain', body: { success: true, result: fixture.domain }, calls }));
    }
    assert.equal(url.pathname, `${apiPath}/deployments`);
    const kind = 'deployments';
    const page = Number(url.searchParams.get('page'));
    assert.ok(page === 1 || page === 2);
    assert.equal(url.searchParams.get('per_page'), page === 1 ? '100' : '1');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['page', 'per_page']);
    const body = { success: true, result: [fixture[kind][page - 1]],
      result_info: { page, per_page: 1, total_pages: 2, total_count: 2 } };
    return Response.json(alter({ kind, page, body, calls }));
  };
  return { fetchImpl, calls };
}

async function collect(fetchImpl, overrides = {}) {
  return collectPagesAliasEvidence({ token, sourceSha: sha, runId: '12345', runAttempt: '1', fetchImpl, now: clock(), ...overrides });
}

test('two bounded all-environment snapshots emit only allowlisted alias evidence', async () => {
  const { fetchImpl, calls } = mockFetch();
  const result = await collect(fetchImpl);
  assert.equal(calls.length, 8);
  assert.deepEqual(result, { schemaVersion: 'lythaus-pages-alias-observation-v1', status: 'OBSERVED_UNIQUE_ALIAS',
    authorization: 'NONE', project: 'lythaus-web', hostname: 'app.lythaus.co',
    firstObservedAt: '2026-10-29T19:00:02.000Z', secondObservedAt: '2026-10-29T19:00:03.000Z',
    deploymentCount: 2, match: { deploymentId, commitSha: sha, branch: 'main' },
    acquisitionStartedAt: '2026-10-29T19:00:01.000Z', acquisitionCompletedAt: '2026-10-29T19:00:04.000Z',
    sourceSha: sha, workflowRunId: '12345', workflowRunAttempt: '1' });
  for (const hidden of [secret, token, 'branch.lythaus-web.pages.dev', 'verification_data', 'env_vars', 'build_config']) {
    assert.equal(JSON.stringify(result).includes(hidden), false);
  }
});

test('missing hostname alias is inconclusive, never a release authorization', async () => {
  const fixture = data(); fixture.deployments[0].aliases = [];
  const result = await collect(mockFetch(fixture).fetchImpl);
  assert.equal(result.status, 'INCONCLUSIVE');
  assert.equal(result.authorization, 'NONE');
  assert.equal(result.match, null);
});

test('incomplete, changing, malformed and oversized pagination cannot produce an observation', async () => {
  for (const alter of [
    ({ kind, body }) => { if (kind === 'deployments') delete body.result_info; return body; },
    ({ kind, body }) => { if (kind === 'deployments') body.result_info.total_pages = 101; return body; },
    ({ kind, body }) => { if (kind === 'deployments') body.result_info.count = 0; return body; },
    ({ kind, body }) => { if (kind === 'deployments') body.result_info.count = '1'; return body; },
    ({ kind, page, body }) => { if (kind === 'deployments' && page === 2) body.result_info.page = 1; return body; },
    ({ kind, page, body }) => { if (kind === 'deployments' && page === 2) body.result_info.total_count = 3; return body; },
    ({ kind, body }) => { if (kind === 'deployments') body.result_info.total_count = 3; return body; },
  ]) {
    await assert.rejects(collect(mockFetch(data(), alter).fetchImpl), error =>
      ['provider_response_invalid', 'pagination_metadata_missing', 'pagination_incomplete', 'evidence_invalid'].includes(error.code)
      && !error.message.includes(secret) && !error.message.includes(token));
  }
});

test('ambiguous, failed and changed provider observations are rejected', async () => {
  for (const mutate of [
    fixture => { fixture.deployments[1].aliases = ['https://app.lythaus.co']; },
    fixture => { fixture.deployments[0].latest_stage.status = 'failure'; },
    fixture => { fixture.deployments[0].is_skipped = true; },
    fixture => { fixture.deployments[0].deployment_trigger.metadata.commit_dirty = true; },
    fixture => { fixture.domain.status = 'pending'; },
  ]) {
    const fixture = data(); mutate(fixture);
    await assert.rejects(collect(mockFetch(fixture).fetchImpl), error => error.code === 'evidence_invalid');
  }
  const { fetchImpl } = mockFetch(data(), ({ kind, body, calls }) => {
    if (kind === 'deployments' && calls.length > 4) body.result[0].aliases = [];
    return body;
  });
  await assert.rejects(collect(fetchImpl), error => error.code === 'evidence_invalid');
});

test('omitted unrelated deployment metadata is tolerated while a matching deployment still requires it', async () => {
  const fixture = data();
  delete fixture.deployments[1].is_skipped;
  delete fixture.deployments[1].latest_stage;
  delete fixture.deployments[1].deployment_trigger;
  assert.equal((await collect(mockFetch(fixture).fetchImpl)).status, 'OBSERVED_UNIQUE_ALIAS');
  delete fixture.deployments[0].deployment_trigger.metadata.commit_dirty;
  await assert.rejects(collect(mockFetch(fixture).fetchImpl), error => error.code === 'evidence_invalid');
});

test('missing deployment pagination metadata is reported precisely without provider content', async () => {
  const { fetchImpl } = mockFetch(data(), ({ kind, body }) => {
    if (kind === 'deployments') delete body.result_info;
    return body;
  });
  await assert.rejects(collect(fetchImpl), error =>
    error.code === 'pagination_metadata_missing' && !error.message.includes(secret));
});

test('provider failure and malformed bodies return fixed messages, never provider details', async () => {
  await assert.rejects(collect(async () => { throw new Error(`${secret} ${token}`); }), error =>
    error.code === 'provider_read_failed' && !error.message.includes(secret) && !error.message.includes(token));
  await assert.rejects(collect(async () => new Response(secret, { status: 401 })), error =>
    error.code === 'provider_read_failed' && error.httpStatus === 401 && !error.message.includes(secret));
  await assert.rejects(collect(async () => new Response(`not-json-${secret}`, { status: 200 })), error =>
    error.code === 'provider_response_invalid' && !error.message.includes(secret));
  await assert.rejects(collect(async () => new Response('x'.repeat(8 * 1024 * 1024 + 1), { status: 200 })), error =>
    error.code === 'provider_response_invalid');
});

test('a shared response budget bounds both snapshots without exposing discarded fields', async () => {
  const padding = 'x'.repeat(7 * 1024 * 1024);
  const { fetchImpl } = mockFetch(data(), ({ body }) => ({ ...body, private_nested: { padding, secret } }));
  await assert.rejects(collect(fetchImpl), error => error.code === 'observation_limit_exceeded'
    && !error.message.includes(secret) && !error.message.includes(token));
});

test('invalid runner provenance is rejected before network access', async () => {
  let requested = false;
  const fetchImpl = async () => { requested = true; throw new Error(secret); };
  for (const overrides of [{ sourceSha: [sha] }, { runId: ['12345'] }, { runAttempt: ['1'] },
    { token: '' }, { now: 'not-a-clock' }]) {
    await assert.rejects(collect(fetchImpl, overrides), error => error.code === 'diagnostic_context_invalid');
  }
  assert.equal(requested, false);
  await assert.rejects(collect(mockFetch().fetchImpl, { now: () => `${secret}2026-10-29T19:00:00Z` }), error =>
    error.code === 'evidence_invalid' && !error.message.includes(secret));
});

test('the real command suppresses synthetic provider exceptions and refuses debug mode', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pages-alias-test-'));
  try {
    const preload = path.join(dir, 'mock.mjs');
    writeFileSync(preload, `globalThis.fetch = async () => { throw new Error(${JSON.stringify(`${secret} ${token}`)}); };\n`);
    const script = path.resolve('scripts/cloudflare/observe-pages-alias.mjs');
    const env = { PATH: process.env.PATH ?? '', CLOUDFLARE_API_TOKEN: token, GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'AsoraKK/Lythaus', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
      GITHUB_REF_PROTECTED: 'true', GITHUB_WORKFLOW_REF: 'AsoraKK/Lythaus/.github/workflows/cloudflare-domain-audit.yml@refs/heads/main',
      GITHUB_SHA: sha, GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1' };
    for (const [extra, expected] of [[{}, 'provider_read_failed'], [{ RUNNER_DEBUG: '1' }, 'diagnostic_context_invalid']]) {
      const result = spawnSync(process.execPath, ['--import', preload, script], { env: { ...env, ...extra }, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.deepEqual(JSON.parse(result.stderr), { status: 'BLOCKED', authorization: 'NONE', reason: expected });
      assert.equal(result.stderr.includes(secret), false);
      assert.equal(result.stderr.includes(token), false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('workflow isolates manual observation, existing inventory and step-scoped secret', () => {
  const workflow = readFileSync('.github/workflows/cloudflare-domain-audit.yml', 'utf8');
  const job = workflow.split('\n  pages_alias:')[1];
  assert.ok(job);
  assert.match(workflow, /pages_alias_only:[\s\S]*?default: false[\s\S]*?type: boolean/);
  assert.match(workflow, /github\.event_name != 'workflow_dispatch' \|\| inputs\.pages_alias_only != true/);
  assert.match(workflow, /inputs\.pages_alias_only == true && 'cloudflare-pages-alias-observation' \|\| 'cloudflare-account-audit'/);
  assert.match(job, /github\.event_name == 'workflow_dispatch' && inputs\.pages_alias_only == true/);
  assert.match(job, /environment: production/);
  assert.match(job, /persist-credentials: false/);
  assert.match(job, /GITHUB_REF_PROTECTED/);
  assert.match(job, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(job, /NODE_OPTIONS: ''[\s\S]*?NODE_DEBUG: ''/);
  assert.ok(job.indexOf('node --test') < job.indexOf('node scripts/cloudflare/observe-pages-alias.mjs'));
  assert.doesNotMatch(job, /upload-artifact|wrangler|curl\s/);
});
