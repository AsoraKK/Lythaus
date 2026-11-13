import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';
import { contentFixture } from './content-journey-fixture.mjs';
import { compareApprovedArtwork } from './brand-reference.mjs';
import { brandPresentation, containedBrandRect } from './brand-presentation-contract.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const colors = JSON.parse(await readFile(new URL('../../design/tokens.json', import.meta.url))).color;
const build = path.resolve(process.env.EDITORIAL_BUILD ?? 'build/editorial-review-web');
const output = path.resolve(process.env.EDITORIAL_EVIDENCE ?? 'build/editorial-review-evidence');
const source = process.env.EDITORIAL_SOURCE ?? 'uncommitted-review';
const widths = (process.env.EDITORIAL_WIDTHS ?? '320,390,768,1024,1440').split(',').map(Number);
const scales = (process.env.EDITORIAL_SCALES ?? '1,2').split(',').map(Number);
await mkdir(output, { recursive: true });
const contentFont = JSON.parse(await readFile(new URL('./fixtures/content-engine-font.json', import.meta.url)));
const font = Buffer.from(contentFont.base64, 'base64');
assert.equal(createHash('sha256').update(font).digest('hex'), contentFont.sha256);
const fixture = contentFixture();
const requests = [];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) {
      requests.push({ method: request.method, path: pathname });
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      if (pathname.includes('bookmarks')) {
        response.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({ items: [], hasMore: false, nextCursor: null }));
        return;
      }
      if (await fixture(request, response)) return;
    }
    let file = path.resolve(build, '.' + decodeURIComponent(pathname));
    assert.ok(file === build || file.startsWith(build + path.sep));
    if (!path.extname(file)) file = path.join(build, 'index.html');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store', 'access-control-allow-origin': '*' }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.EDITORIAL_CHROMIUM ? { executablePath: process.env.EDITORIAL_CHROMIUM } : {}) });
const report = { source, fixture: 'test/browser/feed_redesign_entry.dart',
  synthetic: true, capturedAt: new Date().toISOString(), browser: browser.version(),
  compiledSha256: createHash('sha256').update(await readFile(path.join(build, 'main.dart.js'))).digest('hex'),
  scenarios: [], requests };
const ready = page => page.evaluate(() => new Promise(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));
const button = (page, name) => page.getByRole('button', { name, exact: true });
try {
  for (const theme of ['light', 'dark']) for (const scale of scales) for (const width of widths) {
    const scenario = { theme, scale, width, errors: [], blocked: [], screenshots: [] };
    report.scenarios.push(scenario);
    const context = await browser.newContext({ viewport: { width, height: 960 },
      reducedMotion: 'reduce', colorScheme: theme, timezoneId: 'Etc/UTC', serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      scenario.blocked.push(url.origin + url.pathname);
      return route.abort();
    });
    await installFlutterEngineFonts(context);
    await context.route(contentFont.source, route => route.fulfill({ contentType: 'font/woff2', body: font,
      headers: { 'access-control-allow-origin': '*' } }));
    const page = await context.newPage();
    const wordmarkChecks = [];
    page.on('pageerror', error => scenario.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') scenario.errors.push(message.text()); });
    async function capture(name) {
      await ready(page);
      const filename = `${theme}-${scale}x-${width}-${name}`;
      await page.screenshot({ path: path.join(output, filename + '.png') });
      await writeFile(path.join(output, filename + '.txt'), await page.locator('body').ariaSnapshot());
      scenario.screenshots.push(filename + '.png');
    }
    async function verifyWordmark(expectedTheme) {
      await ready(page);
      const brands = page.getByRole('img', { name: 'Lythaus', exact: true });
      assert.equal(await brands.count(), 1, 'Header has one standalone wordmark');
      const box = await brands.boundingBox();
      assert.ok(box && box.width > 0 && box.height > 0);
      (scenario.wordmarkGeometry ??= []).push({ theme: expectedTheme, box });
      const png = PNG.sync.read(await page.screenshot());
      // A clear pixel outside the artwork checks the actual rendered theme,
      // independently of the appearance radio selection.
      const offset = (Math.floor(box.y) * png.width + 2) * 4;
      const expected = colors[expectedTheme].canvas.match(/[A-F0-9]{2}/g).map(value => parseInt(value, 16));
      assert.deepEqual([...png.data.subarray(offset, offset + 3)], expected);
      const presentation = brandPresentation('shell', expectedTheme);
      assert.equal(presentation.kind, 'wordmark');
      const result = { pending: true };
      wordmarkChecks.push({ png, box, presentation, result });
      return result;
    }
    async function appearance(name) {
      await button(page, 'Menu').click();
      await button(page, 'Close menu').waitFor();
      const radio = page.getByRole('radio', { name, exact: true });
      // Keyboard traversal exercises the drawer's real focus/ensure-visible
      // behavior, including controls beyond the 200% text viewport.
      for (let attempt = 0; attempt < 20; attempt++) {
        const box = await radio.count() ? await radio.boundingBox() : null;
        if (box && box.y >= 0 && box.y + box.height <= 960) break;
        await page.keyboard.press('Tab');
        await page.keyboard.press(box && box.y < 0 ? 'PageUp' : 'PageDown');
        await ready(page);
      }
      const box = await radio.boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= 960,
        `Appearance option is reachable at ${width}px / ${scale}x: ${name} ${JSON.stringify(box)}`);
      const beforeFlutter = await page.evaluate(() => window.__readEditorialFocus
        ? JSON.parse(window.__readEditorialFocus()) : null);
      // The target is visibly reachable; dispatch a real pointer at its center
      // without Playwright implicitly scrolling Flutter's semantics DOM.
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.getByRole('radio', { name, exact: true, checked: true }).waitFor();
      // Flutter web re-enables browser accessibility gesture mode 500ms after
      // pointer input. Check durable keyboard focus after that engine debounce.
      await page.waitForTimeout(600);
      await ready(page);
      (scenario.appearanceTrace ??= []).push(await page.evaluate(({ name, beforeFlutter }) => ({
        name,
        tag: document.activeElement?.tagName,
        focus: document.activeElement?.getAttribute('role'),
        label: document.activeElement?.getAttribute('aria-label'),
        flutter: window.__readEditorialFocus ? JSON.parse(window.__readEditorialFocus()) : null,
        beforeFlutter,
      }), { name, beforeFlutter }));
      await page.keyboard.press('Escape');
      scenario.lastEscape = await page.evaluate(() => window.__editorialEscape);
      // Close menu may itself be scrolled out of semantics. Wait for the shell
      // action to return, not for an already-offscreen drawer header to vanish.
      await button(page, 'Menu').waitFor();
    }
    try {
      await page.goto(`${origin}/?scenario=reading&theme=${theme}&textScale=${scale}`);
      await page.evaluate(() => document.addEventListener('keydown', event => {
        if (event.key === 'Escape') window.__editorialEscape = {
          target: event.target?.tagName,
          role: event.target?.getAttribute('role'),
          label: event.target?.getAttribute('aria-label') ?? event.target?.textContent?.slice(0, 80),
        };
      }, true));
      await page.locator('flt-semantics-placeholder').evaluate(element => element.click());
      await button(page, 'Menu').waitFor();
      await page.getByRole('banner', { name: /A little more room to grow/ }).waitFor();
      assert.equal(await page.getByRole('button', { name: /^Discovery(?:$|\s)/ }).count(), 1);
      assert.equal(await page.getByText('Human-authored', { exact: true }).count(), 0);
      assert.equal(await page.getByText('AI-assisted', { exact: true }).count(), 0);
      await capture('feed');
      scenario.wordmark = await verifyWordmark(theme);
      await button(page, 'Menu').click();
      await button(page, 'Close menu').waitFor();
      await capture('menu');
      await page.keyboard.press('Escape');
      await button(page, 'Close menu').waitFor({ state: 'hidden' });
      await appearance(theme === 'light' ? 'Light' : 'Dark');
      scenario.sameAppearanceWordmark = await verifyWordmark(theme);
      const opposite = theme === 'light' ? 'dark' : 'light';
      await appearance(opposite === 'light' ? 'Light' : 'Dark');
      scenario.switchedWordmark = await verifyWordmark(opposite);
      await capture('appearance-switched');
      await appearance('System');
      scenario.systemWordmark = await verifyWordmark(theme);
      await page.emulateMedia({ colorScheme: opposite });
      await ready(page);
      scenario.systemChangedWordmark = await verifyWordmark(opposite);
      await page.emulateMedia({ colorScheme: theme });
      await appearance(theme === 'light' ? 'Light' : 'Dark');
      await verifyWordmark(theme);
      scenario.appearanceSwitching = true;
      await button(page, 'Create').click();
      const field = page.getByRole('textbox', { name: /Your post/ });
      await field.waitFor();
      const draft = 'A private draft for reviewing the editorial layout.';
      // Flutter exposes a semantics input before the engine editing connection
      // is ready. Playwright fill() can update that proxy without reaching the
      // controller. Focus, settle, then use the real keyboard editing path.
      await field.click();
      await ready(page);
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText(draft);
      const draftState = page.getByRole('group', {
        name: `${5000 - draft.length} characters remaining`, exact: true,
      });
      // Assert Flutter state as well as DOM value before navigating away: an
      // input-delivery failure must not masquerade as draft restoration loss.
      await draftState.waitFor();
      assert.equal(await field.inputValue(), draft);
      await capture('draft');
      assert.equal(await page.getByText('Human-authored', { exact: true }).count(), 0);
      assert.equal(await page.getByText('AI-assisted', { exact: true }).count(), 0);
      await page.getByRole('button', { name: /^Discovery(?:$|\s)/ }).click();
      await page.getByRole('banner', { name: /A little more room to grow/ }).waitFor();
      await button(page, 'Create').click();
      await field.waitFor();
      await draftState.waitFor();
      await field.focus();
      await ready(page);
      assert.equal(await field.inputValue(), draft);
      await capture('draft-return');
      scenario.draftRetained = true;
      // The reference renderer opens another browser page. Run comparisons
      // after user interactions so this observer cannot disturb app focus.
      for (const { png, box, presentation, result } of wordmarkChecks) {
        Object.assign(result, await compareApprovedArtwork(page, png,
          containedBrandRect(box, presentation.kind),
          `${origin}/assets/assets/brand/lythaus-v1/${presentation.file}`, PNG,
          'canvas', box, presentation.foreground));
        delete result.pending;
      }
      assert.deepEqual(scenario.errors, []);
      assert.deepEqual(scenario.blocked, []);
      scenario.passed = true;
      console.log(JSON.stringify({ theme, scale, width, passed: true }));
    } catch (error) {
      scenario.failure = error.message;
      await capture('failure').catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  assert.ok(requests.every(request => request.method === 'GET'), 'Draft review performs no content writes');
} finally {
  await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
