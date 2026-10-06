import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium, webkit } from 'playwright';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';

const build = path.resolve(process.env.AUTH_WEB_ARTIFACT_DIR ?? 'build/web');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png' };
const user = { id: '018f0000-0000-7000-8000-000000000001', email: 'synthetic@example.invalid', role: 'user', tier: 'bronze', subscription_tier: 'free', reputation_score: 0, created_at: '2026-08-01T00:00:00Z', last_login_at: '2026-08-01T00:00:00Z' };

for (const [name, engine] of Object.entries({ chromium, webkit })) for (const width of [1440, 390]) {
  test(`${name} ${width}: native privacy status, verified export, holds, cancellation and expiry`, { timeout: 180000 }, async t => {
    const calls = [], errors = [], mutations = [];
    let session = false, unavailable = false, expired = false, complete = false;
    let exportState = 'completed', deleteState = 'blocked', cooldown = 29 * 86400;
    const bytes = Buffer.from(JSON.stringify({ syntheticOwner: user.id, data: ['synthetic export'] }));
    const hash = createHash('sha256').update(bytes).digest('hex');
    const fixture = await localAuthBrowserServer(async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname === 'app.lythaus.co') {
        let file = path.resolve(build, '.' + url.pathname);
        assert.ok(file === build || file.startsWith(build + path.sep));
        if (!path.extname(file)) file = path.join(build, 'index.html');
        try { return await route.fulfill({ contentType: mime[path.extname(file)] ?? 'application/octet-stream', body: await readFile(file) }); }
        catch { return route.fulfill({ status: 404, body: 'Local artifact missing' }); }
      }
      if (url.hostname !== 'api.lythaus.co') return route.abort();
      const headers = { 'access-control-allow-origin': 'https://app.lythaus.co', 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode, X-Lythaus-Auth-Transport' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const requestHeaders = await request.allHeaders();
      const authenticated = session && requestHeaders.authorization === 'Bearer local-privacy-fixture';
      calls.push({ path: url.pathname, method: request.method(), authenticated });
      let status = 200, body = { items: [], hasMore: false, nextCursor: null };
      if (url.pathname === '/api/auth/email') {
        session = true;
        headers['set-cookie'] = '__Host-lythaus_refresh=' + 'f'.repeat(48) + '; Path=/; HttpOnly; Secure; SameSite=Strict';
        body = { accessToken: 'local-privacy-fixture', sessionTransport: 'cookie-v1', expiresIn: 900 };
      } else if (url.pathname === '/api/auth/refresh') {
        status = session ? 200 : 401;
        body = session ? { accessToken: 'local-privacy-fixture', sessionTransport: 'cookie-v1', expiresIn: 900 } : { error: 'refresh_token_invalid' };
      } else if (url.pathname === '/api/auth/userinfo') body = user;
      else if (url.pathname === '/api/auth/logout') {
        session = false;
        headers['set-cookie'] = '__Host-lythaus_refresh=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
        body = { state: 'signed_out' };
      } else if (url.pathname === '/api/users/me') body = { user: { id: user.id, displayName: 'Synthetic member', trustPassportVisibility: 'private', moderationState: 'allowed', publicVisibility: false } };
      else if (url.pathname.startsWith('/api/privacy/requests')) {
        if (!authenticated || expired) { status = 401; body = { error: 'authentication_required' }; }
        else if (unavailable) { status = 404; body = { error: 'unavailable' }; }
        else if (url.pathname.endsWith('/export')) {
          assert.equal(url.search, '');
          return route.fulfill({ status: 200, headers: { ...headers, 'x-content-sha256': hash, 'access-control-expose-headers': 'x-content-sha256', 'cache-control': 'private, no-store' }, contentType: 'application/json', body: bytes });
        } else if (request.method() === 'POST') {
          const input = request.postDataJSON(); mutations.push(input);
          assert.deepEqual(Object.keys(input), ['requestType']);
          assert.ok(requestHeaders['idempotency-key']);
          if (input.requestType === 'export') { exportState = 'received'; cooldown = 30 * 86400; }
          else { assert.equal(input.requestType, 'delete'); deleteState = 'received'; }
          status = 202; body = { requestId: input.requestType + '-1', requestType: input.requestType, state: 'received', acceptedAt: '2026-10-03T12:00:00Z' };
        } else {
          const type = url.searchParams.get('requestType'); assert.ok(type === 'export' || type === 'delete');
          const state = type === 'export' ? exportState : deleteState;
          body = { ...(type === 'export' ? { retryAfterSeconds: cooldown } : {}), request: state === 'idle' ? null : {
            requestId: type + '-1', requestType: type, state, acceptedAt: '2026-10-02T12:00:00Z', completedAt: state === 'completed' ? '2026-10-02T12:30:00Z' : null,
          } };
        }
      }
      return route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const browser = await engine.launch({ headless: true, proxy: { server: fixture.proxy } });
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', ignoreHTTPSErrors: true, acceptDownloads: true });
    await installFlutterEngineFonts(context);
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    t.after(async () => {
      try { if (!complete) t.diagnostic(JSON.stringify({ calls, errors, mutations, url: page.url(), screen: await page.locator('flt-semantics').allTextContents(), labels: await page.locator('[aria-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))) })); }
      finally { await browser.close(); await fixture.close(); }
    });
    const button = name => page.getByRole('button', { name, exact: true });
    const text = value => page.locator('flt-semantics').getByText(value, { exact: true })
      .or(page.getByRole('group', { name: new RegExp(value.replaceAll('.', '\\.')) }));
    async function open(location) {
      await page.goto('https://app.lythaus.co' + location);
      await page.locator('flt-semantics-placeholder').waitFor({ timeout: 60000 });
      await page.locator('flt-semantics-placeholder').evaluate(node => node.click());
    }
    async function enterText(field, value) {
      await field.click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await field.press('ControlOrMeta+A'); await field.press('Backspace');
      await field.pressSequentially(value, { delay: 20 });
    }
    await open('/settings/privacy?section=data');
    await button('Continue as guest').click();
    await text('Sign in to manage your data and privacy requests.').waitFor();
    assert.equal(calls.filter(c => c.path.startsWith('/api/privacy')).length, 0);
    await button('Sign in').click();
    await button('Sign in with email').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/settings/privacy?section=data');
    await enterText(page.getByRole('textbox', { name: 'Email', exact: true }), user.email);
    const password = page.locator('input[type=password]'); await enterText(password, 'historical12'); await password.press('Enter');
    await text('Export completed. Download while the secure export remains available.').waitFor();
    assert.ok(calls.filter(c => c.path.startsWith('/api/privacy')).every(c => c.authenticated));
    const downloaded = page.waitForEvent('download'); await button('Download export').click();
    const download = await downloaded; assert.equal(download.suggestedFilename(), 'lythaus-export-export-1.json');
    assert.deepEqual(await readFile(await download.path()), bytes);
    unavailable = true; await button('Refresh status').click();
    await text('Export status has not been confirmed. Refresh to check.').waitFor();
    assert.equal(await button('Download export').count(), 0);
    assert.equal(mutations.length, 0);
    unavailable = false; cooldown = 0; await button('Refresh status').click();
    await text('Next request available now').waitFor();
    await button('Request export').click();
    await text('Export request received. Processing has not finished.').waitFor();
    assert.deepEqual(mutations, [{ requestType: 'export' }]);
    exportState = 'processing'; await button('Refresh status').click(); await text('Your export is being prepared.').waitFor();
    exportState = 'blocked'; deleteState = 'idle'; await button('Refresh status').click(); await text('Your export is on hold. Refresh status for updates.').waitFor();
    await page.mouse.move(width / 2, 700); await page.mouse.wheel(0, 650);
    await button('Request account deletion').click(); await text('Delete account').waitFor(); await button('Cancel').click();
    assert.equal(mutations.length, 1);
    await button('Request account deletion').click();
    await enterText(page.getByRole('textbox', { name: /^Confirmation/ }), 'DELETE'); await button('Delete').click();
    await text('Deletion request received. Your account remains available while processing is pending.').waitFor();
    assert.deepEqual(mutations, [{ requestType: 'export' }, { requestType: 'delete' }]);
    assert.ok(session);
    await page.mouse.wheel(0, -1000); expired = true; await button('Refresh status').click();
    await button('Sign in with email').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/settings/privacy?section=data');
    assert.equal(await button('Download export').count(), 0);
    const privateRequests = calls.filter(c => c.path.startsWith('/api/privacy')).length;
    await button('Continue as guest').click();
    await text('Sign in to manage your data and privacy requests.').waitFor();
    assert.equal(calls.filter(c => c.path.startsWith('/api/privacy')).length, privateRequests);
    assert.deepEqual(errors, []); complete = true;
  });
}
