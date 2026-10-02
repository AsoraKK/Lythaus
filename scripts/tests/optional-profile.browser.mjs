import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium, webkit } from 'playwright';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';
import { parseProfileUpdate } from '../../apps/lythaus-public-api/src/profile-runtime-policy.ts';

const build = path.resolve(process.env.AUTH_WEB_ARTIFACT_DIR ?? 'build/web');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png' };
const user = { id: '018f0000-0000-7000-8000-000000000001', email: 'synthetic@example.invalid', role: 'user',
  subscription_tier: 'free', reputation_score: 0, created_at: '2026-08-01T00:00:00Z', last_login_at: '2026-08-01T00:00:00Z' };

for (const [engineName, engine] of Object.entries({ chromium, webkit })) for (const width of [1440, 390]) {
  test(`${engineName} ${width}: optional profile partial save, skip, pending state and interruption`, async t => {
    let session = false;
    let profile = { id: user.id, displayName: '', bio: '', moderationState: 'allowed', publicVisibility: true, subscriptionTier: 'free' };
    const patches = [], privateReads = [], errors = [], failedRequests = [], consoleErrors = [];
    let phase = 'entry';
    const requestPhases = new WeakMap();
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
      const headers = { 'access-control-allow-origin': 'https://app.lythaus.co', 'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
        'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode, X-Lythaus-Auth-Transport' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      let status = 200, body = { items: [], hasMore: false, nextCursor: null };
      if (url.pathname === '/api/auth/email') {
        session = true;
        headers['set-cookie'] = '__Host-lythaus_refresh=' + 'f'.repeat(48) + '; Path=/; HttpOnly; Secure; SameSite=Strict';
        body = { accessToken: 'synthetic-profile-token', expiresIn: 900, sessionTransport: 'cookie-v1' };
      } else if (url.pathname === '/api/auth/refresh') {
        const cookie = (await request.allHeaders()).cookie;
        status = session && cookie?.includes('__Host-lythaus_refresh=') ? 200 : 401;
        body = status === 200 ? { accessToken: 'synthetic-profile-token', expiresIn: 900, sessionTransport: 'cookie-v1' } : { error: 'refresh_token_invalid' };
      } else if (url.pathname === '/api/auth/userinfo') body = user;
      else if (url.pathname === '/api/auth/passkeys/capabilities') body = { enabled: false };
      else if (url.pathname === '/api/auth/logout') { session = false; body = { state: 'signed_out' }; }
      else if (url.pathname === '/api/users/me') {
        assert.ok(session);
        assert.equal((await request.allHeaders()).authorization, 'Bearer synthetic-profile-token');
        if (request.method() === 'PATCH') {
          const patch = parseProfileUpdate(request.postDataJSON());
          patches.push({ data: patch, key: (await request.allHeaders())['idempotency-key'] });
          profile = { ...profile, ...patch, moderationState: 'under_review' };
        } else {
          privateReads.push(profile.moderationState);
          // Make cancellation on setup disposal reproducible on fast local hosts.
          if (patches.length === 1) await new Promise(resolve => setTimeout(resolve, 150));
        }
        body = { user: profile };
      } else if (url.pathname === `/api/users/${user.id}`) {
        status = profile.moderationState === 'allowed' && profile.publicVisibility ? 200 : 404;
        body = status === 200 ? { user: { id: user.id, displayName: profile.displayName, bio: profile.bio } } : { error: 'profile_not_found' };
      } else if (url.pathname === '/api/reputation/me') {
        body = { userId: user.id, level: 0, reputationLevel: 0, levelName: 'New',
          reputationStatus: 'active', reputationBand: 'new', policyVersion: 'reputation-v2.0.0',
          pillars: { accountability: 0, contribution: 0, conduct: 0, sourcing: 0, authenticity: 0, reviewReliability: 0 },
          promotionBlockers: [], evaluatedAt: null };
      } else if (!['/api/feed/discover', '/api/custom-feeds', '/api/subscription/status'].includes(url.pathname)) {
        status = 404; body = { error: 'route_not_found' };
      }
      return route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const browser = await engine.launch({ headless: true, proxy: { server: fixture.proxy } });
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', ignoreHTTPSErrors: true });
    await installFlutterEngineFonts(context);
    let page = await context.newPage(); page.setDefaultTimeout(30000);
    function observe(target) {
      target.on('request', request => requestPhases.set(request, phase));
      target.on('pageerror', error => errors.push(error.message));
      target.on('console', message => {
        if (message.type() !== 'error') return;
        const location = message.location();
        const expectedRefreshRejection = location.url === 'https://api.lythaus.co/api/auth/refresh'
          && /^Failed to load resource:.*401/.test(message.text());
        consoleErrors.push({ message: message.text(), location, expectedRefreshRejection });
        if (!expectedRefreshRejection) errors.push(message.text());
      });
      target.on('requestfailed', request => {
        const url = new URL(request.url()), failure = request.failure()?.errorText;
        const requestPhase = requestPhases.get(request);
        const expectedSetupDisposal = requestPhase === 'saving-partial'
          && patches.length >= 1 && request.method() === 'GET'
          && url.origin === 'https://api.lythaus.co' && url.pathname === '/api/users/me'
          && ['net::ERR_ABORTED', 'Load request cancelled'].includes(failure);
        failedRequests.push({ resource: url.origin + url.pathname,
          method: request.method(), failure, phase: requestPhase, expectedSetupDisposal });
      });
    }
    observe(page);
    t.after(async () => {
      if (errors.length || failedRequests.length) t.diagnostic(JSON.stringify({ failedRequests, consoleErrors }));
      if (process.env.AUTH_QA_DIR) {
        await mkdir(process.env.AUTH_QA_DIR, { recursive: true });
        await writeFile(path.join(process.env.AUTH_QA_DIR, `profile-${engineName}-${width}-network.json`), JSON.stringify({ failedRequests, consoleErrors }, null, 2));
      }
      await browser.close(); await fixture.close();
    });
    async function activate() {
      await page.locator('flt-semantics-placeholder').waitFor({ timeout: 60000 });
      await page.locator('flt-semantics-placeholder').evaluate(node => node.click());
    }
    async function open(url = 'https://app.lythaus.co/') { await page.goto(url); await activate(); }
    async function type(field, value) {
      await field.click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await field.press('ControlOrMeta+A'); await field.press('Backspace');
      if (value) await field.pressSequentially(value, { delay: 15 });
      assert.equal(await field.inputValue(), value);
    }
    async function fieldValue(field) {
      await field.click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return field.inputValue();
    }
    async function signIn() {
      await type(page.getByRole('textbox', { name: 'Email', exact: true }), user.email);
      await type(page.locator('input[type=password]'), 'synthetic-profile-password');
      await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
      await page.getByText('Set up your profile (optional)', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Save profile', exact: true }).waitFor();
    }
    async function ownProfile() {
      await page.getByRole('button', { name: /^Profile(?:\b|$)/ }).first().click();
      await page.getByRole('button', { name: /^Edit profile(?:\b|$)/ }).waitFor();
    }
    async function shot(state) {
      if (!process.env.AUTH_QA_DIR) return;
      await mkdir(process.env.AUTH_QA_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.AUTH_QA_DIR, `profile-${engineName}-${width}-${state}.png`) });
    }
    await open();
    assert.equal(await page.title(), 'Lythaus');
    await signIn();
    assert.ok((await page.locator('flt-semantics').allTextContents()).some(text => text.includes('Save profile')));
    await type(page.getByRole('textbox', { name: /Display name/ }), 'ＦＵＣＫ');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.locator('flt-semantics').getByText('Please choose a different display name', { exact: true }).waitFor();
    assert.equal(patches.length, 0);
    await type(page.getByRole('textbox', { name: /Display name/ }), '');
    await type(page.getByRole('textbox', { name: /Bio/ }), 'Saved partial profile');
    await shot('partial-before-save');
    phase = 'saving-partial';
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.getByText('No posts yet', { exact: true }).waitFor();
    phase = 'discover-after-partial';
    assert.deepEqual(patches[0].data, { bio: 'Saved partial profile' });
    assert.ok(patches[0].key);
    await ownProfile();
    await page.locator('flt-semantics').getByText('Saved, under review. Your profile changes are not public yet.', { exact: true }).first().waitFor();
    await shot('pending-owner');
    await page.getByRole('button', { name: /^Edit profile(?:\b|$)/ }).click();
    const bio = page.getByRole('textbox', { name: /Bio/ });
    assert.equal(await fieldValue(bio), 'Saved partial profile');
    await type(bio, 'Unsaved interruption');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByText('Discard unsaved changes?', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    assert.equal(await fieldValue(bio), 'Unsaved interruption');
    assert.equal(patches.length, 1);
    phase = 'refresh-interruption';
    await page.reload(); await activate();
    phase = 'restored-session';
    assert.equal(await page.getByText('Set up your profile (optional)', { exact: true }).count(), 0);
    await ownProfile();
    await page.getByRole('button', { name: /^Edit profile(?:\b|$)/ }).click();
    assert.equal(await fieldValue(page.getByRole('textbox', { name: /Bio/ })), 'Saved partial profile');
    await type(page.getByRole('textbox', { name: /Display name/ }), 'Zoë O’Connor');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.getByRole('button', { name: /^Edit profile(?:\b|$)/ }).waitFor();
    assert.deepEqual(patches[1].data, { displayName: 'Zoë O’Connor' });
    assert.ok(privateReads.length >= 3);
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.deepEqual(failedRequests.filter(request => !request.expectedSetupDisposal), []);
    assert.ok(!/Next\.js|Unhandled exception|ErrorWidget/.test((await page.locator('flt-semantics').allTextContents()).join('\n')));

    await context.close();
    phase = 'skip-session';
    profile = { ...profile, displayName: '', bio: '', moderationState: 'allowed' }; session = false;
    const fresh = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', ignoreHTTPSErrors: true });
    await installFlutterEngineFonts(fresh);
    const skipPage = await fresh.newPage(); skipPage.setDefaultTimeout(30000);
    observe(skipPage);
    page = skipPage;
    await open();
    await signIn();
    await skipPage.getByRole('button', { name: 'Skip and explore', exact: true }).click();
    await skipPage.getByText('No posts yet', { exact: true }).waitFor();
    assert.equal(patches.length, 2, 'Skip must not write profile data');
    await skipPage.getByRole('button', { name: /^Profile(?:\b|$)/ }).first().click();
    await skipPage.getByRole('button', { name: /^Complete your profile(?:\b|$)/ }).waitFor();
    await shot('skipped');
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.deepEqual(failedRequests.filter(request => !request.expectedSetupDisposal), []);
    await fresh.close();
  });
}
