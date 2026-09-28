import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { versionWebEntrypoints } from '../ci/version-web-entrypoints.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, 'playwright') : 'playwright');
const directory = mkdtempSync(path.join(os.tmpdir(), 'lythaus-cache-browser-'));
const bootstrap = 'window._flutter={loader:{load(){const script=document.createElement("script");script.src=_flutter.buildConfig.builds[0].mainJsPath;document.head.append(script);}}};_flutter.buildConfig={"builds":[{"mainJsPath":"main.dart.js"}]};_flutter.loader.load();';
writeFileSync(path.join(directory, 'index.html'), '<title>Release cache fixture</title><script src="flutter_bootstrap.js" async></script>');
writeFileSync(path.join(directory, 'flutter_bootstrap.js'), bootstrap);
writeFileSync(path.join(directory, 'main.dart.js'), 'window.release="before";');
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!/^[a-zA-Z0-9_.-]+$/.test(file)) return response.writeHead(400).end();
  try {
    response.writeHead(200, {
      'content-type': file.endsWith('.js') ? 'application/javascript' : 'text/html',
      'cache-control': file === 'index.html' ? 'no-store' : 'public, max-age=14400',
    }).end(readFileSync(path.join(directory, file)));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.release === 'before');
  await page.evaluate(() => localStorage.setItem('release-fixture-preference', 'retained'));
  writeFileSync(path.join(directory, 'main.dart.js'), 'window.release="after";');
  await page.reload();
  await page.waitForFunction(() => window.release);
  const unversionedReload = await page.evaluate(() => window.release);
  const manifest = versionWebEntrypoints(directory);
  const requested = [];
  page.on('request', request => requested.push(new URL(request.url()).pathname));
  await page.reload();
  await page.waitForFunction(() => window.release === 'after');
  assert.ok(requested.includes(`/${manifest.main.file}`));
  assert.ok(requested.includes(`/${manifest.bootstrap.file}`));
  assert.equal(await page.evaluate(() => localStorage.getItem('release-fixture-preference')), 'retained');
  console.log(JSON.stringify({ status: 'PASSED', unversionedReload, versionedReload: 'after', storagePreserved: true, manifest }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
