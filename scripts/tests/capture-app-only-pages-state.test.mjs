import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { captureAppPages, captureReusedPages } from '../ci/capture-app-only-pages-state.mjs';

const projectId = '99999999-9999-4999-8999-999999999999';
const deploymentId = '11111111-1111-4111-8111-111111111111';
function project() {
  return { success: true, result: { id: projectId, name: 'lythaus-web', production_branch: 'main',
    canonical_deployment: { id: deploymentId, project_id: projectId, project_name: 'lythaus-web',
      environment: 'production', is_skipped: false, latest_stage: { name: 'deploy', status: 'success' }, url: 'https://11111111.lythaus-web.pages.dev',
      deployment_trigger: { metadata: { branch: 'main', commit_dirty: false, commit_hash: 'a'.repeat(40) } } } } };
}

test('capture performs one authenticated read of the fixed app Pages project', async () => {
  const calls = [];
  const result = await captureAppPages({ token: 'synthetic-token', branch: 'main', fetchImpl: async (url, options) => {
    calls.push({ url, options }); return Response.json(project());
  } });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/[a-f0-9]{32}\/pages\/projects\/lythaus-web$/);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(result.deploymentId, deploymentId);
  assert.ok(!JSON.stringify(result).includes('synthetic-token'));
});

test('provider failure is sanitized and not retried', async () => {
  let calls = 0;
  await assert.rejects(() => captureAppPages({ token: 'synthetic-token', branch: 'main', fetchImpl: async () => {
    calls++; throw new Error('sensitive provider diagnostic');
  } }), error => {
    assert.equal(error.message, 'read-only app Pages provider request failed'); return true;
  });
  assert.equal(calls, 1);
});

test('reused Pages capture reads exactly the fixed marketing and protected admin projects', async () => {
  const calls = [];
  const pages = await captureReusedPages({ token: 'synthetic-token', adminProject: 'lythaus-admin', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const name = url.split('/').at(-1), value = project();
    value.result.name = name;
    value.result.canonical_deployment.project_name = name;
    value.result.canonical_deployment.url = `https://11111111.${name}.pages.dev`;
    return Response.json(value);
  } });
  assert.deepEqual(Object.keys(pages), ['marketing', 'control-panel']);
  assert.deepEqual(calls.map(call => call.url.split('/').at(-1)), ['lythaus-marketing', 'lythaus-admin']);
  assert.ok(calls.every(call => call.options.method === 'GET' && call.options.redirect === 'error'));
  assert.ok(!JSON.stringify(pages).includes('synthetic-token'));
  await assert.rejects(() => captureReusedPages({ token: 'synthetic-token', adminProject: 'lythaus-web' }), /inputs are invalid/);
});

test('wrong branch, preview state, and invalid inputs cannot become a Pages baseline', async () => {
  for (const mutate of [
    value => { value.result.production_branch = 'other'; },
    value => { value.result.canonical_deployment.environment = 'preview'; },
    value => { value.result.canonical_deployment.deployment_trigger.metadata.commit_dirty = true; },
  ]) {
    const payload = project(); mutate(payload);
    await assert.rejects(() => captureAppPages({ token: 'synthetic-token', branch: 'main', fetchImpl: async () => Response.json(payload) }), /deployment is unverified/);
  }
  await assert.rejects(() => captureAppPages({ token: '', branch: 'main' }), /inputs are invalid/);
  await assert.rejects(() => captureAppPages({ token: 'synthetic-token', branch: '../wrong' }), /inputs are invalid/);
});

test('the executable refuses an unprotected or incomplete environment', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/capture-app-only-pages-state.mjs'], {
    encoding: 'utf8', env: { PATH: process.env.PATH },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires the exact main-dispatch Actions account context/);
});
