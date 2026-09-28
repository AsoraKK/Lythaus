import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const baselineSha = '8e3b3ebad2f846e61db2bfe819376723da7e9863';
const baseline = {
  "forgot-password.astro": {
    "kind": "scripts",
    "sha256": "5f08a258ff7b8a898a7dd7ad0c07ba45c78e01053abf49376a8dd16667679ca8"
  },
  "resend-verification.astro": {
    "kind": "scripts",
    "sha256": "1493c28bdd356cdad9f41eef420a650b396bb76ae333af1fdf544cc76fe3eb86"
  },
  "reset-password.astro": {
    "kind": "scripts",
    "sha256": "4ec114cbb9472e1b14171a187f20a16a2ef7da5cfc2ea67ed60bb6bb8a9413bf"
  },
  "sign-in.astro": {
    "kind": "scripts",
    "sha256": "07f9b00f3d9dff1dbc2da4d0b68fd5c8f2c7a9b9f0c3f26dadb459f1b626463f"
  },
  "signup.astro": {
    "kind": "scripts",
    "sha256": "15e4232c4fd6ece262f3d028b247d5da671dc3e4ab246e936ee1a38db669a4ec"
  },
  "verify-email.astro": {
    "kind": "scripts",
    "sha256": "2befeaa99368aa8c5b0e08a85b304c4f86e7ffa61ca0e4976d3313d0326be7fa"
  },
  "invite/index.astro": {
    "kind": "scripts",
    "sha256": "a1ad00c505031ec35ca3e972f29aa80d264dd53f6127a355b0dd2fe3a2d8525c"
  },
  "privacy/index.astro": {
    "kind": "legal",
    "sha256": "b61bd5e390107e7b44fbd27b14682d5798948a3e3301450e32d9eef5cd7ea5c1"
  },
  "terms/index.astro": {
    "kind": "legal",
    "sha256": "1e6cf582c093f51651668276ae2b409af8eb337d73eb2a8bde6465082d622d15"
  },
  "guidelines/index.astro": {
    "kind": "legal",
    "sha256": "8669b6087c600b1db858b23c3d6a73d56f0536cf6129d7585cf42155e99866ce"
  }
};

for (const [file, expected] of Object.entries(baseline)) {
  test(`${file} preserves ${expected.kind} from ${baselineSha}`, () => {
    const source = read(`src/pages/${file}`);
    const content = expected.kind === 'scripts'
      ? [...source.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map((match) => match[0]).join('\n')
      : source.match(/<section\b[\s\S]*?<\/section>/)[0].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    assert.equal(createHash('sha256').update(content).digest('hex'), expected.sha256);
  });
}

test('every secondary route opts into its isolated layout without local styling', () => {
  const files = fs.readdirSync(path.join(root, 'src/pages'), { recursive: true })
    .filter((file) => file.endsWith('.astro') && file !== 'index.astro');
  assert.equal(files.length, 18);
  for (const file of files) {
    const source = read(`src/pages/${file}`);
    assert.match(source, /import SecondaryLayout from/);
    assert.doesNotMatch(source, /BaseLayout|<style\b/);
  }
  const layout = read('src/layouts/SecondaryLayout.astro');
  assert.match(layout, /design\/tokens\.json/);
  assert.doesNotMatch(layout, /global\.css|home-opening|home-pitch|fonts\.google/);
  assert.match(layout, /prefers-color-scheme:dark/);
  assert.match(layout, /lythaus-secondary-appearance/);
  assert.match(layout, /no-referrer/);
  assert.match(layout, /noindex, nofollow, noarchive/);
});

test('contact has a real mail route and no unconnected submission form', () => {
  const contact = read('src/pages/contact/index.astro');
  assert.doesNotMatch(contact, /<form|<textarea|Send message/);
  assert.match(contact, /mailto:support@lythaus\.app/);
  assert.match(read('src/pages/terms/index.astro'), /mailto:support@lythaus\.app/);
});

test('article contents refer to real stable section IDs', () => {
  for (const file of ['privacy', 'terms', 'guidelines']) {
    const source = read(`src/pages/${file}/index.astro`);
    const sections = JSON.parse(source.match(/const articleSections = ([\s\S]*?);/)[1]);
    assert.ok(sections.length > 2);
    for (const section of sections) assert.ok(source.includes(`id="${section.id}"`));
  }
});

test('semantic theme pairs meet text and essential control contrast', () => {
  const tokens = JSON.parse(fs.readFileSync(path.resolve(root, '../../design/tokens.json'), 'utf8'));
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const contrast = (a, b) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
    return (values[1] + 0.05) / (values[0] + 0.05);
  };
  assert.equal(contrast('#000000', '#FFFFFF'), 21);
  assert.equal(contrast('#777777', '#777777'), 1);
  for (const [name, colors] of Object.entries(tokens.color)) {
    for (const background of ['canvas', 'surface', 'surfaceRaised']) {
      for (const text of ['text', 'secondary', 'muted', 'accent']) {
        assert.ok(contrast(colors[text], colors[background]) >= 4.5, `${name} ${text} on ${background}`);
      }
      assert.ok(contrast(colors.control, colors[background]) >= 3, `${name} essential control on ${background}`);
    }
    for (const [foreground, background] of [['onAccent', 'accent'], ['onSelection', 'selection'], ['danger', 'dangerSurface'], ['success', 'successSurface'], ['warning', 'warningSurface'], ['info', 'infoSurface']]) {
      assert.ok(contrast(colors[foreground], colors[background]) >= 4.5, `${name} ${foreground} on ${background}`);
    }
  }
});
