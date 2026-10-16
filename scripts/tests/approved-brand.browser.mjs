import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, webkit } from 'playwright';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';

const output = path.resolve(process.env.BRAND_EVIDENCE ?? 'build/brand-evidence');
const build = path.resolve(process.env.BRAND_WEB_BUILD ?? 'build/brand-web');
const admin = path.resolve('apps/control-panel/dist');
const engine = process.env.BRAND_BROWSER ?? 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const source = process.env.BRAND_SOURCE;
assert.match(source ?? '', /^[a-f0-9]{40}$/);
const approved = JSON.parse(await readFile('docs/brand/approved-v1/INTEGRATION-MANIFEST.json', 'utf8'));
async function verifyIcons(page, context) {
  const icons = await page.locator('link[rel="icon"],link[rel="apple-touch-icon"]').evaluateAll(nodes => nodes.map(node => node.href));
  assert.equal(icons.length, 4);
  for (const url of icons) {
    const expected = approved.web_copy_map.find(asset => asset.public_url === new URL(url).pathname);
    assert.ok(expected, url);
    const response = await context.request.get(url);
    assert.equal(response.status(), 200);
    assert.equal(createHash('sha256').update(await response.body()).digest('hex'), expected.sha256);
  }
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
async function serve(root) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let file = path.resolve(root, '.' + pathname);
      assert.ok(file === root || file.startsWith(root + path.sep));
      if (!path.extname(file)) file = path.join(root, 'index.html');
      const bytes = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
      response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: 'http://127.0.0.1:' + server.address().port };
}
await mkdir(output, { recursive: true });
const appServer = await serve(build), adminServer = await serve(admin);
const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
const results = [];
async function capture(page, name) {
  await page.evaluate(() => {
    const label = document.createElement('div');
    label.textContent = 'LOCAL SYNTHETIC BRAND QA';
    label.style.cssText = 'position:fixed;bottom:0;right:0;z-index:99999;background:#111;color:#fff;padding:4px;font:10px sans-serif;pointer-events:none';
    document.body.append(label);
  });
  await page.screenshot({ path: path.join(output, name + '.png') });
}
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [320, 390, 1440]) {
      for (const screen of ['login', 'onboarding', 'shell']) {
        const context = await browser.newContext({ viewport: { width, height: 960 }, colorScheme: theme, reducedMotion: 'reduce' });
        const errors = [], blocked = [];
        await context.route('**/*', async route => {
          if (new URL(route.request().url()).origin === appServer.origin) return route.continue();
          blocked.push(route.request().url()); return route.abort();
        });
        await installFlutterEngineFonts(context);
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        try {
          await page.goto(appServer.origin + '/?screen=' + screen + '&theme=' + theme + '&scale=' + (width === 320 ? '2' : '1'));
          await page.locator('flt-semantics-placeholder').evaluate(element => element.click());
          if (screen === 'shell') {
            await page.getByRole('textbox', { name: /Your post/ }).waitFor();
            await page.getByRole('button', { name: /^Discover(?:$|\s+Tab)/ }).click();
            await page.getByText('No posts yet', { exact: true }).waitFor();
            await page.getByRole('button', { name: 'Feed controls', exact: true }).click();
            await page.getByText('Choose a feed', { exact: true }).waitFor();
            await page.getByRole('button', { name: 'Close feed controls', exact: true }).click();
          } else {
            await page.getByRole('img', { name: 'Lythaus', exact: true }).waitFor();
          }
          await page.waitForTimeout(300);
          if (screen === 'login') {
            const email = page.getByRole('textbox', { name: 'Email', exact: true });
            await email.click();
            await page.waitForFunction(() => document.activeElement instanceof HTMLInputElement);
            await page.keyboard.insertText('draft@example.invalid');
            await page.setViewportSize({ width: width === 1440 ? 1024 : width + 20, height: 960 });
            await page.setViewportSize({ width, height: 960 });
            await page.waitForFunction(() => document.activeElement?.value === 'draft@example.invalid');
          }
          await capture(page, engine + '-' + screen + '-' + theme + '-' + width);
          await verifyIcons(page, context);
          if (screen !== 'shell') {
          const action = page.getByRole('button', { name: screen === 'login' ? 'Continue as guest' : 'Continue', exact: true });
          for (let attempt = 0; attempt < 12; attempt++) {
            const rect = await action.boundingBox();
            if (rect && rect.y >= 0 && rect.y + rect.height < 940) break;
            await page.mouse.move(width / 2, 700);
            await page.mouse.wheel(0, 400);
            await page.waitForTimeout(120);
          }
          await action.click();
          await page.getByText('Synthetic continuation completed', { exact: true }).waitFor();
          }
          assert.deepEqual(errors, []);
          assert.deepEqual(blocked, []);
          results.push({ screen, theme, width, status: 'passed' });
        } catch (error) {
          await capture(page, engine + '-' + screen + '-' + theme + '-' + width + '-failed');
          results.push({ screen, theme, width, status: 'failed', error: error.message, errors, blocked });
          throw error;
        } finally { await context.close(); }
      }
      const context = await browser.newContext({ viewport: { width, height: 960 }, colorScheme: theme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
      await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ body: '' }));
      await page.route('**/api/admin/**', route => route.fulfill({ contentType: 'application/json', body: '{"items":[],"status":"synthetic"}' }));
      try {
        await page.goto(adminServer.origin + '/flags');
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        const logo = page.getByRole('img', { name: 'Lythaus', exact: true });
        await logo.waitFor();
        assert.equal(await logo.count(), 1);
        assert.ok(await logo.evaluate(image => image.complete && image.naturalWidth > 0));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await capture(page, engine + '-admin-' + theme + '-' + width);
        await page.getByRole('link', { name: 'Audit', exact: true }).click();
        assert.equal(new URL(page.url()).pathname, '/audit');
        await verifyIcons(page, context);
        assert.deepEqual(errors, []);
        results.push({ screen: 'admin', theme, width, status: 'passed' });
      } finally { await context.close(); }
    }
  }
  assert.equal(results.length, 24);
} finally {
  await browser.close();
  await Promise.all([appServer, adminServer].map(({ server }) => new Promise(resolve => server.close(resolve))));
  await writeFile(path.join(output, engine + '-results.json'), JSON.stringify({
    source, engine, browser: browser.version(), results,
    compiledSha256: createHash('sha256').update(await readFile(path.join(build, 'main.dart.js'))).digest('hex'),
  }, null, 2) + '\n');
}
