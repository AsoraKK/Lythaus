import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { approvedMonochromeSvg } from '../../../design/approved-monochrome-svg.mjs';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const namedColours = Object.keys(require('color-name'));
const namedPaint = new RegExp(`(?:color|background|fill|stroke|shadow|border)[\\w-]*\\s*[:=]\\s*["']?(?:${namedColours.join('|')})\\b`, 'i');
function assertPaletteLiterals(source, file) {
  for (const match of source.matchAll(/#([\da-f]{3,8})\b/gi)) {
    assert.ok(palette.has(match[1].toUpperCase()), `${file}: ${match[0]}`);
  }
  assert.doesNotMatch(source, /(?:rgba?|hsla?|oklch|oklab|lch|lab|color)\(\s*\d/i, file);
  assert.doesNotMatch(source, namedPaint, file);
}

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const palette = new Set(['242321', '302E2B', 'F5F3EE', 'EFC58D']);
const tokens = JSON.parse(read('design/tokens.json'));
const files = (dir) => readdirSync(path.join(root, dir), { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);

test('marketing and Flutter semantic aliases resolve to exactly the approved four colours', () => {
  assert.deepEqual(tokens.color.light, tokens.color.dark);
  assert.deepEqual(new Set(Object.values(tokens.color.dark).map((value) => value.slice(1))), palette);
  const css = read('apps/marketing-site/src/styles/palette.css');
  const cssSources = Object.fromEntries([...css.matchAll(/--palette-([\w-]+): #(\w{6});/g)].map((m) => [m[1], `#${m[2]}`]));
  const cssAliases = Object.fromEntries([...css.matchAll(/--ds-([\w-]+): var\(--palette-([\w-]+)\);/g)].map((m) => [m[1], cssSources[m[2]]]));
  const dart = read('lib/design_system/tokens/semantic_colors.dart');
  const dartSources = Object.fromEntries([...dart.matchAll(/static const (\w+) = Color\(0xFF(\w{6})\);/g)].map((m) => [m[1], `#${m[2]}`]));
  const dartAliases = Object.fromEntries([...dart.matchAll(/'(\w+)': (\w+),/g)].map((m) => [m[1], dartSources[m[2]]]));
  assert.deepEqual(dartAliases, tokens.color.dark);
  for (const [key, value] of Object.entries(tokens.color.dark)) {
    assert.equal(cssAliases[key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)], value, key);
  }
});

test('authored UI colours cannot bypass the shared palette', () => {
  for (const file of [...files('apps/marketing-site/src'), ...files('web'), 'design/approved-monochrome-svg.mjs']) {
    if (!/\.(css|astro|html|m?js|ts)$/.test(file)) continue;
    const source = read(file);
    assertPaletteLiterals(source, file);
  }
  for (const file of files('lib').filter((file) => file.endsWith('.dart'))) {
    if (file.startsWith('lib/generated/') || file.endsWith('/approved_brand_paths.g.dart')) continue;
    const source = read(file);
    assert.doesNotMatch(source, /\bColors\.\w+|ColorScheme\.fromSeed|Color\.from(?:ARGB|RGBO)/, file);
    for (const match of source.matchAll(/Color\(0x[\da-f]{2}([\da-f]{6})\)/gi)) {
      assert.equal(file, 'lib/design_system/tokens/semantic_colors.dart', `${file} must use semantic tokens`);
      assert.ok(palette.has(match[1].toUpperCase()), `${file}: ${match[0]}`);
    }
  }
  for (const file of ['web/manifest.json', 'apps/marketing-site/public/site.webmanifest']) {
    const manifest = JSON.parse(read(file));
    assert.equal(manifest.background_color, '#242321');
    assert.equal(manifest.theme_color, '#242321');
  }
});

test('colour inventory rejects new literals, named colours and inline script styles', () => {
  for (const source of ['color: purple', 'background: orange', 'fill="rebeccapurple"', "node.style.color = '#ffffff'", 'color: rgb(255,0,0)', 'color: oklch(60% .2 40)']) {
    assert.throws(() => assertPaletteLiterals(source, 'negative fixture'), assert.AssertionError);
  }
});

test('one dark theme preserves readable copy, status semantics and static brand fallback', () => {
  const layout = read('apps/marketing-site/src/layouts/SecondaryLayout.astro');
  assert.doesNotMatch(layout, /secondary-appearance|prefers-color-scheme/);
  assert.match(read('lib/main.dart'), /themeMode: ThemeMode.dark/);
  assert.match(read('lib/design_system/theme/lyth_color_schemes.dart'), /static ColorScheme light\(\) => dark\(\)/);
  const opening = read('apps/marketing-site/src/components/OpeningWordmark.astro');
  assert.match(opening, /class="wordmark-fallback approved-brand" aria-hidden="true"><ApprovedBrand \/>/);
  assert.match(read('apps/marketing-site/src/scripts/home-opening.js'), /SVGMaskElement/);
  assert.doesNotMatch(read('apps/marketing-site/src/scripts/home-opening.js'), /enter\('\.pitch|opacity: 0.*translateY/);
  assert.doesNotMatch(read('apps/marketing-site/src/pages/index.astro'), />0[1-4]\s*\//);
  const snackbar = read('lib/design_system/components/lyth_snackbar.dart');
  for (const status of ['Success', 'Error', 'Warning', 'Information']) assert.ok(snackbar.includes(`status: '${status}'`));
  assert.match(snackbar, /semanticLabel: status/);
});

test('static monochrome representations preserve every approved outline and viewBox', () => {
  for (const filename of ['lythaus-wordmark-white.5ba0451347e2.svg', 'lythaus-symbol-white.8e20f9650ccb.svg']) {
    const original = read(`assets/brand/lythaus-v1/${filename}`).replace(/<\?xml[^>]*>\s*/, '').trim();
    const monochrome = approvedMonochromeSvg(original);
    const originalFill = original.match(/fill="([^"]*)"/)[1];
    assert.equal(monochrome
      .replace(' class="approved-brand-art" aria-hidden="true" focusable="false"', '')
      .replaceAll('fill="currentColor"', `fill="${originalFill}"`), original,
    'Only fill inheritance and decorative accessibility attributes may change; all geometry is byte-identical');
    assert.doesNotMatch(monochrome, /<image|<text|mask=|filter=|fill="#/);
  }
  const component = read('apps/marketing-site/src/components/ApprovedBrand.astro');
  assert.match(component, /lythaus-wordmark-white\.5ba0451347e2\.svg\?raw/);
  assert.match(component, /lythaus-symbol-white\.8e20f9650ccb\.svg\?raw/);
  assert.match(component, /approvedMonochromeSvg\(variant === 'symbol' \? symbol : wordmark\)/);
  const expected = approvedMonochromeSvg(read('assets/brand/lythaus-v1/lythaus-wordmark-white.5ba0451347e2.svg'));
  const startup = read('web/index.html');
  const copies = [...startup.matchAll(/<svg class="approved-brand-art"[\s\S]*?<\/svg>/g)];
  assert.equal(copies.length, 2, 'Startup and no-JavaScript pages both have the approved static wordmark');
  for (const [svg] of copies) assert.equal(svg.replace(/\n\s*/g, '\n'), expected);
  assert.doesNotMatch(read('web/startup-presentation.css'), /mask|filter/);
});

test('native launch and engine-window surfaces match the canonical canvas in both appearances', () => {
  const resource = read('android/app/src/main/res/values/ui_colors.xml');
  assert.equal(resource.match(/<color name="lythaus_canvas">([^<]+)<\/color>/)[1], tokens.color.dark.canvas);
  const surfaces = files('android/app/src/main/res').filter(file => /\/(?:styles|launch_background)\.xml$/.test(file));
  assert.equal(surfaces.length, 4);
  for (const file of surfaces) {
    const source = read(file);
    if (file.endsWith('/styles.xml')) {
      const backgrounds = [...source.matchAll(/<item name="android:(?:windowBackground|colorBackground)">([^<]+)<\/item>/g)];
      assert.equal(backgrounds.length, 4, file);
      for (const [, value] of backgrounds) assert.equal(value, '@color/lythaus_canvas', file);
    } else assert.match(source, /<item android:drawable="@color\/lythaus_canvas" \/>/);
    assert.doesNotMatch(source, /@android:color\/|\?android:colorBackground|#[\da-f]{3,8}/i, file);
  }
  const channels = tokens.color.dark.canvas.slice(1).match(/../g).map(value => parseInt(value, 16) / 255);
  for (const file of ['ios/Runner/Base.lproj/LaunchScreen.storyboard', 'ios/Runner/Base.lproj/Main.storyboard']) {
    const source = read(file);
    const backgrounds = [...source.matchAll(/<color key="backgroundColor" red="([^"]+)" green="([^"]+)" blue="([^"]+)" alpha="1" colorSpace="custom" customColorSpace="sRGB"\/>/g)];
    assert.equal(backgrounds.length, 1, file);
    assert.deepEqual(backgrounds[0].slice(1).map(Number), channels, file);
    assert.doesNotMatch(source, /key="backgroundColor" white=/, file);
  }
});

test('iOS launch placeholders remain fully transparent and introduce no artwork colour', async () => {
  for (const name of ['LaunchImage.png', 'LaunchImage@2x.png', 'LaunchImage@3x.png']) {
    const { data, info } = await sharp(path.join(root, 'ios/Runner/Assets.xcassets/LaunchImage.imageset', name))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height, info.channels], [1, 1, 4]);
    assert.equal(data[3], 0, name);
  }
});
