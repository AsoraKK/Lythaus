import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium, webkit} from 'playwright';
import {localAuthBrowserServer} from './local-auth-browser-server.mjs';
import {installFlutterEngineFonts} from './flutter-engine-font-fixture.mjs';

const build = path.resolve(process.env.LOADING_BUILD ?? 'build/loading-web');
const output = path.resolve(process.env.LOADING_EVIDENCE ?? path.join(tmpdir(), 'lythaus-loading-evidence'));
await mkdir(output, {recursive: true});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const productionInputs = ['lib/main.dart', 'lib/design_system/widgets/lyth_loading_wordmark.dart', 'lib/design_system/widgets/loading_motion_preference_stub.dart', 'lib/design_system/widgets/loading_motion_preference_web.dart', 'lib/features/auth/presentation/auth_choice_screen.dart', 'web/index.html', 'web/startup-presentation.css', 'web/startup-presentation.js', 'pubspec.yaml', 'pubspec.lock'];
const identity = {
  checkoutHead: execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(),
  productionSourceSha256: Object.fromEntries(await Promise.all(productionInputs.map(async file => [file, hash(await readFile(file))]))),
  buildSha256: Object.fromEntries(await Promise.all(['main.dart.js', 'index.html', 'startup-presentation.css', 'startup-presentation.js'].map(async file => [file, hash(await readFile(path.join(build, file)))]))),
};
for (const file of ['startup-presentation.css', 'startup-presentation.js']) {
  assert.equal(identity.productionSourceSha256[`web/${file}`], identity.buildSha256[file], 'Browser build must include the current presentation source');
}
const mime = {'.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.json':'application/json', '.wasm':'application/wasm', '.ttf':'font/ttf', '.otf':'font/otf', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon'};
const results = [];
const {PNG} = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const pixelsHash = bytes => hash(PNG.sync.read(bytes).data);
function assertPainted(bytes, label) {
  const png = PNG.sync.read(bytes);
  let ivory = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i] > 180 && png.data[i + 1] > 150 && png.data[i + 2] > 100 && png.data[i + 3] > 200) ivory++;
  }
  assert.ok(ivory > 50, `${label}: approved artwork must paint meaningful visible pixels (found ${ivory})`);
  return ivory;
}
function assertReadable(bytes, referenceBytes, label) {
  const current = PNG.sync.read(bytes), reference = PNG.sync.read(referenceBytes);
  assert.equal(current.width, reference.width);
  assert.equal(current.height, reference.height);
  let letters = 0, visible = 0;
  for (let i = 0; i < reference.data.length; i += 4) {
    if (reference.data[i] <= 180 || reference.data[i + 1] <= 150 || reference.data[i + 2] <= 100 || reference.data[i + 3] <= 200) continue;
    letters++;
    if (current.data[i] > 180 && current.data[i + 1] > 150 && current.data[i + 2] > 100 && current.data[i + 3] > 200) visible++;
  }
  assert.ok(letters > 50 && visible / letters >= .9, `${label}: ${visible}/${letters} approved letter pixels remain visible`);
  return visible / letters;
}
function assertSimilar(bytes, referenceBytes, label) {
  const current = PNG.sync.read(bytes), reference = PNG.sync.read(referenceBytes);
  assert.equal(current.width, reference.width);
  assert.equal(current.height, reference.height);
  let maxDifference = 0;
  for (let i = 0; i < reference.data.length; i++) maxDifference = Math.max(maxDifference, Math.abs(current.data[i] - reference.data[i]));
  assert.ok(maxDifference <= 10, `${label}: maximum channel difference ${maxDifference} exceeds 10`);
  return maxDifference;
}
function assertAlignedArtwork(bytes, referenceBytes, label) {
  const current = PNG.sync.read(bytes), reference = PNG.sync.read(referenceBytes);
  assert.ok(Math.abs(current.width - reference.width) <= 1);
  assert.ok(Math.abs(current.height - reference.height) <= 1);
  const lit = (png, x, y) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return false;
    const i = (y * png.width + x) * 4;
    return png.data[i] > 180 && png.data[i + 1] > 150 && png.data[i + 2] > 100 && png.data[i + 3] > 200;
  };
  const coverage = (from, to) => {
    let total = 0, matched = 0;
    for (let y = 0; y < from.height; y++) for (let x = 0; x < from.width; x++) {
      if (!lit(from, x, y)) continue;
      total++;
      if ([-1, 0, 1].some(dy => [-1, 0, 1].some(dx => lit(to, x + dx, y + dy)))) matched++;
    }
    return total > 50 ? matched / total : 0;
  };
  const forward = coverage(reference, current), reverse = coverage(current, reference);
  assert.ok(forward >= .99 && reverse >= .99, `${label}: aligned artwork coverage ${forward}/${reverse}`);
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };

for (const [name, engine] of Object.entries({chromium, webkit})) {
  if (process.env.LOADING_ENGINE && process.env.LOADING_ENGINE !== name) continue;
  for (const width of [390, 1440]) {
    if (process.env.LOADING_WIDTH && Number(process.env.LOADING_WIDTH) !== width) continue;
    const id = `${name}-${width}`;
    const refresh = deferred(), login = deferred();
    let refreshStarted = false, loginStarted = false;
    const calls = [], errors = [], unexpected = [], environmentWarnings = [];
    const fixture = await localAuthBrowserServer(async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname === 'app.lythaus.co') {
        let file = path.resolve(build, '.' + url.pathname);
        assert.ok(file === build || file.startsWith(build + path.sep));
        if (!path.extname(file)) file = path.join(file, 'index.html');
        try { return route.fulfill({contentType: mime[path.extname(file)] ?? 'application/octet-stream', body: await readFile(file)}); }
        catch { unexpected.push(url.pathname); return route.fulfill({status: 404, body: 'Missing local artifact'}); }
      }
      assert.equal(url.hostname, 'api.lythaus.co');
      const headers = {'access-control-allow-origin':'https://app.lythaus.co', 'access-control-allow-credentials':'true', 'access-control-allow-methods':'GET,POST,OPTIONS', 'access-control-allow-headers':'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode, X-Lythaus-Auth-Transport'};
      if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers});
      calls.push({path: url.pathname, method: request.method()});
      let status = 200, body = {items: [], hasMore: false, nextCursor: null};
      if (url.pathname === '/api/auth/refresh') {
        refreshStarted = true;
        await refresh.promise;
        status = 401; body = {error: 'refresh_token_invalid'};
      } else if (url.pathname === '/api/auth/email') {
        assert.equal(request.postDataJSON().email, 'synthetic@example.invalid');
        assert.equal(request.postDataJSON().password, 'historical12');
        loginStarted = true;
        await login.promise;
        status = 401; body = {error: 'invalid_credentials'};
      } else if (url.pathname === '/api/auth/logout') body = {state: 'signed_out'};
      else if (url.pathname !== '/api/feed/discover') unexpected.push(url.pathname);
      return route.fulfill({status, headers, contentType:'application/json', body: JSON.stringify(body)});
    });
    const browser = await engine.launch({headless: true, proxy: {server: fixture.proxy},
      ...(name === 'webkit' && process.env.WEBKIT_EXECUTABLE ? {executablePath: process.env.WEBKIT_EXECUTABLE} : {})});
    const context = await browser.newContext({viewport: {width, height: 900}, ignoreHTTPSErrors: true, serviceWorkers: 'block'});
    await context.addInitScript(() => {
      window.loadingMotionEvents = [];
      window.loadingMotionListeners = {added:0, removed:0};
      const listeners = new WeakMap();
      const add = MediaQueryList.prototype.addEventListener;
      const remove = MediaQueryList.prototype.removeEventListener;
      MediaQueryList.prototype.addEventListener = function(type, listener, options) {
        if (this.media === '(prefers-reduced-motion: reduce)' && type === 'change') {
          if (!listeners.has(this)) listeners.set(this, new Set());
          if (!listeners.get(this).has(listener)) { listeners.get(this).add(listener); window.loadingMotionListeners.added++; }
        }
        return add.call(this, type, listener, options);
      };
      MediaQueryList.prototype.removeEventListener = function(type, listener, options) {
        if (this.media === '(prefers-reduced-motion: reduce)' && type === 'change' && listeners.get(this)?.delete(listener)) window.loadingMotionListeners.removed++;
        return remove.call(this, type, listener, options);
      };
      const motion = matchMedia('(prefers-reduced-motion: reduce)');
      motion.addEventListener('change', event => window.loadingMotionEvents.push({type:'motion', matches:event.matches, at:performance.now()}));
      for (const type of ['focus', 'blur', 'pageshow', 'pagehide']) addEventListener(type, () => window.loadingMotionEvents.push({type, at:performance.now()}));
      document.addEventListener('visibilitychange', () => window.loadingMotionEvents.push({type:'visibility', hidden:document.hidden, at:performance.now()}));
    });
    await installFlutterEngineFonts(context);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (!['warning', 'error'].includes(message.type())) return;
      if (/GL Driver Message.*GPU stall due to ReadPixels/.test(message.text())) {
        environmentWarnings.push(message.text()); return;
      }
      if (message.type() === 'error' && /401/.test(message.text()) && /\/api\/auth\/(refresh|email)/.test(message.location().url)) return;
      errors.push(message.text());
    });
    const result = {id, browser: browser.version(), viewport: {width, height: 900}, synthetic: true, screenshots: []};
    async function capture(label) {
      const file = `${id}-${label}.png`;
      await page.screenshot({path: path.join(output, file)});
      result.screenshots.push(file);
    }
    try {
      await context.route('**/flutter_bootstrap.js', route => route.fulfill({contentType:'application/javascript', body:''}));
      await page.goto('https://app.lythaus.co/');
      assert.equal(await page.title(), 'Lythaus');
      const brand = page.locator('.startup-wordmark');
      await page.waitForFunction(() => document.getAnimations().length === 6);
      const bounds = await brand.boundingBox();
      result.startupBounds = bounds;
      assert.ok(Math.abs(bounds.height - bounds.width * 166 / 1000) < .02, JSON.stringify(bounds));
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      assert.equal(await page.locator('#lythaus-startup').innerText(), 'Loading Lythaus');
      assert.equal(await page.locator('[role=status]').getAttribute('aria-live'), 'polite');
      const status = await page.locator('[role=status]').boundingBox();
      assert.equal(status.width, 1);
      const frame = async time => page.evaluate(time => {
        document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = time; });
      }, time);
      await frame(600); await capture('startup-first-reveal');
      await frame(3600); await capture('startup-repeat');
      result.startupPaintedPixels = assertPainted(await brand.screenshot(), 'Startup repeat');
      const repeat = await page.screenshot();
      await frame(6600); assert.equal(pixelsHash(await page.screenshot()), pixelsHash(repeat), 'Three-second cycle repeats the same pixels');
      await page.evaluate(() => document.getAnimations().forEach(animation => {
        if (animation.effect.getTiming().iterations === 1) animation.finish();
        else { animation.currentTime = 1600; animation.play(); }
      }));
      const exposure = () => page.evaluate(() => document.querySelector('mask [data-light-position]').getAnimations()[0].playState);
      assert.equal(await exposure(), 'finished');
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
      assert.equal(await exposure(), 'finished');
      assert.ok((await page.evaluate(() => document.getAnimations().filter(a => a.effect.getTiming().iterations === Infinity).map(a => a.playState))).every(state => state === 'paused'));
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow')));
      assert.equal(await exposure(), 'finished');
      await page.emulateMedia({reducedMotion: 'reduce'});
      await page.waitForFunction(() => document.getAnimations().length === 0);
      assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
      assert.deepEqual(await brand.boundingBox(), bounds);
      await capture('startup-reduced-motion');
      const staticStartup = await brand.screenshot();
      await page.emulateMedia({reducedMotion: 'no-preference'});
      await page.waitForFunction(() => document.getAnimations().length === 5);
      await frame(0);
      result.startupResumedMaxDifference = assertSimilar(await brand.screenshot(), staticStartup, 'Startup motion resumes');
      await capture('startup-motion-resumed');
      await page.evaluate(() => window.lythausStartupFailed());
      assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
      await page.getByRole('button', {name:'Try again'}).waitFor();
      await capture('startup-error');
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow')));
      assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
      await page.evaluate(() => document.querySelector('#lythaus-startup').remove());
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
      await page.emulateMedia({reducedMotion: 'reduce'});
      await page.reload({waitUntil:'domcontentloaded'});
      assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
      const initiallyStaticStartup = await brand.screenshot();
      assertPainted(initiallyStaticStartup, 'Startup launched with reduced motion');
      await page.emulateMedia({reducedMotion: 'no-preference'});
      await page.waitForFunction(() => document.getAnimations().length === 5);
      await frame(0);
      result.startupInitiallyStaticMaxDifference = assertSimilar(await brand.screenshot(), initiallyStaticStartup, 'Initially static startup resumes');
      await capture('startup-initially-static-resumed');
      await page.evaluate(() => document.querySelector('#lythaus-startup').remove());
      await context.unroute('**/flutter_bootstrap.js');
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('flt-semantics-placeholder').waitFor({timeout:60000});
      await page.locator('flt-semantics-placeholder').evaluate(node => node.click());
      for (let i = 0; !refreshStarted && i < 200; i++) await page.waitForTimeout(50);
      assert.equal(refreshStarted, true);
      await page.waitForTimeout(3600);
      await capture('actual-main-pending-session');
      assert.equal(await page.locator('#lythaus-startup').count(), 1);
      refresh.resolve();
      await page.locator('#lythaus-startup').waitFor({state:'detached'});
      const submit = page.getByRole('button', {name:'Sign in with email', exact:true});
      await submit.waitFor();
      const logo = page.getByRole('img', {name:'Lythaus', exact:true});
      const idleBounds = await logo.boundingBox();
      const idlePixels = await logo.screenshot();
      const idleHash = pixelsHash(idlePixels);
      const glowRegion = bounds => {
        const x = Math.max(0, bounds.x - 40), y = Math.max(0, bounds.y - 55);
        return {x, y, width:Math.min(width, bounds.x + bounds.width + 40) - x, height:Math.min(900, bounds.y + bounds.height + 55) - y};
      };
      const upperGlowRegion = bounds => ({x:0, y:Math.max(0, Math.floor(bounds.y) - 55), width, height:Math.min(50, Math.floor(bounds.y))});
      const idleRegionHash = pixelsHash(await page.screenshot({clip: glowRegion(idleBounds)}));
      const idleUpperHash = pixelsHash(await page.screenshot({clip: upperGlowRegion(idleBounds)}));
      result.loginPaintedPixels = assertPainted(idlePixels, 'Actual main login');
      await capture('login-idle');
      await page.evaluate(() => {
        window.loadingAnnouncements = [];
        new MutationObserver(records => {
          const regions = new Set(records.map(record => {
            const element = record.target.nodeType === 3 ? record.target.parentElement : record.target;
            return element.closest?.('[aria-live=polite]');
          }).filter(Boolean));
          for (const region of regions) if (region.textContent.trim()) window.loadingAnnouncements.push(region.textContent.trim());
        }).observe(document.body, {subtree:true, childList:true, characterData:true});
      });
      for (const [field, value] of [[page.getByRole('textbox',{name:'Email',exact:true}), 'synthetic@example.invalid'], [page.locator('input[type=password]'), 'historical12']]) {
        await field.click();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await field.press('ControlOrMeta+A'); await field.press('Backspace');
        await field.pressSequentially(value, {delay:20});
        assert.equal(await field.inputValue(), value);
      }
      await page.locator('input[type=password]').press('Enter');
      for (let i = 0; !loginStarted && i < 200; i++) await page.waitForTimeout(50);
      assert.equal(loginStarted, true);
      await page.getByRole('button', {name:'Signing in…', exact:true}).waitFor();
      assert.deepEqual(await logo.boundingBox(), idleBounds);
      await page.waitForFunction(() => window.loadingAnnouncements.includes('Signing in…'));
      await page.waitForTimeout(500); await capture('login-first-sweep');
      await page.waitForTimeout(3000); await capture('login-repeat');
      assertPainted(await logo.screenshot(), 'Pending login repeat');
      await page.waitForTimeout(3000); await capture('login-second-repeat');
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {configurable:true, value:'hidden'});
        Object.defineProperty(document, 'hidden', {configurable:true, value:true});
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(250);
      const paused = pixelsHash(await logo.screenshot());
      await page.waitForTimeout(1200);
      assert.equal(pixelsHash(await logo.screenshot()), paused, 'Hidden sign-in pauses the light');
      await page.evaluate(() => {
        delete document.visibilityState;
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      let resumedAfterPause = false;
      for (let sample = 0; sample < 15; sample++) {
        await page.waitForTimeout(200);
        if (pixelsHash(await logo.screenshot()) !== paused) { resumedAfterPause = true; break; }
      }
      assert.equal(resumedAfterPause, true, 'Visible sign-in resumes the light');
      let inSweep = false;
      for (let sample = 0; sample < 20; sample++) {
        if (pixelsHash(await logo.screenshot()) !== idleHash) { inSweep = true; break; }
        await page.waitForTimeout(200);
      }
      assert.equal(inSweep, true, 'Reduced-motion transition is exercised during a visible sweep');
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
      await page.waitForTimeout(200);
      result.reducedMotionHashes = [];
      result.reducedMotionRegionHashes = [];
      for (let sample = 0; sample < 7; sample++) {
        result.reducedMotionHashes.push(pixelsHash(await logo.screenshot()));
        result.reducedMotionRegionHashes.push(pixelsHash(await page.screenshot({clip: glowRegion(idleBounds)})));
        if (sample < 6) await page.waitForTimeout(650);
      }
      result.motionEvents = await page.evaluate(() => ({events:window.loadingMotionEvents, hidden:document.hidden, focus:document.hasFocus(), reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}));
      assert.equal(result.motionEvents.hidden, false);
      assert.equal(result.motionEvents.focus, true);
      assert.equal(result.motionEvents.reduced, true);
      assert.ok(result.reducedMotionHashes.every(value => value === idleHash), `Reduced motion must match idle artwork ${idleHash}: ${result.reducedMotionHashes.join(',')}`);
      assert.ok(result.reducedMotionRegionHashes.every(value => value === idleRegionHash), `Reduced motion must clear the full glow region ${idleRegionHash}: ${result.reducedMotionRegionHashes.join(',')}`);
      assert.equal(await page.getByRole('button', {name:'Signing in…', exact:true}).isVisible(), true, 'Sign-in stays pending throughout reduced-motion samples');
      result.reducedMotionSamples = 7;
      await capture('login-reduced-motion');
      await page.emulateMedia({reducedMotion:'no-preference'});
      let resumed = false;
      for (let sample = 0; sample < 3; sample++) {
        await page.waitForTimeout(120);
        const pixels = await logo.screenshot();
        assertReadable(pixels, idlePixels, `Sign-in motion resumes sample ${sample}`);
        if (pixelsHash(pixels) !== idleHash) resumed = true;
      }
      assert.equal(resumed, true, 'The light resumes when motion is allowed and sign-in is still pending');
      assert.equal(await page.getByRole('button', {name:'Signing in…', exact:true}).isVisible(), true, 'Sign-in stays pending until the fixture responds');
      result.signInAnnouncements = await page.evaluate(() => window.loadingAnnouncements.filter(text => text === 'Signing in…'));
      assert.equal(result.signInAnnouncements.length, 1);
      login.resolve();
      await submit.waitFor();
      await page.waitForTimeout(500);
      const stopped = await logo.screenshot();
      assertPainted(stopped, 'Failed login static artwork');
      await page.waitForTimeout(3200);
      assert.equal(pixelsHash(await logo.screenshot()), pixelsHash(stopped), 'Error stops the light');
      await capture('login-error-stopped');
      const errorBounds = await logo.boundingBox();
      for (const dimension of ['x', 'width', 'height']) assert.equal(errorBounds[dimension], idleBounds[dimension]);
      assertAlignedArtwork(stopped, idlePixels, 'Failed login returns to the idle artwork');
      assert.equal(pixelsHash(await page.screenshot({clip: upperGlowRegion(errorBounds)})), idleUpperHash, 'Failed login clears the glow above the artwork');
      const signInError = page.getByText(/^(?:Invalid email or password|Sign-in timed out\. Check your connection and try again\.)$/);
      await signInError.waitFor();
      result.signInError = await signInError.innerText();
      const listenersBeforeDisposal = await page.evaluate(() => ({...window.loadingMotionListeners}));
      await page.getByRole('button', {name:'Continue as guest', exact:true}).click();
      await page.waitForFunction(removed => window.loadingMotionListeners.removed > removed, listenersBeforeDisposal.removed);
      result.motionListenerDisposal = {before:listenersBeforeDisposal, after:await page.evaluate(() => ({...window.loadingMotionListeners}))};
      assert.equal(result.motionListenerDisposal.after.removed, listenersBeforeDisposal.removed + 1);
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpected, []);
      result.checks = 'identity, nonblank, responsive geometry, 3s repeat pixels, live status, background resume, dynamic reduced motion, failure/disposal, actual-main session handoff, long pending sign-in and failure stop passed';
    } catch (error) {
      result.error = error.stack;
      await capture('failure').catch(() => {});
    } finally {
      refresh.resolve(); login.resolve();
      result.errors = errors; result.environmentWarnings = environmentWarnings; result.unexpected = unexpected; result.calls = calls;
      results.push(result);
      await context.close(); await browser.close(); await fixture.close();
      await writeFile(path.join(output, 'results.json'), JSON.stringify({browserPlugin:'not available; Playwright used', build, identity, results}, null, 2));
      console.log(JSON.stringify(result));
    }
  }
}
assert.ok(results.every(result => !result.error), 'Inspect retained browser failures in results.json');
