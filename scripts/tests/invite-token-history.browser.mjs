import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';

const web = path.resolve(process.env.AUTH_WEB_ARTIFACT_DIR ?? 'build/web');
await readFile(path.join(web, 'flutter_bootstrap.js'));
const mime = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

test('Chromium invite token is captured, scrubbed from history, and submitted to the mocked API', { timeout: 120000 }, async t => {
  const token = 'synthetic_invite_token_0123456789abcdef';
  const email = 'alpha-browser@example.invalid';
  const password = 'synthetic browser invite password';
  const calls = [];
  const pageErrors = [];
  const fixture = await localAuthBrowserServer(async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'app.lythaus.co') {
      const root = path.resolve(web);
      let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      assert.ok(file === root || file.startsWith(`${root}${path.sep}`), 'static fixture path must stay inside the built app');
      // Flutter web is a single-page app: deep links are served by the root
      // document, with GoRouter selecting the route client-side.
      if (!path.extname(file)) file = path.join(root, 'index.html');
      try {
        return await route.fulfill({ contentType: mime[path.extname(file)] ?? 'application/octet-stream', body: await readFile(file) });
      } catch {
        return route.fulfill({ status: 404, body: 'Local app artifact missing' });
      }
    }
    if (url.hostname !== 'api.lythaus.co') return route.abort();

    const allowHeaders = {
      'access-control-allow-origin': 'https://app.lythaus.co',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode, X-Lythaus-Auth-Transport',
      'cache-control': 'no-store',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: allowHeaders });
    if (url.pathname === '/api/auth/refresh') {
      calls.push({ path: url.pathname, method: request.method() });
      return route.fulfill({ status: 401, headers: allowHeaders, contentType: 'application/json', body: JSON.stringify({ error: 'refresh_token_invalid' }) });
    }
    if (url.pathname === '/api/auth/email/verify' && request.method() === 'POST') {
      const body = request.postDataJSON();
      calls.push({
        path: url.pathname,
        method: request.method(),
        authorizationPresent: Boolean((await request.allHeaders()).authorization),
        payload: body,
      });
      return route.fulfill({ status: 200, headers: allowHeaders, contentType: 'application/json', body: JSON.stringify({ state: 'verified' }) });
    }
    calls.push({ path: url.pathname, method: request.method() });
    return route.fulfill({ status: 404, headers: allowHeaders, contentType: 'application/json', body: JSON.stringify({ error: 'route_not_found' }) });
  });

  let browser;
  let page;
  let complete = false;
  t.after(async () => {
    try {
      if (!complete && page && !page.isClosed()) {
        t.diagnostic(JSON.stringify({ synthetic: true, path: new URL(page.url()).pathname, calls: calls.map(({ path, method }) => ({ path, method })), pageErrorCount: pageErrors.length }));
      }
    } finally {
      await browser?.close();
      await fixture.close();
    }
  });

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium',
    args: ['--no-sandbox'],
    proxy: { server: fixture.proxy },
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', ignoreHTTPSErrors: true });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => pageErrors.push(error.message));

  const enableFlutter = async () => {
    const placeholder = page.locator('flt-semantics-placeholder');
    await page.waitForFunction(
      () => document.querySelector('flt-semantics-placeholder') || document.querySelector('flt-semantics'),
      { timeout: 60000 },
    );
    if (await placeholder.count()) {
      await placeholder.first().evaluate(node => node.click());
    }
    await page.locator('flt-semantics').first().waitFor({ timeout: 60000 });
  };
  const openInvite = async () => {
    await page.goto('https://app.lythaus.co/login');
    await enableFlutter();
    await page.goto(`https://app.lythaus.co/invite#token=${token}`);
    await enableFlutter();
    await page.getByText('Enter your invite code', { exact: true }).waitFor();
    await page.waitForFunction(() => window.location.hash === '');
    assert.equal(new URL(page.url()).pathname, '/invite');
    assert.equal(new URL(page.url()).search, '');
  };

  await openInvite();
  const firstCode = page.getByRole('textbox', { name: 'Invitation code', exact: true });
  await firstCode.waitFor();
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByText('Your email is verified and your account is ready.', { exact: false }).first().waitFor();

  const verification = calls.find(call => call.path === '/api/auth/email/verify' && call.method === 'POST');
  assert.ok(verification, 'the real Flutter service called the mocked verification endpoint');
  assert.equal(verification.authorizationPresent, false, 'public invite redemption does not attach a bearer token');
  assert.deepEqual(verification.payload, { email, token, password });

  const historyToken = 'synthetic_history_invite_0123456789abcdef';
  await page.goto('https://app.lythaus.co/login');
  await enableFlutter();
  await page.goto(`https://app.lythaus.co/invite#token=${historyToken}`);
  await enableFlutter();
  await page.getByText('Enter your invite code', { exact: true }).waitFor();
  await page.waitForFunction(() => window.location.hash === '');
  await page.goBack();
  await enableFlutter();
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).waitFor();
  await page.goForward();
  await enableFlutter();
  await page.getByText('Enter your invite code', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/invite');
  assert.equal(new URL(page.url()).search, '');
  assert.equal(new URL(page.url()).hash, '', 'forward navigation cannot restore the scrubbed token in browser history');

  const legacyCode = 'synthetic_legacy_invite_0123456789abcdef';
  await page.goto('https://app.lythaus.co/login');
  await enableFlutter();
  await page.goto(`https://app.lythaus.co/invite/${legacyCode}`);
  await enableFlutter();
  await page.getByText('Enter your invite code', { exact: true }).waitFor();
  await page.waitForFunction(() => window.location.pathname === '/invite');
  assert.equal(new URL(page.url()).search, '');
  assert.equal(new URL(page.url()).hash, '');
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByText('Your email is verified and your account is ready.', { exact: false }).first().waitFor();
  const legacyVerification = calls.find(call => call.path === '/api/auth/email/verify' && call.method === 'POST' && call.payload?.token === legacyCode);
  assert.ok(legacyVerification, 'the legacy code survives route normalization without remaining in the URL');
  assert.equal(legacyVerification.authorizationPresent, false);

  assert.deepEqual(pageErrors, []);
  assert.equal(new URL(page.url()).hash, '');
  complete = true;
});
