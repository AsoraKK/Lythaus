import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const publicFile = (url) => path.join(root, 'public', url.replace(/^\//u, ''));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const assets = [
  { url: '/brand/lythaus-v1/lythaus-lockup-black.9518c6eeb03b.svg', sha256: '9518c6eeb03bb718b6f43c23b44f6a08020bd93f4bf85d75c81fa6b9716d24f3', mime: 'image/svg+xml' },
  { url: '/brand/lythaus-v1/lythaus-lockup-white.57df30b168bc.svg', sha256: '57df30b168bcf5b36b67e033b1924ddf1a891fc28d8fc41d88f2b3db4798031a', mime: 'image/svg+xml' },
  { url: '/brand/lythaus-v1/lythaus-social-card-1200x630.c20d3b1b40a8.png', sha256: 'c20d3b1b40a870640abdb88c049b68df565cda71d6f883064655116af1d6fa8e', mime: 'image/png' },
  { url: '/icons/lythaus-v1/favicon.e3dfdd675a74.ico', sha256: 'e3dfdd675a7450c028317d74caeedaf03f613b73a34f50a3950ba4972bbdb67c', mime: 'image/x-icon' },
  { url: '/icons/lythaus-v1/favicon.116ff3e020c6.svg', sha256: '116ff3e020c6b7f8539644880c8bc810d1a6278709b5f273c2a8d354d5f33cb7', mime: 'image/svg+xml' },
  { url: '/icons/lythaus-v1/favicon-96x96.572a7b9a0d35.png', sha256: '572a7b9a0d35f57d71c9f5a7d5f6d5b11a58b67a8bfd55d36416d447476c85ef', mime: 'image/png' },
  { url: '/icons/lythaus-v1/apple-touch-icon.19122fd8c91b.png', sha256: '19122fd8c91b3ce51b5a6a00d5840b3fa0f8a02416c0b997c283f9aba42a83bd', mime: 'image/png' },
  { url: '/icons/lythaus-v1/pwa-icon-192x192.5c5c7622a5f7.png', sha256: '5c5c7622a5f762e0f0251fc7e806cd51a9f9b95c779f5fda9cc38cb6c658d7b8', mime: 'image/png' },
  { url: '/icons/lythaus-v1/pwa-icon-512x512.27a8dadec032.png', sha256: '27a8dadec032e03ffca0953feaac6e800d7b737da5e5e3ec15b822841d2fe04d', mime: 'image/png' },
  { url: '/icons/lythaus-v1/pwa-maskable-192x192.36698aff23fb.png', sha256: '36698aff23fb111d8e81ac90c4f6fe1ed34c22aece93ed0833573b81caa6879f', mime: 'image/png' },
  { url: '/icons/lythaus-v1/pwa-maskable-512x512.10ec5b6e6764.png', sha256: '10ec5b6e6764cc1935d8909f6f54fe107efb370edf056d33c94718536aaee54d', mime: 'image/png' },
];
const baseLayout = readFileSync(path.join(root, 'src/layouts/BaseLayout.astro'), 'utf8');
const secondaryLayout = readFileSync(path.join(root, 'src/layouts/SecondaryLayout.astro'), 'utf8');
const secondaryStyles = readFileSync(path.join(root, 'src/styles/secondary.css'), 'utf8');
const brandStyles = readFileSync(path.join(root, 'src/styles/brand.css'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(root, 'public/site.webmanifest'), 'utf8'));

function assertMimeSignature(bytes, mime, filename) {
  if (mime === 'image/svg+xml') {
    assert.match(bytes.toString('utf8'), /<svg\b/u, `${filename} must contain SVG markup`);
  } else if (mime === 'image/png') {
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), `${filename} must be PNG`);
  } else {
    assert.deepEqual(bytes.subarray(0, 4), Buffer.from([0, 0, 1, 0]), `${filename} must be ICO`);
    assert.ok(bytes.readUInt16LE(4) > 0, `${filename} must contain icon frames`);
  }
}

test('fingerprinted brand assets match approved hashes and MIME signatures', () => {
  for (const asset of assets) {
    const filename = publicFile(asset.url);
    const bytes = readFileSync(filename);
    assert.equal(sha256(bytes), asset.sha256, `${asset.url} must match the approved manifest hash`);
    assert.match(path.basename(filename), new RegExp(`\\.${asset.sha256.slice(0, 12)}\\.(?:svg|png|ico)$`, 'u'));
    assertMimeSignature(bytes, asset.mime, asset.url);
  }

  const socialCard = readFileSync(publicFile('/brand/lythaus-v1/lythaus-social-card-1200x630.c20d3b1b40a8.png'));
  assert.equal(socialCard.readUInt32BE(16), 1200);
  assert.equal(socialCard.readUInt32BE(20), 630);
});

test('both marketing layouts use versioned icons and social metadata', () => {
  const layouts = `${baseLayout}\n${secondaryLayout}`;
  const referenced = [
    '/icons/lythaus-v1/favicon.116ff3e020c6.svg',
    '/icons/lythaus-v1/favicon-96x96.572a7b9a0d35.png',
    '/icons/lythaus-v1/favicon.e3dfdd675a74.ico',
    '/icons/lythaus-v1/apple-touch-icon.19122fd8c91b.png',
  ];
  for (const url of referenced) assert.ok(layouts.includes(url), `${url} must be linked by both layouts`);
  assert.match(layouts, /type="image\/svg\+xml"/u);
  assert.match(layouts, /type="image\/png"/u);
  assert.match(layouts, /type="image\/x-icon"/u);
  assert.match(layouts, /const socialImageUrl = `\$\{siteUrl\}\/brand\/lythaus-v1\/lythaus-social-card-1200x630\.c20d3b1b40a8\.png`/u);
  assert.match(layouts, /property="og:image" content=\{socialImageUrl\}/u);
  assert.match(layouts, /name="twitter:image" content=\{socialImageUrl\}/u);
  assert.match(layouts, /name="twitter:card" content="summary_large_image"/u);
  assert.doesNotMatch(layouts, /href="\/(?:favicon\.(?:ico|png)|brand\/lythaus-mark\.svg)"/u);
});

test('single accessible lockups preserve theme contrast and responsive sizing', () => {
  assert.equal((baseLayout.match(/class="brand-lockup"/gu) ?? []).length, 2);
  assert.equal((secondaryLayout.match(/class="secondary-brand-art"/gu) ?? []).length, 2);
  assert.match(baseLayout, /class="brand" href="\/" aria-label="Lythaus home"[\s\S]*?class="brand-lockup"[^>]*alt=""/u);
  assert.match(secondaryLayout, /class="secondary-brand" href="\/" aria-label="Lythaus home"[\s\S]*?class="secondary-brand-art" aria-hidden="true"/u);
  assert.doesNotMatch(`${baseLayout}\n${secondaryLayout}`, /<span>Lythaus<\/span>|lythaus-mark\.svg/u);
  assert.ok(secondaryStyles.includes('/brand/lythaus-v1/lythaus-lockup-black.9518c6eeb03b.svg'));
  assert.ok(secondaryStyles.includes('/brand/lythaus-v1/lythaus-lockup-white.57df30b168bc.svg'));
  assert.match(secondaryStyles, /data-appearance="dark"[^\n]*secondary-brand-lockup/u);
  assert.match(secondaryStyles, /prefers-color-scheme:\s*dark/u);
  assert.match(secondaryStyles, /secondary-brand-art[^\n]*aspect-ratio/u);
  assert.match(brandStyles, /width:\s*min\(154px,\s*42vw\)/u);
  assert.match(brandStyles, /height:\s*auto/u);
});

test('web manifest preserves identity and maps any and maskable icons separately', () => {
  assert.equal(manifest.name, 'Lythaus');
  assert.equal(manifest.short_name, 'Lythaus');
  assert.equal(manifest.description, 'A calm, human-first publishing network.');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#070706');
  assert.equal(manifest.theme_color, '#070706');
  assert.deepEqual(manifest.icons, [
    { src: '/icons/lythaus-v1/pwa-icon-192x192.5c5c7622a5f7.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/lythaus-v1/pwa-icon-512x512.27a8dadec032.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/lythaus-v1/pwa-maskable-192x192.36698aff23fb.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/lythaus-v1/pwa-maskable-512x512.10ec5b6e6764.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]);
  for (const icon of manifest.icons) {
    assert.match(icon.src, /\.[a-f0-9]{12}\.png$/u, 'manifest icons must be cache-safe versioned URLs');
    assert.ok(existsSync(publicFile(icon.src)), `${icon.src} must exist`);
  }
});

test('legacy root icon paths stay exact approved fallbacks', () => {
  const aliases = [
    ['/favicon.ico', '/icons/lythaus-v1/favicon.e3dfdd675a74.ico'],
    ['/favicon.png', '/icons/lythaus-v1/favicon-96x96.572a7b9a0d35.png'],
    ['/apple-touch-icon.png', '/icons/lythaus-v1/apple-touch-icon.19122fd8c91b.png'],
    ['/icons/lythaus-192.png', '/icons/lythaus-v1/pwa-icon-192x192.5c5c7622a5f7.png'],
    ['/icons/lythaus-512.png', '/icons/lythaus-v1/pwa-icon-512x512.27a8dadec032.png'],
    ['/icons/lythaus-512-maskable.png', '/icons/lythaus-v1/pwa-maskable-512x512.10ec5b6e6764.png'],
  ];
  for (const [alias, approved] of aliases) {
    assert.equal(sha256(readFileSync(publicFile(alias))), sha256(readFileSync(publicFile(approved))), `${alias} must remain an approved fallback`);
  }
  assert.equal(existsSync(publicFile('/brand/lythaus-mark.svg')), false, 'the retired unversioned mark must not remain public');
});
