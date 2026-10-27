import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {chromium} from 'playwright';
import {installFlutterEngineFonts} from './flutter-engine-font-fixture.mjs';

const root = path.resolve(process.env.MOBILE_UX_BUILD ?? 'build/mobile-ux-after');
const output = path.resolve(process.env.MOBILE_UX_EVIDENCE ?? 'build/mobile-ux-evidence');
const source = process.env.MOBILE_UX_SOURCE;
const baseline = process.env.MOBILE_UX_BASELINE === '1';
assert.match(source ?? '', /^[a-f0-9]{40}$/);
const {PNG} = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const tokens = JSON.parse(await readFile('design/tokens.json', 'utf8'));
const types = {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml'};
const server = createServer(async (request, response) => {
  try {
    let file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    assert.ok(file === root || file.startsWith(root + path.sep));
    if (!path.extname(file)) file = path.join(file, 'index.html');
    const bytes = await readFile(file);
    response.writeHead(200, {'Content-Type': types[path.extname(file)] ?? 'application/octet-stream'});
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir(output, {recursive: true});
const browser = await chromium.launch({headless: true});
const results = [];
let passed = false;
const bundleSha256 = createHash('sha256').update(await readFile(path.join(root, 'main.dart.js'))).digest('hex');
async function capture(page, name, metadata) {
  const bytes = await page.screenshot({path: path.join(output, name + '.png')});
  results.push({name, ...metadata, sha256: createHash('sha256').update(bytes).digest('hex')});
  return bytes;
}
try {
  for (const {width, height, scale, theme} of [
    {width: 390, height: 844, scale: 1, theme: 'light'},
    {width: 320, height: 568, scale: 2, theme: 'light'},
    {width: 390, height: 844, scale: 1, theme: 'dark'},
  ]) {
    const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1, locale: 'en-US', reducedMotion: 'reduce', serviceWorkers: 'block'});
    const errors = [], blocked = [];
    await context.route('**/*', route => {
      if (route.request().url().startsWith(origin + '/')) return route.continue();
      blocked.push(route.request().url());
      return route.abort();
    });
    await installFlutterEngineFonts(context);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const metadata = {source, bundleSha256, build: path.basename(root), width, height, textScale: scale, theme, renderer: 'Flutter CanvasKit / Chromium', synthetic: true};
    const name = `${theme}-${width}x${height}-${scale}x`;
    await page.goto(`${origin}/?screen=login&theme=${theme}&scale=${scale}`);
    await page.locator('flt-glass-pane').waitFor({state: 'attached'});
    await page.locator('flt-semantics-placeholder').evaluate(node => node.click());
    await page.getByRole('textbox', {name: 'Email', exact: true}).waitFor();
    await page.waitForTimeout(400);
    await capture(page, `login-${name}`, metadata);
    const email = page.getByRole('textbox', {name: 'Email', exact: true});
    await email.click();
    await page.waitForTimeout(200);
    await email.pressSequentially('draft@example.invalid', {delay: 20});
    const password = page.getByRole('textbox', {name: 'Password', exact: true});
    await password.click();
    await page.waitForTimeout(200);
    await password.pressSequentially('Synthetic draft only', {delay: 20});
    await page.waitForTimeout(250);
    assert.equal(await password.inputValue(), 'Synthetic draft only');
    await page.getByRole('button', {name: /Verification & invites/}).click();
    await page.getByRole('button', {name: 'Redeem invite', exact: true}).click();
    await page.getByRole('textbox', {name: /Invite code/}).waitFor();
    await page.waitForTimeout(300);
    await capture(page, `invite-${name}`, metadata);
    const redeem = page.getByRole('button', {name: 'Redeem invite', exact: true});
    results.at(-1).redeemBox = await redeem.boundingBox();
    if (!baseline) assert.equal(await page.getByRole('img', {name: 'Lythaus', exact: true}).count(), 1);
    if (width === 320) {
      await page.setViewportSize({width, height: 340});
      await page.waitForTimeout(250);
      await page.mouse.move(width / 2, 220);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(250);
      const bytes = await capture(page, `invite-constrained-${name}`, {...metadata, height: 340, note: 'Reduced browser viewport; native IME covered by widget test', redeemBox: await redeem.boundingBox()});
      if (!baseline) {
        const action = await redeem.boundingBox();
        assert.ok(action.y >= 0 && action.y + action.height <= 340 && action.height >= 48);
        const png = PNG.sync.read(bytes);
        const expected = tokens.color[theme].accent.slice(1).match(/../g).map(value => parseInt(value, 16));
        let painted = 0, total = 0;
        for (let y = Math.ceil(action.y + 4); y < action.y + action.height - 4; y++) {
          for (let x = Math.ceil(action.x + 4); x < action.x + action.width - 4; x++) {
            const offset = (y * png.width + x) * 4;
            if (expected.every((channel, index) => Math.abs(channel - png.data[offset + index]) <= 8)) painted++;
            total++;
          }
        }
        results.at(-1).paintedActionFraction = painted / total;
        assert.ok(painted / total > 0.5, 'The visible action must paint in the screenshot, not only move in the accessibility DOM');
      }
      await page.setViewportSize({width, height});
    }
    if (!baseline) {
      await redeem.click();
      await page.locator('flt-semantics').getByText('Invite code is required.', {exact: true}).waitFor();
      await page.waitForTimeout(350);
      if (width === 320) {
        await page.mouse.move(width / 2, 400);
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(250);
      }
      await capture(page, `invite-error-${name}`, metadata);
    }
    await page.getByRole('button', {name: 'Back', exact: true}).click();
    await page.getByRole('textbox', {name: 'Email', exact: true}).click();
    await page.waitForTimeout(250);
    assert.equal(await page.getByRole('textbox', {name: 'Email', exact: true}).inputValue(), 'draft@example.invalid');
    await page.getByRole('textbox', {name: 'Password', exact: true}).click();
    await page.waitForTimeout(250);
    assert.equal(await page.getByRole('textbox', {name: 'Password', exact: true}).inputValue(), 'Synthetic draft only');
    assert.deepEqual(errors, []);
    assert.deepEqual(blocked, []);
    await context.close();
  }
  passed = true;
} finally {
  await writeFile(path.join(output, 'captures.json'), JSON.stringify({source, baseline, passed, browser: browser.version(), results}, null, 2) + '\n');
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log(`Captured ${results.length} local mobile screens; Back preserves the sign-in draft in all three viewports.`);
