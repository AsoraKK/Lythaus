import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, webkit } from 'playwright';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';

const build = path.resolve(process.env.NAVIGATION_WEB_BUILD ?? 'build/adaptive-shell-web');
const output = path.resolve(process.env.NAVIGATION_EVIDENCE ?? 'build/adaptive-shell-evidence');
const engine = process.env.NAVIGATION_BROWSER ?? 'chromium';
const source = process.env.NAVIGATION_SOURCE;
assert.ok(['chromium', 'webkit'].includes(engine));
assert.match(source ?? '', /^[a-f0-9]{40}$/, 'Supply the exact fixture build source SHA');
await mkdir(output, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    let file = path.resolve(build, '.' + pathname);
    assert.ok(file === build || file.startsWith(build + path.sep));
    if (!path.extname(file)) file = path.join(build, 'index.html');
    const bytes = await readFile(file);
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await ({ chromium, webkit }[engine]).launch({ headless: true });
const results = [];
const scenarios = [];
const snapshot = page => page.evaluate(() => JSON.parse(window.lythausNavigationSnapshot()));
const nav = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}(?:$|\\s+Tab)`) });
try {
  for (const theme of ['light', 'dark']) for (const scale of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 960 },
      colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [], blocked = [];
    const scenario = { engine, theme, scale, status: 'running', errors, blocked };
    scenarios.push(scenario);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      blocked.push(url.origin + url.pathname);
      return route.abort();
    });
    await installFlutterEngineFonts(context);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try {
      await page.goto(`${origin}/?theme=${theme}&scale=${scale}`);
      await page.locator('flt-semantics-placeholder').evaluate(element => element.click());
      const field = page.getByRole('textbox', { name: /Your post/ });
      await field.click();
      await page.keyboard.insertText('Synthetic unfinished draft');
      await page.waitForFunction(() => JSON.parse(window.lythausNavigationSnapshot()).text === 'Synthetic unfinished draft');
      for (const key of ['ControlOrMeta+Home', 'ArrowRight', 'ArrowRight', ...Array(7).fill('Shift+ArrowRight')]) {
        await page.keyboard.press(key);
        await page.waitForTimeout(100);
      }
      await page.waitForFunction(() => {
        const state = JSON.parse(window.lythausNavigationSnapshot());
        return state.text === 'Synthetic unfinished draft' && state.base === 2 && state.extent === 9 && state.focused;
      });
      const initial = await snapshot(page);
      for (const width of [320, 390, 1024, 1440]) {
        await page.setViewportSize({ width, height: 960 });
        await page.waitForTimeout(150);
        assert.deepEqual(await snapshot(page), initial, 'Resize preserves controller, text, selection and focus');
        await nav(page, 'Discover').click();
        await page.getByText('No posts yet', { exact: true }).waitFor();
        assert.equal((await snapshot(page)).focused, false, 'Hidden composer cannot keep focus');
        await nav(page, 'Create').click();
        await field.waitFor();
        await page.waitForFunction(() => JSON.parse(window.lythausNavigationSnapshot()).focused);
        assert.deepEqual(await snapshot(page), initial, 'Tab return preserves controller, text, selection and focus');
        const filename = `${engine}-${theme}-${scale}x-${width}.png`;
        await page.screenshot({ path: path.join(output, filename) });
        results.push({ engine, theme, scale, width, filename, state: await snapshot(page) });
      }
      const discover = nav(page, 'Discover');
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        if (await discover.evaluate(element => element === document.activeElement)) break;
      }
      assert.ok(await discover.evaluate(element => element === document.activeElement), 'Tab reaches navigation');
      await page.keyboard.press('Enter');
      await page.getByText('No posts yet', { exact: true }).waitFor();
      await nav(page, 'Create').click();
      await field.waitFor();
      await page.evaluate(() => window.lythausNavigationSignOut());
      await page.setViewportSize({ width: 320, height: 960 });
      await page.getByText('Sign in to create a post.', { exact: true }).waitFor();
      assert.equal((await snapshot(page)).fields, 0, 'Sign-out removes protected composer');
      assert.deepEqual(errors, []);
      assert.deepEqual(blocked, []);
      scenario.status = 'passed';
      console.log(JSON.stringify({ engine, theme, scale, widths: 4, status: 'passed' }));
    } catch (error) {
      scenario.status = 'failed';
      scenario.failure = error.message;
      await page.screenshot({ path: path.join(output, `${engine}-${theme}-${scale}x-failure.png`) });
      console.error(JSON.stringify({ errors, blocked, snapshot: await snapshot(page).catch(() => null) }));
      throw error;
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(output, `${engine}-results.json`), JSON.stringify({
    source, engine, browser: browser.version(), capturedAt: new Date().toISOString(),
    compiledSha256: createHash('sha256').update(await readFile(path.join(build, 'main.dart.js'))).digest('hex'),
    scenarios, results,
  }, null, 2) + '\n');
}
