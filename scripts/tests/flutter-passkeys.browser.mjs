import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';
import { classifyPublicError } from '../../apps/lythaus-public-api/src/auth-runtime-policy.ts';
import { passkeyFixture, fixturePassword, origin } from '../../apps/lythaus-public-api/tests/passkey-test-support.mjs';

const build = path.resolve(process.env.AUTH_WEB_ARTIFACT_DIR ?? 'build/web');
const evidence = process.env.AUTH_QA_DIR ?? '/tmp/lythaus-passkey-qa';
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.wasm':'application/wasm', '.ttf':'font/ttf', '.otf':'font/otf', '.png':'image/png' };

for (const width of [1440, 390]) {
  test(`chromium ${width}: actual PWA enrollment, maintenance, passkey login, removal and email fallback with a virtual authenticator`, async t => {
    const f = await passkeyFixture(t);
    const errors = [];
    const calls = [];
    const passkeyResponses = [];
    let session = false;
    const user = { id:f.userId, email:'passkey-synthetic@example.invalid', role:'user', tier:'bronze', subscription_tier:'free', reputation_score:0, created_at:'2026-08-01T00:00:00Z', last_login_at:'2026-08-01T00:00:00Z' };
    const originalPrincipal = f.deps.principal;
    f.deps.principal = async request => {
      const token = request.headers.get('authorization');
      if (token === `Bearer ${f.ownerToken}` || token === `Bearer synthetic-access-${f.userId}`) {
        const account = await f.control.query('SELECT token_version FROM identity.users WHERE id=$1', [f.userId]);
        return { userId:f.userId, roles:[], tokenVersion:account.rows[0].token_version };
      }
      return originalPrincipal(request);
    };
    const fixture = await localAuthBrowserServer(async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.hostname === 'app.lythaus.co') {
        let file = path.resolve(build, '.' + url.pathname);
        assert.ok(file === build || file.startsWith(build + path.sep));
        if (!path.extname(file)) file = path.join(build, 'index.html');
        try { return route.fulfill({ contentType:mime[path.extname(file)] ?? 'application/octet-stream', body:await readFile(file) }); }
        catch { return route.fulfill({ status:404, body:'Local build artifact missing' }); }
      }
      if (url.hostname !== 'api.lythaus.co') return route.abort();
      const incoming = await req.allHeaders();
      const headers = { 'access-control-allow-origin':origin, 'access-control-allow-credentials':'true',
        'access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers':'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode, X-Lythaus-Auth-Transport' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status:204, headers });
      calls.push(url.pathname);
      if (url.pathname.startsWith('/api/auth/passkeys')) {
        let response;
        try {
          response = await f.handler(new Request(req.url(), { method:req.method(), headers:incoming,
            ...(['POST','PATCH'].includes(req.method()) ? { body:req.postData() } : {}) }));
        } catch (error) {
          const classified = classifyPublicError(error);
          response = Response.json({ error:classified.exposedCode, correlationId:'synthetic-passkey-browser' }, { status:classified.status });
        }
        passkeyResponses.push({ path:url.pathname, status:response.status });
        if (url.pathname.endsWith('/login/verify') && response.status === 200) session = true;
        for (const [key, value] of response.headers) if (key !== 'set-cookie') headers[key] = value;
        const cookies = response.headers.getSetCookie();
        if (cookies.length) headers['set-cookie'] = cookies;
        return route.fulfill({ status:response.status, headers, contentType:'application/json', body:await response.text() });
      }
      let status = 200;
      let body = { items:[], hasMore:false, nextCursor:null };
      if (url.pathname.endsWith('/auth/email')) {
        assert.equal(req.postDataJSON().password, fixturePassword);
        session = true;
        headers['set-cookie'] = '__Host-lythaus_refresh=' + 'e'.repeat(64) + '; Path=/; HttpOnly; Secure; SameSite=Strict';
        body = { accessToken:f.ownerToken, sessionTransport:'cookie-v1', expiresIn:900 };
      } else if (url.pathname.endsWith('/auth/refresh')) {
        if (session && incoming.cookie?.includes('__Host-lythaus_refresh=')) body = { accessToken:f.ownerToken, sessionTransport:'cookie-v1', expiresIn:900 };
        else { status = 401; body = { error:'refresh_token_invalid' }; }
      } else if (url.pathname.endsWith('/auth/userinfo')) {
        if (session) body = user;
        else { status = 401; body = { error:'authentication_required' }; }
      } else if (url.pathname.endsWith('/auth/logout')) {
        session = false;
        headers['set-cookie'] = '__Host-lythaus_refresh=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
        body = { loggedOut:true, sessionRevocation:'all' };
      } else if (url.pathname === '/api/users/me') {
        assert.ok(session);
        assert.equal(req.method(), 'GET');
        assert.ok([`Bearer ${f.ownerToken}`, `Bearer synthetic-access-${f.userId}`].includes(incoming.authorization));
        body = { user:{ id:f.userId, displayName:'Synthetic passkey owner', bio:'', moderationState:'allowed', publicVisibility:true, subscriptionTier:'free' } };
      } else if (url.pathname === `/api/users/${f.userId}`) body = { user:{ id:f.userId, handle:'synthetic_passkey', displayName:'Synthetic passkey owner', trustPassportVisibility:'private', reputationScore:0 } };
      else if (!['/api/feed/discover','/api/subscription/status','/api/custom-feeds','/api/users/me/reputation','/api/reputation/me'].includes(url.pathname)) {
        status = 404; body = { error:'route_not_found' };
      }
      return route.fulfill({ status, headers, contentType:'application/json', body:JSON.stringify(body) });
    });
    const browser = await chromium.launch({ headless:true, proxy:{ server:fixture.proxy, bypass:'<-loopback>' } });
    const context = await browser.newContext({ ignoreHTTPSErrors:true, viewport:{ width,height:1000 }, serviceWorkers:'block' });
    await installFlutterEngineFonts(context);
    const page = await context.newPage();
    async function capture(label) {
      await mkdir(evidence, { recursive:true });
      const state = { label, url:page.url(), title:await page.title(), errors, calls,
        screen:await page.locator('flt-semantics').allTextContents(),
        semantics:await page.locator('flt-semantics').evaluateAll(nodes => nodes.map(node => ({
          role:node.getAttribute('role'), label:node.getAttribute('aria-label'), text:node.textContent,
        }))) };
      await writeFile(path.join(evidence, `passkeys-${width}-${label}.json`), JSON.stringify(state, null, 2));
      await page.screenshot({ path:path.join(evidence, `passkeys-${width}-${label}.png`) });
    }
    t.after(async () => {
      try { if (!page.isClosed()) await capture('last'); }
      finally { await browser.close(); await fixture.close(); }
    });
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options:{ protocol:'ctap2', transport:'internal', hasResidentKey:true, hasUserVerification:true, isUserVerified:true, automaticPresenceSimulation:true } });
    await page.goto(origin);
    await page.locator('flt-semantics-placeholder').waitFor({ timeout:60000 });
    await page.locator('flt-semantics-placeholder').evaluate(node => node.click());
    await page.getByRole('button', { name:'Sign in with email', exact:true }).waitFor();
    await page.getByRole('button', { name:'Sign in with a passkey', exact:true }).waitFor();
    assert.equal(await page.title(), 'Lythaus');
    assert.equal(await page.evaluate(() => isSecureContext), true);
    await mkdir(evidence, { recursive:true });
    await page.screenshot({ path:path.join(evidence, `passkeys-${width}-entry.png`) });
    async function enter(field, value) {
      await field.click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await field.press('ControlOrMeta+A');
      await field.press('Backspace');
      await field.pressSequentially(value, { delay:10 });
      assert.equal(await field.inputValue(), value);
    }
    async function emailLogin() {
      await enter(page.getByRole('textbox', { name:'Email',exact:true }), user.email);
      const password = page.locator('input[type=password]');
      await enter(password, fixturePassword);
      await password.press('Enter');
      await page.getByText('No posts yet', { exact:true }).waitFor();
    }
    async function security() {
      await capture('feed');
      if (width < 700) {
        await page.getByRole('button', { name:/^Profile(?:\b|$)/ }).click();
        await page.getByText('No posts yet', { exact:true }).waitFor({ state:'hidden' });
        await page.getByText('Synthetic passkey owner', { exact:true }).waitFor();
        await capture('profile');
      }
      await page.getByRole('button', { name:'Settings',exact:true }).click();
      await page.getByText(/^Privacy and your data\n/).waitFor();
      if (width >= 700) await page.getByText('No posts yet', { exact:true }).waitFor({ state:'hidden' });
      else await page.getByText('Synthetic passkey owner', { exact:true }).waitFor({ state:'hidden' });
      await capture('settings');
      await page.getByText('Account security', { exact:true }).click();
      await page.getByText(/^Privacy and your data\n/).waitFor({ state:'hidden' });
      await page.getByText(/^Signed-in account\n/).waitFor();
      await capture('security');
    }
    await emailLogin();
    await security();
    await page.getByText(/^Passkeys\nAdd, verify/).click();
    await page.getByText(/^Signed-in account\n/).waitFor({ state:'hidden' });
    await page.getByRole('button', { name:'Add a passkey',exact:true }).click();
    await enter(page.getByRole('textbox', { name:'Name',exact:true }), 'Synthetic virtual passkey');
    await enter(page.locator('input[type=password]'), 'Incorrect synthetic password!');
    await page.getByRole('button', { name:'Save',exact:true }).click();
    await page.locator('flt-semantics').getByText('Passkey verification failed. You can use email and password.', { exact:true }).waitFor();
    assert.equal((await f.control.query('SELECT count(*)::int AS count FROM identity.passkey_challenges WHERE user_id=$1 AND purpose=$2', [f.userId, 'register'])).rows[0].count, 0);
    assert.equal((await f.control.query('SELECT count(*)::int AS count FROM identity.passkey_credentials WHERE user_id=$1', [f.userId])).rows[0].count, 0);
    assert.deepEqual((await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials, []);
    await capture('enrollment-rejected');
    await page.getByRole('button', { name:'Add a passkey',exact:true }).click();
    await enter(page.getByRole('textbox', { name:'Name',exact:true }), 'Synthetic virtual passkey');
    await enter(page.locator('input[type=password]'), fixturePassword);
    await page.getByRole('button', { name:'Save',exact:true }).click();
    await page.locator('flt-semantics').getByText('Passkey saved.', { exact:true }).waitFor();
    await page.getByRole('group', { name:/^Synthetic virtual passkey\b/ }).waitFor();
    assert.equal((await f.control.query('SELECT name FROM identity.passkey_credentials WHERE user_id=$1 AND revoked_at IS NULL', [f.userId])).rows[0].name, 'Synthetic virtual passkey');
    assert.equal((await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials.length, 1);
    await capture('enrolled');
    await page.getByRole('button', { name:'Verify an existing passkey',exact:true }).click();
    await page.locator('flt-semantics').getByText('Passkey verified.', { exact:true }).waitFor();
    await page.getByRole('button', { name:'Rename passkey',exact:true }).click();
    await enter(page.getByRole('textbox', { name:'Name',exact:true }), 'Renamed virtual passkey');
    await page.getByRole('button', { name:'Save',exact:true }).click();
    await page.locator('flt-semantics').getByText('Passkey saved.', { exact:true }).waitFor();
    await page.getByRole('group', { name:/^Renamed virtual passkey\b/ }).waitFor();
    assert.equal((await f.control.query('SELECT name FROM identity.passkey_credentials WHERE user_id=$1 AND revoked_at IS NULL', [f.userId])).rows[0].name, 'Renamed virtual passkey');
    await page.screenshot({ path:path.join(evidence, `passkeys-${width}-management.png`) });
    await page.getByRole('button', { name:'Back',exact:true }).click();
    await page.getByRole('button', { name:'Add a passkey',exact:true }).waitFor({ state:'hidden' });
    await page.getByRole('button', { name:'Sign out of all sessions',exact:true }).click();
    await page.getByText(/^Signed-in account\n/).waitFor({ state:'hidden' });
    await page.getByRole('button', { name:'Sign in with a passkey',exact:true }).waitFor();
    const passkeyLoginCallStart = calls.length;
    const passkeyLoginResponseStart = passkeyResponses.length;
    await page.getByRole('button', { name:'Sign in with a passkey',exact:true }).click();
    try {
      await page.getByText('No posts yet', { exact:true }).waitFor();
    } catch (error) {
      console.log('PASSKEY_LOGIN_DIAGNOSTIC ' + JSON.stringify({
        viewport:width,
        session,
        apiCalls:calls.slice(passkeyLoginCallStart),
        passkeyResponses:passkeyResponses.slice(passkeyLoginResponseStart),
        screen:await page.locator('flt-semantics').allTextContents(),
        pageErrors:errors,
      }));
      throw error;
    }
    const cookies = await context.cookies('https://api.lythaus.co');
    assert.ok(cookies.some(cookie => cookie.name === '__Host-lythaus_refresh' && cookie.httpOnly && cookie.secure && cookie.sameSite === 'Strict'));
    assert.ok(!(await page.evaluate(() => Object.keys(localStorage))).some(key => ['jwt','refreshToken','userData'].includes(key)));
    await security();
    await page.getByText(/^Passkeys\nAdd, verify/).click();
    await page.getByText(/^Signed-in account\n/).waitFor({ state:'hidden' });
    await page.getByRole('button', { name:'Remove passkey',exact:true }).click();
    await enter(page.locator('input[type=password]'), fixturePassword);
    await page.getByRole('button', { name:'Remove',exact:true }).click();
    await page.getByRole('button', { name:'Sign in with email',exact:true }).waitFor();
    assert.equal((await f.control.query('SELECT count(*)::int AS count FROM identity.passkey_credentials WHERE user_id=$1 AND revoked_at IS NULL', [f.userId])).rows[0].count, 0);
    assert.equal((await f.control.query('SELECT count(*)::int AS count FROM identity.auth_sessions WHERE user_id=$1 AND revoked_at IS NULL', [f.userId])).rows[0].count, 0);
    await emailLogin();
    assert.ok(calls.includes('/api/auth/passkeys/login/verify'));
    assert.ok(calls.includes('/api/auth/passkeys/maintenance/verify'));
    assert.ok(calls.filter(call => call === '/api/users/me').length >= 2);
    assert.equal((await f.control.query(`SELECT count(*)::int AS count FROM identity.account_events WHERE user_id=$1 AND event_type='security.strong_auth_evidence'`, [f.userId])).rows[0].count, 2);
    assert.deepEqual(errors, []);
  });
}
