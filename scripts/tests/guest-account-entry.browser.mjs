import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium, webkit } from 'playwright';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';

const build = path.resolve(process.env.AUTH_WEB_ARTIFACT_DIR ?? 'build/web');
const evidence = path.resolve(process.env.GUEST_SEARCH_EVIDENCE_DIR ?? 'build/guest-search-evidence');
await mkdir(evidence, { recursive: true });
assert.match(await readFile(path.join(build, 'flutter_bootstrap.js'), 'utf8'), /"useLocalCanvasKit":true/);
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png' };
const user = { id: '018f0000-0000-7000-8000-000000000001', email: 'synthetic@example.invalid', role: 'user', tier: 'bronze', subscription_tier: 'free', reputation_score: 0, created_at: '2026-08-01T00:00:00Z', last_login_at: '2026-08-01T00:00:00Z' };

for (const [name, engine] of Object.entries({ chromium, webkit })) for (const width of [1440, 390]) {
  test(`${name} ${width}: actual guest account entry, cancellation, query return and unsupported feeds`, { timeout: 120000 }, async t => {
    const calls = [], errors = [];
    let session = false, complete = false;
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
      calls.push({ path: url.pathname, method: request.method(), session, query: Object.fromEntries(url.searchParams) });
      let status = 200, body = { items: [], hasMore: false, nextCursor: null };
      if (url.pathname === '/api/auth/email') {
        assert.equal(request.postDataJSON().password, 'historical12');
        session = true;
        headers['set-cookie'] = '__Host-lythaus_refresh=' + 'f'.repeat(48) + '; Path=/; HttpOnly; Secure; SameSite=Strict';
        body = { accessToken: 'local-access-fixture', sessionTransport: 'cookie-v1', expiresIn: 900 };
      } else if (url.pathname === '/api/auth/refresh') {
        status = session ? 200 : 401;
        body = session ? { accessToken: 'local-access-fixture', sessionTransport: 'cookie-v1', expiresIn: 900 } : { error: 'refresh_token_invalid' };
      } else if (url.pathname === '/api/auth/userinfo') body = user;
      else if (url.pathname === '/api/auth/logout') {
        session = false;
        headers['set-cookie'] = '__Host-lythaus_refresh=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
        body = { state: 'signed_out' };
      } else if (url.pathname === '/api/users/me') body = { user: { id: user.id, displayName: 'Synthetic acceptance', trustPassportVisibility: 'private', moderationState: 'allowed', publicVisibility: false, reputationScore: 0 } };
      else if (url.pathname === '/api/feed/discover' && url.searchParams.has('tag')) {
        status = 503; body = { error: 'tag_search_unavailable' };
      } else if (!['/api/feed/discover', '/api/subscription/status', '/api/custom-feeds', '/api/reputation/me'].includes(url.pathname)) {
        status = 404; body = { error: 'route_not_found' };
      }
      return route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const browser = await engine.launch({ headless: true, proxy: { server: fixture.proxy } });
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', ignoreHTTPSErrors: true });
    await installFlutterEngineFonts(context);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    t.after(async () => {
      try { if (!complete) t.diagnostic(JSON.stringify({ calls, errors, url: page.url(), screen: await page.locator('flt-semantics').allTextContents() })); }
      finally { await browser.close(); await fixture.close(); }
    });
    const button = name => page.getByRole('button', { name, exact: true });
    const text = value => page.getByText(value, { exact: true });
    const waitPath = expected => page.waitForURL(url => url.pathname + url.search === expected);
    async function enterText(field, value) {
      await field.click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await field.press('ControlOrMeta+A');
      await field.press('Backspace');
      await field.pressSequentially(value, { delay: 20 });
      assert.equal(await field.inputValue(), value);
    }
    async function open(location = '/') {
      await page.goto('https://app.lythaus.co' + location);
      await page.locator('flt-semantics-placeholder').waitFor({ timeout: 60000 });
      await page.locator('flt-semantics-placeholder').evaluate(node => node.click());
    }
    async function cancelEntry(destination) {
      await button('Sign in').click();
      await button('Sign in with email').waitFor();
      assert.equal(new URL(page.url()).searchParams.get('returnTo'), destination);
      await button('Continue as guest').click();
      await waitPath(destination);
      await button('Sign in with email').waitFor({ state: 'hidden' });
    }
    await open();
    await button('Continue as guest').click();
    await text('No posts yet').waitFor();
    await button('Trending').click();
    await text('Trending is not available yet.').waitFor();
    assert.equal(await button('Retry').count(), 0);
    await button('Back').click();
    await text('No posts yet').waitFor();
    for (const [label, tab] of [['Profile', 'profile'], ['Rewards', 'rewards'], ['Create', 'create']]) {
      await page.getByRole('button', { name: new RegExp('^' + label + '(?:\\b|$)') }).click();
      await waitPath('/?tab=' + tab);
      await cancelEntry('/?tab=' + tab);
    }
    if (width === 1440) {
      await button('Settings').click();
      await text('Notifications').click();
      await text('Sign in to view your notifications.').waitFor();
      await cancelEntry('/notifications');
      await button('Back').click();
    } else {
      await page.getByRole('button', { name: /^Discover(?:\b|$)/ }).click();
    }
    await button('Search').click();
    const query = page.getByRole('textbox', { name: 'Search tags', exact: true });
    const expectQuery = async () => {
      await query.click();
      await page.waitForFunction(() => [...document.querySelectorAll('input')].some(input => input.value === 'water'));
      assert.equal(await query.inputValue(), 'water');
    };
    await enterText(query, 'water');
    await query.press('Enter');
    await waitPath('/search?q=water');
    await expectQuery();
    await text('Tag search is temporarily unavailable.').waitFor();
    assert.equal(await button('Retry search').count(), 1);
    assert.equal(await text('No results for “water”').count(), 0);
    assert.equal(await button('Sign in').count(), 0);
    const searchCallsBeforeRetry = calls.filter(call => call.path === '/api/feed/discover' && call.query.tag === 'water');
    assert.ok(searchCallsBeforeRetry.length > 0);
    assert.ok(searchCallsBeforeRetry.every(call => call.method === 'GET' && !call.session));
    const retryResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.hostname === 'api.lythaus.co' && url.pathname === '/api/feed/discover' && url.searchParams.get('tag') === 'water';
    });
    await button('Retry search').click();
    assert.equal((await retryResponse).status(), 503);
    assert.ok(calls.filter(call => call.path === '/api/feed/discover' && call.query.tag === 'water').length > searchCallsBeforeRetry.length);
    await open('/search?q=water');
    await button('Continue as guest').click();
    await waitPath('/search?q=water');
    await expectQuery();
    await text('Tag search is temporarily unavailable.').waitFor();
    assert.equal(await button('Retry search').count(), 1);
    assert.deepEqual(calls.filter(call => ['/api/feed', '/api/feed/trending', '/api/notifications'].includes(call.path)), []);
    const allSearchCalls = calls.filter(call => call.path === '/api/feed/discover' && call.query.tag === 'water');
    assert.ok(allSearchCalls.length > searchCallsBeforeRetry.length);
    assert.ok(allSearchCalls.every(call => call.method === 'GET' && !call.session));
    assert.equal(await button('Sign in').count(), 0);
    assert.deepEqual(calls.filter(call => ['/api/feed', '/api/feed/trending', '/api/notifications'].includes(call.path)), []);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(evidence, `${name}-${width}.png`), fullPage: true });
    complete = true;
  });
}
