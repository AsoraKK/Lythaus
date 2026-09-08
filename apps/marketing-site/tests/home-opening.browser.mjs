import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { before, after, test } from 'node:test';
import { chromium, firefox, webkit } from 'playwright';

const dist = path.resolve(import.meta.dirname, '../dist');
const evidence = process.env.HOMEPAGE_QA_DIR;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
let server;
let origin;

before(async () => {
  await readFile(path.join(dist, 'index.html'));
  if (evidence) await mkdir(evidence, { recursive: true });
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let file = path.resolve(dist, '.' + pathname);
      if (file !== dist && !file.startsWith(dist + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      if (!path.extname(file)) file = path.join(file, 'index.html');
      const content = await readFile(file);
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
  assert.equal(state.mask, 'none', 'The finished word is not partially masked');
  assert.equal(state.sourceHidden, true, 'No residual light is visible');
  assert.equal(state.moving, 0, 'The final page is still');
  assert.equal(state.overflow, false, 'No horizontal overflow');
}

for (const [engineName, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(engineName + ' homepage opening', { timeout: 120000 }, async (t) => {
    const browser = await engine.launch();
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
            assert.equal(await page.locator('h1 svg').getAttribute('aria-hidden'), 'true');
            assert.equal(await page.locator('.pitch-section').count(), 10);
            await page.waitForFunction(() => document.documentElement.dataset.opening === 'resolved');
            const elapsed = await page.evaluate(() => window.openingTimes.resolved - window.openingTimes.playing);
            assert.ok(elapsed >= 1750, 'Document loading must not consume the opening timeline');
            await finished(page);
            assert.deepEqual(errors, []);
            if (evidence) await page.screenshot({ path: path.join(evidence, `${engineName}-${width}-final.png`) });
          } finally { await context.close(); }
        });
      }

      for (const [name, options, setup] of [
        ['no JavaScript', { javaScriptEnabled: false }],
        ['reduced motion', { reducedMotion: 'reduce' }],
        ['unavailable session storage', {}, (page) => page.addInitScript(() => {
          Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Unavailable'); } });
        })],
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

      await t.test('refresh and route return stay static; anchors remain usable', async () => {
        const { context, page } = await open();
        try {
          await page.keyboard.press('Tab');
          await page.reload({ waitUntil: 'domcontentloaded' });
          await finished(page);
          await page.goto(origin + '/privacy');
          await page.goBack({ waitUntil: 'domcontentloaded' });
          await finished(page);
          await page.getByRole('link', { name: 'Join the private beta', exact: true }).click();
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

      await t.test('source stays central while one beam position drives exposure and copy waits', async () => {
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
                energy: Number(getComputedStyle(document.querySelector('[data-light-energy]')).opacity),
                overflow: document.documentElement.scrollWidth > innerWidth,
              }));
              assert.ok(state.positions.every((x) => Math.abs(x - state.positions[0]) < 0.01));
              assert.ok(Math.abs(state.source.x - state.source.centre) < 0.1, 'The point remains at the centre throughout');
              assert.ok(Math.abs(state.projection.origin + state.projection.extent - state.positions[0]) < 0.1, 'The beam reaches from its fixed origin to the illumination front');
              assert.ok(state.positions[0] >= previousX, 'The beam never reverses');
              previousX = state.positions[0];
              if (at < 1420) assert.equal(state.copy, 0);
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
