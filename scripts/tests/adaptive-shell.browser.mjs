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
const nav = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}(?:$|\\s)`) });
const waitForTwoFrames = page => page.evaluate(() => new Promise(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));
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

      await page.setViewportSize({ width: 1024, height: 960 });
      await page.waitForTimeout(150);
      const menuAction = nav(page, 'Menu');
      if (scale === 1) {
        const menuActionBox = await menuAction.boundingBox();
        assert.ok(menuActionBox && menuActionBox.height < 80,
          'The compact Menu action fits within 80 px');
      }
      await menuAction.click();
      const closeMenu = page.getByRole('button', { name: 'Close menu', exact: true });
      await closeMenu.waitFor({ state: 'visible' });
      const notifications = page.getByRole('button', { name: 'Notifications', exact: true });
      await notifications.waitFor({ state: 'visible' });
      const row = await notifications.boundingBox();
      if (scale === 1) {
        assert.ok(row && row.height < 80,
          'The compact Notifications destination fits within 80 px');
      }
      const notificationLabel = page.getByText('Notifications', { exact: true });
      await notificationLabel.waitFor({ state: 'visible' });
      const labelLines = await notificationLabel.evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return [...range.getClientRects()]
          .filter(rect => rect.width > 0 && rect.height > 0)
          .map(rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            right: rect.right, bottom: rect.bottom }));
      });
      assert.equal(labelLines.length, 1,
        `The Notifications label stays on one line at text scale ${scale}`);
      if (scale === 2) {
        const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
        assert.ok(row && row.x >= 0 && row.y >= 0 && row.x + row.width <= viewport.width &&
          row.y + row.height <= viewport.height,
        'The scaled Notifications row remains within the viewport');
        const [labelLine] = labelLines;
        assert.ok(labelLine.x >= row.x && labelLine.y >= row.y &&
          labelLine.right <= row.x + row.width && labelLine.bottom <= row.y + row.height,
        'The scaled Notifications label remains within its row');
        assert.ok(labelLine.x >= 0 && labelLine.y >= 0 &&
          labelLine.right <= viewport.width && labelLine.bottom <= viewport.height,
        'The scaled Notifications label remains within the viewport');
      }
      await closeMenu.click();
      await closeMenu.waitFor({ state: 'hidden' });
      await page.setViewportSize({ width: 390, height: 960 });
      await page.waitForTimeout(150);

      const field = page.getByRole('textbox', { name: /Your post/ });
      await field.click();
      await page.waitForFunction(() => {
        const editor = document.activeElement;
        const state = JSON.parse(window.lythausNavigationSnapshot());
        return state.focused &&
          (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) &&
          editor.isConnected && !editor.disabled && !editor.readOnly;
      });
      await waitForTwoFrames(page);
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
        await nav(page, 'Discovery').click();
        await page.locator('flt-semantics').getByText('No public posts yet', { exact: true }).waitFor();
        assert.equal((await snapshot(page)).focused, false, 'Hidden composer cannot keep focus');
        await nav(page, 'Create').first().click();
        await field.waitFor();
        await page.waitForFunction(() => JSON.parse(window.lythausNavigationSnapshot()).focused);
        assert.deepEqual(await snapshot(page), initial, 'Tab return preserves controller, text, selection and focus');
        await waitForTwoFrames(page);
        await page.waitForTimeout(250);
        const filename = `${engine}-${theme}-${scale}x-${width}.png`;
        await page.screenshot({ path: path.join(output, filename) });
        results.push({ engine, theme, scale, width, filename, state: await snapshot(page) });
      }
      const discover = nav(page, 'Discovery');
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        await waitForTwoFrames(page);
        if (await discover.evaluate(element => element === document.activeElement)) break;
      }
      assert.ok(await discover.evaluate(element => element === document.activeElement), 'Tab reaches navigation');
      await page.keyboard.press('Enter');
      await page.locator('flt-semantics').getByText('No public posts yet', { exact: true }).waitFor();
      await nav(page, 'Create').first().click();
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
      const input = await page.evaluate(() => {
        const editor = document.activeElement;
        return { tag: editor?.tagName, role: editor?.getAttribute('role'),
          connected: editor?.isConnected, disabled: editor?.disabled,
          readOnly: editor?.readOnly };
      }).catch(() => null);
      console.error(JSON.stringify({ errors, blocked, input, snapshot: await snapshot(page).catch(() => null) }));
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
