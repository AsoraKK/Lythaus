import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installPublicReadOnlyBoundary, publicReadOnlyResource } from './public-read-only-browser-policy.mjs';

assert.equal(process.env.LYTHAUS_PUBLIC_BROWSER_ACCEPTANCE, 'read_only', 'Explicit read_only opt-in required');
const output = path.resolve(process.env.PUBLIC_BROWSER_EVIDENCE_DIR ?? '/tmp/lythaus-public-read-only-acceptance');
const repository = path.resolve(import.meta.dirname, '../..');
assert.ok(!output.startsWith(repository + path.sep) && output !== repository, 'Evidence must remain outside the public repository');
const { chromium } = await import('playwright');
await mkdir(output, { recursive: true });
let proxy;
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  let url;
  try { url = new URL(process.env.HTTPS_PROXY || process.env.HTTP_PROXY); }
  catch { throw new Error('invalid_environment_proxy'); }
  proxy = { server: url.origin,
    ...(url.username ? { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) } : {}) };
}
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}), ...(proxy ? { proxy } : {}) });
const reports = [];
const tlsBypass = process.env.PUBLIC_BROWSER_PROXY_CERTIFICATE_BYPASS === 'true';
const pages = [['signup', 'Create your account'], ['sign-in', 'Sign in'], ['forgot-password', 'password'],
  ['resend-verification', 'email'], ['verify-email', 'email'], ['reset-password', 'password'], ['privacy', 'Privacy']];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block',
      reducedMotion: 'reduce', colorScheme: 'light', ignoreHTTPSErrors: tlsBypass });
    const blocked = [], consoleFindings = [], pageErrors = [], brandResponses = [];
    await installPublicReadOnlyBoundary(context, blocked);
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on('pageerror', () => pageErrors.push('uncaught_page_error'));
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.hostname === 'lythaus.co' && ['/brand/lythaus-v1/', '/icons/lythaus-v1/'].some(prefix => url.pathname.startsWith(prefix))) {
        brandResponses.push({ resource: publicReadOnlyResource(response.url()), status: response.status() });
      }
    });
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const text = message.text();
      consoleFindings.push({ category: /Content Security Policy|Content-Security-Policy/iu.test(text) ? 'content_security_policy'
        : /ERR_BLOCKED_BY_CLIENT/iu.test(text) ? 'read_only_boundary_block' : 'unclassified_console_error',
      resource: message.location().url ? publicReadOnlyResource(message.location().url) : null });
    });
    try {
      for (const [route, identity] of pages) {
        const initial = { blocked: blocked.length, console: consoleFindings.length, errors: pageErrors.length, brand: brandResponses.length };
        const result = { width, route, checks: {} };
        try {
          const response = await page.goto('https://lythaus.co/' + route + '/', { waitUntil: 'networkidle' });
          result.httpStatus = response.status();
          result.title = await page.title();
          result.checks.pageIdentity = response.ok() && result.title.toLowerCase().includes(identity.toLowerCase());
          result.checks.meaningfulContent = (await page.locator('main').innerText()).trim().length > 20;
          result.checks.noFrameworkOverlay = await page.locator('astro-error-overlay,vite-error-overlay').count() === 0;
          result.checks.noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
          result.wordmark = await page.locator('header .secondary-brand-wordmark').evaluate(async node => {
            const source = getComputedStyle(node).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/u)?.[1];
            const rect = node.getBoundingClientRect();
            if (!source) return { decoded: false, visible: false };
            const image = new Image(); image.src = source;
            let decoded = false;
            try { await image.decode(); decoded = image.naturalWidth > 0 && image.naturalHeight > 0; } catch {}
            return { assetPath: new URL(source, location.href).pathname, decoded,
              visible: rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0
                && rect.right <= innerWidth && rect.bottom <= innerHeight };
          });
          result.checks.brandWordmarkLoaded = result.wordmark.assetPath === '/brand/lythaus-v1/lythaus-wordmark-black.e450176663e0.svg'
            && result.wordmark.decoded && result.wordmark.visible;
          if (['signup', 'sign-in'].includes(route)) {
            await page.getByRole('button', { name: /show password/iu }).click();
            assert.equal(await page.locator('input[name=password]').getAttribute('type'), 'text');
            await page.getByRole('button', { name: /hide password/iu }).click();
            assert.equal(await page.locator('input[name=password]').getAttribute('type'), 'password');
            result.checks.passwordReveal = true;
          }
          result.screenshot = path.join(output, `${width}-${route}.png`);
          await page.screenshot({ path: result.screenshot });
        } catch { result.failure = 'public_page_observation_incomplete'; }
        result.blocked = blocked.slice(initial.blocked);
        result.consoleFindings = consoleFindings.slice(initial.console);
        result.pageErrors = pageErrors.slice(initial.errors);
        result.brandResponses = brandResponses.slice(initial.brand);
        result.checks.noBrandAssetFailures = !result.brandResponses.some(item => item.status >= 400);
        result.status = result.failure || Object.values(result.checks).some(value => value !== true) || result.pageErrors.length
          ? 'FAILED' : result.consoleFindings.some(item => item.category !== 'read_only_boundary_block') ? 'ATTENTION_REQUIRED' : 'OBSERVED';
        reports.push(result);
      }
      const initial = { console: consoleFindings.length, errors: pageErrors.length };
      const app = { width, route: 'https://app.lythaus.co/', status: 'NOT_OBSERVED' };
      try {
        await page.goto(app.route, { waitUntil: 'load' });
        await page.locator('flt-semantics-placeholder').waitFor({ timeout: 60_000 });
        await page.locator('flt-semantics-placeholder').evaluate(node => node.click());
        await page.getByRole('button', { name: 'Continue as guest', exact: true }).waitFor({ timeout: 60_000 });
        app.title = await page.title();
        app.screenshot = path.join(output, `${width}-app-entry.png`);
        await page.screenshot({ path: app.screenshot });
        const feedResponse = page.waitForResponse(response => response.request().method() === 'GET'
          && publicReadOnlyResource(response.url()) === 'https://api.lythaus.co/api/feed/discover', { timeout: 30_000 }).catch(() => null);
        await page.getByRole('button', { name: 'Continue as guest', exact: true }).click();
        await page.getByRole('button', { name: /^Profile(?:\b|$)/u }).waitFor();
        app.status = 'GUEST_NAVIGATION_OBSERVED';
        app.note = 'Guest navigation controls rendered. Feed data and account-session behavior are not certified.';
        const response = await feedResponse;
        app.guestFeed = { status: 'FEED_RESPONSE_NOT_OBSERVED', httpStatus: response?.status() ?? null,
          responseCompleted: response ? (await response.finished()) === null : false };
        const loading = page.getByText('Loading posts', { exact: true }).first();
        await loading.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
        app.guestFeed.loadingVisible = await loading.isVisible();
        app.guestFeed.emptyVisible = await page.getByText('No posts yet', { exact: true }).first().isVisible();
        app.guestFeed.errorVisible = await page.getByText('Couldn’t load posts', { exact: true }).first().isVisible();
        app.guestFeed.status = app.guestFeed.loadingVisible ? 'FEED_STILL_LOADING'
          : app.guestFeed.errorVisible ? 'FEED_UNAVAILABLE'
          : app.guestFeed.httpStatus === 200 && app.guestFeed.responseCompleted && app.guestFeed.emptyVisible ? 'EMPTY_FEED_OBSERVED'
          : app.guestFeed.responseCompleted ? 'FEED_RESPONSE_COMPLETE_UNCLASSIFIED' : 'FEED_RESPONSE_NOT_OBSERVED';
        app.guestScreenshot = path.join(output, `${width}-app-guest.png`);
        await page.screenshot({ path: app.guestScreenshot });
      } catch { app.failure = 'app_observation_incomplete'; }
      app.blocked = blocked.filter(item => item.resource?.startsWith('https://api.lythaus.co/'));
      app.consoleFindings = consoleFindings.slice(initial.console);
      app.pageErrors = pageErrors.slice(initial.errors);
      if (app.pageErrors.length) app.status = 'FAILED';
      reports.push(app);
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  const result = { evidenceClass: 'LIVE_PUBLIC_READ_ONLY_UI_OBSERVATION', observedAt: new Date().toISOString(),
    harnessSourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
    deployedSourceSha: null, tlsValidated: false, browserCertificateValidationEnabled: !tlsBypass, environmentProxyCertificateBypass: tlsBypass,
    provesAuthentication: false, provesEmailDelivery: false, provesPublishing: false,
    notes: 'Fresh unauthenticated contexts. No forms submitted, credentials entered or private storage imported. Non-read requests, redirects, WebSockets, private API routes and third-party requests blocked. Non-redirect upstream responses forwarded unchanged; no synthetic responses supplied. This observation cannot satisfy protected exact-candidate acceptance.', reports };
  await writeFile(path.join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ evidenceClass: result.evidenceClass, evidencePath: path.join(output, 'results.json'),
    statuses: reports.map(({ width, route, status }) => ({ width, route, status })) }));
  process.exitCode = reports.some(result => ['FAILED', 'NOT_OBSERVED', 'ATTENTION_REQUIRED'].includes(result.status)) ? 1 : 0;
}
