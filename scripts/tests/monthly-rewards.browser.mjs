import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium, webkit } from 'playwright';
import { monthlyRewardsResponseReadiness } from '../../packages/contracts/src/monthly-rewards-response-readiness.ts';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';

const build = path.resolve(process.env.AUTH_WEB_ARTIFACT_DIR ?? 'build/web');
const output = path.resolve(process.env.MONTHLY_REWARDS_QA_DIR ?? 'build/monthly-rewards-evidence');
const engineName = process.env.MONTHLY_REWARDS_ENGINE ?? 'chromium';
assert.ok(['chromium', 'webkit'].includes(engineName));
const engine = engineName === 'webkit' ? webkit : chromium;
const csvOnly = process.env.MONTHLY_REWARDS_CSV_ONLY === '1';
const readiness = monthlyRewardsResponseReadiness();
const owner = { id: '018f0000-0000-7000-8000-000000000011', email: 'monthly-owner@example.invalid', displayName: 'Avery Monthly', bio: 'Synthetic monthly evidence.', role: 'user', subscription_tier: 'free', reputation_score: 0, created_at: '2026-08-01T00:00:00Z', last_login_at: '2026-08-01T00:00:00Z' };
const publicId = '018f0000-0000-7000-8000-000000000012';
const token = 'synthetic-monthly-token';
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png', '.woff2': 'font/woff2' };
const statusBody = (confirmed, shadow) => ({ state: 'pending', reasonCode: 'approval_unavailable', effectiveMonth: confirmed ? '2026-10' : null, currentLevel: confirmed ? 3 : null, sourceMonth: confirmed ? '2026-09' : null, sourceScore: confirmed ? 4000 : null, snapshot: confirmed ? { state: shadow ? 'shadow' : 'confirmed', reasonCode: 'source_month_assessed', effectiveMonth: '2026-10', sourceMonth: '2026-09', snapshotId: '018f0000-0000-7000-8000-000000000021', revision: shadow ? 2 : 1, sourceRevision: shadow ? 2 : 1, sourceScore: 4000, level: 3, policyVersion: 'lythaus-monthly-rewards-2026-10-v1' } : { state: 'unavailable', reasonCode: 'approval_unavailable', effectiveMonth: '2026-10' }, selection: { state: 'unavailable', reasonCode: 'approval_unavailable' }, responsePreparation: readiness, preparedResponse: null });
const action = { actionId: 'monthly.profile', capGroup: 'profile', points: null, allowance: 1000, remainingInGroup: null, accepted: 1, pending: 0, withheld: 0, state: 'pending', reasonCode: 'evidence_pending', validFrom: null, validUntil: null };
const reportBody = (sourceMonth, empty) => ({ reportState: empty ? 'pending' : 'shadow', reasonCode: empty ? 'assembly_pending' : null, sourceMonth, effectiveMonth: '2026-11', policyVersion: 'lythaus-monthly-rewards-2026-10-v1', levelAuthority: { state: 'unavailable', reasonCode: 'approval_unavailable', effectiveMonth: null, sourceMonth: null, sourceScore: null, level: null, levelKind: null }, corrections: { sourceRevisions: empty ? [] : [{ revision: 2, sourceScore: 4500, reasonCode: 'source_corrected', recordedAt: null }], effectiveSnapshots: [] }, report: empty ? null : { sourceRevision: 2, sourceRecordedAt: null, total: { sourceScore: 2000, maximumSourceMonth: 13500 }, weekly: { points: 1000, maximumSelectedWeeklyPoints: 10000, selectedWeeks: [{ points: 1000, state: 'corrected', revision: 2, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-08T00:00:00Z', actions: [] }], omittedWeeks: [{ points: 500, state: 'locked', revision: 1, startsAt: null, endsAt: null, selectionReason: 'not_selected_best_four', actions: [] }] }, monthly: { points: 1000, maximumPoints: 2500, actions: [action] }, quarterlyEmail: { points: null, maximumPoints: 1000, evidence: null } }, responsePreparation: readiness, preparedResponse: null });

test(`rendered private monthly rewards (${engineName})`, { timeout: 600000 }, async () => {
  await mkdir(output, { recursive: true });
  const evidence = [];
  for (const config of [{ name: 'desktop-light', width: 1440, height: 960, theme: 'light' }, { name: 'mobile-dark', width: 390, height: 844, theme: 'dark' }]) {
    let signedIn = false, confirmed = false, shadow = false, empty = true, failStatus = false;
    const calls = [], errors = [], captures = [];
    const csvChecks = [];
    const fixture = await localAuthBrowserServer(async (route) => {
      const request = route.request(), url = new URL(request.url()), headersIn = await request.allHeaders();
      if (url.hostname === 'app.lythaus.co') {
        let file = path.resolve(build, `.${url.pathname}`);
        assert.ok(file === build || file.startsWith(`${build}${path.sep}`));
        if (!path.extname(file)) file = path.join(build, 'index.html');
        try { return route.fulfill({ contentType: mime[path.extname(file)] ?? 'application/octet-stream', body: await readFile(file) }); }
        catch { return route.fulfill({ status: 404, body: 'Local artifact missing' }); }
      }
      if (url.hostname !== 'api.lythaus.co') return route.abort();
      const headers = { 'access-control-allow-origin': 'https://app.lythaus.co', 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode, X-Lythaus-Auth-Transport' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      calls.push({ path: url.pathname, method: request.method(), authorization: headersIn.authorization ?? null, query: url.search });
      let status = 200, body = { items: [], hasMore: false, nextCursor: null };
      if (url.pathname === '/api/auth/email') { signedIn = true; headers['set-cookie'] = '__Host-lythaus_refresh=' + 'e'.repeat(48) + '; Path=/; HttpOnly; Secure; SameSite=Strict'; body = { accessToken: token, expiresIn: 900, sessionTransport: 'cookie-v1' }; }
      else if (url.pathname === '/api/auth/refresh') { status = signedIn && (headersIn.cookie ?? '').includes('__Host-lythaus_refresh=') ? 200 : 401; body = status === 200 ? { accessToken: token, expiresIn: 900, sessionTransport: 'cookie-v1' } : { error: 'refresh_token_invalid' }; }
      else if (url.pathname === '/api/auth/userinfo') { status = signedIn ? 200 : 401; body = signedIn ? owner : { error: 'session_required' }; }
      else if (url.pathname === '/api/auth/logout') { signedIn = false; body = { state: 'signed_out' }; }
      else if (url.pathname === '/api/users/me') { body = { user: { id: owner.id, displayName: owner.displayName, bio: owner.bio, publicVisibility: true, moderationState: 'allowed', subscriptionTier: 'free', presentationPreferences: { leftHandedMode: false, horizontalSwipeEnabled: true, version: 1 } } }; }
      else if (url.pathname === `/api/users/${publicId}`) { body = { user: { id: publicId, displayName: 'Public Monthly Member', bio: 'Public profile fixture', reputation: { level: 1, label: 'New' } } }; }
      else if (url.pathname === `/api/users/${publicId}/follow`) { body = { userId: publicId, following: false, followedBy: false, blocked: false }; }
      else if (['/api/reputation/me', '/api/users/me/reputation'].includes(url.pathname)) { body = { userId: owner.id, level: 0, reputationLevel: 0, levelName: 'New', reputationStatus: 'active', reputationBand: 'new', policyVersion: 'reputation-v2.0.0', pillars: {}, promotionBlockers: [], evaluatedAt: null }; }
      else if (url.pathname === '/api/rewards/me/monthly') { assert.equal(headersIn.authorization, `Bearer ${token}`); assert.equal(url.search, ''); status = failStatus ? 503 : 200; body = failStatus ? { error: 'synthetic_private_failure' } : statusBody(confirmed, shadow); }
      else if (/^\/api\/reputation\/me\/reports\/monthly\/\d{4}-\d{2}\/export\.csv$/.test(url.pathname)) {
        assert.equal(headersIn.authorization, `Bearer ${token}`); assert.equal(headersIn.accept, 'text/csv'); assert.equal(url.search, '');
        await new Promise(resolve => setTimeout(resolve, 600));
        return route.fulfill({ status: 200, headers, contentType: 'text/csv', body: `sourceMonth,score\n${url.pathname.split('/').at(-2)},2000\n` });
      }
      else if (/^\/api\/reputation\/me\/reports\/monthly\/\d{4}-\d{2}$/.test(url.pathname)) { assert.equal(headersIn.authorization, `Bearer ${token}`); assert.equal(url.search, ''); body = reportBody(url.pathname.split('/').at(-1), empty); }
      else if (url.pathname === '/api/rewards/me') { body = { subscriptionTier: 'free', reputationLevel: 0, reputationBand: 'new', availableRewardLevels: [], maxOptionsPerLevel: 0, redemptionStatus: 'pending', fraudRiskStatus: 'normal', offers: [], redemptionHistory: [], affiliateDisclosure: '' }; }
      return route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const browser = await engine.launch({ headless: true, proxy: { server: fixture.proxy }, ...(process.env.MONTHLY_REWARDS_BROWSER_PATH ? { executablePath: process.env.MONTHLY_REWARDS_BROWSER_PATH } : {}) });
    let page;
    try {
      const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: 2, colorScheme: config.theme, reducedMotion: 'reduce', serviceWorkers: 'block', ignoreHTTPSErrors: true });
      await installFlutterEngineFonts(context);
      page = await context.newPage(); page.setDefaultTimeout(30000);
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text())) errors.push(message.text()); });
      const text = () => page.locator('flt-semantics').evaluateAll(nodes => nodes.map(node => [node.textContent, node.getAttribute('aria-label')].filter(Boolean).join('\n')).join('\n'));
      const waitText = (value) => page.waitForFunction(value => [...document.querySelectorAll('flt-semantics')].some(node => node.textContent?.includes(value) || node.getAttribute('aria-label')?.includes(value)), value);
      async function enter(field, value) { await field.click(); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await field.press('ControlOrMeta+A'); await field.press('Backspace'); await field.pressSequentially(value, { delay: 20 }); assert.equal(await field.inputValue(), value); }
      async function open(route) { await page.goto(`https://app.lythaus.co${route}`); const placeholder = page.locator('flt-semantics-placeholder'); await placeholder.waitFor({ timeout: 60000 }); await placeholder.evaluate(element => element.click()); }
      async function guestEntry() { await page.getByRole('button', { name: /^(Continue as guest|Sign in)$/ }).first().waitFor(); const guest = page.getByRole('button', { name: 'Continue as guest', exact: true }); if (await guest.count()) await guest.click(); }
      async function locate(target) {
        for (let attempt = 0; attempt < 160; attempt++) {
          let direction = attempt < 80 ? 1 : -1;
          if (await target.count()) { const box = await target.first().boundingBox({ timeout: 1000 }).catch(() => null); if (box && box.y >= 64 && box.y < (await page.viewportSize()).height - 90) return target.first(); if (box) direction = box.y < 64 ? -1 : 1; }
          await page.mouse.move((await page.viewportSize()).width / 2, (await page.viewportSize()).height * .7); await page.mouse.wheel(0, direction * 250); await page.waitForTimeout(80);
        }
        throw new Error('Monthly control was not reachable');
      }
      async function capture(state) {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.waitForTimeout(100);
        const metrics = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth })); assert.ok(metrics.documentWidth <= metrics.width + 1); const filename = `${engineName}-${config.name}-${state}.png`; await page.screenshot({ path: path.join(output, filename), animations: 'disabled' }); captures.push({ filename, state, fixtureLabel: `synthetic local TLS / ${state}`, metrics });
      }
      await open('/rewards');
      await guestEntry();
      await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
      assert.equal(calls.filter(call => call.path.includes('/reports/monthly/') || call.path === '/api/rewards/me/monthly').length, 0);
      await capture('guest-readonly');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await enter(page.getByRole('textbox', { name: 'Email', exact: true }), owner.email);
      await enter(page.locator('input[type=password]'), 'synthetic-password');
      await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
      await page.getByText('Monthly level pending', { exact: true }).waitFor({ timeout: 90000 });
      assert.match(await text(), /projection unavailable/); assert.doesNotMatch(await text(), /Level 5 confirmed|Prospective maximum:/);
      await capture('pending-disabled');
      confirmed = true; shadow = true;
      const refresh = await locate(page.getByRole('button', { name: 'Refresh status', exact: true })); await refresh.focus(); await page.keyboard.press('Enter');
      await page.getByText('Monthly level in shadow', { exact: true }).waitFor();
      assert.match(await text(), /not a confirmed entitlement/); assert.doesNotMatch(await text(), /Level 3 confirmed/);
      await capture('v1-shadow-unconfirmed');
      shadow = false; empty = false; await refresh.click();
      await page.getByText('Level 3 confirmed', { exact: true }).waitFor();
      const methodology = await locate(page.getByRole('button', { name: /Disabled v2 methodology/ })); await methodology.click();
      await waitText('Prospective maximum: 13,650');
      assert.match(await text(), /Prospective maximum: 13,650/); assert.match(await text(), /Preparation only/);
      await capture('confirmed-disabled-methodology');
      await methodology.click();
      failStatus = true; await refresh.click();
      await waitText('Your private monthly status is unavailable right now.');
      failStatus = false; await page.getByRole('button', { name: 'Retry', exact: true }).first().click();
      await page.getByText('Level 3 confirmed', { exact: true }).waitFor();
      await (await locate(page.getByRole('button', { name: 'Refresh report', exact: true }))).click();
      for (const title of ['Omitted weeks', 'Monthly action evidence', 'Corrections']) await (await locate(page.getByRole('button', { name: new RegExp(title) }))).click();
      await waitText('Source revision 2');
      assert.match(await text(), /Cap group: profile/); assert.match(await text(), /Unknown date/); assert.match(await text(), /Source revision 2/);
      await capture('corrected-evidence');
      const csvControl = await locate(page.getByRole('button', { name: 'Export CSV', exact: true }));
      const downloadReady = page.waitForEvent('download');
      await csvControl.click();
      await page.getByRole('button', { name: 'Exporting…', exact: true }).waitFor();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const download = await downloadReady;
      const csvMonth = calls.findLast(call => call.path.endsWith('/export.csv')).path.split('/').at(-2);
      const csvBytes = await readFile(await download.path(), 'utf8');
      assert.equal(download.suggestedFilename(), `monthly-reputation-${csvMonth}.csv`);
      assert.equal(csvBytes, `sourceMonth,score\n${csvMonth},2000\n`);
      csvChecks.push({ sourceMonth: csvMonth, delayMilliseconds: 600, observedPendingAcrossTwoFrames: true, exactServerBytes: true });
      await capture('csv-export-complete');
      if (csvOnly) {
        assert.equal(errors.length, 0, errors.join('\n'));
        evidence.push({ config, browser: browser.version(), calls, errors, captures, csvChecks });
        await context.close(); continue;
      }
      await page.setViewportSize({ width: Math.floor(config.width / 2), height: Math.floor(config.height / 2) });
      await (await locate(page.getByRole('button', { name: /Corrections/ }))).focus(); await page.keyboard.press('Tab');
      await capture('zoom-200-approximation');
      await page.setViewportSize({ width: config.width, height: config.height });
      await open('/?tab=profile');
      await page.getByRole('tab', { name: /^Overview/ }).waitFor();
      assert.ok(await page.getByRole('tab', { name: /^Posts/ }).count()); assert.ok(await page.getByRole('tab', { name: /^Comments/ }).count());
      await capture('owner-settings-first');
      await (await locate(page.getByRole('button', { name: 'Refresh status', exact: true }))).focus();
      assert.match(await text(), /Level 3 confirmed/); await capture('owner-tracker');
      await open(`/user/${publicId}`);
      await page.getByText('Public Monthly Member', { exact: true }).waitFor({ timeout: 90000 });
      assert.doesNotMatch(await text(), /Monthly reputation|Level 3 confirmed|Cap group:|Current progress/);
      await capture('public-private-evidence-absent');
      await open('/settings');
      await page.getByRole('button', { name: 'Account security', exact: true }).click();
      await page.getByRole('button', { name: 'Sign out of all sessions', exact: true }).click();
      await guestEntry();
      await open('/rewards');
      await guestEntry();
      await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
      assert.doesNotMatch(await text(), /Level 3 confirmed|source score: 4,000|Cap group:/);
      await capture('signed-out-cleared');
      assert.equal(errors.length, 0, errors.join('\n'));
      assert.equal(calls.filter(call => (call.path.startsWith('/api/rewards/') || call.path.includes('/reports/monthly/')) && call.method !== 'GET').length, 0, 'No entitlement or award writes');
      evidence.push({ config, browser: browser.version(), calls, errors, captures, csvChecks });
      await context.close();
    } catch (error) {
      if (page) { await page.screenshot({ path: path.join(output, `${engineName}-${config.name}-failure.png`) }).catch(() => {}); await writeFile(path.join(output, `${engineName}-${config.name}-failure.json`), JSON.stringify({ message: error.message, errors, calls, captures, content: await page.content() }, null, 2)); }
      throw error;
    } finally { await browser.close(); await fixture.close(); }
  }
  await writeFile(path.join(output, `${engineName}-evidence.json`), JSON.stringify({ engineName, scenario: csvOnly ? 'csv-only' : 'full', commit: process.env.QA_COMMIT ?? 'local-uncommitted-validation', evidence, limitations: ['Synthetic local TLS fixture only; no production data.', ...(csvOnly ? ['CSV-only run; owner/public navigation, zoom and sign-out are not executed in this run.'] : []), 'Browser zoom is approximated by halving CSS viewport at device-pixel ratio 2; actual 200% text scaling is covered by Flutter widget tests.', 'Reduced motion and keyboard controls are exercised; no physical screen-reader or native-device run.'] }, null, 2));
});
