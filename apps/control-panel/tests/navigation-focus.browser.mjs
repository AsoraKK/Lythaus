import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { mock } from 'node:test';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { format } from 'node:util';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = process.env.CONTROL_PANEL_NAVIGATION_EVIDENCE_DIR || '/tmp/lythaus-navigation-focus-evidence';
const baseUrl = process.env.CONTROL_PANEL_NAVIGATION_BASE_URL || 'http://127.0.0.1:5177/';
const pageTarget = new URL(baseUrl);
assert.equal(pageTarget.protocol, 'http:');
assert.ok(['localhost', '127.0.0.1'].includes(pageTarget.hostname), 'Navigation fixtures require a local frontend');
const engine = process.env.CONTROL_PANEL_NAVIGATION_BROWSER || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const cases = [[390, 200], [390, 100], [320, 100], [320, 200], [600, 100], [600, 200], [768, 100], [768, 200], [900, 100], [900, 200], [901, 100], [901, 200], [1440, 100], [1440, 200]]
  .flatMap(([width, scale]) => ['light', 'dark'].map(theme => [width, scale, theme]));
const scenarios = [];
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const cssSha256 = createHash('sha256').update(await readFile(`${root}/apps/control-panel/src/styles.css`)).digest('hex');
const overviewCssSha256 = createHash('sha256').update(await readFile(`${root}/apps/control-panel/src/pages/overview.css`)).digest('hex');
const tokensCssSha256 = createHash('sha256').update(await readFile(`${root}/apps/control-panel/src/styles/tokens.css`)).digest('hex');
const receipt = { sourceHead, cssSha256, overviewCssSha256, tokensCssSha256, baseUrl, browser: engine, browserPath: 'Browser plugin not available; existing locked Playwright', flow: 'Overview -> Tab/Shift+Tab controls -> period/Refresh/definitions -> all activity-card text -> navigation links -> Flags -> Overview', fixture: 'Disposable local PostgreSQL17 + real Worker dispatcher + restricted admin transaction adapter; other operational services explicitly unavailable', scenarios, themeVerification: 'Explicit html data-theme and browser colorScheme; computed root color-scheme/surface/foreground tokens and actual body/panel/select colors checked initially, after scrolling and after Flags/Overview round trip', framing: 'All PNGs use ordinary width×900 viewport; no resized element screenshots or hidden navigation. A verified 24px synthetic watermark is excluded from visibility assertions.' };
const require = createRequire(`${root}/package.json`);
const { default: pg } = await import(pathToFileURL(require.resolve('pg')));
const { chromium, webkit } = require('playwright');
const { generateKeyPair, exportJWK, SignJWT } = await import(pathToFileURL(require.resolve('jose')));
const { uuidv7 } = await import(pathToFileURL(`${root}/packages/security/src/index.ts`));
const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
assert.ok(target.pathname.startsWith('/lythaus_auth_test'));
await mkdir(output, { recursive: true });
const logs = [], browserLogs = [], pageErrors = [], consoleErrors = [];
const originalLog = console.log;
console.log = (...values) => logs.push(format(...values));
async function withClient(role, work) {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try { if (role) await client.query(`SET ROLE ${role}`); return await work(client); }
  finally { await client.end(); }
}
const sql = (text, values = []) => withClient(null, client => client.query(text, values));
async function transaction(_binding, work) {
  return withClient('lythaus_admin', async client => {
    await client.query('BEGIN');
    try {
      const result = await work({ query: (text, values) => client.query(text, values) });
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  });
}
const dbUrl = pathToFileURL(require.resolve('@lythaus/db'));
const db = await import(dbUrl);
mock.module(dbUrl, { cache: true, namedExports: { ...db, query: (_binding, text, values) => withClient('lythaus_admin', client => client.query(text, values)), transaction } });
const { default: worker } = await import(pathToFileURL(`${root}/apps/lythaus-admin-api/src/index.ts`));
const actors = [], users = [uuidv7(), uuidv7(), uuidv7()], posts = [uuidv7(), uuidv7(), uuidv7()];
const acceptanceUser = uuidv7(), acceptancePost = uuidv7();
const subjectKey = 'local-synthetic-owner-key';
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey); jwk.kid = 'local-synthetic-key';
const jwks = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); });
await new Promise(resolve => jwks.listen(0, '127.0.0.1', resolve));
const env = { DB_ADMIN_FRESH: {}, ACCESS_SUBJECT_HMAC_KEY: subjectKey, ACCESS_AUDIENCES: 'local-synthetic-admin',
  ACCESS_JWKS_URL: `http://127.0.0.1:${jwks.address().port}/jwks`, EXPECTED_HOSTNAMES: 'admin.lythaus.co', CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co' };
const activity = page => page.getByRole('heading', { name: 'Members and contributors', exact: true, level: 2 }).locator('..');
const lowerBound = page => activity(page).getByRole('heading', { name: 'Known active lower bound', exact: true }).locator('..').locator('strong');
async function assertIncomplete(page) {
  for (const name of ['Active members', 'Contributor share of active members', 'Quiet members']) {
    assert.equal(await activity(page).getByRole('heading', { name, exact: true }).locator('..').locator('strong').textContent(), 'Unavailable');
  }
}
const browsers = [];
try {
  const version = await sql('SHOW server_version_num');
  assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 17);
  for (const [index, user] of users.entries()) await sql("INSERT INTO identity.users (id, created_at) VALUES ($1, current_timestamp - ($2::integer * interval '1 hour'))", [user, index === 0 ? 48 : index]);
  await sql("INSERT INTO identity.admin_memberships (user_id, access_subject_hmac, role) VALUES ($1, $2, 'administrator')", [users[0], createHmac('sha256', subjectKey).update('local-synthetic-contributor-admin').digest()]);
  await sql('INSERT INTO identity.users (id, is_production_acceptance) VALUES ($1, true)', [acceptanceUser]);
  await sql("INSERT INTO content.posts (id, author_id, body, declared_creation_mode, moderation_state, created_at) VALUES ($1, $2, 'Local synthetic private acceptance post body', 'human', 'allowed', current_timestamp - interval '20 minutes')", [acceptancePost, acceptanceUser]);
  await sql("INSERT INTO identity.user_entitlements (user_id, subscription_tier) VALUES ($1, 'premium'), ($2, 'black')", [users[1], users[2]]);
  for (const [index, post] of posts.entries()) await sql("INSERT INTO content.posts (id, author_id, body, declared_creation_mode, moderation_state, created_at) VALUES ($1, $2, 'Local synthetic private post body', 'human', 'allowed', current_timestamp - ($3::integer * interval '1 minute'))", [post, users[0], index === 2 ? 1440 : 30 + index]);
  for (const [post, author] of [[posts[0], users[1]], [posts[0], users[0]], [posts[2], users[1]]]) await sql("INSERT INTO content.comments (id, post_id, author_id, body, declared_creation_mode, moderation_state, created_at) VALUES ($1, $2, $3, 'Local synthetic private comment body', 'human', 'allowed', current_timestamp - interval '15 minutes')", [uuidv7(), post, author]);
  await sql("INSERT INTO content.comments (id, post_id, author_id, body, declared_creation_mode, moderation_state, created_at) VALUES ($1, $2, $3, 'Local synthetic private acceptance comment body', 'human', 'allowed', current_timestamp - interval '10 minutes')", [uuidv7(), posts[0], acceptanceUser]);


  const browser = await ({ chromium, webkit }[engine]).launch({ headless: true }); browsers.push(browser);
  for (const [width, scale, theme] of cases) {
    // Each independent viewport has its own real authorized synthetic owner. Keep
    // the production rate limiter enabled; never reset counters during a case.
    const actor = uuidv7(), subject = `local-synthetic-owner-${actor}`; actors.push(actor);
    await sql('INSERT INTO identity.users (id, is_production_acceptance) VALUES ($1, true)', [actor]);
    await sql("INSERT INTO identity.admin_memberships (user_id, access_subject_hmac, role) VALUES ($1, $2, 'owner')", [actor, createHmac('sha256', subjectKey).update(subject).digest()]);
    const token = await new SignJWT({ sub: subject }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setAudience('local-synthetic-admin').setIssuedAt().setExpirationTime('10m').sign(privateKey);
    const record = { width, height: 900, scale, theme, checks: [], cards: [], sourceResponses: [] }; scenarios.push(record);
    const capturePrefix = `${output}/${width}-${scale}-${theme}`;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', colorScheme: theme });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { browserLogs.push(message.text()); if (['error', 'warning'].includes(message.type())) consoleErrors.push(message.text()); });
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ body: '' }));
    await page.route('**/api/admin/**', async route => {
      const url = new URL(route.request().url());
      if (!['/api/admin/overview', '/api/admin/health'].includes(url.pathname)) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'local_synthetic_source_unavailable' }) }); return;
      }
      const response = await worker.fetch(new Request(`https://admin.lythaus.co${url.pathname}${url.search}`, { headers: { 'cf-access-jwt-assertion': token, origin: 'https://admin.lythaus.co' } }), env);
      const body = await response.text();
      record.sourceResponses.push({ route: url.pathname, status: response.status });
      assert.ok(!body.includes('Local synthetic private'));
      for (const id of [...actors, acceptanceUser, ...users]) assert.ok(!body.includes(id));
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
    });
    try {
      await page.goto(baseUrl);
      await lowerBound(page).filter({ hasText: 'At least 2' }).waitFor();
      await page.getByRole('status').waitFor({ state: 'detached' });
      assert.equal(await page.title(), 'Lythaus Control Panel');
      assert.equal(new URL(page.url()).pathname, '/');
      assert.equal(await page.locator('vite-error-overlay').count(), 0);
      assert.equal(await lowerBound(page).textContent(), 'At least 2');
      await assertIncomplete(page);
      await page.evaluate(({ scale, theme }) => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.fontSize = `${scale}%`;
        const label = document.createElement('div'); label.id = 'synthetic-evidence-label';
        label.textContent = `LOCAL SYNTHETIC · ${theme} · ${innerWidth}×900 · ${scale}%`;
        label.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99;background:#fff;color:#111;font:700 11px/14px sans-serif;padding:4px;border:1px solid #111';
        document.body.append(label);
      }, { scale, theme });
      const frame = () => page.evaluate(() => {
        const nav = document.querySelector('header.nav');
        const rect = nav.getBoundingClientRect();
        const rootStyle = getComputedStyle(document.documentElement);
        return { scrollY, navTop: rect.top, navBottom: rect.bottom, navPosition: getComputedStyle(nav).position,
          rootFontPixels: parseFloat(getComputedStyle(document.documentElement).fontSize),
          appTheme: document.documentElement.dataset.theme, colorScheme: rootStyle.colorScheme,
          surfaceToken: rootStyle.getPropertyValue('--surface').trim(), onSurfaceToken: rootStyle.getPropertyValue('--on-surface').trim(),
          bodyColor: getComputedStyle(document.body).color,
          panelBackground: getComputedStyle(document.querySelector('.overview .lyth-card--panel')).backgroundColor,
          selectBackground: getComputedStyle(document.querySelector('.overview-controls select')).backgroundColor,
          watermarkHeight: document.querySelector('#synthetic-evidence-label').getBoundingClientRect().height,
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
          navigationPresent: getComputedStyle(nav).display !== 'none' && getComputedStyle(nav).visibility !== 'hidden' };
      });
      const assertTheme = state => {
        assert.equal(state.appTheme, theme);
        assert.equal(state.colorScheme, theme);
        assert.equal(state.surfaceToken, theme === 'light' ? '#f2f5f7' : '#0b1115');
        assert.equal(state.onSurfaceToken, theme === 'light' ? '#12202a' : '#ecf2f5');
        assert.equal(state.bodyColor, theme === 'light' ? 'rgb(18, 32, 42)' : 'rgb(236, 242, 245)');
        assert.equal(state.panelBackground, theme === 'light' ? 'rgb(232, 238, 242)' : 'rgb(18, 27, 34)');
        assert.equal(state.selectBackground, theme === 'light' ? 'rgb(242, 245, 247)' : 'rgb(11, 17, 21)');
      };
      const visibleFocus = async label => {
        const state = await page.evaluate(() => {
          const element = document.activeElement, rect = element.getBoundingClientRect();
          const bottom = document.querySelector('#synthetic-evidence-label').getBoundingClientRect().top;
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
          const probes = [[centerX, centerY], [centerX, rect.top + 2], [centerX, rect.bottom - 2], [rect.left + 2, centerY], [rect.right - 2, centerY]];
          const ownsProbes = probes.every(([x, y]) => { const point = document.elementFromPoint(x, y); return !!point && (point === element || element.contains(point)); });
          return { tag: element.tagName, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
            inViewport: rect.top >= 0 && rect.bottom <= bottom && rect.left >= 0 && rect.right <= innerWidth,
            ownsCenter: !!hit && (hit === element || element.contains(hit)), ownsProbes, centerHit: hit?.tagName };
        });
        record.checks.push({ label, focus: state });
        await page.screenshot({ path: `${capturePrefix}-focus.png`, fullPage: false });
        assert.ok(state.inViewport && state.ownsCenter && state.ownsProbes, `${width}×900 ${scale}%: ${label} keyboard focus must be visible; ${JSON.stringify(state)}`);
      };
      record.initial = await frame();
      assertTheme(record.initial);
      assert.equal(record.initial.watermarkHeight, 24);
      assert.equal(record.initial.rootFontPixels, 16 * scale / 100);
      assert.ok(record.initial.noHorizontalOverflow && record.initial.navigationPresent);
      await page.screenshot({ path: `${capturePrefix}-initial.png`, fullPage: false });
      const navigation = page.getByRole('navigation').getByRole('link');
      const expected = ['Overview', 'Flags', 'Appeals', 'Authenticity beta', 'Accounts', 'Waitlist', 'Audit', 'Auth acceptance'];
      assert.deepEqual(await navigation.allTextContents(), expected);
      for (const name of expected) {
        await page.keyboard.press('Tab'); await page.waitForTimeout(90);
        assert.equal(await page.evaluate(() => document.activeElement.textContent), name);
        await visibleFocus(name);
      }
      const period = page.getByLabel('Reporting period (UTC)');
      await page.keyboard.press('Tab'); await page.waitForTimeout(90);
      assert.ok(await period.evaluate(element => element === document.activeElement));
      await visibleFocus('Reporting period');
      await page.screenshot({ path: `${capturePrefix}-period.png`, fullPage: false });
      await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(90);
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Auth acceptance');
      await visibleFocus('Backward to navigation');
      await page.keyboard.press('Tab'); await page.waitForTimeout(90); await visibleFocus('Forward to period');
      await page.keyboard.press('ArrowDown');
      await lowerBound(page).filter({ hasText: 'At least 2' }).waitFor();
      await page.getByRole('status').waitFor({ state: 'detached' });
      assert.equal(await period.inputValue(), 'mtd');
      assert.equal(await lowerBound(page).textContent(), 'At least 2');
      await page.keyboard.press('Tab'); await page.waitForTimeout(90);
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Refresh');
      await visibleFocus('Refresh');
      await page.keyboard.press('Enter'); await page.getByRole('status').waitFor({ state: 'detached' });
      await page.keyboard.press('Tab'); await page.waitForTimeout(90);
      const definition = page.getByRole('heading', { name: 'Posts', exact: true, level: 3 }).locator('..').locator('summary');
      assert.ok(await definition.evaluate(element => element === document.activeElement));
      await visibleFocus('Post definition');
      await page.keyboard.press('Enter');
      assert.equal(await definition.locator('..').getAttribute('open'), '');
      await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(90); await visibleFocus('Backward to Refresh');
      await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(90); await visibleFocus('Backward to period');
      await page.evaluate(() => document.activeElement.blur());
      const before = await frame(); await page.keyboard.press('PageDown'); await page.waitForTimeout(200);
      const after = await frame(); assert.ok(after.scrollY > before.scrollY);
      record.pageDownMoves = true;
      for (const [index, name] of ['Active members', 'Known active lower bound', 'Contributor share of active members', 'Quiet members'].entries()) {
        const card = page.getByRole('heading', { name, exact: true, level: 3 }).locator('..');
        const witnessed = new Set(); let total, captured = false;
        for (let attempt = 0; attempt < 80; attempt++) {
          const state = await card.evaluate(element => {
            const navBottom = Math.max(0, document.querySelector('header.nav').getBoundingClientRect().bottom);
            const bottom = document.querySelector('#synthetic-evidence-label').getBoundingClientRect().top;
            const nodes = [element.querySelector('h3'), element.querySelector('strong'), ...element.querySelectorAll('p')];
            const grouped = nodes.map(node => { const range = document.createRange(); range.selectNodeContents(node);
              return [...range.getClientRects()].map(rect => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
                ownsCenter: element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) })); });
            return { navBottom, bottom, lines: grouped.flat(), primary: grouped.slice(0, 2).flat() };
          });
          total = state.lines.length;
          const visible = line => line.top >= state.navBottom + 2 && line.bottom <= state.bottom - 2 && line.left >= 0 && line.right <= width && line.ownsCenter;
          state.lines.forEach((line, i) => { if (visible(line)) witnessed.add(i); });
          if (!captured && state.primary.every(visible)) {
            await page.screenshot({ path: `${capturePrefix}-card-${index + 1}.png`, fullPage: false }); captured = true;
          }
          const pending = state.lines.findIndex((_line, i) => !witnessed.has(i));
          if (pending === -1) break;
          await page.mouse.move(width - 8, 800);
          await page.mouse.wheel(0, state.lines[pending].top - state.navBottom - 20);
          await page.waitForTimeout(180);
        }
        assert.equal(witnessed.size, total, `${name}: every rendered text rectangle must be scroll-reachable without occlusion`);
        record.cards.push({ name, textRects: total, witnessed: witnessed.size, headingValueCapturedTogether: captured });
      }
      record.scrolled = await frame();
      assertTheme(record.scrolled);
      if (width <= 900) assert.ok(record.scrolled.navBottom < 0, 'Stacked navigation must naturally scroll away');
      else { assert.equal(record.scrolled.navPosition, 'sticky'); assert.equal(record.scrolled.navTop, 0); }
      await page.keyboard.press('Control+Home'); await page.waitForTimeout(180);
      assert.equal((await frame()).navTop, 0);
      await navigation.getByText('Flags', { exact: true }).click();
      await page.getByRole('heading', { name: 'Moderation cases', level: 1 }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/flags');
      await page.keyboard.press('Control+Home'); await page.waitForTimeout(100);
      await page.getByRole('navigation').getByRole('link', { name: 'Overview', exact: true }).click();
      await lowerBound(page).filter({ hasText: 'At least 2' }).waitFor();
      await page.getByRole('status').waitFor({ state: 'detached' });
      assert.equal(new URL(page.url()).pathname, '/');
      assert.equal(await lowerBound(page).textContent(), 'At least 2');
      await assertIncomplete(page);
      record.menuRoundTrip = true;
      record.returned = await frame();
      assertTheme(record.returned);
      assert.ok(record.returned.noHorizontalOverflow);
      assert.ok(record.sourceResponses.length < 120);
      assert.ok(record.sourceResponses.every(response => response.status === 200));
      const rates = await sql('SELECT request_count FROM system.rate_limit_windows WHERE subject_hash = encode(sha256(convert_to($1,\'UTF8\')),\'hex\')', [`admin:${actor}`]);
      record.rateWindowCounts = rates.rows.map(row => row.request_count);
      assert.ok(record.rateWindowCounts.every(count => count > 0 && count < 120));
      record.result = 'pass';
    } catch (error) {
      record.result = 'fail'; record.error = error.message;
      record.horizontalOffenders = await page.evaluate(() => [...document.querySelectorAll('body *')]
        .filter(element => element.getBoundingClientRect().right > innerWidth + 1)
        .map(element => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right, text: element.textContent.slice(0, 80) })).slice(0, 20));
      await page.screenshot({ path: `${capturePrefix}-failure.png`, fullPage: false });
      throw error;
    } finally {
      await context.close();
      await writeFile(`${output}/navigation-focus-receipt.json`, JSON.stringify(receipt, null, 2));
    }
  }
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors.filter(message => !message.includes('503 (Service Unavailable)')), []);
  for (const value of ['Local synthetic private', ...actors, acceptanceUser, ...users]) {
    assert.ok(![...logs, ...browserLogs].some(log => log.includes(value)), 'Logs must not disclose private fixture bodies or identities');
  }
  receipt.result = 'pass'; receipt.pageErrors = pageErrors; receipt.unexplainedConsoleErrors = [];
  await writeFile(`${output}/navigation-focus-receipt.json`, JSON.stringify(receipt, null, 2));
  originalLog(JSON.stringify({ result: 'pass', scenarios: scenarios.length, cssSha256, browser: engine, fixture: 'local synthetic; no production data' }));
} finally {
  for (const browser of browsers) await browser.close();
  await new Promise(resolve => jwks.close(resolve));
  await sql('DELETE FROM content.comments WHERE author_id = ANY($1::uuid[])', [[...users, acceptanceUser]]);
  await sql('DELETE FROM content.posts WHERE id = ANY($1::uuid[])', [[...posts, acceptancePost]]);
  await sql('DELETE FROM system.audit_events WHERE actor_id = ANY($1::uuid[])', [actors]);
  for (const actor of actors) await sql('DELETE FROM system.rate_limit_windows WHERE subject_hash = encode(sha256(convert_to($1,\'UTF8\')),\'hex\')', [`admin:${actor}`]);
  await sql('DELETE FROM identity.admin_memberships WHERE user_id = ANY($1::uuid[])', [[...actors, users[0]]]);
  await sql('DELETE FROM identity.users WHERE id = ANY($1::uuid[])', [[...actors, acceptanceUser, ...users]]);
  console.log = originalLog;
}
