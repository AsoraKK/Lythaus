import assert from 'node:assert/strict';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { allowsAppAuthCors, allowsAppAuthPostBody, classifyAppAuthRequest } from '../release/app-only-auth-network-policy.mjs';
import { installFlutterEngineFonts } from '../tests/flutter-engine-font-fixture.mjs';

const API = 'https://api.lythaus.co';
const APP = 'https://app.lythaus.co';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json',
  '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };

async function artifactFile(root, pathname) {
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(part => part === '.' || part === '..')) throw new Error('unsafe artifact path');
  let relative = decoded.replace(/^\/+/, '');
  if (!relative || !path.extname(relative)) relative = 'index.html';
  let current = root;
  for (const part of relative.split('/')) {
    if (!part) throw new Error('unsafe artifact path');
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error('artifact symlink refused');
  }
  const resolved = await realpath(current);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('unsafe artifact path');
  return resolved;
}
/**
 * Runs the actual artifact in a browser, forwarding only the allowlisted API
 * requests. The production caller must supply the already verified CI artifact
 * and authorized test account. No screenshot, trace, credentials, response
 * bodies, or request paths are emitted by the default caller.
 */
export async function runAppOnlyAuthBrowser({ chromium, artifactDir, email, password, launchOptions = {}, contextOptions = {}, onBlocked = () => {}, timeoutMs = 30000 } = {}) {
  if (!chromium || typeof chromium.launch !== 'function' || !path.isAbsolute(artifactDir ?? '')
    || typeof email !== 'string' || !email || typeof password !== 'string' || !password) throw new Error('browser acceptance inputs are missing');
  let browser, phase = 'setup', denied = 0, routeErrors = 0, pageErrors = 0, requestFailures = 0;
  const authPosts = new Map();
  try {
    if ((await lstat(artifactDir)).isSymbolicLink()) throw new Error('artifact root symlink refused');
    const root = await realpath(artifactDir);
    await readFile(path.join(root, 'index.html'));
    browser = await chromium.launch({ ...launchOptions, headless: true });
    const context = await browser.newContext({ ...contextOptions, viewport: { width: 390, height: 1000 }, serviceWorkers: 'block' });
    let ownerId = null;
    await context.routeWebSocket('**/*', socket => { denied++; socket.close(); });
    await context.route('**/*', async route => {
      try {
        const request = route.request(), url = new URL(request.url());
        const headers = await request.allHeaders();
        const disposition = classifyAppAuthRequest(request.url(), request.method(), {
          ownerId, preflightMethod: headers['access-control-request-method'],
        });
        if (disposition === 'DENY' || (disposition === 'API' && request.method() === 'POST'
          && !allowsAppAuthPostBody(url.pathname, request.postData(), { email, password }))) {
          denied++; onBlocked({ origin: url.origin, pathname: url.pathname, method: request.method() }); await route.abort('blockedbyclient'); return;
        }
        if (disposition === 'ARTIFACT') {
          const file = await artifactFile(root, url.pathname);
          await route.fulfill({ status: 200, contentType: mime[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
            body: request.method() === 'HEAD' ? '' : await readFile(file) });
          return;
        }
        let forwardHeaders;
        if (request.method() === 'POST') {
          const initialEmptyRefresh = url.pathname === '/api/auth/refresh' && ['entry', 'login'].includes(phase)
            && !headers.cookie && !headers.authorization;
          const expectedPhase = { '/api/auth/email': 'login', '/api/auth/refresh': 'refresh', '/api/auth/logout': 'logout' }[url.pathname];
          const key = initialEmptyRefresh ? 'initial-empty-refresh' : `${url.pathname}:${phase}`;
          const count = (authPosts.get(key) ?? 0) + 1;
          authPosts.set(key, count);
          if ((!initialEmptyRefresh && (!expectedPhase || phase !== expectedPhase)) || count !== 1) {
            denied++; onBlocked({ origin: url.origin, pathname: url.pathname, method: request.method(), reason: 'unexpected-auth-phase', phase, count });
            await route.abort('blockedbyclient'); return;
          }
          // Preserve the original anonymous request if sign-in races with the
          // startup check; route.fetch must not attach a newly issued cookie.
          if (initialEmptyRefresh) forwardHeaders = { ...headers, cookie: '' };
        }
        // Do not let a redirect bypass request inspection or carry a login
        // body to a different destination. Fetch once without redirects.
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, ...(forwardHeaders ? { headers: forwardHeaders } : {}) });
        if (response.status() >= 300 && response.status() < 400) { denied++; await route.abort('blockedbyclient'); return; }
        if (!allowsAppAuthCors(response.headers(), headers, request.method())) {
          denied++; onBlocked({ origin: url.origin, pathname: url.pathname, method: request.method(), reason: 'invalid-cors' });
          await route.abort('blockedbyclient'); return;
        }
        if (url.pathname === '/api/auth/userinfo' && request.method() === 'GET') {
          if (response.ok()) {
            const body = await response.json();
            if (typeof body?.id !== 'string') throw new Error('userinfo identity missing');
            ownerId = body.id;
          }
        }
        await route.fulfill({ response });
      } catch {
        routeErrors++;
        try { await route.abort('failed'); } catch { /* The request may already be closed. */ }
      }
    });
    // The existing pinned fallback-font fixtures prevent external font requests.
    await installFlutterEngineFonts(context);
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.on('pageerror', () => { pageErrors++; });
    page.on('requestfailed', () => { requestFailures++; });
    async function enableSemantics() {
      const placeholder = page.locator('flt-semantics-placeholder');
      await placeholder.waitFor({ timeout: 60000 });
      await placeholder.evaluate(node => node.click());
    }
    async function enter(field, value) {
      await field.click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await field.press('ControlOrMeta+A'); await field.press('Backspace');
      await field.pressSequentially(value, { delay: 10 });
    }
    phase = 'entry';
    await page.goto(`${APP}/`);
    await enableSemantics();
    await page.getByRole('button', { name: 'Sign in with email', exact: true }).waitFor({ timeout: 60000 });
    phase = 'login';
    const login = page.waitForResponse(response => response.url() === `${API}/api/auth/email`
      && response.request().method() === 'POST' && response.status() === 200);
    const userinfo = page.waitForResponse(response => response.url() === `${API}/api/auth/userinfo`
      && response.request().method() === 'GET' && response.status() === 200);
    const discover = page.waitForResponse(response => new URL(response.url()).origin === API
      && new URL(response.url()).pathname === '/api/feed/discover' && response.request().method() === 'GET' && response.status() === 200);
    await enter(page.getByRole('textbox', { name: 'Email', exact: true }), email);
    const passwordField = page.locator('input[type=password]');
    await enter(passwordField, password);
    await passwordField.press('Enter');
    await Promise.all([login, userinfo, discover]);
    await page.getByRole('button', { name: /^Profile(?:\b|$)/ }).waitFor();
    assert.ok((await context.cookies(API)).some(cookie => cookie.name === '__Host-lythaus_refresh'
      && cookie.httpOnly && cookie.secure && cookie.sameSite === 'Strict'));
    phase = 'refresh';
    const refresh = page.waitForResponse(response => response.url() === `${API}/api/auth/refresh`
      && response.request().method() === 'POST' && response.status() === 200);
    await page.reload();
    await enableSemantics();
    await refresh;
    phase = 'security navigation';
    await page.getByRole('button', { name: /^Profile(?:\b|$)/ }).click();
    await page.getByRole('button', { name: 'Open settings', exact: true }).click();
    await page.getByText('Account security', { exact: true }).click();
    phase = 'logout';
    const logout = page.waitForResponse(response => response.url() === `${API}/api/auth/logout`
      && response.request().method() === 'POST' && response.status() === 200);
    await page.getByRole('button', { name: 'Sign out of all sessions', exact: true }).click();
    await logout;
    await page.getByRole('button', { name: 'Sign in with email', exact: true }).waitFor();
    assert.equal((await context.cookies(API)).some(cookie => cookie.name === '__Host-lythaus_refresh'), false);
    phase = 'browser integrity';
    assert.equal(denied, 0); assert.equal(routeErrors, 0); assert.equal(pageErrors, 0); assert.equal(requestFailures, 0);
    await context.close();
    return Object.freeze({ status: 'PASSED', journey: 'LOGIN_REFRESH_LOGOUT', viewport: '390x1000' });
  } catch {
    // Playwright errors can contain entered values; never include them in logs.
    throw new Error(`app-only browser authentication acceptance failed during ${phase} (blocked=${denied}, routeErrors=${routeErrors}, pageErrors=${pageErrors}, requestFailures=${requestFailures})`);
  } finally {
    if (browser) await browser.close();
  }
}
