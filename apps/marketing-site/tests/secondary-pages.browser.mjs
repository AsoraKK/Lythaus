import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, 'playwright') : 'playwright');
assert.ok(process.env.SECONDARY_QA_DIR, 'Set SECONDARY_QA_DIR to an evidence directory outside the repository');
const evidence = path.resolve(process.env.SECONDARY_QA_DIR);
assert.ok(!evidence.startsWith(path.resolve(root, '../..') + path.sep));
await mkdir(evidence, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };
const fileFor = (pathname) => {
  const requestPath = pathname.startsWith('/invite/') ? '/invite' : pathname;
  let file = path.resolve(dist, '.' + requestPath);
  assert.ok(file === dist || file.startsWith(dist + path.sep));
  if (!path.extname(file)) file = path.join(file, 'index.html');
  return file;
};
const server = createServer(async (request, response) => {
  try {
    const file = fileFor(decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch {
    response.writeHead(404, { 'content-type': 'text/html' }).end(await readFile(path.join(dist, '404.html')));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const routes = ['about', 'ai-moderation', 'check-email', 'contact', 'features', 'forgot-password', 'guidelines', 'help', 'invite', 'pricing', 'privacy', 'resend-verification', 'reset-password', 'sign-in', 'signup', 'terms', 'verify-email', '404.html'];
const report = { baselineSha: '8e3b3ebad2f846e61db2bfe819376723da7e9863', browser: browser.version(), routes: [], interactions: [], fixtures: [], screenshots: [], failures: [] };

async function contextFor(width, theme, fixture) {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1000 }, locale: 'en-ZA', timezoneId: 'Africa/Johannesburg', colorScheme: theme, reducedMotion: 'reduce', deviceScaleFactor: 1 });
  const requests = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      if (fixture && url.origin === 'https://api.lythaus.co') {
        requests.push({ method: request.method(), path: url.pathname });
        const reply = fixture(request);
        if (reply.abort) return route.abort('failed');
        return route.fulfill({ status: reply.status ?? 200, contentType: 'application/json', body: JSON.stringify(reply.body) });
      }
      return route.abort();
    }
    if (fixture && request.isNavigationRequest()) {
      const html = await readFile(fileFor(url.pathname), 'utf8');
      return route.fulfill({ status: 200, contentType: 'text/html', body: html.replace(/data-turnstile-site-key(?:="[^"]*")?/g, 'data-turnstile-site-key="fixture-only"') });
    }
    return route.continue();
  });
  if (fixture) await context.addInitScript(() => {
    let config;
    window.turnstile = { render: (_element, options) => { config = options; return 'fixture'; }, execute: () => queueMicrotask(() => config.callback('fixture-token')), reset: () => {} };
  });
  const page = await context.newPage();
  const errors = [];
  const consoleIssues = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) consoleIssues.push(message.text()); });
  return { context, page, errors, consoleIssues, requests };
}
async function open(page, route) {
  await page.goto(`${origin}/${route}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  assert.match(await page.title(), /Lythaus/);
  assert.equal(await page.locator('h1').count(), 1);
  assert.ok((await page.locator('main').innerText()).trim().length > 20);
  assert.equal(await page.locator('astro-error-overlay').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-secondary')), true);
}
async function capture(page, name) {
  await page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: true });
  report.screenshots.push(`${name}.png`);
}
async function layoutCheck(page, name) {
  const problems = await page.evaluate(() => {
    const result = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) result.push(`horizontal overflow: ${document.documentElement.scrollWidth} > ${innerWidth}`);
    for (const el of document.querySelectorAll('button, input, select, summary, .button')) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') continue;
      if (rect.height < 44) result.push(`${el.tagName} target height ${rect.height}`);
      if (rect.left < -1 || rect.right > innerWidth + 1) result.push(`${el.tagName} clips horizontally`);
    }
    return result;
  });
  assert.deepEqual(problems, [], name);
}
async function contrastCheck(page, name) {
  const problems = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const painter = canvas.getContext('2d', { willReadFrequently: true });
    const cache = new Map();
    const parse = (color) => {
      if (cache.has(color)) return cache.get(color);
      painter.clearRect(0, 0, 1, 1);
      painter.fillStyle = color;
      painter.fillRect(0, 0, 1, 1);
      const bytes = [...painter.getImageData(0, 0, 1, 1).data];
      const result = [...bytes.slice(0, 3), bytes[3] / 255];
      cache.set(color, result);
      return result;
    };
    for (const [css, expected] of [['rgb(255, 128, 0)', [255, 128, 0, 1]], ['color(srgb 1 0.5 0)', [255, 128, 0, 1]], ['rgba(0, 0, 0, 0)', [0, 0, 0, 0]]]) {
      if (JSON.stringify(parse(css)) !== JSON.stringify(expected)) throw new Error(`Color conversion assertion failed: ${css}`);
    }
    const over = (front, back) => {
      const alpha = front[3] ?? 1;
      return front.slice(0, 3).map((value, i) => value * alpha + back[i] * (1 - alpha));
    };
    const background = (element) => element ? over(parse(getComputedStyle(element).backgroundColor), background(element.parentElement)) : [255, 255, 255];
    const luminance = (rgb) => rgb.map((value) => value / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    if (luminance([0, 0, 0]) !== 0 || luminance([255, 255, 255]) !== 1) throw new Error('Luminance endpoint assertion failed');
    if (JSON.stringify(over([0, 0, 0, .5], [255, 255, 255])) !== '[127.5,127.5,127.5]') throw new Error('Alpha composition assertion failed');
    const failures = [];
    for (const el of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName) || ![...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim())) continue;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (!rect.width || !rect.height || style.visibility === 'hidden' || el.closest(':disabled, [hidden]')) continue;
      const bg = background(el), fg = over(parse(style.color), bg);
      const lum = [luminance(bg), luminance(fg)].sort((a, b) => a - b);
      const ratio = (lum[1] + .05) / (lum[0] + .05);
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.6667 && parseFloat(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) failures.push({ tag: el.tagName, text: el.textContent.trim().slice(0, 60), ratio });
    }
    return failures;
  });
  assert.deepEqual(problems, [], `Rendered contrast: ${name}`);
}
async function fixtureCase(name, theme, route, reply, run) {
  const state = await contextFor(390, theme, reply);
  try {
    await open(state.page, route);
    await run(state);
    await layoutCheck(state.page, name);
    await contrastCheck(state.page, name);
    await capture(state.page, `${name}-${theme}`);
    assert.deepEqual(state.errors, []);
    report.fixtures.push({ name, theme, requests: state.requests, consoleIssues: state.consoleIssues });
  } finally { await state.context.close(); }
}

try {
  for (const theme of ['light', 'dark']) {
    for (const width of [320, 360, 390, 768, 1024, 1440]) {
      const state = await contextFor(width, theme);
      for (const route of routes) {
        await open(state.page, route);
        await layoutCheck(state.page, `${route}-${width}-${theme}`);
        await contrastCheck(state.page, `${route}-${width}-${theme}`);
        const metrics = await state.page.evaluate(() => ({ loadMs: performance.getEntriesByType('navigation')[0].loadEventEnd, encodedBytes: performance.getEntriesByType('resource').reduce((sum, resource) => sum + resource.encodedBodySize, 0), colorScheme: getComputedStyle(document.documentElement).colorScheme }));
        assert.equal(metrics.colorScheme, theme);
        report.routes.push({ route, width, theme, ...metrics });
        await capture(state.page, `${route.replace('.html', '')}-${width}-${theme}`);
      }
      assert.deepEqual(state.errors, []);
      assert.deepEqual(state.consoleIssues, []);
      await state.context.close();
    }
    const enlarged = await contextFor(320, theme);
    for (const route of ['help', 'privacy', 'signup', 'reset-password']) {
      await open(enlarged.page, route);
      await enlarged.page.evaluate(() => document.documentElement.style.fontSize = '200%');
      await layoutCheck(enlarged.page, `${route} 200%`);
      await capture(enlarged.page, `${route}-320-200percent-${theme}`);
    }
    assert.deepEqual(enlarged.errors, []);
    await enlarged.context.close();

    const nav = await contextFor(390, theme);
    await open(nav.page, 'help');
    await nav.page.keyboard.press('Tab');
    assert.equal(await nav.page.locator('.skip-link').evaluate((el) => el === document.activeElement), true);
    await nav.page.keyboard.press('Enter');
    assert.equal(await nav.page.locator('main').evaluate((el) => el === document.activeElement), true);
    await nav.page.locator('.secondary-menu summary').focus();
    await nav.page.keyboard.press('Enter');
    assert.equal(await nav.page.locator('.secondary-menu').getAttribute('open'), '');
    await nav.page.keyboard.press('Tab');
    assert.equal(await nav.page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Features', exact: true }).evaluate((el) => el === document.activeElement), true);
    await nav.page.keyboard.press('Escape');
    assert.equal(await nav.page.locator('.secondary-menu summary').evaluate((el) => el === document.activeElement), true);
    await nav.page.locator('#secondary-appearance').selectOption(theme === 'light' ? 'dark' : 'light');
    await open(nav.page, 'contact');
    assert.equal(await nav.page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), theme === 'light' ? 'dark' : 'light');
    await nav.page.goBack();
    assert.equal(new URL(nav.page.url()).pathname, '/help');
    await nav.page.locator('#secondary-appearance').selectOption('system');
    await open(nav.page, 'privacy');
    await nav.page.locator('.article-contents summary').click();
    await nav.page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: '8. Contact', exact: true }).click();
    assert.equal(new URL(nav.page.url()).hash, '#contact');
    await nav.page.emulateMedia({ media: 'print' });
    assert.equal(await nav.page.locator('.secondary-header').isVisible(), false);
    assert.equal(await nav.page.locator('h1').isVisible(), true);
    await nav.page.emulateMedia({ media: 'screen' });
    report.interactions.push({ theme, keyboardMenu: 'pass', skipLink: 'pass', themePersistence: 'pass', history: 'pass', articleAnchor: 'pass', print: 'pass' });
    await nav.context.close();

    await fixtureCase('verify-success', theme, 'verify-email?token=fixture-token', () => ({ body: { state: 'verified' } }), async ({ page, requests }) => {
      assert.equal(requests.length, 0);
      assert.equal(new URL(page.url()).search, '');
      assert.equal(await page.locator('meta[name="referrer"]').getAttribute('content'), 'no-referrer');
      await page.locator('[data-email-verification-submit]').click();
      assert.equal(await page.locator('[data-email-verification-status]').innerText(), 'Passwords must match and contain 15–128 characters.');
      assert.equal(requests.length, 0);
      await page.locator('#verification-password').fill('fixture-only-passphrase');
      await page.locator('#verification-password-confirmation').fill('mismatched-fixture');
      await page.locator('[data-email-verification-submit]').click();
      assert.equal(await page.locator('[data-email-verification-status]').innerText(), 'Passwords must match and contain 15–128 characters.');
      assert.equal(requests.length, 0);
      await page.locator('#verification-password-confirmation').fill('fixture-only-passphrase');
      await page.locator('[data-email-verification-submit]').click();
      await page.locator('[data-email-verification-status][data-state="success"]').waitFor();
      assert.equal(requests.length, 1);
      assert.equal(requests[0].method, 'POST');
      assert.equal(await page.locator('[data-email-verification-submit]').isDisabled(), true);
    });
    await fixtureCase('verify-invalid', theme, 'verify-email?token=fixture-token', () => ({ status: 400, body: { error: 'verification_token_invalid' } }), async ({ page, requests }) => {
      await page.locator('#verification-password').fill('fixture-only-passphrase');
      await page.locator('#verification-password-confirmation').fill('fixture-only-passphrase');
      await page.locator('[data-email-verification-submit]').click();
      await page.locator('[data-email-verification-status][data-state="error"]').waitFor();
      assert.equal(requests.length, 1);
      assert.equal(requests[0].method, 'POST');
      assert.match(await page.locator('[data-email-verification-status]').innerText(), /invalid, expired, or already used/);
      assert.equal(await page.locator('[data-email-verification-resend]').isVisible(), true);
    });
    await fixtureCase('reset-success', theme, 'reset-password?token=fixture-token', () => ({ body: { state: 'password_reset_completed' } }), async ({ page, requests }) => {
      assert.equal(requests.length, 0);
      assert.equal(new URL(page.url()).search, '');
      await page.locator('#new-password').fill('fixture-only-passphrase');
      await page.locator('#new-password-confirmation').fill('mismatched-fixture');
      await page.locator('[data-reset-submit]').click();
      assert.equal(requests.length, 0);
      await page.locator('#new-password-confirmation').fill('fixture-only-passphrase');
      await page.locator('[data-reset-submit]').click();
      await page.locator('[data-reset-status][data-state="success"]').waitFor();
      assert.equal(await page.locator('#new-password').inputValue(), '');
      assert.equal(await page.locator('#new-password').isDisabled(), true);
    });
    await fixtureCase('sign-in-success', theme, 'sign-in', () => ({ body: { accessToken: 'fixture-access', expiresIn: 900, tokenType: 'Bearer', sessionTransport: 'cookie-v1' } }), async ({ page, requests }) => {
      await page.route('https://app.lythaus.co/**', (route) => route.abort('aborted'));
      const handoff = page.waitForRequest('https://app.lythaus.co/');
      const login = page.waitForRequest('https://api.lythaus.co/api/auth/email');
      await page.locator('#sign-in-email').fill('visual-fixture@example.invalid');
      await page.locator('#sign-in-password').fill('fixture-only-passphrase');
      await page.getByRole('button', { name: 'Show password', exact: true }).click();
      assert.equal(await page.locator('#sign-in-password').getAttribute('type'), 'text');
      await page.getByRole('button', { name: 'Show password', exact: true }).click();
      assert.equal(await page.locator('#sign-in-password').getAttribute('type'), 'password');
      await page.locator('[data-sign-in-submit]').click();
      await page.locator('[data-sign-in-status][data-state="success"]').waitFor();
      assert.equal(await page.locator('[data-sign-in-status]').innerText(), 'Signed in. Opening the Lythaus app...');
      assert.equal((await login).headers()['x-lythaus-auth-transport'], 'cookie-v1');
      assert.equal((await handoff).isNavigationRequest(), true);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].method, 'POST');
      assert.equal(await page.locator('#sign-in-password').inputValue(), '');
      assert.equal(await page.evaluate(() => sessionStorage.length), 0);
    });
    await fixtureCase('sign-in-invalid-session', theme, 'sign-in', () => ({ body: { accessToken: 'fixture-access', refreshToken: 'fixture-refresh' } }), async ({ page, requests }) => {
      const handoffs = [];
      page.on('request', (request) => { if (request.url().startsWith('https://app.lythaus.co/')) handoffs.push(request.url()); });
      await page.locator('#sign-in-email').fill('visual-fixture@example.invalid');
      await page.locator('#sign-in-password').fill('fixture-only-passphrase');
      await page.locator('[data-sign-in-submit]').click();
      await page.locator('[data-sign-in-status][data-state="error"]').waitFor();
      assert.equal(await page.locator('[data-sign-in-status]').innerText(), 'We could not sign you in. Check your details and try again.');
      assert.equal(requests.length, 1);
      assert.equal(requests[0].method, 'POST');
      assert.deepEqual(handoffs, []);
      assert.equal(await page.locator('[data-sign-in-submit]').isEnabled(), true);
      assert.equal(await page.evaluate(() => sessionStorage.length), 0);
    });
    await fixtureCase('sign-in-verification-required', theme, 'sign-in', () => ({ status: 403, body: { error: 'email_verification_required' } }), async ({ page }) => {
      await page.locator('#sign-in-email').fill('visual-fixture@example.invalid');
      await page.locator('#sign-in-password').fill('fixture-only-passphrase');
      await page.locator('[data-sign-in-submit]').click();
      await page.locator('[data-sign-in-status][data-state="error"]').waitFor();
      assert.equal(await page.locator('[data-sign-in-resend-region]').isVisible(), true);
    });
    await fixtureCase('signup-success', theme, 'signup', () => ({ body: { state: 'verification_required' } }), async ({ page }) => {
      await page.locator('#signup-email').fill('visual-fixture@example.invalid');
      await page.locator('#signup-password').fill('fixture-only-passphrase');
      await page.locator('#signup-password-confirmation').fill('fixture-only-passphrase');
      await page.locator('[data-signup-submit]').click();
      await page.locator('[data-signup-status][data-state="success"]').waitFor();
      assert.equal(await page.locator('[data-signup-check-email]').isVisible(), true);
      assert.equal(await page.locator('#signup-password').inputValue(), '');
      assert.match(await page.locator('[data-signup-status]').innerText(), /Delivery is not confirmed/);
    });
    await fixtureCase('recovery-success', theme, 'forgot-password?email=visual-fixture%40example.invalid', () => ({ body: { state: 'reset_if_eligible' } }), async ({ page }) => {
      assert.equal(await page.locator('#reset-email').inputValue(), 'visual-fixture@example.invalid');
      assert.equal(new URL(page.url()).search, '');
      await page.locator('[data-reset-submit]').click();
      await page.locator('[data-reset-status][data-state="success"]').waitFor();
      assert.match(await page.locator('[data-reset-status]').innerText(), /Your request was accepted\. If eligible, check your email for recovery instructions\. This does not confirm email delivery\./);
    });
    await fixtureCase('resend-success', theme, 'resend-verification', () => ({ body: { state: 'verification_required' } }), async ({ page }) => {
      await page.locator('#verification-email').fill('visual-fixture@example.invalid');
      await page.locator('[data-verification-submit]').click();
      await page.locator('[data-verification-status][data-state="success"]').waitFor();
      assert.equal(await page.locator('[data-verification-submit]').isDisabled(), true);
      assert.match(await page.locator('[data-verification-cooldown]').innerText(), /seconds/);
    });
    await fixtureCase('invite-invalid', theme, 'invite/example-fixture', () => ({ body: { valid: false } }), async ({ page }) => {
      await page.getByText('Invite link could not be verified. Request a new invite.', { exact: true }).waitFor();
      assert.equal(await page.locator('#open-app').isVisible(), false);
    });
    await fixtureCase('recovery-offline', theme, 'forgot-password', () => ({ abort: true }), async ({ page }) => {
      await page.locator('#reset-email').fill('visual-fixture@example.invalid');
      await page.locator('[data-reset-submit]').click();
      await page.locator('[data-reset-status][data-state="error"]').waitFor();
      assert.equal(await page.locator('[data-reset-submit]').isDisabled(), false);
    });
  }
} catch (error) {
  report.failures.push(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(JSON.stringify({ routeRenders: report.routes.length, interactions: report.interactions.length, fixtures: report.fixtures.length, screenshots: report.screenshots.length, failures: report.failures, evidence }, null, 2));
