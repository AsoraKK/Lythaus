import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
assert.ok(process.env.HOMEPAGE_QA_DIR && process.env.SECONDARY_QA_DIR, 'Set HOMEPAGE_QA_DIR and SECONDARY_QA_DIR to the external evidence directories');
const baseline = path.join(process.env.HOMEPAGE_QA_DIR, 'homepage-before');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, 'playwright') : 'playwright');
const roots = { before: path.join(baseline, 'dist'), after: path.join(root, 'dist') };
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (request, response) => {
  try {
    const parts = new URL(request.url, 'http://localhost').pathname.split('/').filter(Boolean);
    const version = request.headers.cookie?.includes('version=before') ? 'before' : 'after';
    let file = path.resolve(roots[version], ...parts);
    assert.ok(file.startsWith(roots[version] + path.sep));
    if (!path.extname(file)) file = path.join(file, 'index.html');
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const fonts = [await readFile(path.join(baseline, 'font-0.woff2')), await readFile(path.join(baseline, 'font-1.woff2'))];
const browser = await chromium.launch({ headless: true });
const samples = [];
try {
  for (let repetition = 0; repetition < 5; repetition += 1) {
    for (const route of ['sign-in', 'privacy']) {
      for (const version of ['before', 'after']) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce', locale: 'en-ZA' });
        await context.addCookies([{ name: 'version', value: version, url: origin }]);
        await context.route('**/*', async (request) => {
          const url = request.request().url();
          if (url.startsWith(origin + '/')) return request.continue();
          if (url.startsWith('https://fonts.googleapis.com/')) return request.fulfill({ contentType: 'text/css', body: '@font-face{font-family:"DM Sans";font-style:normal;font-weight:400 700;src:url(https://fonts.gstatic.com/frozen-body.woff2)}@font-face{font-family:Manrope;font-style:normal;font-weight:400 700;src:url(https://fonts.gstatic.com/frozen-heading.woff2)}' });
          if (url.startsWith('https://fonts.gstatic.com/')) return request.fulfill({ contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: url.includes('heading') ? fonts[1] : fonts[0] });
          return request.abort();
        });
        const page = await context.newPage();
        await page.goto(`${origin}/${route}`);
        await page.evaluate(() => document.fonts.ready);
        const navigation = await page.evaluate(() => ({ loadMs: performance.getEntriesByType('navigation')[0].loadEventEnd, domContentLoadedMs: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd, sameOriginResourceBytes: performance.getEntriesByType('resource').filter((entry) => entry.name.startsWith(location.origin)).reduce((sum, entry) => sum + entry.encodedBodySize, 0) }));
        const menuPaintMs = await page.evaluate(async () => {
          const start = performance.now();
          document.querySelector('[data-mobile-nav-toggle], .secondary-menu summary').click();
          await new Promise(requestAnimationFrame);
          return performance.now() - start;
        });
        samples.push({ repetition, route, version, ...navigation, menuPaintMs });
        await context.close();
      }
    }
  }
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const medians = [];
for (const route of ['sign-in', 'privacy']) for (const version of ['before', 'after']) {
  const selected = samples.filter((sample) => sample.route === route && sample.version === version);
  medians.push({ route, version, loadMs: median(selected.map((sample) => sample.loadMs)), domContentLoadedMs: median(selected.map((sample) => sample.domContentLoadedMs)), menuPaintMs: median(selected.map((sample) => sample.menuPaintMs)), sameOriginResourceBytes: median(selected.map((sample) => sample.sameOriginResourceBytes)) });
}
const result = { baselineSha: '8e3b3ebad2f846e61db2bfe819376723da7e9863', conditions: 'Chromium headless, 390x844, dark, reduced motion, five cold-context samples per version/route, loopback static HTTP; original remote font CSS and bytes served from frozen local fixtures. No network latency or real-user performance claim.', medians, samples };
await writeFile(path.join(process.env.SECONDARY_QA_DIR, 'performance.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ conditions: result.conditions, medians }, null, 2));
