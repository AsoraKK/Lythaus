import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, 'playwright') : 'playwright');
const mode = process.argv[2];
assert.ok(['capture', 'resume-capture', 'compare', 'production'].includes(mode), 'Use capture, resume-capture, compare or production');
const capturing = mode === 'capture' || mode === 'resume-capture';
assert.ok(process.env.HOMEPAGE_QA_DIR, 'HOMEPAGE_QA_DIR must name an evidence directory outside the repository');
const evidence = path.resolve(process.env.HOMEPAGE_QA_DIR);
assert.ok(!evidence.startsWith(root + path.sep), 'Keep visual evidence outside the repository');
const baselineSha = '8e3b3ebad2f846e61db2bfe819376723da7e9863';
const baseline = path.join(evidence, 'homepage-before');
const output = capturing ? baseline : path.join(evidence, `homepage-${mode === 'compare' ? 'after' : 'production'}`);
if (mode === 'capture') {
  execFileSync(process.execPath, ['--test', path.join(root, 'apps/marketing-site/tests/homepage-protection.test.mjs')], { stdio: 'inherit' });
  await assert.rejects(access(baseline), 'Refusing to replace a baseline directory');
}
if (mode === 'resume-capture') {
  const previous = JSON.parse(await readFile(path.join(baseline, 'report.json'), 'utf8'));
  assert.equal(previous.baselineSha, baselineSha);
  assert.ok(['capture', 'resume-capture'].includes(previous.mode));
}
await mkdir(output, { recursive: true });
const dist = capturing ? path.join(output, 'dist') : path.join(root, 'apps/marketing-site/dist');
if (mode === 'capture') await cp(process.env.HOMEPAGE_BASELINE_DIST ?? path.join(root, 'apps/marketing-site/dist'), dist, { recursive: true, errorOnExist: true });
const fontUrls = [
  'https://fonts.gstatic.com/s/dmsans/v17/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K4.woff2',
  'https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggexSg.woff2',
];
const fonts = new Map();
for (const [index, url] of fontUrls.entries()) {
  const filename = path.join(baseline, `font-${index}.woff2`);
  if (mode === 'capture') {
    const response = await fetch(url);
    assert.equal(response.ok, true, `Cannot freeze font ${url}`);
    await writeFile(filename, Buffer.from(await response.arrayBuffer()));
  }
  fonts.set(url, await readFile(filename));
}
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = mode === 'production' ? null : createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(dist, '.' + pathname);
    assert.ok(file === dist || file.startsWith(dist + path.sep));
    if (!path.extname(file)) file = path.join(file, 'index.html');
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
if (server) await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = mode === 'production' ? 'https://lythaus.co' : `http://127.0.0.1:${server.address().port}`;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = { baselineSha, mode, browser: '', fontHashes: Object.fromEntries([...fonts].map(([url, bytes]) => [url, sha(bytes)])), screenshots: [], runs: [], fixtureRequests: [], differences: [] };
const browser = await chromium.launch({ headless: true });
report.browser = browser.version();
async function screenshot(page, name, fullPage = false) {
  const filename = path.join(output, `${name}.png`);
  const bytes = await page.screenshot({ fullPage });
  if (mode === 'resume-capture') {
    try { assert.ok(bytes.equals(await readFile(filename)), `Existing baseline screenshot cannot be replaced: ${name}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(filename, bytes, { flag: 'wx' }); }
  } else await writeFile(filename, bytes);
  report.screenshots.push({ name, sha256: sha(bytes), bytes: bytes.length });
  if (mode === 'compare') {
    const before = await readFile(path.join(baseline, `${name}.png`));
    if (!bytes.equals(before)) report.differences.push(name);
  }
}
async function open(width, reducedMotion = 'no-preference', fixture) {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, deviceScaleFactor: 1, locale: 'en-ZA', timezoneId: 'Africa/Johannesburg', colorScheme: 'dark', reducedMotion });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    if (fonts.has(url)) return route.fulfill({ status: 200, contentType: 'font/woff2', body: fonts.get(url), headers: { 'access-control-allow-origin': '*' } });
    if (request.method() !== 'GET') {
      assert.ok(fixture && mode !== 'production' && url === 'https://api.lythaus.co/api/waitlist', `Blocked non-fixture request: ${request.method()} ${url}`);
      report.fixtureRequests.push({ scenario: fixture, method: request.method(), url });
      return route.fulfill({ status: fixture === 'success' ? 200 : 429, contentType: 'application/json', body: JSON.stringify(fixture === 'success' ? { ok: true } : { error: 'rate_limit_exceeded' }) });
    }
    if (!url.startsWith(origin + '/')) return route.abort();
    if (fixture && request.isNavigationRequest()) {
      const html = await readFile(path.join(dist, 'index.html'), 'utf8');
      return route.fulfill({ status: 200, contentType: 'text/html', body: html.replace(/data-turnstile-site-key(?:="[^"]*")?/u, 'data-turnstile-site-key="fixture-only"') });
    }
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.openingTimes = {};
    new MutationObserver(() => {
      const state = document.documentElement.dataset.opening;
      if (state) window.openingTimes[state] = performance.now();
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-opening'] });
  });
  if (fixture) await page.addInitScript(() => {
    let config;
    window.turnstile = { render: (_element, options) => { config = options; return 'fixture'; }, execute: () => queueMicrotask(() => config.callback('fixture-token')), reset: () => {} };
  });
  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.title(), 'For the living internet');
  assert.equal(await page.getByRole('heading', { level: 1, name: 'Lythaus', exact: true }).count(), 1);
  return { context, page, errors };
}
try {
  for (const width of [360, 390, 768, 1024, 1440]) {
    const { context, page, errors } = await open(width);
    await page.waitForFunction(() => document.documentElement.dataset.opening === 'playing');
    await page.evaluate(() => { for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = 0; } });
    await screenshot(page, `${width}-opening`);
    await page.evaluate(() => { for (const animation of document.getAnimations()) animation.currentTime = 700; });
    await screenshot(page, `${width}-light`);
    await page.evaluate(() => window.dispatchEvent(new Event('pointerdown')));
    await page.waitForFunction(() => document.documentElement.dataset.opening === 'resolved');
    await page.waitForTimeout(350);
    await screenshot(page, `${width}-settled`, true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (width <= 900) {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      assert.equal(await page.locator('[data-mobile-nav-toggle]').getAttribute('aria-expanded'), 'true');
      await page.waitForTimeout(250);
      await screenshot(page, `${width}-menu`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-mobile-nav-toggle]').evaluate((el) => el === document.activeElement), true);
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('link', { name: 'Problem', exact: true }).click();
    } else await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Problem', exact: true }).click();
    assert.equal(new URL(page.url()).hash, '#problem');
    await page.waitForTimeout(600);
    const section = await page.locator('#problem').boundingBox();
    assert.ok(section.y >= 0 && section.y < 180, 'Section navigation positions the heading below the header');
    await screenshot(page, `${width}-anchor`);
    const metrics = await page.evaluate(() => ({ domContentLoadedMs: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd, loadMs: performance.getEntriesByType('navigation')[0].loadEventEnd, resourceBytes: performance.getEntriesByType('resource').reduce((sum, item) => sum + item.encodedBodySize, 0), text: document.body.innerText }));
    report.runs.push({ width, errors, ...metrics });
    assert.deepEqual(errors, []);
    await context.close();
  }
  for (const width of [390, 1440]) {
    const { context, page, errors } = await open(width, 'reduce');
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    await screenshot(page, `${width}-reduced`, true);
    assert.deepEqual(errors, []);
    await context.close();
    const live = await open(width);
    await live.page.waitForFunction(() => document.documentElement.dataset.opening === 'resolved');
    const duration = await live.page.evaluate(() => window.openingTimes.resolved - window.openingTimes.playing);
    assert.ok(duration >= 1750 && duration < 2500, `Uninterrupted opening duration ${duration}`);
    report.runs.push({ width, uninterruptedOpeningMs: duration });
    await live.context.close();
  }
  if (mode !== 'production') {
    for (const scenario of ['success', 'error']) {
      const { context, page, errors } = await open(390, 'reduce', scenario);
      await page.locator('#waitlist-email').fill('');
      await page.locator('[data-waitlist-submit]').click();
      assert.equal(await page.locator('[data-waitlist-status]').innerText(), 'Enter a valid email address.');
      await page.keyboard.press('Escape');
      await page.locator('#waitlist h2').click();
      await page.waitForTimeout(350);
      await screenshot(page, `waitlist-validation-${scenario}`);
      await page.locator('#waitlist-email').fill('visual-fixture@example.invalid');
      await page.locator('[data-waitlist-submit]').click();
      await page.waitForFunction(() => ['success', 'error'].includes(document.querySelector('[data-waitlist-status]').dataset.state));
      const status = await page.locator('[data-waitlist-status]').innerText();
      assert.equal(status, scenario === 'success' ? "You're on the list. Thanks for joining Lythaus. We'll be in touch when there is something worth sharing." : 'Too many attempts. Please try again shortly.');
      assert.equal(await page.locator('[data-waitlist-submit]').isDisabled(), false);
      await page.waitForTimeout(350);
      await screenshot(page, `waitlist-${scenario}`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    const { context, page } = await open(390, 'reduce');
    await page.locator('#waitlist-email').fill('visual-fixture@example.invalid');
    await page.locator('[data-waitlist-submit]').click();
    assert.equal(await page.locator('[data-waitlist-status]').innerText(), "We couldn't verify this request. Please try again.");
    await screenshot(page, 'waitlist-unavailable');
    await context.close();
  }
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
assert.deepEqual(report.differences, [], 'Homepage screenshots differ from the frozen baseline; never regenerate to hide a regression');
console.log(JSON.stringify({ mode, baselineSha, screenshots: report.screenshots.length, differences: report.differences, output }, null, 2));
