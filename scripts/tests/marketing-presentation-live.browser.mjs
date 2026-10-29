import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium, firefox, webkit } from 'playwright';
import sharp from 'sharp';

const origin = process.env.MARKETING_LIVE_ORIGIN;
const evidence = process.env.MARKETING_LIVE_QA_DIR;
if (!['https://lythaus.co', 'https://www.lythaus.co'].includes(origin)) throw new Error('canonical_marketing_origin_required');
if (evidence) await mkdir(evidence, { recursive: true });

async function pixels(page) {
  const box = await page.locator('.pitch-wordmark').boundingBox();
  assert.ok(box?.width > 0 && box.height > 0);
  const png = await page.screenshot({ clip: box });
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = 0, right = 0, amber = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels, [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r > 180 && g > 180 && b > 180) { if (x < info.width / 2) left++; else right++; }
    if (r > 65 && r - g >= 8 && g - b >= 8) amber++;
  }
  return { png, left, right, amber };
}

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(`${name}: live presentation and safe form behavior`, { timeout: 120000 }, async () => {
    const browser = await engine.launch();
    const open = async (options = {}, form = false, setup = null) => {
      const context = await browser.newContext({ serviceWorkers: 'block', ...options });
      const calls = [];
      await context.route('https://api.lythaus.co/**', async route => {
        const request = route.request(); calls.push({ url: request.url(), method: request.method(), body: request.postData() });
        if (form && request.method() === 'POST' && new URL(request.url()).pathname === '/api/waitlist')
          await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        else await route.abort();
      });
      await context.route('https://challenges.cloudflare.com/**', route => route.abort());
      await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      if (form) await page.addInitScript(() => {
        let callback;
        window.turnstile = { render(_element, options) { callback = options.callback; return 'synthetic-widget'; },
          execute() { callback('synthetic-turnstile-token'); }, reset() {} };
      });
      if (setup) await page.addInitScript(setup);
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      return { context, page, errors, calls };
    };
    try {
      for (const width of [1440, 390]) {
        const frames = []; let lit;
        for (const [index, time] of [0, 660, 1250].entries()) {
          const { context, page, errors } = await open({ viewport: { width, height: width === 390 ? 844 : 900 } });
          try {
            await page.waitForFunction(() => document.documentElement.dataset.opening === 'playing', null, { timeout: 10000 });
            await page.evaluate(currentTime => { for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = currentTime; } }, time);
            const visual = await page.evaluate(() => {
              const word = document.querySelector('.pitch-wordmark'), bounds = word.getBoundingClientRect(), parent = word.parentElement.getBoundingClientRect();
              const scene = document.querySelector('.wordmark-scene');
              return { width: bounds.width, expectedWidth: Math.min(parent.width, 980), overflow: document.documentElement.scrollWidth > innerWidth,
                state: document.documentElement.dataset.opening, scene: getComputedStyle(scene).visibility,
                fallback: getComputedStyle(document.querySelector('.wordmark-fallback')).visibility,
                exposure: document.querySelector('.wordmark-reveal').getAttribute('mask'),
                intensity: Number.parseFloat(getComputedStyle(scene).getPropertyValue('--light-intensity')),
                bloom: Number.parseFloat(getComputedStyle(scene).getPropertyValue('--light-bloom-width')) };
            });
            assert.ok(Math.abs(visual.width - visual.expectedWidth) < 0.1); assert.equal(visual.overflow, false);
            assert.equal(visual.state, 'playing'); assert.equal(visual.scene, 'visible'); assert.equal(visual.fallback, 'hidden');
            assert.equal(visual.exposure, 'url(#wordmark-exposure)'); assert.ok(visual.intensity >= 1 && visual.bloom >= 76);
            assert.equal(await page.locator('.pitch-section-meta, .home-eyebrow').count(), 0);
            if (index === 1) lit = await pixels(page);
            await page.locator('.wordmark-optics').evaluate(element => element.style.setProperty('visibility', 'hidden', 'important'));
            frames.push(await pixels(page)); assert.deepEqual(errors, []);
            if (evidence) await writeFile(path.join(evidence, `${name}-${width}-${time}.png`), frames.at(-1).png);
          } finally { await context.close(); }
        }
        const [before, middle, after] = frames;
        assert.ok(after.left > 30 && after.right > 30);
        assert.ok(before.left + before.right < Math.max(12, (after.left + after.right) * 0.02));
        assert.ok(middle.left > after.left * 0.3 && middle.right < Math.max(12, after.right * 0.12));
        assert.ok(lit.amber > middle.amber + (width === 390 ? 20 : 100));
        if (evidence) await writeFile(path.join(evidence, `${name}-${width}-beam.png`), lit.png);
      }
      for (const options of [{ javaScriptEnabled: false }, { reducedMotion: 'reduce' }]) {
        const { context, page } = await open({ viewport: { width: 390, height: 844 }, ...options });
        try {
          assert.equal(await page.locator('.wordmark-fallback').evaluate(element => getComputedStyle(element).visibility), 'visible');
          assert.equal(await page.getByRole('heading', { level: 1, name: 'Lythaus', exact: true }).count(), 1);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        } finally { await context.close(); }
      }
      for (const [setup, waitForResolved] of [
        [() => { window.SVGMaskElement = undefined; }, false],
        [() => { Element.prototype.animate = () => { throw new Error('Initialization failed'); }; }, true],
      ]) {
        const { context, page, errors } = await open({ viewport: { width: 390, height: 844 } }, false, setup);
        try {
          if (waitForResolved) await page.waitForFunction(() => document.documentElement.dataset.opening === 'resolved');
          assert.equal(await page.locator('.wordmark-fallback').evaluate(element => getComputedStyle(element).visibility), 'visible');
          assert.equal(await page.getByRole('heading', { level: 1, name: 'Lythaus', exact: true }).count(), 1);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
      const { context, page, calls, errors } = await open({ viewport: { width: 390, height: 844 } }, true);
      try {
        const form = page.locator('[data-waitlist]');
        assert.match(await form.getAttribute('data-turnstile-site-key'), /^[A-Za-z0-9_-]{20,}$/);
        assert.equal(await form.getAttribute('data-api-base-url'), 'https://api.lythaus.co');
        await page.locator('#waitlist-email').fill('synthetic@example.invalid');
        await page.locator('[data-waitlist-submit]').click();
        await page.locator('[data-waitlist-success]').waitFor({ state: 'visible' });
        assert.equal(calls.length, 1); assert.equal(calls[0].method, 'POST');
        assert.deepEqual(JSON.parse(calls[0].body), { email: 'synthetic@example.invalid', turnstileToken: 'synthetic-turnstile-token',
          consentVersion: 'waitlist-v1', source: 'lythaus.co' });
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    } finally { await browser.close(); }
  });
}
