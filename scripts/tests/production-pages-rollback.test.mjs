import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { inspectProductionPages } from '../ci/inspect-production-pages-rollback.mjs';

const account = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const ids = {
  'lythaus-control-panel': '93ac4df5-86c3-4986-93ea-74650e9f35d4',
  'lythaus-web': 'd00dfa8e-e4e1-47e0-8387-e3bc24de3493',
  'lythaus-marketing': 'd91f8bb3-fd6b-4a9b-b308-f400fdd9e460',
};
const hosts = {
  'lythaus-control-panel': ['admin.lythaus.co'],
  'lythaus-web': ['app.lythaus.co'],
  'lythaus-marketing': ['lythaus.co', 'www.lythaus.co'],
};
const firstId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const secondId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

function provider(change = () => {}) {
  const calls = [];
  async function fetchImpl(url, options) {
    const prefix = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/pages/projects/';
    assert.ok(url.startsWith(prefix));
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined);
    assert.equal(options.headers.authorization, 'Bearer test-only');
    const [name, domains, host, extra] = url.slice(prefix.length).split('/');
    assert.ok(Object.hasOwn(ids, name));
    assert.equal(extra, undefined);
    const call = { name, host, visit: calls.filter(item => item.name === name && item.host === host).length + 1 };
    calls.push(call);
    let result;
    if (host) {
      assert.equal(domains, 'domains');
      assert.ok(hosts[name].includes(host));
      result = { name: host, status: 'active', verification_data: { private: 'filtered-provider-field' } };
    } else {
      assert.equal(domains, undefined);
      result = { name, id: ids[name], production_branch: 'main', private: 'filtered-provider-field',
        latest_deployment: { id: secondId },
        canonical_deployment: { project_name: name, project_id: ids[name], id: firstId, environment: 'production',
          latest_stage: { name: 'deploy', status: 'success' }, is_skipped: false, aliases: hosts[name],
          deployment_trigger: { metadata: { branch: 'main', commit_hash: '1'.repeat(40), commit_dirty: false } } } };
    }
    const payload = { success: true, result };
    const response = change(call, payload);
    return response ?? Response.json(payload);
  }
  return { calls, fetchImpl };
}

const inspect = fixture => inspectProductionPages({ token: 'test-only', fetchImpl: fixture.fetchImpl });

test('requires two stable canonical observations and an active record for each configured host', async () => {
  const fixture = provider();
  const receipt = await inspect(fixture);
  assert.equal(receipt.status, 'canonical_rollback_pins_observed');
  assert.deepEqual(receipt.projects.map(x => x.project).sort(), Object.keys(ids).sort());
  assert.ok(receipt.projects.every(x => x.deploymentId === firstId && x.sourceSha === '1'.repeat(40)));
  assert.deepEqual(receipt.projects.flatMap(x => x.domains.map(d => d.host)).sort(), Object.values(hosts).flat().sort());
  assert.ok(receipt.projects.flatMap(x => x.domains).every(d => d.active && d.listedOnCanonicalDeployment));
  assert.equal(fixture.calls.length, 14);
  assert.doesNotMatch(JSON.stringify(receipt), /filtered-provider-field|test-only/);
});

test('retains absent or unlisted alias evidence separately from the project rollback pin', async () => {
  for (const [aliases, expected] of [[null, null], [[], false], [['https://admin.lythaus.co/'], true]]) {
    const receipt = await inspect(provider(({ name, host }, p) => {
      if (!host && name === 'lythaus-control-panel') p.result.canonical_deployment.aliases = aliases;
    }));
    assert.equal(receipt.status, 'canonical_rollback_pins_observed');
    assert.equal(receipt.projects[0].domains[0].listedOnCanonicalDeployment, expected);
  }
});

test('rejects cross-project, preview, dirty, malformed and incomplete deployments', async () => {
  const changes = [
    p => { p.result.id = ids['lythaus-web']; }, p => { delete p.result.canonical_deployment; },
    p => { p.result.canonical_deployment.project_name = 'other'; }, p => { p.result.production_branch = 'other'; },
    p => { p.result.canonical_deployment.environment = 'preview'; }, p => { p.result.canonical_deployment.id = [firstId]; },
    p => { p.result.canonical_deployment.latest_stage.status = 'active'; }, p => { p.result.canonical_deployment.is_skipped = true; },
    p => { p.result.canonical_deployment.deployment_trigger.metadata.commit_dirty = true; },
    p => { p.result.canonical_deployment.deployment_trigger.metadata.commit_hash = ['1'.repeat(40)]; },
    p => { p.result.canonical_deployment.aliases = [{}]; },
  ];
  for (const change of changes) {
    const receipt = await inspect(provider(({ name, host }, p) => {
      if (!host && name === 'lythaus-control-panel') change(p);
    }));
    assert.equal(receipt.status, 'incomplete');
    assert.ok(receipt.projects[0].error);
  }
});

test('rejects an inactive or incorrect domain and detects a concurrent deployment', async () => {
  for (const change of [p => { p.result.status = 'pending'; }, p => { p.result.name = 'other.example'; }]) {
    const receipt = await inspect(provider(({ host }, p) => { if (host === 'admin.lythaus.co') change(p); }));
    assert.equal(receipt.projects[0].error, 'domain_unverified');
  }
  const receipt = await inspect(provider(({ name, host, visit }, p) => {
    if (!host && name === 'lythaus-web' && visit === 2) p.result.canonical_deployment.id = secondId;
  }));
  assert.deepEqual(receipt, { status: 'changed_during_observation', projects: [] });
});

test('reports fixed errors for provider denials and never emits response bodies or exception details', async () => {
  for (const [reply, code] of [
    [() => new Response('filtered-provider-field', { status: 403 }), 'project_http_403'],
    [() => Response.json({ success: false, errors: ['filtered-provider-field'] }), 'project_response_invalid'],
    [() => { throw new Error('filtered-provider-field'); }, 'provider_response_unavailable'],
  ]) {
    const receipt = await inspect(provider(reply));
    assert.equal(receipt.status, 'incomplete');
    assert.ok(receipt.projects.every(x => x.error === code));
    assert.doesNotMatch(JSON.stringify(receipt), /filtered-provider-field|test-only/);
  }
  const empty = provider();
  assert.equal((await inspectProductionPages({ token: ' ', fetchImpl: empty.fetchImpl })).status, 'token_unavailable');
  assert.equal(empty.calls.length, 0);
});

test('the protected inspection is dispatch-only and receives a single Cloudflare secret', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/production-pages-rollback-inspection.yml', import.meta.url), 'utf8');
  assert.match(workflow, /on:\n  workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^  (push|pull_request|schedule|workflow_call|workflow_run):/m);
  assert.match(workflow, /github\.repository_id == '1010752912'.*refs\/heads\/main.*github\.ref_protected/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /persist-credentials: false/);
  assert.deepEqual([...workflow.matchAll(/secrets\.(\w+)/g)].map(m => m[1]), ['CLOUDFLARE_API_TOKEN']);
});
