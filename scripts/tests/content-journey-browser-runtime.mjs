import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { contentFixture } from './content-journey-fixture.mjs';
import { chromium } from 'playwright';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';

export const build = path.resolve(process.env.CONTENT_WEB_ARTIFACT_DIR ?? 'build/content-journey-web');
export const evidence = path.resolve(process.env.CONTENT_QA_DIR ?? 'build/content-journey-evidence');
const font = JSON.parse(await readFile(new URL('./fixtures/content-engine-font.json', import.meta.url), 'utf8'));
const fontBody = Buffer.from(font.base64, 'base64');
assert.equal(createHash('sha256').update(fontBody).digest('hex'), font.sha256);

export async function harness() {
  await mkdir(evidence, { recursive: true });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf',
    '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const fixture = contentFixture();
  const server = createServer(async (request, response) => {
    try {
      if (await fixture(request,response)) return;
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      let file = path.resolve(build, '.' + pathname);
      assert.ok(file === build || file.startsWith(build + path.sep));
      if (!path.extname(file)) file = path.join(build, 'index.html');
      let body = await readFile(file);
      if (file.endsWith('/flutter_bootstrap.js')) {
        body = body.toString().replace('_flutter.loader.load({',
          '_flutter.buildConfig.useLocalCanvasKit = true;\n_flutter.loader.load({');
      }
      response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store' }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_EXECUTABLE });
  return { origin, browser, server, close: async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }};
}

export async function newPage(runtime, { width = 390, theme = 'light', actor = 'owner', scenario = '', caseId = randomUUID(), storageState } = {}) {
  const context = await runtime.browser.newContext({ viewport: { width, height: 900 },
    colorScheme: theme, locale: 'en-US', timezoneId: 'Etc/UTC',
    reducedMotion: 'reduce', serviceWorkers: 'block', storageState });
  const result = { width, height: 900, theme, actor, errors: [], warnings: [], blocked: [],
    writes: [], checks: [], screenshots: [], expectedHttpErrors: [], caseId };
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === runtime.origin) return route.continue();
    result.blocked.push(url.origin + url.pathname);
    return route.abort();
  });
  await installFlutterEngineFonts(context);
  await context.route(font.source, route => route.fulfill({
    contentType: 'font/woff2', body: fontBody,
    headers: {'access-control-allow-origin':'*'},
  }));
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('console', message => {
    const text = message.text();
    if (text.startsWith('SYNTHETIC-CONTENT-WRITE ')) {
      result.writes.push(JSON.parse(text.slice('SYNTHETIC-CONTENT-WRITE '.length)));
    } else if (message.type() === 'error' && /^Failed to load resource:.*[45][0-9][0-9]/.test(text)
        && message.location().url.startsWith(runtime.origin+'/api/')) result.expectedHttpErrors.push(text);
    else if (message.type() === 'error') result.errors.push(text);
    else if (message.type() === 'warning') result.warnings.push(text);
  });
  await page.goto(runtime.origin + '/?theme=' + theme + '&actor=' + actor + '&scenario=' + scenario+'&case='+caseId, { waitUntil: 'load' });
  await page.locator('flt-semantics-placeholder').waitFor({ timeout: 60000 });
  await page.locator('flt-semantics-placeholder').evaluate(element => element.click());
  await page.getByRole('button', { name: 'Open composer', exact: true }).waitFor();
  return { page, context, result };
}

export async function enterText(page, input, text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await input.click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(text);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await new Promise(resolve => setTimeout(resolve,100));
    if (await input.inputValue() === text) return;
  }
  throw new Error('Flutter input did not retain typed value: ' + text);
}

export async function screenshot(page, result, name) {
  const file = path.join(evidence, name + '-' + result.width + '-' + result.theme + '.png');
  await page.screenshot({ path: file });
  result.screenshots.push(file);
  return file;
}
