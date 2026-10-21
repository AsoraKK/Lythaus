import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';
import { installPublicReadOnlyBoundary } from '../ci/public-read-only-browser-policy.mjs';

for (const redirect of ['https://api.lythaus.co/api/auth/email/verify?token=synthetic',
  'https://unapproved.example.invalid/write', 'https://lythaus.co/sign-in/']) {
  test(`read-only boundary does not request a redirect destination: ${new URL(redirect).hostname}`, { timeout: 30_000 }, async t => {
    const hits = [], blocked = [];
    const fixture = await localAuthBrowserServer(async route => {
      const request = route.request();
      hits.push({ method: request.method(), url: request.url() });
      return route.fulfill({ status: 302, headers: { location: redirect }, body: 'Redirect must not be followed' });
    });
    t.after(() => fixture.close());
    const browser = await chromium.launch({ headless: true, proxy: { server: fixture.proxy },
      ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    t.after(() => browser.close());
    const context = await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true });
    await installPublicReadOnlyBoundary(context, blocked);
    const page = await context.newPage();
    await assert.rejects(page.goto('https://lythaus.co/signup/'), /ERR_BLOCKED_BY_CLIENT/u);
    assert.deepEqual(hits, [{ method: 'GET', url: 'https://lythaus.co/signup/' }]);
    assert.deepEqual(blocked, [{ kind: 'http', method: 'GET', resource: 'https://lythaus.co/signup/', reason: 'redirects_disabled' }]);
  });
}

test('read-only boundary preserves a real non-redirect response body and status', { timeout: 30_000 }, async t => {
  const hits = [], blocked = [];
  const body = '<!doctype html><title>Public read-only loopback</title><main>Exact original upstream bytes</main>';
  const fixture = await localAuthBrowserServer(async route => {
    hits.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'x-synthetic-marker': 'unaltered' }, body });
  });
  t.after(() => fixture.close());
  const browser = await chromium.launch({ headless: true, proxy: { server: fixture.proxy },
    ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true });
  await installPublicReadOnlyBoundary(context, blocked);
  const page = await context.newPage();
  const response = await page.goto('https://lythaus.co/signup/');
  assert.equal(response.status(), 200);
  assert.equal(response.headers()['x-synthetic-marker'], 'unaltered');
  assert.equal(await response.text(), body);
  assert.equal(await page.title(), 'Public read-only loopback');
  assert.equal(await page.locator('main').innerText(), 'Exact original upstream bytes');
  assert.deepEqual(hits, ['https://lythaus.co/signup/']);
  assert.deepEqual(blocked, []);
});
