import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium, webkit } from 'playwright';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';
import { authorPrivateAlphaView } from '../../packages/authenticity/src/private-alpha.ts';

const build = path.resolve(process.env.AUTH_WEB_ARTIFACT_DIR ?? 'build/web');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png' };
const id = '01990000-0000-7000-8000-000000000711';
const user = { id, email: 'alpha@example.invalid', role: 'user', tier: 'bronze', subscription_tier: 'free', reputation_score: 0, created_at: '2026-08-01T00:00:00Z', last_login_at: '2026-08-01T00:00:00Z' };
for (const [name, engine, width] of [['chromium', chromium, 1440], ['webkit', webkit, 390]]) {
  test(`${name} ${width}: private route auth, text submission, unavailable result, refresh and deletion`, async t => {
    let session = false, exists = false, unavailable = false, completed = false;
    const calls = [], errors = [];
    const item = () => authorPrivateAlphaView({ id, state: 'failed', contentKind: 'text', result: null, reviewState: 'none', textPresent: true, imagePresent: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 900000).toISOString() });
    const fixture = await localAuthBrowserServer(async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname === 'app.lythaus.co') {
        const file = path.join(build, path.extname(url.pathname) ? url.pathname : 'index.html');
        const body = await readFile(file).catch(() => null);
        return body ? route.fulfill({ body, contentType: mime[path.extname(file)] ?? 'application/octet-stream' }) : route.fulfill({ status: 404 });
      }
      if (url.hostname !== 'api.lythaus.co') return route.abort();
      const h = await request.allHeaders();
      const headers = { 'access-control-allow-origin': 'https://app.lythaus.co', 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode, X-Lythaus-Auth-Transport', 'cache-control': 'private, no-store' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      calls.push({ path: url.pathname, method: request.method() });
      let status = 200, body = { items: [], hasMore: false, nextCursor: null };
      if (url.pathname.endsWith('/auth/email')) {
        session = true;
        headers['set-cookie'] = '__Host-lythaus_refresh=' + 'a'.repeat(48) + '; Path=/; HttpOnly; Secure; SameSite=Strict';
        body = { accessToken: 'protocol-alpha-token', sessionTransport: 'cookie-v1', expiresIn: 900 };
      } else if (url.pathname.endsWith('/auth/refresh')) {
        status = session ? 200 : 401;
        body = session ? { accessToken: 'protocol-alpha-token', sessionTransport: 'cookie-v1', expiresIn: 900 } : { error: 'refresh_token_invalid' };
      } else if (url.pathname.endsWith('/auth/userinfo')) body = user;
      else if (url.pathname.startsWith('/api/authenticity/alpha/cases')) {
        assert.equal(h.authorization, 'Bearer protocol-alpha-token');
        if (unavailable) { status = 503; body = { error: 'alpha_unavailable' }; }
        else if (request.method() === 'DELETE') { exists = false; body = { caseId: id, status: 'deleted', purgeStatus: 'completed' }; }
        else if (request.method() === 'POST') {
          assert.ok(h['idempotency-key']);
          const input = request.postDataJSON();
          assert.equal(input.contentKind, 'text'); assert.equal(input.trainingConsent, false); assert.equal(input.text, 'Private browser protocol fixture.');
          exists = true; status = 201; body = { caseId: id, status: 'queued' };
        } else body = url.pathname.endsWith('/cases') ? { items: exists ? [item()] : [] } : item();
      }
      return route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const browser = await engine.launch({ headless: true, proxy: { server: fixture.proxy } });
    const context = await browser.newContext({ viewport: { width, height: 1100 }, serviceWorkers: 'block', ignoreHTTPSErrors: true });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    t.after(async () => {
      if (!completed) {
        if (process.env.AUTH_QA_DIR) { await mkdir(process.env.AUTH_QA_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.AUTH_QA_DIR, `alpha-${name}-${width}-failure.png`) }); }
        t.diagnostic(JSON.stringify({ calls, errors, url: page.url(), controls: await page.locator('flt-semantics').evaluateAll(nodes => nodes.filter(node => node.hasAttribute('role') || node.hasAttribute('aria-label')).map(node => ({ role: node.getAttribute('role'), label: node.getAttribute('aria-label'), text: node.textContent, bounds: node.getBoundingClientRect().toJSON() }))) }));
      }
      await browser.close(); await fixture.close();
    });
    const open = async route => {
      await page.goto('https://app.lythaus.co' + route);
      const placeholder = page.locator('flt-semantics-placeholder');
      await placeholder.waitFor({ timeout: 60000 }); await placeholder.evaluate(node => node.click());
    };
    await open('/authenticity');
    await page.getByRole('button', { name: 'Sign in with email', exact: true }).waitFor();
    assert.equal(calls.some(call => call.path.startsWith('/api/authenticity/alpha/')), false);
    const enter = async (field, value) => {
      await field.click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await field.pressSequentially(value, { delay: 10 });
    };
    session = true;
    await context.addCookies([{ name: '__Host-lythaus_refresh', value: 'a'.repeat(48), url: 'https://api.lythaus.co', httpOnly: true, secure: true, sameSite: 'Strict' }]);
    await open('/');
    await page.getByText('No posts yet', { exact: true }).waitFor();
    await open('/authenticity');
    assert.equal(await page.title(), 'Lythaus');
    const emptyCases = () => page.getByText('No private alpha cases yet.', { exact: true }).or(page.getByLabel('No private alpha cases yet.', { exact: true })).first();
    await emptyCases().waitFor();
    await page.getByRole('button', { name: /Submission.*Text plus image/s }).click();
    await page.getByRole('menuitem', { name: 'Text only', exact: true }).click();
    await enter(page.getByRole('textbox', { name: /Text or caption/ }), 'Private browser protocol fixture.');
    await page.getByRole('checkbox').click();
    await page.waitForFunction(() => document.querySelector('flt-semantics[role="checkbox"]')?.getAttribute('aria-checked') === 'true');
    await page.getByRole('button', { name: 'Submit text', exact: true }).click();
    await page.getByRole('button', { name: /^text: failed/ }).click();
    await page.mouse.move(width / 2, 800); await page.mouse.wheel(0, 700);
    await page.getByLabel(/Processing is unavailable\. No authorship finding is available\./).waitFor({ timeout: 5000 });
    await page.mouse.wheel(0, 1200);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await page.locator('flt-semantics').allTextContents()).join(' ').includes('rawClassifierScore'), false);
    const creates = () => calls.filter(call => call.path.endsWith('/cases') && call.method === 'POST').length;
    assert.equal(creates(), 1);
    if (process.env.AUTH_QA_DIR) { await mkdir(process.env.AUTH_QA_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.AUTH_QA_DIR, `alpha-${name}-${width}.png`) }); }
    await page.mouse.wheel(0, -1000);
    unavailable = true;
    await page.getByRole('button', { name: 'Refresh cases', exact: true }).click();
    await page.getByText('Private alpha is unavailable or your account is not admitted.', { exact: true }).waitFor();
    unavailable = false;
    await page.getByRole('button', { name: 'Refresh cases', exact: true }).click();
    assert.equal(creates(), 1);
    await page.mouse.wheel(0, 1400);
    await page.getByRole('button', { name: 'Delete case', exact: true }).click();
    await page.mouse.wheel(0, -1500);
    await emptyCases().waitFor();
    assert.ok(calls.some(call => call.method === 'DELETE'));
    assert.deepEqual(errors.filter(message => !/^\/fonts\.gstatic\.com\/s\/roboto\//.test(message)), []);
    completed = true;
  });
}
