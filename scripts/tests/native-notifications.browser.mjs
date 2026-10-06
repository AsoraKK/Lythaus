import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium, webkit } from 'playwright';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';
import { normalizeNotificationPreferences } from '../../apps/lythaus-public-api/src/notification-policy.ts';

const build = path.resolve(process.env.AUTH_WEB_ARTIFACT_DIR ?? 'build/web');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png' };
const user = { id: '018f0000-0000-7000-8000-000000000001', email: 'synthetic@example.invalid', role: 'user', tier: 'bronze', subscription_tier: 'free', reputation_score: 0, created_at: '2026-08-01T00:00:00Z', last_login_at: '2026-08-01T00:00:00Z' };

for (const [name, engine] of Object.entries({ chromium, webkit })) for (const width of [1440, 390]) {
  test(`${name} ${width}: native member notifications, guest isolation, preferences, devices and expiry`, { timeout: 120000 }, async t => {
    const calls = [], errors = [], saves = [];
    let session = false, expired = false, read = false, revoked = false, complete = false;
    let preferences = { emailEnabled: true, pushEnabled: false, repliesEnabled: true, moderationEnabled: true, rewardsEnabled: false };
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
      const authenticated = session && requestHeaders.authorization === 'Bearer local-member-fixture';
      calls.push({ path: url.pathname, method: request.method(), authenticated });
      let status = 200, body = { items: [], hasMore: false, nextCursor: null };
      if (url.pathname === '/api/auth/email') {
        assert.equal(request.postDataJSON().password, 'historical12');
        session = true;
        headers['set-cookie'] = '__Host-lythaus_refresh=' + 'f'.repeat(48) + '; Path=/; HttpOnly; Secure; SameSite=Strict';
        body = { accessToken: 'local-member-fixture', sessionTransport: 'cookie-v1', expiresIn: 900 };
      } else if (url.pathname === '/api/auth/refresh') {
        status = session ? 200 : 401;
        body = session ? { accessToken: 'local-member-fixture', sessionTransport: 'cookie-v1', expiresIn: 900 } : { error: 'refresh_token_invalid' };
      } else if (url.pathname === '/api/auth/userinfo') body = user;
      else if (url.pathname === '/api/auth/logout') {
        session = false;
        headers['set-cookie'] = '__Host-lythaus_refresh=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
        body = { state: 'signed_out' };
      } else if (url.pathname === '/api/users/me') body = { user: { id: user.id, displayName: 'Synthetic member', trustPassportVisibility: 'private', moderationState: 'allowed', publicVisibility: false } };
      else if (url.pathname.startsWith('/api/notifications')) {
        if (!authenticated || expired) {
          status = 401; body = { error: { code: 'authentication_required', message: 'Authentication required' } };
        } else if (url.pathname === '/api/notifications') {
          body = { items: [{ id: 'native-1', notificationType: 'privacy_complete', entityId: 'privacy-1', title: 'Privacy request completed', readAt: read ? '2026-10-02T12:00:00Z' : null, createdAt: '2026-10-01T12:00:00Z' }], nextCursor: null, totalUnread: read ? 0 : 1 };
        } else if (url.pathname === '/api/notifications/native-1/read') {
          read = true; body = { id: 'native-1', action: 'read' };
        } else if (url.pathname === '/api/notifications/preferences') {
          if (request.method() === 'PUT') {
            const patch = normalizeNotificationPreferences(request.postDataJSON());
            assert.deepEqual([...patch.changedKeys].sort(), Object.keys(preferences).sort());
            preferences = Object.fromEntries(Object.keys(preferences).map(key => [key, patch[key]]));
            saves.push(preferences);
          }
          body = preferences;
        } else if (url.pathname === '/api/notifications/devices') {
          body = { items: revoked ? [] : [{ id: 'device-1', platform: 'web', active: true, created_at: '2026-10-01T12:00:00Z', revoked_at: null }] };
        } else if (url.pathname === '/api/notifications/devices/device-1/revoke') {
          revoked = true; body = { id: 'device-1', revoked: true };
        } else { status = 404; body = { error: 'route_not_found' }; }
      } else if (!['/api/feed/discover', '/api/subscription/status', '/api/custom-feeds', '/api/reputation/me'].includes(url.pathname)) {
        status = 404; body = { error: 'route_not_found' };
      }
      return route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const browser = await engine.launch({ headless: true, proxy: { server: fixture.proxy } });
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', ignoreHTTPSErrors: true });
    await installFlutterEngineFonts(context);
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    t.after(async () => {
      try { if (!complete) t.diagnostic(JSON.stringify({ calls, errors, url: page.url(), screen: await page.locator('flt-semantics').allTextContents(), labels: await page.locator('[aria-label]').evaluateAll(nodes => nodes.map(node => ({ role: node.getAttribute('role'), label: node.getAttribute('aria-label') }))) })); }
      finally { await browser.close(); await fixture.close(); }
    });
    const button = name => page.getByRole('button', { name, exact: true });
    const text = value => page.locator('flt-semantics').getByText(value, { exact: true });
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
    await open('/notifications');
    await button('Continue as guest').click();
    await text('Sign in to view your notifications.').waitFor();
    assert.equal(calls.filter(call => call.path.startsWith('/api/notifications')).length, 0);
    await button('Sign in').click();
    await enterText(page.getByRole('textbox', { name: 'Email', exact: true }), user.email);
    const password = page.locator('input[type=password]');
    await enterText(password, 'historical12'); await password.press('Enter');
    const notification = page.getByRole('group', { name: /Privacy request completed/ });
    await notification.waitFor();
    assert.ok(calls.some(call => call.path === '/api/notifications' && call.authenticated));
    const readReply = page.waitForResponse(response => new URL(response.url()).pathname === '/api/notifications/native-1/read' && response.status() === 200);
    await notification.click(); await (await readReply).finished();
    await text('This notification has no available destination.').waitFor();
    assert.equal(read, true);
    await open('/settings/notifications');
    await text('Quiet hours are not available yet.').waitFor();
    await page.getByRole('group', { name: /Web browser/ }).waitFor();
    const savedReply = page.waitForResponse(response => new URL(response.url()).pathname === '/api/notifications/preferences' && response.request().method() === 'PUT' && response.status() === 200);
    await page.getByLabel('Push notifications', { exact: true }).click(); await (await savedReply).finished();
    await page.getByRole('switch', { name: 'Push notifications', exact: true, checked: true }).waitFor();
    assert.equal(saves.length, 1); assert.equal(saves[0].pushEnabled, true);
    await button('Remove').click(); await page.locator('flt-semantics').getByText(/No devices registered/).waitFor();
    assert.equal(revoked, true);
    expired = true;
    await open('/notifications');
    await text('Sign in to view your notifications.').waitFor();
    assert.equal(await notification.count(), 0);
    await button('Sign in').click(); await button('Sign in with email').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/notifications');
    const privateRequests = calls.filter(call => call.path.startsWith('/api/notifications')).length;
    await button('Continue as guest').click();
    await text('Sign in to view your notifications.').waitFor();
    assert.equal(calls.filter(call => call.path.startsWith('/api/notifications')).length, privateRequests);
    assert.deepEqual(errors, []);
    complete = true;
  });
}
