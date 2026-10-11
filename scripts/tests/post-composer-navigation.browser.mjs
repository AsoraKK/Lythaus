import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import pg from 'pg';
import { chromium } from 'playwright';
import { generateKeyPair, exportJWK, exportPKCS8 } from 'jose';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { postModerationFixture } from '../../apps/lythaus-jobs/tests/post-moderation-fixture.mjs';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
assert.ok(target.pathname.startsWith('/lythaus_auth_test_post_'));
const build = path.resolve(process.env.POST_INCIDENT_WEB_ARTIFACT_DIR ?? 'build/post-incident-after');
const evidence = process.env.POST_INCIDENT_QA_DIR ?? '/tmp/lythaus-post-browser';
const broken = process.env.POST_INCIDENT_EXPECT_BROKEN === '1';
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
  '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png' };
const scenarios = broken ? [{ width: 390, mode: 'pending', dark: false }] : [
  { width: 390, mode: 'pending', dark: false },
  { width: 1440, mode: 'slow', dark: true },
  { width: 390, mode: 'ack-loss', dark: true },
  { width: 390, mode: 'validation', dark: false },
  { width: 390, mode: 'inactive', dark: false },
  { width: 390, mode: 'dirty-back', dark: false },
  { width: 390, mode: 'ack-back', dark: true },
];

for (const { width, mode, dark } of scenarios) test(
  `${width} ${mode}: routed release Flutter composer with native Workerd and PostgreSQL`,
  { timeout: 120_000 }, async t => {
    const client = new pg.Client({ connectionString, ssl: false });
    await client.connect();
    const ownerId = uuidv7();
    await client.query("INSERT INTO identity.users(id,status,display_name) VALUES($1,'active','Synthetic browser actor')", [ownerId]);
    await client.query("INSERT INTO social.profiles(user_id,moderation_state,public_visibility) VALUES($1,'allowed',true)", [ownerId]);
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
    const keyId = 'synthetic-post-browser';
    const token = await signAccessToken({ userId: ownerId, privateKeyPem: await exportPKCS8(privateKey), keyId });
    const native = await postModerationFixture(connectionString, {
      ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.co',
      CORS_ALLOWED_ORIGINS: 'https://app.lythaus.co',
      JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
    });
    const user = { id: ownerId, email: 'synthetic@example.invalid', role: 'user', tier: 'bronze',
      subscription_tier: 'free', reputation_score: 0, created_at: '2026-10-01T00:00:00Z', last_login_at: '2026-10-01T00:00:00Z' };
    const errors = [], writes = [], calls = [];
    let lost = false, rejected = false;
    let releaseSubmission;
    const submissionHold = new Promise(resolve => { releaseSubmission = resolve; });
    let notifySubmissionStarted;
    const submissionStarted = new Promise(resolve => { notifySubmissionStarted = resolve; });
    const fixture = await localAuthBrowserServer(async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname === 'app.lythaus.co') {
        let file = path.resolve(build, '.' + url.pathname);
        assert.ok(file === build || file.startsWith(build + path.sep));
        if (!path.extname(file)) file = path.join(build, 'index.html');
        try { return route.fulfill({ contentType: mime[path.extname(file)] ?? 'application/octet-stream', body: await readFile(file) }); }
        catch { return route.fulfill({ status: 404, body: 'Local artifact missing' }); }
      }
      assert.equal(url.hostname, 'api.lythaus.co');
      const headers = { 'access-control-allow-origin': 'https://app.lythaus.co',
        'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode, X-Lythaus-Auth-Transport' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const call = { method: request.method(), path: url.pathname };
      calls.push(call);
      let response;
      if (url.pathname.endsWith('/auth/email')) {
        assert.equal(request.postDataJSON().password, 'synthetic12');
        response = Response.json({ accessToken: token, sessionTransport: 'cookie-v1', expiresIn: 900 });
      } else if (url.pathname.endsWith('/auth/userinfo')) response = Response.json(user);
      else if (url.pathname.endsWith('/auth/refresh')) response = Response.json({ error: 'refresh_token_invalid' }, { status: 401 });
      else {
        if (request.method() === 'POST' && url.pathname === '/api/posts') {
          writes.push({ body: request.postDataJSON(), key: (await request.allHeaders())['idempotency-key'] });
          notifySubmissionStarted();
          if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 1500));
          if (mode === 'inactive') await submissionHold;
          if (mode === 'validation' && !rejected) {
            rejected = true;
            call.status = 400;
            return route.fulfill({ status: 400, headers, contentType: 'application/json',
              body: JSON.stringify({ error: 'invalid_post', message: 'Synthetic server validation failed. Your draft is preserved.' }) });
          }
        }
        response = await native.dispatchFetch(url.toString(), {
          method: request.method(), headers: await request.allHeaders(),
          ...(['GET', 'HEAD'].includes(request.method()) ? {} : { body: request.postData() }),
        });
        if (request.method() === 'POST' && url.pathname === '/api/posts' && ['ack-loss', 'ack-back'].includes(mode) && !lost) {
          assert.equal(response.status, 201);
          lost = true;
          call.status = 503;
          call.persistedStatus = response.status;
          return route.fulfill({ status: 503, headers, contentType: 'application/json',
            body: JSON.stringify({ error: 'synthetic_acknowledgement_lost' }) });
        }
      }
      call.status = response.status;
      return route.fulfill({ status: response.status, headers: { ...Object.fromEntries(response.headers), ...headers },
        body: await response.text() });
    });
    let browser;
    try { browser = await chromium.launch({ headless: true,
      ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
      proxy: { server: fixture.proxy } }); }
    catch (error) { await fixture.close(); await native.dispose(); await client.end(); throw error; }
    const context = await browser.newContext({ viewport: { width, height: 900 },
      colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce', serviceWorkers: 'block', ignoreHTTPSErrors: true });
    await installFlutterEngineFonts(context);
    const page = await context.newPage(); page.setDefaultTimeout(20_000);
    const content = text => page.getByText(text, { exact: false })
      .or(page.getByLabel(text, { exact: false })).first();
    const verifyApiResponses = () => assert.deepEqual(calls.filter(call => call.status >= 400 && !(
      (call.path.endsWith('/auth/refresh') && call.status === 401) ||
      (['ack-loss', 'ack-back'].includes(mode) && call.path === '/api/posts' && call.status === 503 && call.persistedStatus === 201) ||
      (mode === 'validation' && call.path === '/api/posts' && call.status === 400)
    )), [], 'Unexpected API HTTP failure');
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text())) errors.push(message.text());
    });
    const screenshot = path.join(evidence, `${broken ? 'before' : 'after'}-${width}-${mode}.png`);
    let complete = false;
    t.after(async () => {
      releaseSubmission();
      await mkdir(evidence, { recursive: true });
      if (!complete) await page.screenshot({ path: screenshot });
      if (!complete) t.diagnostic(JSON.stringify({
        screen: await page.locator('flt-semantics').allTextContents(),
        labels: await page.locator('[aria-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))),
      }));
      await writeFile(path.join(evidence, `${broken ? 'before' : 'after'}-${width}-${mode}.json`),
        JSON.stringify({ synthetic: true, actualFlutterRelease: true, nativeWorkerdPostgres: true,
          head: process.env.QA_COMMIT ?? 'working-tree', url: page.url(), title: await page.title(),
          width, mode, complete, writes: writes.length, errors, calls, screenshot }, null, 2));
      await browser.close(); await fixture.close(); await native.dispose(); await client.end();
    });
    await page.goto('https://app.lythaus.co/');
    await page.locator('flt-semantics-placeholder').waitFor({ timeout: 60_000 });
    await page.locator('flt-semantics-placeholder').evaluate(node => node.click());
    assert.equal(await page.title(), 'Lythaus');
    async function enter(field, text) {
      await field.click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await field.press('ControlOrMeta+A');
      await field.press('Backspace');
      await field.pressSequentially(text, { delay: 20 });
      assert.equal(await field.inputValue(), text);
    }
    await enter(page.getByRole('textbox', { name: 'Email', exact: true }), user.email);
    await enter(page.locator('input[type=password]'), 'synthetic12');
    await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
    const create = page.getByRole('button', { name: /^Create(?:\b|$)/ });
    await create.waitFor({ timeout: 60_000 });
    await page.waitForURL(url => url.pathname === '/');
    const beforeCreate = page.url();
    await create.click();
    const field = page.getByRole('textbox', { name: /Your post/ });
    await field.waitFor();
    await enter(field, 'Synthetic routed submission');
    await page.getByRole('checkbox', { name: 'Human-authored', exact: true }).click();
    async function backAndForward(frozen) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const originalPixels = frozen ? await page.screenshot({ clip: await field.boundingBox() }) : null;
      await page.goBack();
      await page.waitForURL(beforeCreate);
      await page.getByRole('button', { name: /^Discover(?:\b|$)/ }).first().waitFor();
      await page.goForward();
      await page.waitForURL(url => url.searchParams.get('tab') === 'create');
      await field.waitFor();
      await content('27 of 5000 characters used').waitFor();
      if (frozen) {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.deepEqual(await page.screenshot({ clip: await field.boundingBox() }), originalPixels,
          'Frozen draft must render the same content after Back/Forward');
      } else {
        await field.click();
        await page.waitForFunction(() => [...document.querySelectorAll('textarea,input')]
          .some(node => node.value === 'Synthetic routed submission'));
        assert.equal(await field.inputValue(), 'Synthetic routed submission');
      }
      assert.equal(await field.isEnabled(), !frozen);
      assert.equal(await page.getByRole('checkbox', { name: 'Human-authored', exact: true }).isChecked(), true);
    }
    if (mode === 'dirty-back') {
      await backAndForward(false);
      assert.equal(writes.length, 0);
      assert.equal((await client.query('SELECT id FROM content.posts WHERE author_id=$1', [ownerId])).rowCount, 0);
      assert.deepEqual(errors, []);
      verifyApiResponses();
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: screenshot }); complete = true;
      t.diagnostic(JSON.stringify({ complete, synthetic: true, width, mode, screenshot, errors: errors.length }));
      return;
    }
    const post = page.getByRole('button', { name: 'Post', exact: true });
    await post.waitFor();
    await page.waitForFunction(node => node.getAttribute('aria-disabled') !== 'true', await post.elementHandle());
    await post.evaluate(node => { node.click(); node.click(); });
    await page.mouse.move(0, 800);
    if (mode === 'slow') {
      await page.getByRole('button', { name: 'Close composer', exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'create');
    }
    if (mode === 'inactive') {
      await submissionStarted;
      await page.getByRole('button', { name: /^Profile(?:\b|$)/ }).click();
      await page.waitForURL(url => url.searchParams.get('tab') === 'profile');
      releaseSubmission();
    }
    if (['ack-loss', 'ack-back'].includes(mode)) {
      await content('The earlier submission is still unconfirmed. Retry the same request after signing in.').waitFor();
      await page.locator('flt-semantics').getByText(/^Choose Human-authored or AI-assisted before posting\./).first().waitFor({ state: 'hidden' });
      assert.equal(await field.inputValue(), 'Synthetic routed submission');
      assert.equal(await field.isEnabled(), false);
      if (mode === 'ack-back') {
        await backAndForward(true);
        assert.equal(writes.length, 1);
        await page.waitForFunction(node => node.getAttribute('aria-disabled') !== 'true', await post.elementHandle());
      }
      await post.click();
    }
    if (mode === 'validation') {
      await content('Synthetic server validation failed. Your draft is preserved.').waitFor();
      await page.locator('flt-semantics').getByText(/^Choose Human-authored or AI-assisted before posting\./).first().waitFor({ state: 'hidden' });
      assert.equal(await field.inputValue(), 'Synthetic routed submission');
      assert.equal(await field.isEnabled(), true);
      const persisted = await client.query('SELECT id FROM content.posts WHERE author_id=$1', [ownerId]);
      assert.equal(persisted.rowCount, 0);
    } else if (broken) {
      await page.waitForTimeout(2000);
      assert.equal(await page.getByRole('button', { name: /^Discover(?:\b|$)/ }).count(), 0);
      assert.equal(await field.count(), 0);
    } else {
      if (mode === 'inactive') {
        await content('Post submitted. Publication checks are pending.').waitFor();
        assert.equal(new URL(page.url()).searchParams.get('tab'), 'profile');
        assert.equal(await field.count(), 0);
        await page.getByRole('button', { name: /^Profile(?:\b|$)/ }).first().waitFor();
      } else {
        await page.waitForURL(url => url.pathname === '/' && url.searchParams.get('tab') === 'discover');
        await page.getByRole('button', { name: /^Discover(?:\b|$)/ }).first().waitFor();
      }
      await content('Post submitted. Publication checks are pending.').waitFor();
      await page.locator('flt-semantics').getByText(/^Choose Human-authored or AI-assisted before posting\./).first().waitFor({ state: 'hidden' });
      assert.deepEqual(errors, []);
      const persisted = await client.query('SELECT id,moderation_state FROM content.posts WHERE author_id=$1', [ownerId]);
      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0].moderation_state, 'under_review');
      assert.equal((await client.query("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='content.post.created'", [persisted.rows[0].id])).rowCount, 1);
    }
    assert.equal(writes.length, ['ack-loss', 'ack-back'].includes(mode) ? 2 : 1);
    if (['ack-loss', 'ack-back'].includes(mode)) assert.deepEqual(writes[0], writes[1]);
    if (!broken) verifyApiResponses();
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: screenshot }); complete = true;
    t.diagnostic(JSON.stringify({ complete, synthetic: true, width, mode, expectedBroken: broken, screenshot, errors: errors.length }));
  },
);
