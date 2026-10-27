import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { before, after, test } from 'node:test';
import { chromium, firefox, webkit } from 'playwright';
import sharp from 'sharp';
import { artworkFidelity } from '../../../scripts/tests/brand-artwork-pixels.mjs';
import {approvedStaticSource,staticBrandReference} from './static-brand-reference.mjs';

const dist = path.resolve(import.meta.dirname, '../dist');
const startupSource = path.resolve(import.meta.dirname, '../../../web');
const derivedBrand = JSON.parse(await readFile(path.resolve(import.meta.dirname, '../../../docs/brand/four-colour/manifest.json'), 'utf8'));
const evidence = process.env.HOMEPAGE_QA_DIR;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
let server;
let origin;
let iconRedirects;

before(async () => {
  await readFile(path.join(dist, 'index.html'));
  iconRedirects = new Map((await readFile(path.join(dist, '_redirects'), 'utf8')).split('\n')
    .map(line => line.trim().split(/\s+/)).filter(([, , status]) => status === '302').map(([from, to]) => [from, to]));
  if (evidence) await mkdir(evidence, { recursive: true });
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (iconRedirects.has(pathname)) {
        response.writeHead(302, { location: iconRedirects.get(pathname) }).end();
        return;
      }
      const startup = pathname.startsWith('/__startup/');
      const root = startup ? startupSource : dist;
      let file = path.resolve(root, '.' + (startup ? pathname.slice('/__startup'.length) : pathname));
      if (file !== root && !file.startsWith(root + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      if (!path.extname(file)) file = path.join(file, 'index.html');
      let content = await readFile(file);
      if (startup && file.endsWith('/index.html')) content = content.toString().replace('$FLUTTER_BASE_HREF', '/__startup/');
      response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function frame(page, time) {
  await page.waitForFunction(() => document.documentElement.dataset.opening === 'playing');
  await page.evaluate((currentTime) => {
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = currentTime;
    }
  }, time);
}

async function finished(page) {
  const state = await page.evaluate(() => {
    const selectors = ['.pitch-intro-statement', '.pitch-intro-support .pitch-lede', '.pitch-intro-support .button', '.site-header'];
    return {
      visible: selectors.every((selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        return style.opacity === '1' && style.visibility === 'visible' && style.display !== 'none';
      }),
      mask: getComputedStyle(document.querySelector('.wordmark-settled')).maskImage,
      sourceHidden: getComputedStyle(document.querySelector('.wordmark-optics')).visibility === 'hidden' ||
        getComputedStyle(document.querySelector('.wordmark-optics')).display === 'none',
      moving: document.getAnimations().filter((animation) => !(animation instanceof CSSTransition) && animation.playState !== 'finished').length,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  assert.equal(state.visible, true, 'All hero information and navigation is readable');
  assert.match(state.mask, /wordmark-contours/, 'The complete approved outlines stay visible');
  assert.equal(state.sourceHidden, true, 'No residual light is visible');
  assert.equal(state.moving, 0, 'The final page is still');
  assert.equal(state.overflow, false, 'No horizontal overflow');
}

for (const [engineName, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(engineName + ' homepage opening', { timeout: 120000 }, async (t) => {
    const launchOptions = engineName === 'chromium' && process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] }
      : {};
    const browser = await engine.launch(launchOptions);
    const open = async (options = {}, setup) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
      // Font delivery is tested separately; optical geometry must also work offline.
      await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        window.openingTimes = {};
        new MutationObserver(() => {
          const state = document.documentElement.dataset.opening;
          if (state) window.openingTimes[state] = performance.now();
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-opening'] });
      });
      if (setup) await setup(page);
      await page.goto(origin, { waitUntil: 'load' });
      return { context, page, errors };
    };
    try {
      for (const [width, height] of [[1440, 900], [1280, 800], [768, 1024], [390, 844]]) {
        await t.test(`readable, stable completion at ${width}px`, async () => {
          const { context, page, errors } = await open({ viewport: { width, height } });
          try {
            assert.equal(await page.getByRole('heading', { level: 1, name: 'Lythaus', exact: true }).count(), 1);
            assert.equal(await page.locator('.wordmark-scene').getAttribute('aria-hidden'), 'true');
            const wordmarkGeometry = await page.evaluate(() => {
              const wordmark = document.querySelector('.pitch-wordmark');
              const bounds = wordmark.getBoundingClientRect();
              const parent = wordmark.parentElement.getBoundingClientRect();
              const clip = document.querySelector('#wordmark-space rect');
              return {
                width: bounds.width,
                expectedWidth: Math.min(parent.width / 2, 490),
                centerDelta: Math.abs(bounds.x + bounds.width / 2 - (parent.x + parent.width / 2)),
                clip: ['x', 'y', 'width', 'height'].map((attribute) => Number(clip.getAttribute(attribute))),
              };
            });
            assert.ok(Math.abs(wordmarkGeometry.width - wordmarkGeometry.expectedWidth) < 0.1,
              'The hero wordmark and beam stay at half their previous responsive scale');
            assert.ok(wordmarkGeometry.centerDelta < 0.1, 'The smaller hero wordmark stays centered');
            assert.deepEqual(wordmarkGeometry.clip, [-600, -500, 2300, 1150],
              'The SVG clip contains the full moving beam and its glow');
            assert.equal(await page.locator('.pitch-section').count(), 4);
            await page.waitForFunction(() => document.documentElement.dataset.opening === 'resolved');
            const elapsed = await page.evaluate(() => window.openingTimes.resolved - window.openingTimes.playing);
            assert.ok(elapsed >= 1250, 'Document loading must not consume the opening timeline');
            await finished(page);
            assert.deepEqual(errors, []);
            if (evidence) await page.screenshot({ path: path.join(evidence, `${engineName}-${width}-final.png`) });
          } finally { await context.close(); }
        });
      }

      for (const [name, options, setup] of [
        ['no JavaScript', { javaScriptEnabled: false }],
        ['reduced motion', { reducedMotion: 'reduce' }],
        ['unsupported SVG masks', {}, (page) => page.addInitScript(() => { window.SVGMaskElement = undefined; })],
        ['unavailable animation API', {}, (page) => page.addInitScript(() => { Element.prototype.animate = undefined; })],
        ['animation initialization failure', {}, (page) => page.addInitScript(() => {
          Element.prototype.animate = () => { throw new Error('Initialization failed'); };
        })],
      ]) {
        await t.test(name + ' gives immediate complete content', async () => {
          const { context, page, errors } = await open(options, setup);
          try {
            if (name === 'animation initialization failure') {
              await page.waitForFunction(() => document.documentElement.dataset.opening === 'resolved');
            }
            await finished(page);
            assert.deepEqual(errors, []);
            assert.equal(await page.getByRole('heading', { level: 1, name: 'Lythaus', exact: true }).count(), 1);
          } finally { await context.close(); }
        });
      }

      for (const event of ['pointerdown', 'keydown', 'scroll', 'touchstart', 'focusin']) {
        for (const at of [180, 680, 1180]) {
          await t.test(`${event} resolves at ${at}ms`, async () => {
            const { context, page } = await open();
            try {
              await frame(page, at);
              if (event === 'keydown') await page.keyboard.press('Tab');
              else if (event === 'focusin') await page.locator('.brand').focus();
              else if (event === 'scroll') await page.mouse.wheel(0, 100);
              else await page.evaluate((name) => window.dispatchEvent(new Event(name)), event);
              await page.waitForFunction(() => document.documentElement.dataset.opening === 'resolved');
              await finished(page);
              await page.evaluate((name) => window.dispatchEvent(new Event(name)), event);
              await finished(page);
            } finally { await context.close(); }
          });
        }
      }

      await t.test('reduced-motion changes and viewport changes resolve playback', async () => {
        for (const change of ['motion', 'viewport']) {
          const { context, page } = await open();
          try {
            await frame(page, 600);
            if (change === 'motion') await page.emulateMedia({ reducedMotion: 'reduce' });
            else await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForFunction(() => document.documentElement.dataset.opening === 'resolved');
            await finished(page);
          } finally { await context.close(); }
        }
      });

      await t.test('refresh replays; route return stays static; anchors remain usable', async () => {
        const { context, page } = await open();
        try {
          await page.waitForFunction(() => document.documentElement.dataset.opening === 'resolved');
          await finished(page);

          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => document.documentElement.dataset.opening === 'playing');
          assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type), 'reload');
          await page.waitForFunction(() => document.documentElement.dataset.opening === 'resolved');
          await finished(page);

          await page.goto(origin + '/privacy');
          await page.goBack({ waitUntil: 'domcontentloaded' });
          await finished(page);
          await page.locator('.pitch-intro-support').getByRole('link', { name: 'Join the waitlist', exact: true }).click();
          assert.equal(new URL(page.url()).hash, '#waitlist');
          assert.ok(await page.locator('#waitlist').isVisible());
        } finally { await context.close(); }
        const anchor = await browser.newContext();
        try {
          const page = await anchor.newPage();
          await page.goto(origin + '/#problem', { waitUntil: 'domcontentloaded' });
          await finished(page);
        } finally { await anchor.close(); }
      });

      await t.test('mobile keyboard navigation opens, closes and restores focus', async () => {
        const { context, page } = await open({ viewport: { width: 390, height: 844 } });
        try {
          await page.getByRole('button', { name: 'Menu', exact: true }).click();
          await finished(page);
          assert.equal(await page.getByRole('button', { name: 'Menu', exact: true }).getAttribute('aria-expanded'), 'true');
          await page.keyboard.press('Escape');
          assert.equal(await page.getByRole('button', { name: 'Menu', exact: true }).getAttribute('aria-expanded'), 'false');
          assert.equal(await page.locator('[data-mobile-nav-toggle]').evaluate((element) => element === document.activeElement), true);
        } finally { await context.close(); }
      });

      await t.test('source stays central while one beam passes over readable content', async () => {
        for (const width of [1440, 390]) {
          let previousX = -Infinity;
          for (const at of [0, 200, 390, 660, 930, 1180, 1380, 1700]) {
            const { context, page } = await open({ viewport: { width, height: width === 390 ? 844 : 900 } });
            try {
              await frame(page, at);
              const state = await page.evaluate(() => ({
                positions: Array.from(document.querySelectorAll('[data-light-position]'), (element) => new DOMMatrix(getComputedStyle(element).transform).m41),
                source: (() => {
                  const core = document.querySelector('.wordmark-core').getBoundingClientRect();
                  const scene = document.querySelector('.wordmark-scene').getBoundingClientRect();
                  return { x: core.x + core.width / 2, centre: scene.x + scene.width / 2 };
                })(),
                projection: (() => {
                  const matrix = new DOMMatrix(getComputedStyle(document.querySelector('[data-light-projection]')).transform);
                  return { origin: matrix.m41, extent: matrix.m11 };
                })(),
                copy: Number(getComputedStyle(document.querySelector('.pitch-intro-statement')).opacity),
                supportCopy: [...document.querySelectorAll('.pitch-intro-support p')].map(element => {
                  let opacity = 1;
                  for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) opacity *= Number(getComputedStyle(ancestor).opacity);
                  return opacity;
                }),
                energy: Number(getComputedStyle(document.querySelector('[data-light-energy]')).opacity),
                overflow: document.documentElement.scrollWidth > innerWidth,
              }));
              assert.ok(state.positions.every((x) => Math.abs(x - state.positions[0]) < 0.01));
              assert.ok(Math.abs(state.source.x - state.source.centre) < 0.1, 'The point remains at the centre throughout');
              assert.ok(Math.abs(state.projection.origin + state.projection.extent - state.positions[0]) < 0.1, 'The beam reaches from its fixed origin to the illumination front');
              assert.ok(state.positions[0] >= previousX, 'The beam never reverses');
              previousX = state.positions[0];
              assert.equal(state.copy, 1, 'Reading content stays visible throughout the opening');
              assert.equal(state.supportCopy.length, 2);
              assert.deepEqual(state.supportCopy, [1, 1], 'Tagline and supporting text are always readable');
              if (at >= 1380) assert.equal(state.energy, 0);
              if (at === 1180) assert.ok(state.positions[0] > 1000, 'Beam continues beyond S');
              assert.equal(state.overflow, false);
              if (evidence) await page.screenshot({ path: path.join(evidence, `${engineName}-${width}-${at}.png`) });
            } finally { await context.close(); }
          }
        }
      });

      await t.test('pre-paint interruption cannot be undone by initialization', async () => {
        const { context, page } = await open({}, (page) => page.addInitScript(() => {
          const observer = new MutationObserver(() => {
            if (document.documentElement.dataset.opening === 'armed') {
              window.dispatchEvent(new Event('pointerdown'));
              observer.disconnect();
            }
          });
          observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['data-opening'] });
        }));
        try { await finished(page); }
        finally { await context.close(); }
      });

      await t.test('pending fonts cannot indefinitely delay the opening', async () => {
        const { context, page } = await open({}, (page) => page.addInitScript(() => {
          Object.defineProperty(document.fonts, 'ready', { get: () => new Promise(() => {}) });
        }));
        try {
          await page.waitForFunction(() => document.documentElement.dataset.opening === 'playing');
          await page.keyboard.press('Tab');
          await finished(page);
        } finally { await context.close(); }
      });

      await t.test('missing initialization resolves through the watchdog', async () => {
        const { context, page } = await open({}, (page) => page.addInitScript(() => {
          const listen = document.addEventListener.bind(document);
          document.addEventListener = (name, ...args) => {
            if (name !== 'DOMContentLoaded') listen(name, ...args);
          };
        }));
        try {
          await page.waitForFunction(() => document.documentElement.dataset.opening === 'resolved');
          await finished(page);
        } finally { await context.close(); }
      });

      await t.test('late copy metrics do not move the wordmark', async () => {
        const { context, page } = await open();
        try {
          await frame(page, 300);
          const before = await page.locator('h1').boundingBox();
          await page.locator('.pitch-intro-support .pitch-lede').evaluate((element) => {
            element.style.fontSize = '23px';
          });
          const after = await page.locator('h1').boundingBox();
          assert.equal(after.y, before.y);
          assert.equal(after.width, before.width);
        } finally { await context.close(); }
      });
    } finally { await browser.close(); }
  });
}

test('marketing brand assets render responsively with correct theme and MIME', { timeout: 60000 }, async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox'],
  } : {});
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await context.route('https://api.lythaus.co/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ fixture: 'synthetic-brand-qa' }),
  }));
  await context.route('https://challenges.cloudflare.com/**', route => route.abort());

  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.opening === 'resolved', null, { timeout: 5000 });
    assert.match(await page.title(), /For the living internet/u);
    assert.equal(await page.locator('.site-header .approved-brand-art').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('.site-header .brand').getAttribute('aria-label'), 'Lythaus home');
    const logo = await page.locator('.site-header .brand-symbol-slot').evaluate(element => {
      const slot = element.getBoundingClientRect();
      const svg = element.querySelector('svg');
      const art = svg.getBoundingClientRect();
      return {
        paths: svg.querySelectorAll('path').length,
        viewBox: svg.getAttribute('viewBox'),
        slotWidth: slot.width,
        slotHeight: slot.height,
        width: art.width,
        height: art.height,
      };
    });
    assert.equal(logo.paths, 2);
    assert.equal(logo.viewBox, '23.99000000 23.99000000 106.02000000 98.02000000');
    assert.ok(logo.slotWidth >= 39 && logo.slotWidth <= 41);
    assert.ok(logo.slotHeight >= 36 && logo.slotHeight <= 38);
    assert.ok(logo.width >= 39 && logo.width <= 41);
    assert.ok(logo.height >= 36 && logo.height <= 38);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

    const socialImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    assert.equal(new URL(socialImage).pathname, derivedBrand.web['social.png']);
    const assetTypes = await page.evaluate(async (urls) => Promise.all(urls.map(async url => {
      const response = await fetch(url);
      return { url, status: response.status, type: response.headers.get('content-type')?.split(';')[0] };
    })), [
      '/brand/lythaus-v1/lythaus-wordmark-white.5ba0451347e2.svg',
      derivedBrand.web['social.png'],
      derivedBrand.web['favicon.svg'],
      derivedBrand.web['favicon-96x96.png'],
      derivedBrand.web['favicon.ico'],
    ]);
    assert.deepEqual(assetTypes.map(asset => [asset.status, asset.type]), [
      [200, 'image/svg+xml'],
      [200, 'image/png'],
      [200, 'image/svg+xml'],
      [200, 'image/png'],
      [200, 'image/x-icon'],
    ]);
    for (const [alias, target] of Object.entries(derivedBrand.aliases.marketing)) {
      const response = await context.request.get(origin + alias, { maxRedirects: 0 });
      assert.equal(response.status(), 302);
      assert.equal(response.headers().location, target);
      const followed = await context.request.get(origin + alias);
      assert.equal(followed.status(), 200);
      assert.equal(new URL(followed.url()).pathname, target);
      const expected = derivedBrand.entries.find(entry => entry.path === 'apps/marketing-site/public' + target);
      assert.equal(createHash('sha256').update(await followed.body()).digest('hex'), expected.sha256);
    }
    // A bare /favicon.ico fetch fails without a network event in the local
    // browser fixture. Use a fresh query for browser-follow coverage; the exact
    // bare paths, redirect locations, final URLs and bytes are verified above.
    const aliases = await page.evaluate(async entries => Promise.all(entries.map(async ([alias, target]) => {
      const response = await fetch(alias + '?brand-qa=1').catch(error => { throw new Error(`${alias}: ${error.message}`); });
      return [response.status, response.redirected, new URL(response.url).pathname, target];
    })), Object.entries(derivedBrand.aliases.marketing));
    for (const [status, redirected, actual, expected] of aliases) {
      assert.equal(status, 200); assert.equal(redirected, true); assert.equal(actual, expected);
    }

    if (evidence) await page.screenshot({ path: path.join(evidence, 'marketing-brand-home-desktop.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileHome = await page.locator('.site-header .brand-symbol-slot').boundingBox();
    assert.ok(mobileHome.width >= 39 && mobileHome.height >= 36);
    assert.ok(await page.locator('.site-header .approved-brand-art').evaluate(element => element.getBoundingClientRect().height >= 36));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    if (evidence) await page.screenshot({ path: path.join(evidence, 'marketing-brand-home-mobile.png'), fullPage: false });
    await page.setViewportSize({ width: 320, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`${origin}/about`, { waitUntil: 'domcontentloaded' });
    const secondaryLogo = page.locator('.secondary-header .brand-symbol-slot');
    await secondaryLogo.waitFor();
    assert.equal(await secondaryLogo.locator('path').first().evaluate(element => getComputedStyle(element).fill), 'rgb(245, 243, 238)');
    assert.equal(await page.locator('.secondary-header .secondary-brand').getAttribute('aria-label'), 'Lythaus home');
    const secondaryBounds = await secondaryLogo.boundingBox();
    assert.ok(Math.abs(secondaryBounds.width - 40) < 1);
    assert.ok(Math.abs(secondaryBounds.height - 40 * 98.02 / 106.02) < 1);
    assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(36, 35, 33)');
    assert.equal(await page.locator('#secondary-appearance').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    if (evidence) await page.screenshot({ path: path.join(evidence, 'marketing-brand-secondary-mobile.png'), fullPage: false });
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(36, 35, 33)');
    const footerLogo = page.locator('.secondary-footer .secondary-brand-wordmark');
    assert.equal(await footerLogo.count(), 1);
    const footerBounds = await footerLogo.boundingBox();
    assert.ok(footerBounds.width > 0 && footerBounds.height > 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await Promise.all([
      page.waitForURL(url => url.pathname === '/'),
      page.locator('.secondary-header .secondary-brand').click(),
    ]);
    assert.equal(await page.locator('.site-header .brand').getAttribute('aria-label'), 'Lythaus home');
    assert.equal(await page.getByRole('heading', { level: 1, name: 'Lythaus', exact: true }).count(), 1);
    assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
  } finally {
    await context.close();
    await browser.close();
  }
});

for (const [engineName, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(`${engineName} static brand pixels survive unavailable JavaScript, masks and filters`, { timeout: 90000 }, async () => {
    const browser = await engine.launch();
    const dimensions = new Map();
    try {
      for (const [mode, javaScriptEnabled, disableEffects] of [
        ['normal', true, false],
        ['no-javascript', false, false],
        ['no-masks-or-filters', true, true],
        ['no-javascript-masks-or-filters', false, true],
      ]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', javaScriptEnabled });
        await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
        await context.route('**/__startup/flutter_bootstrap.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
        await context.route('**/__startup/release-update.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        if (disableEffects) await page.addInitScript(() => {
          window.SVGMaskElement = undefined;
          window.SVGFilterElement = undefined;
          const supports = CSS.supports.bind(CSS);
          CSS.supports = (...args) => args.some(value => /mask|filter/.test(value)) ? false : supports(...args);
        });
        try {
          for (const [route, selectors] of [
            ['/', [['.site-header .approved-brand-art','symbol'], ['.wordmark-fallback .approved-brand-art','wordmark']]],
            ['/about', [['.secondary-header .approved-brand-art','symbol'], ['.secondary-footer .approved-brand-art','wordmark']]],
            ['/__startup/', [[javaScriptEnabled ? '#lythaus-startup .approved-brand-art' : '.startup-noscript .approved-brand-art','wordmark']]],
          ]) {
            await page.goto(origin + route);
            if (disableEffects) await page.evaluate(() => {
              const style = document.createElement('style');
              style.textContent = '* { mask: none !important; -webkit-mask: none !important; filter: none !important; }';
              document.head.append(style);
            });
            assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(36, 35, 33)');
            for (const [index, [selector,kind]] of selectors.entries()) {
              const art = page.locator(selector);
              await art.waitFor({ state: 'visible' });
              assert.deepEqual(await art.locator('path').evaluateAll(paths => [...new Set(paths.map(element => getComputedStyle(element).fill))]), ['rgb(245, 243, 238)']);
              await art.scrollIntoViewIfNeeded();
              const bounds = await art.boundingBox();
              const clip = { x: Math.floor(bounds.x) - 1, y: Math.floor(bounds.y) - 1, width: Math.ceil(bounds.width) + 2, height: Math.ceil(bounds.height) + 2 };
              const png = await page.screenshot({ clip, ...(evidence ? { path: path.join(evidence, `${engineName}-brand-${mode}-${route.replaceAll('/', '') || 'home'}-${index}.png`) } : {}) });
              const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
              let textPixels = 0, whitePixels = 0;
              for (let i = 0; i < data.length; i += 4) {
                if (data[i] === 245 && data[i + 1] === 243 && data[i + 2] === 238) textPixels++;
                if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) whitePixels++;
              }
              assert.ok(textPixels > 8, `${mode} ${route} ${index} has visible nonblank approved text-colour artwork (${textPixels} text pixels, ${whitePixels} white pixels)`);
              assert.equal(whitePixels, 0, `${mode} ${route} cannot expose the original white asset fill`);
              const key = `${route}:${index}`;
              const pixels = { data, width: info.width, height: info.height };
              const detail={engineName,mode,route,index,kind,bounds,clip,normalDimensions:dimensions.get(key)};
              try{
                if(mode==='normal')dimensions.set(key,{width:bounds.width,height:bounds.height});
                else for(const axis of ['width','height'])assert.ok(Math.abs(bounds[axis]-dimensions.get(key)[axis])<0.01,`${axis} retains its normal layout size`);
                const expected=await staticBrandReference(page,kind,bounds,clip);
                if(evidence)await writeFile(path.join(evidence,`${engineName}-brand-${mode}-${route.replaceAll('/','')||'home'}-${index}-reference.png`),expected);
                const reference=await sharp(expected).ensureAlpha().raw().toBuffer({resolveWithObject:true});
                detail.fidelity=artworkFidelity(pixels,{data:reference.data,width:reference.info.width,height:reference.info.height},[36,35,33]);
              }catch(error){
                detail.error=error.message;
                throw new Error(`Static brand comparison ${JSON.stringify(detail)}: ${error.message}`,{cause:error});
              }finally{
                if(evidence)await writeFile(path.join(evidence,`${engineName}-brand-${mode}-${route.replaceAll('/','')||'home'}-${index}.json`),JSON.stringify(detail,null,2)+'\n');
              }
            }
            if (route === '/__startup/' && !javaScriptEnabled) {
              assert.equal(await page.locator('.startup-noscript').evaluate(element => getComputedStyle(element).color), 'rgb(245, 243, 238)');
              assert.equal(await page.getByText('Lythaus requires JavaScript to run. Please enable JavaScript in your browser.', { exact: true }).isVisible(), true);
            }
            if (evidence && mode === 'no-javascript-masks-or-filters') await page.screenshot({ path: path.join(evidence, `${engineName}-static-${route === '/' ? 'home' : route === '/about' ? 'about' : 'startup'}-no-js-masks-filters.png`) });
          }
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  });

  test(`${engineName} static brand references preserve fractional geometry and reject changed artwork`, { timeout: 60000 }, async () => {
    const browser=await engine.launch(),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
    const wordmark=await approvedStaticSource('wordmark'),symbol=await approvedStaticSource('symbol');
    const decode=async bytes=>{const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {data,width:info.width,height:info.height};};
    const capture=async(source,x,y,color='#F5F3EE',clipPath='none')=>{
      await page.setContent(`<style>body{margin:0;background:#242321}svg{position:absolute;left:${123+x}px;top:${354+y}px;width:144px;height:40px;clip-path:${clipPath}}svg,svg *{fill:${color}}</style>${source}`);
      const bounds=await page.locator('svg').boundingBox();
      const clip={x:Math.floor(bounds.x)-1,y:Math.floor(bounds.y)-1,width:Math.ceil(bounds.width)+2,height:Math.ceil(bounds.height)+2};
      const actual=await decode(await page.screenshot({clip}));
      const expected=await decode(await staticBrandReference(page,'wordmark',bounds,clip));
      return {actual,expected};
    };
    try{
      for(const [x,y] of [[0,0],[0,.5],[.5,0],[.5,.5]]){
        const {actual,expected}=await capture(wordmark,x,y);
        artworkFidelity(actual,expected,[36,35,33]);
      }
      for(const [name,source,color,clipPath] of [
        ['wrong symbol',symbol,'#F5F3EE','none'],
        ['wrong colour',wordmark,'#EFC58D','none'],
        ['blank','<svg xmlns="http://www.w3.org/2000/svg"></svg>','#F5F3EE','none'],
        ['clipped geometry',wordmark,'#F5F3EE','inset(0 35% 0 0)'],
      ]){
        const {actual,expected}=await capture(source,.5,.5,color,clipPath);
        assert.throws(()=>artworkFidelity(actual,expected,[36,35,33]),/Artwork fidelity/,name+' must not certify the approved wordmark');
      }
    }finally{await context.close();await browser.close();}
  });

  test(`${engineName} four-colour supporting pages and form states`, { timeout: 90000 }, async () => {
    const browser = await engine.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      for (const route of ['/about', '/features', '/pricing', '/privacy', '/terms', '/help', '/sign-in', '/signup', '/forgot-password']) {
        await page.goto(origin + route);
        assert.ok(await page.title());
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(36, 35, 33)');
        assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).color), 'rgb(245, 243, 238)');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, route);
      }
      await page.goto(origin + '/sign-in');
      const password = page.locator('input[type="password"]');
      await password.fill('synthetic-only');
      await page.getByRole('button', { name: 'Show password', exact: true }).click();
      assert.equal(await page.locator('input[name="password"]').getAttribute('type'), 'text');
      await page.getByRole('button', { name: 'Hide password', exact: true }).click();
      await password.focus();
      assert.match(await password.evaluate(element => getComputedStyle(element).outlineColor), /239, 197, 141/);
      const submit = page.locator('button[type="submit"]');
      assert.equal(await submit.evaluate(element => getComputedStyle(element).color), 'rgb(36, 35, 33)');
      await submit.evaluate(element => { element.disabled = true; });
      assert.equal(await submit.evaluate(element => getComputedStyle(element).opacity), '1');
      await page.locator('.auth-status').evaluate(element => {
        element.dataset.state = 'error'; element.textContent = 'Unable to sign in. Check your email and password.';
      });
      assert.ok(await page.getByText('Unable to sign in. Check your email and password.', { exact: true }).isVisible());
      assert.deepEqual(errors, []);
      if (evidence) await page.screenshot({ path: path.join(evidence, `${engineName}-signin-states-mobile.png`) });
    } finally { await context.close(); await browser.close(); }
  });
}
