import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { versionWebEntrypoints } from '../ci/version-web-entrypoints.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_DIR
    ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, 'playwright')
    : 'playwright',
);
const fixtureDirectory = path.resolve(
  process.env.WEB_RELEASE_GATE_FIXTURE_DIR ?? 'build/web-release-gate-fixture',
);
assert.ok(existsSync(path.join(fixtureDirectory, 'main.dart.js')),
  `Missing compiled Flutter fixture at ${fixtureDirectory}`);

const directory = mkdtempSync(path.join(os.tmpdir(), 'lythaus-flutter-gate-'));
const safeServiceWorker = readFileSync(
  new URL('../ci/flutter-service-worker.js', import.meta.url),
);
const releases = [];
let currentRelease;

function deploy(label) {
  const target = path.join(directory, label);
  cpSync(fixtureDirectory, target, { recursive: true });
  writeFileSync(path.join(target, 'flutter_service_worker.js'), safeServiceWorker);
  writeFileSync(
    path.join(target, 'main.dart.js'),
    `${readFileSync(path.join(target, 'main.dart.js'), 'utf8')}\nwindow.lythausGateFixtureLabel=${JSON.stringify(label)};\n`,
  );
  const manifest = versionWebEntrypoints(target);
  const release = { label, target, manifest };
  releases.push(release);
  currentRelease = release;
  return release;
}

function findAsset(relativePath) {
  if (relativePath === '' || relativePath === '/') {
    return path.join(currentRelease.target, 'index.html');
  }
  const normalized = path.posix.normalize(relativePath.replace(/^\/+/, ''));
  if (normalized.startsWith('../') || normalized === '..') return null;
  for (const release of [...releases].reverse()) {
    const file = path.join(release.target, normalized);
    if (file.startsWith(`${release.target}${path.sep}`) && existsSync(file) && statSync(file).isFile()) {
      return file;
    }
  }
  return null;
}

function contentType(file) {
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.json') || file.endsWith('.webmanifest')) return 'application/json; charset=utf-8';
  if (file.endsWith('.wasm')) return 'application/wasm';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.woff2')) return 'font/woff2';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'text/html; charset=utf-8';
}

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const route = url.pathname === '/web-release-assets.json'
    ? path.join(currentRelease.target, 'web-release-assets.json')
    : findAsset(decodeURIComponent(url.pathname));
  if (route === null || !existsSync(route)) {
    response.writeHead(404).end();
    return;
  }
  const uncached = url.pathname === '/' || url.pathname === '/index.html' ||
    url.pathname === '/web-release-assets.json' || url.pathname === '/flutter_service_worker.js';
  response.writeHead(200, {
    'content-type': contentType(route),
    'cache-control': uncached ? 'no-store, max-age=0, must-revalidate' : 'public, max-age=14400, immutable',
  });
  response.end(request.method === 'HEAD' ? undefined : readFileSync(route));
});

const firstRelease = deploy('A');
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const origin = `http://127.0.0.1:${server.address().port}/`;

async function openTab(context, label = 'A') {
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`browser page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`browser console error: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    const error = request.failure()?.errorText ?? '';
    if (error !== 'net::ERR_ABORTED') {
      console.error(`browser request failed: ${request.url()} ${error}`);
    }
  });
  await page.route('https://fonts.gstatic.com/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  );
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await page.goto(origin);
  await page.waitForFunction(
    (expected) => window.lythausGateFixtureLabel === expected &&
      typeof window.lythausGateFixtureSetDraft === 'function' &&
      typeof window.lythausGateFixtureGetDraft === 'function' &&
      Boolean(window.lythausReleaseUpdates),
    label,
    { timeout: 60000 },
  );
  return { page, navigationCount: () => navigations };
}

async function checkForUpdate(page) {
  await page.evaluate(() => window.lythausReleaseUpdates.checkNow());
  await page.waitForFunction(() => !window.lythausReleaseUpdates.snapshot().checking);
}

async function waitForRelease(page, label) {
  await page.waitForFunction(
    (expected) => window.lythausGateFixtureLabel === expected &&
      typeof window.lythausGateFixtureGetDraft === 'function',
    label,
    { timeout: 30000 },
  );
}

async function waitForGate(page, safe) {
  await page.waitForFunction(
    (expected) => window.lythausReleaseUpdates.snapshot().canReload === expected,
    safe,
    { timeout: 10000 },
  );
}

try {
  const context = await browser.newContext();
  const editing = await openTab(context);
  const idle = await openTab(context);
  await editing.page.evaluate(() => window.lythausGateFixtureSetDraft('unsent private post'));
  await waitForGate(editing.page, false);
  const secondRelease = deploy('B');
  await checkForUpdate(editing.page);
  await checkForUpdate(idle.page);
  await waitForRelease(idle.page, 'B');
  assert.equal(await editing.page.evaluate(() => window.lythausReleaseUpdates.snapshot().available), true);
  assert.equal(await editing.page.evaluate(() => window.lythausGateFixtureGetDraft()), 'unsent private post');
  const dirtyNavigations = editing.navigationCount();
  await editing.page.waitForTimeout(300);
  assert.equal(editing.navigationCount(), dirtyNavigations);

  await editing.page.evaluate(() => window.lythausGateFixtureSaveDraft());
  await waitForRelease(editing.page, 'B');
  assert.equal(await editing.page.evaluate(() => window.lythausGateFixtureGetDraft()), 'unsent private post');
  assert.equal(await editing.page.evaluate(() => window.lythausGateFixtureGetAccount()), 'account-a');
  assert.notEqual(firstRelease.manifest.releaseId, secondRelease.manifest.releaseId);

  const repeatedNavigations = editing.navigationCount();
  await checkForUpdate(editing.page);
  await checkForUpdate(editing.page);
  await editing.page.waitForTimeout(250);
  assert.equal(editing.navigationCount(), repeatedNavigations);

  await editing.page.evaluate(() => window.lythausGateFixtureBeginPending());
  await waitForGate(editing.page, false);
  const thirdRelease = deploy('C');
  await checkForUpdate(editing.page);
  assert.equal(await editing.page.evaluate(() => window.lythausReleaseUpdates.snapshot().available), true);
  const pendingNavigations = editing.navigationCount();
  await editing.page.waitForTimeout(250);
  assert.equal(editing.navigationCount(), pendingNavigations);
  await editing.page.evaluate(() => window.lythausGateFixtureFinishPending());
  await waitForRelease(editing.page, 'C');
  assert.equal(await editing.page.evaluate(() => window.lythausGateFixtureGetPendingJournal()), 0);

  await editing.page.evaluate(() => window.lythausGateFixtureSetDraft('account A private text'));
  await editing.page.evaluate(() => window.lythausGateFixtureStartJournal());
  await editing.page.waitForFunction(() => window.lythausGateFixtureGetPendingJournal() > 0);
  await editing.page.evaluate(() => window.lythausGateFixtureChangeSession());
  await waitForGate(editing.page, false);
  const fourthRelease = deploy('D');
  await checkForUpdate(editing.page);
  const journalNavigations = editing.navigationCount();
  await editing.page.waitForTimeout(250);
  assert.equal(editing.navigationCount(), journalNavigations);
  await editing.page.evaluate(() => window.lythausGateFixtureReleaseJournal());
  await waitForRelease(editing.page, 'D');
  assert.equal(await editing.page.evaluate(() => window.lythausGateFixtureGetAccount()), 'account-b');
  assert.equal(await editing.page.evaluate(() => window.lythausGateFixtureGetDraft()), '');
  assert.notEqual(thirdRelease.manifest.releaseId, fourthRelease.manifest.releaseId);

  console.log(JSON.stringify({
    status: 'PASSED',
    evidence: 'compiled Flutter debug app with the production Dart reload gate and JavaScript bridge',
    scenarios: [
      'active Flutter draft defers navigation while another tab receives the update',
      'durable journal save releases the gate and restores draft after reload',
      'pending authenticated operation defers reload until finished',
      'held recovery journal and account switch defer reload until the session is ready',
      'new account reload contains no prior account draft',
      'repeated release signal does not navigate again',
    ],
  }));
  await context.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
