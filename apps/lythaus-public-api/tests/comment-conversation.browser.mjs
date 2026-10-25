import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright';

const target = new URL(process.env.COMMENT_PREVIEW_URL ?? 'http://127.0.0.1:5188/');
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname), 'Comment browser tests require a local synthetic preview');
const screenshots = process.env.COMMENT_SCREENSHOTS_DIR ?? 'docs/evidence/comment-propagation-20261023/screenshots';

test('local Flutter web conversations support exact context, chronological replies, sort switching and mobile accessibility', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const errors = [], external = [];
  await mkdir(screenshots, { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== target.origin) {
        external.push(route.request().url()); return route.abort();
      }
      return route.continue();
    });
    await context.route(target.origin + '/assets/FontManifest.json', async route => {
      const response = await route.fetch();
      const manifest = await response.json();
      const regular = manifest.find(family => family.family === 'Manrope')?.fonts
        .find(font => font.asset.endsWith('Manrope-Regular.ttf'));
      assert.ok(regular, 'Preview requires the bundled Manrope regular font');
      if (!manifest.some(family => family.family === 'Roboto')) {
        manifest.push({ family: 'Roboto', fonts: [regular] });
      }
      await route.fulfill({ response, json: manifest });
    });
    const page = await context.newPage();
    const painted = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    page.on('pageerror', error => errors.push(error.message));
    const open = async suffix => {
      await page.goto(target.toString() + suffix);
      await page.waitForSelector('flt-semantics-placeholder');
      await page.locator('flt-semantics-placeholder').evaluate(node => node.click());
      await page.getByRole('button', { name: 'View 2 replies', exact: true }).waitFor();
      await painted();
    };
    await open('');
    assert.equal(await page.getByRole('checkbox', { name: 'Newest', exact: true }).getAttribute('aria-checked'), 'true');
    assert.equal(await page.getByRole('checkbox', { name: 'Most relevant', exact: true }).getAttribute('aria-disabled'), 'true');
    await page.screenshot({ path: screenshots + '/comments-browser-mobile-collapsed.png' });
    await page.getByRole('button', { name: 'View 2 replies', exact: true }).click();
    await page.getByRole('button', { name: 'Check for new replies', exact: true }).waitFor();
    await painted();
    const replyContext = page.getByRole('button', { name: 'Replying to Theo', exact: true });
    assert.equal(await replyContext.count(), 1);
    const rootContext = page.getByRole('button', { name: 'Replying to Nandi', exact: true });
    assert.ok((await rootContext.boundingBox()).y < (await replyContext.boundingBox()).y);
    await replyContext.scrollIntoViewIfNeeded();
    await replyContext.click();
    await page.waitForTimeout(250);
    await painted();
    assert.equal(page.url(), target.toString(), 'In-page reply context must preserve the current route and draft');
    const revealed = await rootContext.boundingBox();
    assert.ok(revealed.y > 120 && revealed.y < 650, 'The exact Theo parent is revealed inside the reading area');
    await page.screenshot({ path: screenshots + '/comments-browser-mobile-expanded.png' });
    await page.getByRole('checkbox', { name: 'Oldest', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role="checkbox"][aria-label="Oldest"]')?.getAttribute('aria-checked') === 'true');
    const older = page.locator('[aria-label*="Clearer signs at the station"]');
    await older.first().waitFor();
    await painted();
    assert.ok((await older.first().boundingBox()).y < 400);
    await page.screenshot({ path: screenshots + '/comments-browser-mobile-oldest.png' });
    await page.setViewportSize({ width: 320, height: 900 });
    await open('?scale=1.6');
    await page.getByRole('button', { name: 'View 2 replies', exact: true }).click();
    await painted();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: screenshots + '/comments-browser-narrow-large-text.png' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await open('?theme=dark');
    await page.getByRole('button', { name: 'View 2 replies', exact: true }).click();
    await painted();
    await page.screenshot({ path: screenshots + '/comments-browser-desktop-dark.png' });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await browser.close(); }
});
