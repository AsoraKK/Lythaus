import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { publicReadOnlyRequestPolicy, publicReadOnlyResource, installPublicReadOnlyBoundary } from '../ci/public-read-only-browser-policy.mjs';

test('public live runner requires explicit read-only opt-in before launching a browser', () => {
  const runner = new URL('../ci/public-read-only-browser-acceptance.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [runner.pathname], { encoding: 'utf8',
    env: { ...process.env, LYTHAUS_PUBLIC_BROWSER_ACCEPTANCE: '' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Explicit read_only opt-in required/u);
});

test('public live runner refuses evidence inside the public repository before launching a browser', () => {
  const runner = new URL('../ci/public-read-only-browser-acceptance.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [runner.pathname], { encoding: 'utf8',
    env: { ...process.env, LYTHAUS_PUBLIC_BROWSER_ACCEPTANCE: 'read_only',
      PUBLIC_BROWSER_EVIDENCE_DIR: new URL('../evidence', import.meta.url).pathname } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Evidence must remain outside the public repository/u);
});

test('public UI boundary permits public pages, release assets and guest feed reads', () => {
  for (const resource of ['https://lythaus.co/signup/', 'https://lythaus.co/_astro/auth.abcd.js',
    'https://app.lythaus.co/login', 'https://app.lythaus.co/main.dart.1234567890abcdef.js',
    'https://app.lythaus.co/assets/fonts/MaterialIcons-Regular.otf',
    'https://app.lythaus.co/web-release-assets.json',
    'https://api.lythaus.co/api/feed/discover?limit=25&tag=water']) {
    assert.equal(publicReadOnlyRequestPolicy('GET', resource), null, resource);
  }
});

test('permitted requests disable redirects and forward only the exact non-redirect upstream response', async () => {
  let http, forwarded;
  const blocked = [], response = { status: () => 200 };
  await installPublicReadOnlyBoundary({ route: async (_, callback) => { http = callback; }, routeWebSocket: async () => {} }, blocked);
  await http({ request: () => ({ method: () => 'GET', url: () => 'https://lythaus.co/signup/' }),
    fetch: async options => { assert.deepEqual(options, { maxRedirects: 0 }); return response; },
    fulfill: async options => { forwarded = options.response; }, abort: () => assert.fail('Public response unexpectedly aborted') });
  assert.equal(forwarded, response);
  assert.deepEqual(blocked, []);
});

test('an upstream read failure aborts without exposing raw transport errors', async () => {
  let http, aborted;
  const blocked = [];
  await installPublicReadOnlyBoundary({ route: async (_, callback) => { http = callback; }, routeWebSocket: async () => {} }, blocked);
  await http({ request: () => ({ method: () => 'GET', url: () => 'https://lythaus.co/signup/' }),
    fetch: async () => { throw new Error('private transport detail'); },
    fulfill: () => assert.fail('Failed upstream read must not be forwarded'), abort: async reason => { aborted = reason; } });
  assert.equal(aborted, 'blockedbyclient');
  assert.equal(blocked[0].reason, 'upstream_read_failed');
  assert.equal(JSON.stringify(blocked).includes('private transport detail'), false);
});

test('public UI boundary blocks authentication, email, privacy and billing mutations before network', async () => {
  let http, websocket;
  const blocked = [], sent = [];
  await installPublicReadOnlyBoundary({ route: async (_, callback) => { http = callback; },
    routeWebSocket: async (_, callback) => { websocket = callback; } }, blocked);
  for (const [method, resource] of [['POST', 'https://api.lythaus.co/api/auth/refresh'],
    ['POST', 'https://api.lythaus.co/api/auth/logout'], ['POST', 'https://api.lythaus.co/api/auth/email'],
    ['POST', 'https://api.lythaus.co/api/auth/password/reset/request'],
    ['POST', 'https://api.lythaus.co/api/privacy/requests'], ['DELETE', 'https://api.lythaus.co/api/users/me'],
    ['PATCH', 'https://api.lythaus.co/api/users/me'], ['POST', 'https://api.lythaus.co/api/billing/checkout'],
    ['GET', 'https://api.lythaus.co/api/auth/email/verify?token=synthetic'],
    ['GET', 'https://api.lythaus.co/api/users/me']]) {
    let aborted = false;
    await http({ request: () => ({ method: () => method, url: () => resource }),
      abort: async reason => { aborted = reason === 'blockedbyclient'; },
      continue: async () => sent.push(resource) });
    assert.equal(aborted, true, resource);
  }
  let closed = false;
  websocket({ close: () => { closed = true; } });
  assert.equal(closed, true);
  assert.deepEqual(sent, []);
  assert.equal(blocked.length, 11);
  assert.equal(JSON.stringify(blocked).includes('token=synthetic'), false);
});

test('public UI boundary rejects origin tricks, sensitive queries, stateful GET routes and unknown methods', () => {
  for (const [method, resource] of [['GET', 'https://lythaus.co.attacker.invalid/signup'],
    ['GET', 'https://lythaus.co@attacker.invalid/signup'], ['GET', 'https://secret@lythaus.co/signup'],
    ['GET', 'http://lythaus.co/signup'], ['GET', 'https://lythaus.co:444/signup'],
    ['GET', 'https://lythaus.co/unsubscribe?token=synthetic'],
    ['GET', 'https://lythaus.co/signup?password=synthetic'], ['GET', 'https://lythaus.co/signup?TOKEN=synthetic'],
    ['GET', 'https://api.lythaus.co/api/feed/discover?access_token=synthetic'],
    ['GET', 'https://api.lythaus.co/api/feed/discover?unexpected=1'],
    ['POST', 'https://lythaus.co/signup'], ['PUT', 'https://app.lythaus.co/file.json'],
    ['GET', 'https://app.lythaus.co/api/unsubscribe.json'],
    ['TRACE', 'https://lythaus.co/signup'], ['GET', 'not a URL']]) {
    assert.ok(publicReadOnlyRequestPolicy(method, resource), resource);
  }
  assert.equal(publicReadOnlyResource('https://secret:synthetic@lythaus.co/signup?token=synthetic#secret'), 'https://lythaus.co/signup');
});
