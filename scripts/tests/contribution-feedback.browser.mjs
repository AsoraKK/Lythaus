import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';

const build = '/tmp/lythaus-feedback-web';
const output = '/tmp/lythaus-feedback-evidence';
const noto = await readFile('/tmp/lythaus-feedback-noto.woff2');
assert.equal(createHash('sha256').update(noto).digest('hex'), '62a7417925f89dc84917c38d96b7b2e68092106dc3832c7a48129030322e73d8');
const emoji = await readFile('/tmp/lythaus-feedback-emoji.woff2');
assert.equal(createHash('sha256').update(emoji).digest('hex'), '2c6df98bda8729b0df325c2218482d6d4772f44e78694663778e023d4d9acc7a');
await mkdir(output, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    let file = path.resolve(build, '.' + pathname);
    assert.ok(file === build || file.startsWith(build + path.sep));
    if (!path.extname(file)) file = path.join(build, 'index.html');
    let body = await readFile(file);
    if (file.endsWith('/flutter_bootstrap.js')) {
      body = body.toString().replace('_flutter.loader.load({', '_flutter.buildConfig.useLocalCanvasKit = true;\n_flutter.loader.load({');
    }
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  for (const scenario of [
    { name: 'mobile', width: 390, height: 844, scale: 1 },
    { name: 'desktop', width: 1440, height: 960, scale: 1 },
    { name: 'mobile-200', width: 320, height: 960, scale: 2 },
  ]) {
    const context = await browser.newContext({ viewport: scenario, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [], blocked = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      blocked.push(url.origin + url.pathname);
      return route.abort();
    });
    await installFlutterEngineFonts(context);
    await context.route('https://fonts.gstatic.com/s/notosans/v37/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A99Y41P6zHtY.woff2', route =>
      route.fulfill({ contentType: 'font/woff2', body: noto, headers: { 'access-control-allow-origin': '*' } }));
    await context.route('https://fonts.gstatic.com/s/notocoloremoji/v32/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.9.woff2', route =>
      route.fulfill({ contentType: 'font/woff2', body: emoji, headers: { 'access-control-allow-origin': '*' } }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try {
      await page.goto(`${origin}/?scale=${scenario.scale}`);
      await page.locator('flt-semantics-placeholder').evaluate(element => element.click());
      await page.getByText('Discovery', { exact: true }).waitFor();
      await page.getByRole('button', { name: /Like 0/ }).first().waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('flt-semantics-host [aria-label]')].some(node => (node.getAttribute('aria-label') ?? '').includes('A closer look at the river')), null, { timeout: 5000 });
      const labels = await page.locator('flt-semantics-host [aria-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')).filter(Boolean));
      assert.ok(labels.some(label => label.includes('A closer look at the river')), `Feed contribution is present in the accessibility tree: ${JSON.stringify(labels)}`);
      assert.equal(await page.title(), 'Lythaus feedback synthetic preview');
      await page.screenshot({ path: path.join(output, `${scenario.name}-initial.png`) });
      await page.getByRole('button', { name: /Like 0/ }).first().click();
      await page.getByRole('button', { name: /Like 1/ }).first().waitFor();
      await page.getByRole('button', { name: /React to content/ }).first().click();
      await page.getByRole('button', { name: /Sad, 0 reactions/ }).first().click();
      await page.getByRole('button', { name: /Sad, 1 reactions/ }).first().waitFor();
      await page.getByRole('button', { name: /Like 1/ }).first().waitFor();
      await page.screenshot({ path: path.join(output, `${scenario.name}-selected.png`) });
      assert.deepEqual(errors, []);
      assert.deepEqual(blocked, []);
      console.log(JSON.stringify({ ...scenario, status: 'passed', title: await page.title() }));
    } catch (error) {
      await page.screenshot({ path: path.join(output, `${scenario.name}-failure.png`) }).catch(() => {});
      console.error(JSON.stringify({ errors: [...new Set(errors)].slice(0, 12), blocked: [...new Set(blocked)].slice(0, 12), url: page.url(), title: await page.title(), body: (await page.locator('body').innerText()).slice(0, 1000), semantics: (await page.locator('flt-semantics-host').innerHTML()).slice(0, 6000) }));
      throw error;
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
