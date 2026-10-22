import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium, webkit } from 'playwright';
import sharp from 'sharp';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';

const disabled = process.env.IMAGE_QA_DISABLED === '1';
const build = path.resolve(process.env.IMAGE_WEB_ARTIFACT_DIR ?? 'build/image-enabled-web');
const evidence = path.resolve(process.env.IMAGE_QA_DIR ?? 'build/image-recovery-evidence');
const base = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const diffSha256 = createHash('sha256').update(execFileSync('git', ['diff', '--binary', 'HEAD'])).digest('hex');
const bundleSha256 = createHash('sha256').update(await readFile(path.join(build, 'main.dart.js'))).digest('hex');
const harnessSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const sourcePaths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z',
  '--', 'lib', 'assets', 'web', 'pubspec.yaml', 'pubspec.lock', '.fvmrc'], { encoding: 'utf8' })
  .split('\0').filter(Boolean).sort();
const sourceManifest = await Promise.all(sourcePaths.map(async filename => ({ filename,
  sha256: createHash('sha256').update(await readFile(filename)).digest('hex') })));
const sourceManifestJson = JSON.stringify(sourceManifest, null, 2);
const sourceManifestSha256 = createHash('sha256').update(sourceManifestJson).digest('hex');
await mkdir(evidence, { recursive: true });
await writeFile(path.join(evidence, 'client-source-manifest.json'), sourceManifestJson);
const png = await sharp({ create: { width: 2, height: 2, channels: 4,
  background: { r: 23, g: 89, b: 131, alpha: 1 } } }).png().toBuffer();
const checksum = createHash('sha256').update(png).digest('hex');
const id = '018f0000-0000-7000-8000-000000000071';
const user = { id: '018f0000-0000-7000-8000-000000000001', email: 'synthetic@example.invalid',
  role: 'user', subscription_tier: 'free', reputation_score: 0,
  created_at: '2026-10-01T00:00:00Z', last_login_at: '2026-10-01T00:00:00Z' };
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const scenarios = disabled ? ['default-disabled'] : ['lost-finalise', 'denied-status'];
const engines = process.env.IMAGE_QA_ENGINE === 'chromium' ? { chromium }
  : process.env.IMAGE_QA_ENGINE === 'webkit' ? { webkit } : { chromium, webkit };

for (const [engineName, engine] of Object.entries(engines)) for (const width of [390, 1440]) {
  for (const scenario of scenarios) test(`${engineName} ${width} ${scenario}: synthetic private image journey`,
    { timeout: 120_000 }, async t => {
      const calls = [], errors = [], unhandled = [], captures = [];
      let session = false, complete = false, finaliseAttempts = 0, statusAttempts = 0;
      const fixture = await localAuthBrowserServer(async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.hostname === 'app.lythaus.co') {
          let file = path.resolve(build, '.' + url.pathname);
          assert.ok(file === build || file.startsWith(build + path.sep));
          if (!path.extname(file)) file = path.join(build, 'index.html');
          try { return route.fulfill({ contentType: mime[path.extname(file)] ?? 'application/octet-stream', body: await readFile(file) }); }
          catch { return route.fulfill({ status: 404, body: 'Local artifact missing' }); }
        }
        if (url.hostname !== 'api.lythaus.co') {
          unhandled.push(url.origin + url.pathname);
          return route.abort();
        }
        const headers = { 'access-control-allow-origin': 'https://app.lythaus.co',
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
          'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode, X-Lythaus-Auth-Transport',
          'cache-control': 'private, no-store' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        const call = { method: request.method(), path: url.pathname, status: 200 };
        calls.push(call);
        let body = { items: [], hasMore: false, nextCursor: null };
        if (url.pathname === '/api/auth/email') {
          session = true;
          body = { accessToken: 'synthetic-image-token', expiresIn: 900, sessionTransport: 'cookie-v1' };
        } else if (url.pathname === '/api/auth/refresh') {
          call.status = 401; body = { error: 'refresh_token_invalid' };
        } else if (url.pathname === '/api/auth/userinfo') body = user;
        else if (url.pathname === '/api/users/me') body = { user: { id: user.id,
          displayName: 'Synthetic image member', bio: '', moderationState: 'allowed', publicVisibility: true } };
        else if (url.pathname === '/api/subscription/status') body = { tier: 'free',
          entitlements: { maxCustomFeeds: 1, newsBoardAccess: false } };
        else if (url.pathname === '/api/reputation/me') body = { userId: user.id, level: 0,
          reputationLevel: 0, levelName: 'New', reputationStatus: 'active', reputationBand: 'new',
          policyVersion: 'reputation-v2.0.0', pillars: { accountability: 0, contribution: 0, conduct: 0,
            sourcing: 0, authenticity: 0, reviewReliability: 0 }, promotionBlockers: [], evaluatedAt: null };
        else if (url.pathname === '/api/rewards/me/monthly') body = { state: 'pending',
          reasonCode: 'approval_unavailable', effectiveMonth: null, currentLevel: null,
          sourceMonth: null, sourceScore: null, snapshot: { state: 'unavailable', reasonCode: 'approval_unavailable' },
          selection: { state: 'unavailable', reasonCode: 'approval_unavailable' } };
        else if (url.pathname.startsWith('/api/media/uploads')) {
          assert.equal(disabled, false);
          assert.ok(session);
          assert.equal((await request.allHeaders()).authorization, 'Bearer synthetic-image-token');
          call.key = (await request.allHeaders())['idempotency-key'] ?? null;
          if (request.method() === 'POST' && url.pathname === '/api/media/uploads') {
            assert.deepEqual(request.postDataJSON(), { size: png.length, contentType: 'image/png', checksumSha256: checksum });
            body = { uploadSessionId: id, contentType: 'image/png', checksumSha256: checksum,
              uploadUrl: `https://api.lythaus.co/api/media/uploads/${id}/bytes`,
              expiresAt: '2099-01-01T00:00:00Z' }; call.status = 201;
          } else if (request.method() === 'PUT' && url.pathname === `/api/media/uploads/${id}/bytes`) {
            assert.deepEqual(request.postDataBuffer(), png);
            body = { uploadSessionId: id, status: 'stored' }; call.status = 201;
          } else if (request.method() === 'POST' && url.pathname === `/api/media/uploads/${id}/finalise`) {
            finaliseAttempts++;
            if (scenario === 'lost-finalise' && finaliseAttempts === 1) {
              call.status = 503; body = { error: 'synthetic_acknowledgement_lost' };
            } else { body = { uploadSessionId: id, status: 'queued', eventId: 'synthetic-private-event' }; call.status = 202; }
          } else if (request.method() === 'GET' && url.pathname === `/api/media/uploads/${id}`) {
            statusAttempts++;
            if (scenario === 'denied-status') { call.status = 404; body = { error: 'upload_session_not_found' }; }
            else body = { uploadSessionId: id, status: statusAttempts === 1 ? 'queued' : 'review',
              expiresAt: '2099-01-01T00:00:00Z', processingComplete: statusAttempts > 1,
              safety: { status: 'not_run' }, authenticity: { status: 'not_run' },
              publication: { allowed: false }, private: true };
          } else { unhandled.push(call); call.status = 404; body = { error: 'fixture_route_missing' }; }
        } else if (!['/api/feed/discover', '/api/custom-feeds', '/api/users/me/posts'].includes(url.pathname)) {
          unhandled.push(call); call.status = 404; body = { error: 'fixture_route_missing' };
        }
        return route.fulfill({ status: call.status, headers, contentType: 'application/json', body: JSON.stringify(body) });
      });
      const browser = await engine.launch({ headless: true, proxy: { server: fixture.proxy },
        ...(engineName === 'chromium' && process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
      const context = await browser.newContext({ viewport: { width, height: 1000 },
        colorScheme: width === 390 ? 'light' : 'dark', reducedMotion: 'reduce',
        serviceWorkers: 'block', ignoreHTTPSErrors: true });
      await installFlutterEngineFonts(context);
      const page = await context.newPage(); page.setDefaultTimeout(30_000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() !== 'error') return;
        const location = message.location().url;
        const expectedHttp = /^Failed to load resource:/.test(message.text()) && (
          location === 'https://api.lythaus.co/api/auth/refresh' ||
          scenario === 'lost-finalise' && location === `https://api.lythaus.co/api/media/uploads/${id}/finalise` ||
          scenario === 'denied-status' && location === `https://api.lythaus.co/api/media/uploads/${id}`);
        if (!expectedHttp) errors.push(message.text());
      });
      const name = `${engineName}-${width}-${scenario}`;
      const capture = async stage => {
        await mkdir(evidence, { recursive: true });
        const filename = path.join(evidence, `${name}-${stage}.png`);
        await page.screenshot({ path: filename, fullPage: true }); captures.push(filename);
      };
      t.after(async () => {
        if (!complete) {
          await capture('failed');
          t.diagnostic(JSON.stringify({ labels: await page.locator('[aria-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), calls, errors, unhandled }));
        }
        await mkdir(evidence, { recursive: true });
        await writeFile(path.join(evidence, `${name}.json`), JSON.stringify({ synthetic: true,
          backend: 'scripted local API responses; no hosted storage, SQL or detector calls',
          actualFlutterRelease: true, base, diffSha256, bundleSha256, harnessSha256, sourceManifestSha256,
          at: new Date().toISOString(), engine: engineName, width, scenario, complete,
          calls, errors, unhandled, captures }, null, 2));
        await context.close(); await browser.close(); await fixture.close();
      });
      const button = name => page.getByRole('button', { name, exact: true });
      const text = value => page.getByText(value, { exact: false }).or(page.getByLabel(value, { exact: false })).first();
      const enter = async (field, value) => {
        await field.click();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await field.press('ControlOrMeta+A'); await field.press('Backspace');
        await field.pressSequentially(value, { delay: 10 });
        assert.equal(await field.inputValue(), value);
      };
      await page.goto('https://app.lythaus.co/');
      await page.locator('flt-semantics-placeholder').waitFor({ timeout: 60_000 });
      await page.locator('flt-semantics-placeholder').evaluate(node => node.click());
      await enter(page.getByRole('textbox', { name: 'Email', exact: true }), user.email);
      await enter(page.locator('input[type=password]'), 'synthetic12');
      await button('Sign in with email').click();
      const create = page.getByRole('button', { name: /^Create(?:\b|$)/ });
      await create.waitFor({ timeout: 60_000 }); await create.click();
      await enter(page.getByRole('textbox', { name: /Your post/ }), 'Synthetic private image test');
      await page.getByRole('checkbox', { name: 'Human-authored', exact: true }).click();
      await page.waitForFunction(node => node.getAttribute('aria-disabled') !== 'true', await button('Post').elementHandle());
      if (disabled) {
        await text('Photos are not available yet').waitFor();
        assert.equal(await button('Choose image').count(), 0);
        assert.equal(calls.filter(call => call.path.startsWith('/api/media/')).length, 0);
        await capture('disabled');
      } else {
        await button('Choose image').scrollIntoViewIfNeeded();
        const chooser = page.waitForEvent('filechooser');
        await button('Choose image').click();
        await (await chooser).setFiles({ name: 'synthetic-private.png', mimeType: 'image/png', buffer: png });
        await button('Upload privately').waitFor();
        assert.equal(await button('Post').isEnabled(), false);
        await capture('selected');
        await button('Upload privately').click();
        if (scenario === 'lost-finalise') {
          await text('Upload is unconfirmed. Retry continues this same private upload.').waitFor();
          await capture('retry'); await button('Retry same upload').click();
          await text('Image processing finished. Safety and authenticity checks have not run.').waitFor();
          assert.equal(finaliseAttempts, 2);
          const finalisations = calls.filter(call => call.path.endsWith('/finalise'));
          assert.ok(finalisations[0].key); assert.equal(finalisations[0].key, finalisations[1].key);
          assert.equal(calls.filter(call => call.method === 'POST' && call.path === '/api/media/uploads').length, 1);
          assert.equal(calls.filter(call => call.method === 'PUT').length, 1);
        } else {
          await text('Image status could not be checked. Retry checks this same upload.').waitFor();
          const retriedStatus = page.waitForResponse(response => response.request().method() === 'GET'
            && response.url() === `https://api.lythaus.co/api/media/uploads/${id}` && response.status() === 404);
          await button('Retry same upload').click();
          await retriedStatus;
          await text('Image status could not be checked. Retry checks this same upload.').waitFor();
          assert.equal(finaliseAttempts, 1);
          assert.ok(statusAttempts >= 2);
        }
        assert.equal(await button('Post').isEnabled(), false);
        await capture('private-result');
        await button('Clear selection').click();
        await page.waitForFunction(node => node.getAttribute('aria-disabled') !== 'true', await button('Post').elementHandle());
        assert.equal(await button('Post').isEnabled(), true);
        await capture('cleared');
      }
      assert.deepEqual(calls.filter(call => call.path === '/api/posts'), []);
      assert.deepEqual(unhandled, []); assert.deepEqual(errors, []);
      complete = true;
    });
}
