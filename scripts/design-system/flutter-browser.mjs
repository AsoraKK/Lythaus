import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '../..');
const build = path.resolve(process.env.FLUTTER_QA_BUILD ?? path.join(root, 'build/web'));
assert.ok(process.env.FLUTTER_QA_DIR, 'Set FLUTTER_QA_DIR outside the repository');
const evidence = path.resolve(process.env.FLUTTER_QA_DIR);
assert.ok(!evidence.startsWith(root + path.sep));
await mkdir(evidence, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, 'playwright') : 'playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(build, '.' + pathname);
    assert.ok(file === build || file.startsWith(build + path.sep));
    if (!path.extname(file)) file = path.join(build, 'index.html');
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const bundle = await readFile(path.join(build, 'main.dart.js'));
const report = { baseline: '8e3b3ebad2f846e61db2bfe819376723da7e9863', browser: browser.version(), fixtureOnly: true, build, bundle: { bytes: bundle.length, gzipBytes: gzipSync(bundle).length, sha256: createHash('sha256').update(bundle).digest('hex') }, cases: [] };
try {
  for (const width of (process.env.FLUTTER_QA_WIDTHS ?? '390,768,1024,1440').split(',').map(Number)) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce', locale: 'en-ZA', timezoneId: 'Africa/Johannesburg', serviceWorkers: 'block' });
    const result = { width, theme, requests: [], blocked: [], errors: [], checks: [] };
    let searchFailure = false;
    report.cases.push(result);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (['api.lythaus.co', 'auth.lythaus.co'].includes(url.hostname)) {
        result.requests.push({ method: route.request().method(), path: url.pathname + url.search });
        const status = url.pathname.includes('/feed') ? (searchFailure ? 503 : 200) : 401;
        return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { items: [], hasMore: false, nextCursor: null } : { error: 'unauthorized' }) });
      }
      result.blocked.push(url.origin + url.pathname);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    const start = performance.now();
    await page.goto(origin, { waitUntil: 'load' });
    await page.locator('flt-semantics-placeholder').waitFor({ timeout: 60000 });
    await page.locator('flt-semantics-placeholder').evaluate(element => element.click());
    await page.getByRole('button', { name: 'Continue as guest', exact: true }).waitFor({ timeout: 60000 });
    result.readyMs = Math.round(performance.now() - start);
    await page.screenshot({ path: path.join(evidence, `login-${width}-${theme}.png`) });
    await page.getByRole('button', { name: 'Continue as guest', exact: true }).click();
    await page.getByText('No posts yet', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(evidence, `feed-${width}-${theme}.png`) });
    result.checks.push('guest-entry');
    result.semantics = await page.locator('flt-semantics').evaluateAll(nodes => nodes.map(node => ({ role: node.getAttribute('role'), label: node.getAttribute('aria-label'), text: node.innerText })).filter(node => node.role || node.label));
    if (!process.env.FLUTTER_QA_BASELINE) {
      await page.getByRole('button', { name: /^Rewards\b/ }).click();
      await page.getByText('Sign in to view your rewards.', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'rewards');
      await page.screenshot({ path: path.join(evidence, `rewards-guest-${width}-${theme}.png`) });
      await page.getByRole('button', { name: /^Profile\b/ }).click();
      await page.waitForURL(url => url.searchParams.get('tab') === 'profile');
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'profile');
      await page.goBack();
      await page.getByText('Sign in to view your rewards.', { exact: true }).waitFor();
      await page.goBack();
      await page.getByText('No posts yet', { exact: true }).waitFor();
      await page.getByRole('button', { name: /^Create\b/ }).click();
      await page.locator('flt-semantics').getByText('Sign in to use this Alpha feature.', { exact: true }).waitFor();
      result.checks.push('rewards-profile-browser-back', 'guest-create-gate');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      const input = page.getByRole('textbox', { name: 'Search tags', exact: true });
      await input.click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.keyboard.insertText('science');
      await page.keyboard.press('Enter');
      await page.getByText('No results for “science”', { exact: true }).waitFor();
      searchFailure = true;
      await page.getByRole('button', { name: 'Clear search', exact: true }).click();
      await page.getByText('Find posts by tag across your feeds.', { exact: true }).waitFor();
      await input.click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.keyboard.insertText('offline');
      await page.keyboard.press('Enter');
      await page.getByText('Search is unavailable right now.', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(evidence, `search-error-${width}-${theme}.png`) });
      searchFailure = false;
      await page.getByRole('button', { name: 'Retry search', exact: true }).click();
      await page.getByText('No results for “offline”', { exact: true }).waitFor();
      assert.equal(await input.inputValue(), 'offline');
      result.checks.push('search-empty-error-retry-retains-query');
    }
    await writeFile(path.join(evidence, `semantics-${width}-${theme}.txt`), await page.locator('body').innerText());
    if (!process.env.FLUTTER_QA_BASELINE) assert.equal(result.errors.length, 0, result.errors.join('\n'));
    await context.close();
  }
} finally {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    report.finalText = await page.locator('body').innerText();
    await page.screenshot({ path: path.join(evidence, 'last-page.png') });
  }
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log(JSON.stringify({ cases: report.cases.length, evidence }));
