import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const baseUrl = process.env.ACTIVITY_PILOT_BROWSER_BASE_URL || 'http://127.0.0.1:5183/';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname));
const fixturePath = process.env.ACTIVITY_PILOT_FIXTURE_OUTPUT;
assert.ok(fixturePath, 'Capture the genuine disposable PostgreSQL17 fixture first.');
const fixtureBytes = fs.readFileSync(fixturePath);
const fixture = JSON.parse(fixtureBytes);
assert.equal(fixture.fixture, 'synthetic_local_pg17_not_production');
const sampledAt = Date.parse(fixture.snapshot.sampledAt);
const output = process.env.ACTIVITY_PILOT_BROWSER_OUTPUT || '/workspace/lythaus-analytics-pilot-evidence/browser';
fs.mkdirSync(output, { recursive: true });
const engine = process.env.ACTIVITY_PILOT_BROWSER_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const receipt = { scope: 'UI rendering and interactions only. Serialized Public/Admin dispatchers, JWT/Access, CSRF/rate, complete Jobs/DSR flow and activation are NOT verified by this test.',
  fixture: fixture.fixture, fixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex'),
  baseUrl, browser: engine, browserPath: 'Browser plugin unavailable; existing locked Playwright',
  clock: 'Browser clock fixed one second after captured PostgreSQL sample for deterministic freshness; source data unchanged.', cases: [] };
const browser = await ({ chromium, webkit }[engine]).launch({ headless: true });
try {
  for (const width of [320, 1440]) for (const scale of [100, 200]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [], requests = [];
    let forbidden = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ clock, theme }) => {
      const OriginalDate = Date;
      globalThis.Date = class extends OriginalDate {
        constructor(...args) { super(...(args.length ? args : [clock])); }
        static now() { return clock; }
      };
      document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.theme = theme; });
    }, { clock: sampledAt + 1000, theme });
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ body: '' }));
    await page.route('**/api/admin/**', async route => {
      const url = new URL(route.request().url()); requests.push(url.pathname);
      if (url.pathname === '/api/admin/health') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'synthetic_ui_fixture_only' }) });
      if (url.pathname === '/api/admin/activity-measurement') return route.fulfill({ status: forbidden ? 403 : 200, contentType: 'application/json', headers: { 'cache-control': 'private, no-store' }, body: JSON.stringify(forbidden ? { error: 'activity_owner_required' } : fixture.snapshot) });
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'synthetic_unavailable_source' }) });
    });
    try {
      await page.goto(baseUrl);
      await page.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
      assert.equal(await page.locator('vite-error-overlay').count(), 0);
      await page.evaluate(({ theme, scale }) => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.fontSize = `${scale}%`;
        const label = document.createElement('div'); label.textContent = 'LOCAL SYNTHETIC PG17 · UI TEST ONLY · NOT PRODUCTION';
        Object.assign(label.style, { position: 'fixed', bottom: '0', left: '0', right: '0', height: '24px', fontSize: '10px', zIndex: '10000', background: '#fff', color: '#111', textAlign: 'center' }); document.body.append(label);
      }, { theme, scale });
      const panel = page.getByRole('heading', { name: 'Account activity pilot', exact: true }).locator('..').locator('..');
      await panel.getByText('3', { exact: true }).waitFor();
      assert.deepEqual(await panel.locator('strong').allTextContents(), ['2', '2', '3', '1']);
      const style = await panel.evaluate(element => ({ theme: document.documentElement.dataset.theme, scheme: getComputedStyle(document.documentElement).colorScheme, foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor, overflow: document.documentElement.scrollWidth > innerWidth }));
      assert.equal(style.theme, theme); assert.equal(style.scheme, theme); assert.equal(style.overflow, false);
      for (const summary of await panel.locator('summary').all()) {
        await summary.scrollIntoViewIfNeeded(); await summary.focus();
        assert.equal(await summary.evaluate(element => document.activeElement === element), true);
        await page.keyboard.press('Enter');
        assert.equal(await summary.evaluate(element => element.parentElement.open), true);
      }
      await panel.getByRole('heading', { name: 'Account activity pilot', exact: true }).scrollIntoViewIfNeeded();
      const filename = `${engine}-${width}-${scale}-${theme}.png`;
      await page.screenshot({ path: path.join(output, filename), fullPage: false });
      const quiet = panel.getByRole('heading', { name: 'Pilot quiet accounts', exact: true }).locator('..');
      await quiet.scrollIntoViewIfNeeded();
      assert.equal(await quiet.getByText(/does not prove human inactivity/).isVisible(), true);
      await page.screenshot({ path: path.join(output, `${engine}-${width}-${scale}-${theme}-quiet.png`), fullPage: false });
      forbidden = true;
      await panel.getByRole('button', { name: 'Refresh pilot' }).click();
      await panel.getByRole('alert').waitFor();
      assert.deepEqual(await panel.locator('strong').allTextContents(), Array(4).fill('Unavailable'));
      assert.equal(errors.length, 0);
      receipt.cases.push({ width, scale, theme, screenshot: filename, style, errors, source: 'Captured genuine synthetic PG17 snapshot; API interception disclosed', requests, checks: ['page identity', 'no overlay', 'actual light/dark', 'no horizontal overflow', 'keyboard definitions', 'genuine fixture counts', 'quiet coverage definition', '403 clears counts'] });
    } finally { await context.close(); }
  }
} finally {
  await browser.close(); fs.writeFileSync(path.join(output, `${engine}-receipt.json`), JSON.stringify(receipt, null, 2) + '\n');
}
console.log(JSON.stringify({ browser: engine, passed: receipt.cases.length, scope: receipt.scope }));
