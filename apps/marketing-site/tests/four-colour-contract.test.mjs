import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

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
  for (const file of [...files('apps/marketing-site/src'), ...files('web')]) {
    if (!/\.(css|astro|html|js|ts)$/.test(file)) continue;
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
  assert.match(opening, /class="wordmark-fallback approved-brand"[\s\S]*?<img src="\/brand\/lythaus-v1\/lythaus-wordmark-white\.5ba0451347e2\.svg"/);
  assert.match(read('apps/marketing-site/src/scripts/home-opening.js'), /SVGMaskElement/);
  assert.doesNotMatch(read('apps/marketing-site/src/scripts/home-opening.js'), /enter\('\.pitch|opacity: 0.*translateY/);
  assert.doesNotMatch(read('apps/marketing-site/src/pages/index.astro'), />0[1-4]\s*\//);
  const snackbar = read('lib/design_system/components/lyth_snackbar.dart');
  for (const status of ['Success', 'Error', 'Warning', 'Information']) assert.ok(snackbar.includes(`status: '${status}'`));
  assert.match(snackbar, /semanticLabel: status/);
});
