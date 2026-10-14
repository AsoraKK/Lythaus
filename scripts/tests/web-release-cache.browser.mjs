import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
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
const directory = mkdtempSync(path.join(os.tmpdir(), 'lythaus-release-browser-'));
const updateClient = readFileSync(
  new URL('../../web/release-update.js', import.meta.url),
);
const safeFlutterServiceWorker = readFileSync(
  new URL('../ci/flutter-service-worker.js', import.meta.url),
  'utf8',
);
const indexTemplate = '<!doctype html><html><head><base href="/"><meta name="lythaus-release-id" content="__LYTHAUS_WEB_RELEASE_ID__"><title>Release fixture</title></head><body><script src="release-update.js"></script><script src="flutter_bootstrap.js" async></script></body></html>';
const bootstrap = 'window._flutter={buildConfig:{"builds":[{"mainJsPath":"main.dart.js"}]},loader:{load(){const script=document.createElement("script");script.src=window._flutter.buildConfig.builds[0].mainJsPath;document.head.append(script);}}};window._flutter.loader.load();';
const serverState = {
  manifestMode: 'normal',
  manifestOverride: null,
  staleNextDocumentHtml: null,
  requests: [],
};

function deployRelease(label) {
  writeFileSync(path.join(directory, 'index.html'), indexTemplate);
  writeFileSync(path.join(directory, 'flutter_bootstrap.js'), bootstrap);
  writeFileSync(
    path.join(directory, 'main.dart.js'),
    `window.release=${JSON.stringify(label)};`,
  );
  writeFileSync(path.join(directory, 'release-update.js'), updateClient);
  const manifest = versionWebEntrypoints(directory);
  return {
    manifest,
    html: readFileSync(path.join(directory, 'index.html'), 'utf8'),
  };
}

function sendFile(request, response, file) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(file)) {
    response.writeHead(400).end();
    return;
  }
  try {
    const bytes = readFileSync(path.join(directory, file));
    const type = file.endsWith('.js')
      ? 'application/javascript; charset=utf-8'
      : file.endsWith('.json')
        ? 'application/json; charset=utf-8'
        : 'text/html; charset=utf-8';
    const cacheControl = file === 'index.html' || file === 'web-release-assets.json'
      ? 'no-store, max-age=0, must-revalidate'
      : 'public, max-age=14400, immutable';
    response.writeHead(200, {
      'content-type': type,
      'cache-control': cacheControl,
    });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(404).end();
  }
}

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  serverState.requests.push({
    url: request.url,
    mode: request.headers['sec-fetch-mode'],
    destination: request.headers['sec-fetch-dest'],
  });
  if (url.pathname === '/flutter_service_worker.js') {
    response.writeHead(200, {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store',
    }).end(safeFlutterServiceWorker);
    return;
  }
  if (url.pathname === '/web-release-assets.json') {
    if (serverState.manifestMode === 'html') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      }).end('<!doctype html><title>SPA fallback</title>');
      return;
    }
    if (serverState.manifestMode === 'malformed-json') {
      response.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      }).end('{');
      return;
    }
    if (serverState.manifestOverride !== null) {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      }).end(JSON.stringify(serverState.manifestOverride));
      return;
    }
    sendFile(request, response, 'web-release-assets.json');
    return;
  }
  if (
    serverState.staleNextDocumentHtml !== null &&
    request.method === 'GET' &&
    request.headers['sec-fetch-mode'] === 'navigate' &&
    request.headers['sec-fetch-dest'] === 'document'
  ) {
    const html = serverState.staleNextDocumentHtml;
    serverState.staleNextDocumentHtml = null;
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    }).end(html);
    return;
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  sendFile(request, response, file);
});

const firstRelease = deployRelease('v1');
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const origin = `http://127.0.0.1:${server.address().port}/`;

async function openTab(context, expectedRelease = 'v1') {
  const page = await context.newPage();
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  await page.goto(origin);
  await page.waitForFunction(
    (expected) =>
      window.release === expected && Boolean(window.lythausReleaseUpdates),
    expectedRelease,
  );
  return {
    page,
    navigationCount: () => navigations,
  };
}

async function checkForUpdate(page) {
  await page.evaluate(() => window.lythausReleaseUpdates.checkNow());
  await page.waitForFunction(
    () => !window.lythausReleaseUpdates.snapshot().checking,
  );
}

async function waitForRelease(page, release) {
  await page.waitForFunction(
    (expected) => window.release === expected,
    release,
    { timeout: 10000 },
  );
}

try {
  const context = await browser.newContext();
  const idle = await openTab(context);
  const editing = await openTab(context);
  await idle.page.evaluate(() => {
    localStorage.setItem('release-fixture-session', 'retained');
    window.lythausReleaseUpdates.setCanReload(false);
  });
  await editing.page.evaluate(() =>
    window.lythausReleaseUpdates.setCanReload(false),
  );

  const secondRelease = deployRelease('v2');
  await checkForUpdate(idle.page);
  await checkForUpdate(editing.page);
  const idleSnapshot = await idle.page.evaluate(
    () => window.lythausReleaseUpdates.snapshot(),
  );
  assert.equal(idleSnapshot.available, true);
  assert.equal(idleSnapshot.canReload, false);

  await idle.page.evaluate(() =>
    window.lythausReleaseUpdates.setCanReload(true),
  );
  await waitForRelease(idle.page, 'v2');
  assert.equal(
    await idle.page.evaluate(() =>
      localStorage.getItem('release-fixture-session'),
    ),
    'retained',
  );
  const idleAttempt = await idle.page.evaluate(
    () => window.lythausReleaseUpdates.snapshot().attemptedReleaseId,
  );
  assert.equal(idleAttempt, null);
  await idle.page.evaluate(() =>
    window.lythausReleaseUpdates.setCanReload(true),
  );

  await editing.page.evaluate(() => {
    const input = document.createElement('textarea');
    input.id = 'active-draft';
    input.value = 'unsent comment draft';
    document.body.append(input);
    input.focus();
  });
  let editingSnapshot = await editing.page.evaluate(
    () => window.lythausReleaseUpdates.snapshot(),
  );
  assert.equal(editingSnapshot.canReload, false);
  assert.equal(editingSnapshot.available, true);
  assert.equal(
    await editing.page.locator('#active-draft').inputValue(),
    'unsent comment draft',
  );
  const editingNavsBefore = editing.navigationCount();
  await editing.page.waitForTimeout(250);
  assert.equal(editing.navigationCount(), editingNavsBefore);
  assert.match(
    await editing.page.locator('#lythaus-web-release-update').innerText(),
    /Finish or save your current work/,
  );

  await editing.page.locator('#active-draft').evaluate((input) => input.blur());
  await editing.page.evaluate(() =>
    window.lythausReleaseUpdates.setCanReload(true),
  );
  await waitForRelease(editing.page, 'v2');
  assert.equal(
    await editing.page.evaluate(() =>
      window.lythausReleaseUpdates.snapshot().attemptedReleaseId,
    ),
    null,
  );

  const rollback = deployRelease('v1');
  await checkForUpdate(idle.page);
  await waitForRelease(idle.page, 'v1');
  assert.notEqual(rollback.manifest.releaseId, secondRelease.manifest.releaseId);

  const beforeRepeatedSignal = idle.navigationCount();
  await checkForUpdate(idle.page);
  await checkForUpdate(idle.page);
  await idle.page.waitForTimeout(250);
  assert.equal(idle.navigationCount(), beforeRepeatedSignal);

  const staleContext = await browser.newContext();
  const staleTab = await openTab(staleContext);
  const independentTab = await openTab(staleContext);
  const staleHtml = firstRelease.html;
  const staleCandidate = deployRelease('v2');
  serverState.staleNextDocumentHtml = staleHtml;
  const staleNavigation = staleTab.page.waitForEvent('framenavigated', {
    timeout: 10000,
  });
  await staleTab.page.evaluate(() =>
    window.lythausReleaseUpdates.setCanReload(true),
  );
  await checkForUpdate(staleTab.page);
  await staleNavigation;
  await staleTab.page.waitForFunction(
    (expected) =>
      window.release === 'v1' &&
      window.lythausReleaseUpdates.snapshot().attemptedReleaseId === expected,
    staleCandidate.manifest.releaseId,
  );
  await staleTab.page.evaluate(() =>
    window.lythausReleaseUpdates.setCanReload(true),
  );
  await checkForUpdate(staleTab.page);
  const staleNavsBefore = staleTab.navigationCount();
  const staleSnapshot = await staleTab.page.evaluate(
    () => window.lythausReleaseUpdates.snapshot(),
  );
  assert.equal(staleSnapshot.available, true);
  assert.equal(staleSnapshot.attemptedReleaseId, staleCandidate.manifest.releaseId);
  await independentTab.page.evaluate(() =>
    window.lythausReleaseUpdates.setCanReload(true),
  );
  await checkForUpdate(independentTab.page);
  await waitForRelease(independentTab.page, 'v2');
  assert.equal(
    await independentTab.page.evaluate(
      () => window.lythausReleaseUpdates.snapshot().attemptedReleaseId,
    ),
    null,
  );
  await checkForUpdate(staleTab.page);
  await checkForUpdate(staleTab.page);
  await staleTab.page.waitForTimeout(250);
  assert.equal(staleTab.navigationCount(), staleNavsBefore);

  const offlineContext = await browser.newContext();
  const offlineTab = await openTab(offlineContext, 'v2');
  await offlineTab.page.evaluate(() =>
    window.lythausReleaseUpdates.setCanReload(true),
  );
  serverState.manifestMode = 'html';
  await checkForUpdate(offlineTab.page);
  assert.equal(
    await offlineTab.page.evaluate(
      () => window.lythausReleaseUpdates.snapshot().available,
    ),
    false,
  );
  serverState.manifestMode = 'malformed-json';
  await checkForUpdate(offlineTab.page);
  assert.equal(
    await offlineTab.page.evaluate(
      () => window.lythausReleaseUpdates.snapshot().available,
    ),
    false,
  );
  serverState.manifestMode = 'normal';
  const restrictedContext = await browser.newContext();
  const restrictedTab = await openTab(restrictedContext, 'v2');
  const thirdRelease = deployRelease('v3');
  serverState.manifestOverride = secondRelease.manifest;
  await checkForUpdate(offlineTab.page);
  assert.equal(
    await offlineTab.page.evaluate(
      () => window.lythausReleaseUpdates.snapshot().available,
    ),
    false,
  );
  serverState.manifestOverride = null;
  await restrictedTab.page.evaluate(() => {
    Object.defineProperty(window.sessionStorage, 'setItem', {
      configurable: true,
      value: () => {
        throw new DOMException('Storage is blocked', 'SecurityError');
      },
    });
    window.lythausReleaseUpdates.setCanReload(true);
  });
  const restrictedNavsBefore = restrictedTab.navigationCount();
  await checkForUpdate(restrictedTab.page);
  assert.equal(
    await restrictedTab.page.evaluate(
      () => window.lythausReleaseUpdates.snapshot().available,
    ),
    true,
  );
  assert.equal(restrictedTab.navigationCount(), restrictedNavsBefore);
  assert.equal(
    await restrictedTab.page
      .locator('#lythaus-web-release-update button')
      .isDisabled(),
    true,
  );
  assert.match(
    await restrictedTab.page.locator('#lythaus-web-release-update').innerText(),
    /storage is unavailable.*reload loop/i,
  );
  await restrictedTab.page.evaluate(() => {
    delete window.sessionStorage.setItem;
    window.lythausReleaseUpdates.setCanReload(true);
  });
  await waitForRelease(restrictedTab.page, 'v3');

  const offlineNavsBefore = offlineTab.navigationCount();
  await offlineContext.setOffline(true);
  await offlineTab.page.evaluate(() => window.lythausReleaseUpdates.checkNow());
  assert.equal(offlineTab.navigationCount(), offlineNavsBefore);
  await offlineContext.setOffline(false);
  await waitForRelease(offlineTab.page, 'v3');

  const workerContext = await browser.newContext();
  const workerTab = await openTab(workerContext, 'v3');
  const workerNavsBefore = workerTab.navigationCount();
  await workerTab.page.evaluate(async () => {
    await navigator.serviceWorker.register('/flutter_service_worker.js');
  });
  await workerTab.page.waitForFunction(() =>
    Boolean(navigator.serviceWorker.controller),
  );
  await workerTab.page.waitForTimeout(250);
  assert.equal(workerTab.navigationCount(), workerNavsBefore);
  await checkForUpdate(workerTab.page);
  assert.equal(
    await workerTab.page.evaluate(() => window.release),
    'v3',
  );
  assert.equal(workerTab.navigationCount(), workerNavsBefore);

  const checkUrls = serverState.requests
    .filter(({ url }) => url.startsWith('/web-release-assets.json'))
    .map(({ url }) => new URL(url, origin));
  assert.ok(checkUrls.length > 0);
  assert.ok(checkUrls.every((url) => url.searchParams.has('check')));
  assert.ok(new Set(checkUrls.map((url) => url.searchParams.get('check'))).size > 1);

  console.log(
    JSON.stringify({
      status: 'PASSED',
      scenarios: [
        'live tab picks up a new release',
        'active draft defers reload',
        'pending authenticated work holds the reload gate',
        'each tab tracks its own reload attempt',
        'rollback reloads by release identity',
        'repeated signal does not loop',
        'stale document response is rejected without looping',
        'blocked session storage pauses reload until the loop guard is available',
        'HTML SPA fallback is not accepted as a manifest',
        'offline polling waits for connectivity',
        'manifest reads bypass stale cache keys',
        'service-worker activation does not navigate live tabs',
      ],
      storagePreserved: true,
      releases: {
        first: firstRelease.manifest.releaseId,
        second: secondRelease.manifest.releaseId,
        rollback: rollback.manifest.releaseId,
      },
    }),
  );
  await Promise.all([
    context.close(),
    staleContext.close(),
    restrictedContext.close(),
    offlineContext.close(),
    workerContext.close(),
  ]);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
