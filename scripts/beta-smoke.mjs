#!/usr/bin/env node

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { createWorker } from 'tesseract.js';

function isPrivateOrLocalHost(host) {
  const normalized = host.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized === '::1') return true;
  if (normalized.endsWith('.local')) return true;
  if (normalized === '127.0.0.1' || normalized === '0.0.0.0') return true;

  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(normalized);
  if (!match) return false;

  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function requirePublicHttpsOrigin(name, value) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }

  const uri = new URL(trimmed);
  if (uri.protocol !== 'https:' || !uri.hostname) {
    throw new Error(`${name} must be a public HTTPS origin`);
  }

  if (isPrivateOrLocalHost(uri.hostname)) {
    throw new Error(`${name} must not target localhost or a private host`);
  }

  return uri;
}

function normalizeOrigin(url) {
  return url.toString().replace(/\/+$/, '');
}

function buildUrl(baseUrl, path) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), base).toString();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function textMatches(haystack, texts) {
  const normalizedHaystack = normalizeText(haystack);
  return texts.some((text) => normalizedHaystack.includes(normalizeText(text)));
}

async function ocrPageText(page, worker) {
  const image = await page.screenshot({ type: 'png' });
  const { data } = await worker.recognize(image);
  return data.text ?? '';
}

async function waitForAnyText(page, worker, texts, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let lastOcrText = '';

  while (Date.now() < deadline) {
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    if (textMatches(bodyText, texts)) {
      return;
    }

    try {
      lastOcrText = await ocrPageText(page, worker);
      if (textMatches(lastOcrText, texts)) {
        return;
      }
    } catch (error) {
      console.error(`[ocr] ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}`);
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`Timed out waiting for text: ${texts.join(', ')}. OCR: ${lastOcrText.slice(0, 1200) || '<empty>'}`);
}

function ocrLines(data) {
  const lines = Array.isArray(data?.lines) ? [...data.lines] : [];
  for (const block of data?.blocks ?? []) {
    for (const paragraph of block?.paragraphs ?? []) {
      lines.push(...(paragraph?.lines ?? []));
    }
  }
  return lines;
}

async function clickVisibleText(page, worker, text) {
  const candidates = page.getByText(text, { exact: false });
  for (let index = (await candidates.count()) - 1; index >= 0; index -= 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click();
      return;
    }
  }

  const image = await page.screenshot({ type: 'png' });
  const { data } = await worker.recognize(image, {}, { blocks: true });
  const line = ocrLines(data).find((item) => textMatches(item?.text ?? '', [text]));
  const box = line?.bbox;
  if (!box || ![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite)) {
    throw new Error(`Could not locate visible text: ${text}`);
  }
  await page.mouse.click((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2);
}

async function fetchWithBody(url, init = {}) {
  const response = await fetch(url, init);
  const body = await response.text();
  return { response, body };
}

const webBaseUrl = normalizeOrigin(
  requirePublicHttpsOrigin('WEB_BASE_URL', process.env.WEB_BASE_URL),
);
const apiBaseUrl = normalizeOrigin(
  requirePublicHttpsOrigin('API_BASE_URL', process.env.API_BASE_URL),
);
const adminApiUrl = normalizeOrigin(
  requirePublicHttpsOrigin('ADMIN_API_URL', process.env.ADMIN_API_URL),
);

const smokeToken = (process.env.LYTHAUS_RUNTIME_ACCESS_TOKEN || '').trim();
const accessClientId = (process.env.CF_ACCESS_CLIENT_ID || process.env.CF_Access_Client_Id || '').trim();
const accessClientSecret = (process.env.CF_ACCESS_CLIENT_SECRET || process.env.CF_Access_Client_Secret || '').trim();
const reportPath = (process.env.BETA_SMOKE_REPORT_PATH || '').trim();

if (!smokeToken) {
  throw new Error('LYTHAUS_RUNTIME_ACCESS_TOKEN is required for authenticated API smoke checks');
}

if (!accessClientId || !accessClientSecret) {
  throw new Error('CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are required for admin API smoke checks');
}

const report = {
  generatedAt: new Date().toISOString(),
  config: {
    webBaseUrl,
    apiBaseUrl,
    adminApiUrl,
  },
  checks: [],
  forbiddenRequests: [],
  pageErrors: [],
  consoleErrors: [],
  failedRequests: [],
  permissionPrompts: 0,
  permissionRequests: 0,
  permissionQueries: 0,
};

function recordCheck(name, status, details = {}) {
  report.checks.push({ name, status, ...details });
}

let browser;
let context;
let page;
let ocrWorker;

try {
  browser = await chromium.launch({ headless: true });
  ocrWorker = await createWorker('eng');
  context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: false,
  });

  await context.addInitScript(() => {
    const bump = (key) => {
      try {
        const current = Number(sessionStorage.getItem(key) || '0');
        sessionStorage.setItem(key, String(current + 1));
      } catch {
        // Ignore storage failures; the smoke checks still run.
      }
    };

    try {
      if (typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function') {
        const original = Notification.requestPermission.bind(Notification);
        Object.defineProperty(Notification, 'requestPermission', {
          configurable: true,
          value: async (...args) => {
            bump('__betaSmokePermissionPrompts');
            bump('__betaSmokeNotificationRequests');
            return original(...args);
          },
        });
      }
    } catch {
      // Best-effort prompt tracking.
    }

    try {
      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        const originalQuery = navigator.permissions.query.bind(navigator.permissions);
        Object.defineProperty(navigator.permissions, 'query', {
          configurable: true,
          value: async (descriptor) => {
            if (descriptor && descriptor.name === 'notifications') {
              bump('__betaSmokeNotificationQueries');
            }
            return originalQuery(descriptor);
          },
        });
      }
    } catch {
      // Best-effort prompt tracking.
    }

    try {
      if (navigator.geolocation) {
        const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
        const originalWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);

        Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
          configurable: true,
          value: (...args) => {
            bump('__betaSmokePermissionPrompts');
            return originalGetCurrentPosition(...args);
          },
        });

        Object.defineProperty(navigator.geolocation, 'watchPosition', {
          configurable: true,
          value: (...args) => {
            bump('__betaSmokePermissionPrompts');
            return originalWatchPosition(...args);
          },
        });
      }
    } catch {
      // Best-effort prompt tracking.
    }

    try {
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
          configurable: true,
          value: async (...args) => {
            bump('__betaSmokePermissionPrompts');
            return originalGetUserMedia(...args);
          },
        });
      }
    } catch {
      // Best-effort prompt tracking.
    }
  });

  page = await context.newPage();
  page.setDefaultTimeout(20_000);

  page.on('pageerror', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    report.pageErrors.push(message);
    console.error(`[pageerror] ${message}`);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text();
      report.consoleErrors.push(text);
      console.error(`[console.error] ${text}`);
    }
  });

  page.on('request', (request) => {
    const requestUrl = request.url();
    if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
      return;
    }

    const hostname = new URL(requestUrl).hostname;
    if (isPrivateOrLocalHost(hostname)) {
      report.forbiddenRequests.push(requestUrl);
    }
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || 'unknown error';
    const url = request.url();
    report.failedRequests.push({ url, failure });
    console.error(`[requestfailed] ${request.method()} ${url} -> ${failure}`);
  });

  console.log(`Web base:   ${webBaseUrl}`);
  console.log(`API base:   ${apiBaseUrl}`);
  console.log(`Admin API:  ${adminApiUrl}`);

  await (async () => {
    const landingUrl = buildUrl(webBaseUrl, '/');
    const response = await page.goto(landingUrl, { waitUntil: 'domcontentloaded' });
    assert(response, `Landing request failed for ${landingUrl}`);
    assert(response.status() === 200, `Landing page returned HTTP ${response.status()}`);
    await waitForAnyText(page, ocrWorker, ['Welcome to Lythaus', 'Continue as guest']);
    recordCheck('landing loads login screen', 'passed', { path: page.url() });
  })();

  await (async () => {
    const loginUrl = buildUrl(webBaseUrl, '/login');
    const response = await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    assert(response, `Login request failed for ${loginUrl}`);
    assert(response.status() === 200, `Login page returned HTTP ${response.status()}`);
    await waitForAnyText(page, ocrWorker, ['Welcome to Lythaus', 'Continue as guest', 'Sign in']);
    recordCheck('/login loads', 'passed', { path: page.url() });
  })();

  await (async () => {
    const callbackUrl = buildUrl(webBaseUrl, '/auth/callback');
    const response = await page.goto(callbackUrl, { waitUntil: 'domcontentloaded' });
    assert(response, `Auth callback request failed for ${callbackUrl}`);
    assert(response.status() === 200, `Auth callback route returned HTTP ${response.status()}`);
    await waitForAnyText(page, ocrWorker, [
      'Back to sign in',
      'Sign-in failed',
      'Completing sign-in',
      'Welcome to Lythaus',
      'Continue as guest',
    ]);
    recordCheck('/auth/callback route does not hard-404', 'passed', { path: page.url() });
  })();

  await (async () => {
    const userUrl = buildUrl(webBaseUrl, '/user/00000000-0000-4000-8000-000000000001');
    const response = await page.goto(userUrl, { waitUntil: 'domcontentloaded' });
    assert(response, `User deep link request failed for ${userUrl}`);
    assert(response.status() === 200, `User deep link returned HTTP ${response.status()}`);
    await waitForAnyText(page, ocrWorker, ['Profile', 'Welcome to Lythaus', 'Continue as guest']);

    const reload = await page.reload({ waitUntil: 'domcontentloaded' });
    assert(reload, 'User deep link reload failed');
    assert(reload.status() === 200, `User deep link reload returned HTTP ${reload.status()}`);
    await waitForAnyText(page, ocrWorker, ['Profile', 'Welcome to Lythaus', 'Continue as guest']);
    recordCheck('/user/:id deep link loads without hard-404', 'passed', { path: page.url() });
  })();

  await (async () => {
    const postUrl = buildUrl(webBaseUrl, '/post/00000000-0000-4000-8000-000000000001');
    const response = await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    assert(response, `Post deep link request failed for ${postUrl}`);
    assert(response.status() === 200, `Post deep link returned HTTP ${response.status()}`);
    await waitForAnyText(page, ocrWorker, ['Post', 'Welcome to Lythaus', 'Continue as guest']);

    const reload = await page.reload({ waitUntil: 'domcontentloaded' });
    assert(reload, 'Post deep link reload failed');
    assert(reload.status() === 200, `Post deep link reload returned HTTP ${reload.status()}`);
    await waitForAnyText(page, ocrWorker, ['Post', 'Welcome to Lythaus', 'Continue as guest']);
    recordCheck('/post/:id deep link loads without hard-404', 'passed', { path: page.url() });
  })();

  await (async () => {
    const loginUrl = buildUrl(webBaseUrl, '/login');
    const response = await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    assert(response, `Login request failed for guest smoke at ${loginUrl}`);
    await waitForAnyText(page, ocrWorker, ['Continue as guest']);
    await clickVisibleText(page, ocrWorker, 'Continue as guest');
    await waitForAnyText(page, ocrWorker, ['Discover calm, trustworthy updates tailored to you.', 'No posts yet']);
    recordCheck('app shell loads', 'passed', { path: page.url() });
    recordCheck('guest discovery feed loads or empty-states', 'passed', { path: page.url() });
  })();

  await (async () => {
    const counter = await page.evaluate(() => ({
      permissionPrompts: Number(sessionStorage.getItem('__betaSmokePermissionPrompts') || '0'),
      notificationRequests: Number(sessionStorage.getItem('__betaSmokeNotificationRequests') || '0'),
      notificationQueries: Number(sessionStorage.getItem('__betaSmokeNotificationQueries') || '0'),
    }));

    assert(counter.permissionPrompts === 0, `Browser permission prompt APIs were used ${counter.permissionPrompts} time(s)`);
    assert(counter.notificationRequests === 0, `Notification permission was requested ${counter.notificationRequests} time(s)`);
    assert(counter.notificationQueries === 0, `Notification permission was queried ${counter.notificationQueries} time(s)`);
    recordCheck('no browser permission prompt', 'passed');
    report.permissionPrompts = counter.permissionPrompts;
    report.permissionRequests = counter.notificationRequests;
    report.permissionQueries = counter.notificationQueries;
  })();

  await (async () => {
    const url = buildUrl(apiBaseUrl, 'feed/discover?limit=1');
    const { response } = await fetchWithBody(url, {
      headers: {
        Authorization: `Bearer ${smokeToken}`,
        Accept: 'application/json',
      },
    });

    const cacheControl = response.headers.get('cache-control') || '';
    assert(response.ok, `Authenticated discover feed returned HTTP ${response.status}`);
    assert(/no-store/i.test(cacheControl), `Authenticated discover feed must be no-store, got: ${cacheControl || '<missing>'}`);
    recordCheck('authenticated discover feed responses are no-store', 'passed', {
      status: response.status,
      cacheControl,
    });
  })();

  await (async () => {
    const url = buildUrl(apiBaseUrl, 'feed?page=1&pageSize=20');
    const { response, body } = await fetchWithBody(url, {
      headers: {
        Authorization: `Bearer ${smokeToken}`,
        Accept: 'application/json',
      },
    });

    const cacheControl = response.headers.get('cache-control') || '';
    assert(response.ok, `Authenticated home feed returned HTTP ${response.status}: ${body.slice(0, 200)}`);
    assert(
      /private/i.test(cacheControl) && /no-store/i.test(cacheControl),
      `Authenticated home feed must be private/no-store, got: ${cacheControl || '<missing>'}`,
    );

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(`Authenticated home feed returned invalid JSON: ${body.slice(0, 200)}`);
    }

    assert(parsed && typeof parsed === 'object', 'Authenticated home feed returned missing payload');
    assert(Array.isArray(parsed.items), 'Authenticated home feed returned missing items array');
    assert(parsed.nextCursor === null || typeof parsed.nextCursor === 'string', 'Authenticated home feed returned invalid nextCursor');

    recordCheck('authenticated home feed returns private no-store JSON', 'passed', {
      status: response.status,
      cacheControl,
      items: parsed.items.length,
      emptyState: parsed.items.length === 0,
    });
  })();

  await (async () => {
    const url = buildUrl(apiBaseUrl, 'feed?page=1&pageSize=20&type=following');
    const { response, body } = await fetchWithBody(url, {
      headers: {
        Authorization: `Bearer ${smokeToken}`,
        Accept: 'application/json',
      },
    });

    const cacheControl = response.headers.get('cache-control') || '';
    assert(response.ok, `Authenticated following feed returned HTTP ${response.status}: ${body.slice(0, 200)}`);
    assert(
      /private/i.test(cacheControl) && /no-store/i.test(cacheControl),
      `Authenticated following feed must be private/no-store, got: ${cacheControl || '<missing>'}`,
    );

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(`Authenticated following feed returned invalid JSON: ${body.slice(0, 200)}`);
    }

    assert(parsed && typeof parsed === 'object', 'Authenticated following feed returned missing payload');
    assert(Array.isArray(parsed.items), 'Authenticated following feed returned missing items array');
    assert(parsed.nextCursor === null || typeof parsed.nextCursor === 'string', 'Authenticated following feed returned invalid nextCursor');

    recordCheck('authenticated following feed handles empty-state cleanly', 'passed', {
      status: response.status,
      cacheControl,
      items: parsed.items.length,
      emptyState: parsed.items.length === 0,
    });
  })();

  await (async () => {
    const url = buildUrl(adminApiUrl, 'api/_admin/config');
    const { response, body } = await fetchWithBody(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'application/json',
      },
    });

    assert(response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400),
      `Unauthenticated admin request should be blocked, got HTTP ${response.status}`);
    recordCheck('admin API requires Cloudflare Access/auth', 'passed', {
      status: response.status,
    });
  })();

  await (async () => {
    const url = buildUrl(adminApiUrl, 'api/_admin/config');
    const { response, body } = await fetchWithBody(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'application/json',
        'CF-Access-Client-Id': accessClientId,
        'CF-Access-Client-Secret': accessClientSecret,
      },
    });

    assert(
      response.status === 200 || response.status === 401 || response.status === 403 || response.status === 404,
      `Service-token admin request should reach origin without a Cloudflare Access redirect, got HTTP ${response.status}: ${body.slice(0, 200)}`,
    );

    const cacheControl = response.headers.get('cache-control') || '';
    if (response.status === 200) {
      assert(/no-store/i.test(cacheControl), `Authenticated admin response must be no-store, got: ${cacheControl || '<missing>'}`);
    }

    recordCheck('admin service token reaches admin origin', 'passed', {
      status: response.status,
      cacheControl,
    });
  })();

  assert(report.forbiddenRequests.length === 0, `Forbidden local/private requests observed: ${report.forbiddenRequests.join(', ')}`);

  console.log('\nSmoke checks passed.');
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  if (page) {
    try {
      await page.close();
    } catch {
      // Ignore cleanup failures.
    }
  }

  if (context) {
    try {
      await context.close();
    } catch {
      // Ignore cleanup failures.
    }
  }

  if (browser) {
    try {
      await browser.close();
    } catch {
      // Ignore cleanup failures.
    }
  }

  if (ocrWorker) {
    try {
      await ocrWorker.terminate();
    } catch {
      // Ignore cleanup failures.
    }
  }

  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(`Report: ${reportPath || '<not written>'}`);
}
