import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import sharp from 'sharp';
import { buildDerivedAssets, coverage, icoFrames, palettePng } from '../derive-four-colour-brand.mjs';

const read = file => readFileSync(file);
const manifest = JSON.parse(read('docs/brand/four-colour/manifest.json'));
const tokens = JSON.parse(read('design/tokens.json')).color.dark;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rgb = value => value.slice(1).match(/../g).map(value => parseInt(value, 16));
const background = rgb(tokens.canvas), foreground = rgb(tokens.accent);

test('every derived export is reproducible from unchanged approved sources', async () => {
  const { outputs } = await buildDerivedAssets();
  for (const [file, expected] of outputs) assert.deepEqual(read(file), expected, file);
  assert.deepEqual(manifest.palette, { canvas: tokens.canvas, surface: tokens.surface, text: tokens.text, accent: tokens.accent });
  for (const entry of manifest.entries) {
    assert.notEqual(entry.source, entry.path);
    assert.equal(sha(read(entry.source)), entry.source_sha256, entry.source);
    assert.equal(sha(read(entry.path)), entry.sha256, entry.path);
  }
});

async function assertRasterGeometry(source, derived, name) {
  const originalMetadata = await sharp(source).metadata(), derivedMetadata = await sharp(derived).metadata();
  assert.deepEqual([derivedMetadata.width, derivedMetadata.height, derivedMetadata.hasAlpha],
    [originalMetadata.width, originalMetadata.height, originalMetadata.hasAlpha], name);
  const original = await sharp(source).ensureAlpha().raw().toBuffer();
  const actual = await sharp(derived).ensureAlpha().raw().toBuffer();
  for (let offset = 0; offset < actual.length; offset += 4) {
    assert.equal(actual[offset + 3], original[offset + 3], `${name}: alpha ${offset}`);
    const before = coverage(original.subarray(offset, offset + 3));
    const after = coverage(actual.subarray(offset, offset + 3), background, foreground);
    assert.ok(Math.abs(before - after) < 0.004, `${name}: outline coverage ${offset}`);
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(Math.abs(actual[offset + channel] - Math.round(background[channel] + after * (foreground[channel] - background[channel]))) <= 1,
        `${name}: extra palette colour at ${offset}`);
    }
  }
}

test('raster and ICO exports retain dimensions, alpha and pixel-position outline coverage', async () => {
  const checked = new Set();
  for (const entry of manifest.entries) {
    if (checked.has(entry.sha256)) continue;
    checked.add(entry.sha256);
    if (entry.path.endsWith('.png')) await assertRasterGeometry(read(entry.source), read(entry.path), entry.path);
    if (entry.path.endsWith('.ico')) {
      const source = icoFrames(read(entry.source)), derived = icoFrames(read(entry.path));
      assert.deepEqual(derived.map(frame => [frame.width, frame.height]), source.map(frame => [frame.width, frame.height]));
      for (const [index, frame] of derived.entries()) {
        assert.deepEqual(frame.entry.subarray(0, 8), source[index].entry.subarray(0, 8), 'ICO frame dimensions, palette count, planes and depth stay unchanged');
        await assertRasterGeometry(source[index].png, frame.png, entry.path + ':' + index);
      }
    }
  }
});

test('partially transparent two-tone pixels preserve both colours, edges and alpha', async () => {
  const original = Buffer.from([17, 17, 15, 128, 242, 201, 141, 200, 130, 109, 78, 90, 17, 17, 15, 0]);
  const source = await sharp(original, { raw: { width: 4, height: 1, channels: 4 } }).png().toBuffer();
  const result = await palettePng(source);
  await assertRasterGeometry(source, result, 'synthetic transparent two-tone fixture');
  const pixels = await sharp(result).raw().toBuffer();
  assert.deepEqual([...pixels.subarray(0, 4)], [...background, 128]);
  assert.deepEqual([...pixels.subarray(4, 8)], [...foreground, 200]);
  assert.ok(pixels[8] > background[0] && pixels[8] < foreground[0]);
  assert.equal(pixels[15], 0);
});

test('raster verification rejects blank, displaced and off-palette artwork', async () => {
  const encode = pixels => sharp(Buffer.from(pixels.flat()), { raw: { width: 3, height: 1, channels: 3 } }).png().toBuffer();
  const source = await encode([[17, 17, 15], [242, 201, 141], [17, 17, 15]]);
  for (const pixels of [
    [background, background, background],
    [background, background, foreground],
    [background, [0, 0, 255], background],
  ]) await assert.rejects(assertRasterGeometry(source, await encode(pixels), 'negative fixture'), assert.AssertionError);
});

test('vector exports change colour attributes without changing approved geometry', () => {
  for (const entry of manifest.entries.filter(entry => /\.(?:svg|xml)$/.test(entry.path) && entry.role !== 'android-adaptive')) {
    const stripPaint = source => source.replace(/#[\da-f]{6,8}/gi, 'PALETTE');
    assert.equal(stripPaint(read(entry.path).toString()), stripPaint(read(entry.source).toString()), entry.path);
    for (const [, color] of read(entry.path).toString().matchAll(/#([\da-f]{6,8})/gi)) {
      const value = '#' + color.slice(-6).toUpperCase();
      assert.ok(Object.values(manifest.palette).includes(value), entry.path + ': ' + value);
    }
  }
});

test('active native launcher mappings select derived resources and preserve original catalogs', () => {
  for (const platform of ['ios', 'macos']) {
    const root = `${platform}/Runner/Assets.xcassets/`;
    assert.deepEqual(read(root + 'AppIconFourColour.appiconset/Contents.json'), read(root + 'AppIcon.appiconset/Contents.json'));
    const project = read(`${platform}/Runner.xcodeproj/project.pbxproj`).toString();
    assert.equal((project.match(/ASSETCATALOG_COMPILER_APPICON_NAME = AppIconFourColour;/g) ?? []).length, 3);
    assert.doesNotMatch(project, /ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;/);
    for (const image of JSON.parse(read(root + 'AppIconFourColour.appiconset/Contents.json')).images) {
      const entry = manifest.entries.find(entry => entry.path === root + 'AppIconFourColour.appiconset/' + image.filename);
      assert.ok(entry, image.filename);
      assert.equal(sha(read(entry.path)), entry.sha256);
    }
  }
  assert.match(read('android/app/src/main/AndroidManifest.xml').toString(), /android:icon="@mipmap\/ic_launcher_four_colour"/);
  for (const version of [26, 33]) {
    const xml = read(`android/app/src/main/res/mipmap-anydpi-v${version}/ic_launcher_four_colour.xml`).toString();
    assert.match(xml, /@color\/lythaus_canvas/);
    assert.match(xml, /@drawable\/ic_launcher_four_colour_foreground/);
    assert.equal(xml.includes('@drawable/ic_launcher_four_colour_monochrome'), version === 33);
  }
  assert.match(read('windows/runner/Runner.rc').toString(), /resources\\\\app_icon_four_colour\.ico/);
});

test('legacy icon redirects are exact temporary aliases and preserve navigation rules', () => {
  const expectedAliases = {
    web: ['/favicon.ico', '/favicon.png', '/apple-touch-icon.png', '/icons/Icon-192.png', '/icons/Icon-512.png', '/icons/Icon-maskable-192.png', '/icons/Icon-maskable-512.png'],
    marketing: ['/favicon.ico', '/favicon.png', '/apple-touch-icon.png', '/icons/lythaus-192.png', '/icons/lythaus-512.png', '/icons/lythaus-512-maskable.png'],
  };
  for (const [root, group, original] of [['web', 'web', '/*    /index.html   200\n'], ['apps/marketing-site/public', 'marketing', '/invite/* /invite/index.html 200\n']]) {
    assert.deepEqual(Object.keys(manifest.aliases[group]), expectedAliases[group]);
    const aliases = Object.entries(manifest.aliases[group]).map(([from, to]) => `${from} ${to} 302\n`).join('');
    assert.equal(read(root + '/_redirects').toString(), aliases + '\n' + original);
    for (const target of Object.values(manifest.aliases[group])) assert.ok(manifest.entries.some(entry => entry.path === root + target));
    const headers = read(root + '/_headers').toString();
    for (const family of ['icons', 'brand']) assert.ok(headers.includes(`/${family}/lythaus-four-colour/*\n  Cache-Control: public, max-age=31536000, immutable`));
  }
});

test('consumer and marketing metadata select only the new icon and social exports', () => {
  for (const file of ['web/index.html', 'apps/marketing-site/src/layouts/BaseLayout.astro', 'apps/marketing-site/src/layouts/SecondaryLayout.astro']) {
    const source = read(file).toString();
    for (const key of ['favicon.ico', 'favicon.svg', 'favicon-96x96.png', 'apple-touch-icon.png', 'social.png']) assert.ok(source.includes(manifest.web[key].slice(1)), file + ': ' + key);
    assert.doesNotMatch(source, /icons\/lythaus-v1|lythaus-social-card-1200x630\.78f698/);
  }
  for (const file of ['web/manifest.json', 'apps/marketing-site/public/site.webmanifest']) {
    const data = JSON.parse(read(file));
    assert.deepEqual(data.icons.map(icon => '/' + icon.src.replace(/^\//, '')), ['pwa-icon-192x192.png', 'pwa-icon-512x512.png', 'pwa-maskable-192x192.png', 'pwa-maskable-512x512.png'].map(key => manifest.web[key]));
    assert.deepEqual(data.icons.map(icon => icon.purpose), ['any', 'any', 'maskable', 'maskable']);
  }
});
