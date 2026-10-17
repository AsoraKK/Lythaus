import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = file => readFileSync(file);
const json = file => JSON.parse(read(file));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const directory = 'docs/brand/approved-v1/';
const manifest = json(directory + 'INTEGRATION-MANIFEST.json');
const imported = json(directory + 'import-map.json');
const approved = new Map(read(directory + 'SHA256SUMS.txt').toString().trim().split('\n')
  .map(line => { const [hash, file] = line.trim().split(/\s+/); return [file, hash]; }));
const pngSize = bytes => {
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

test('every imported byte matches the independently approved package', () => {
  assert.equal(imported.package_sha256, '5e39cb394ce182f540a5434f8e14267a51b40977a05c1ed3816918d85ff22995');
  assert.equal(sha(read(directory + 'INTEGRATION-MANIFEST.json')), '68634bebbfbe2c2cf8026a0e8a7eb157a59de4e8433a88bd355d850dbaf115b9');
  assert.equal(sha(read(directory + 'SHA256SUMS.txt')), 'cb448382f3df6d64b8de3ef391de924e1d196372816e8791410d0b5b8ddb6cfd');
  assert.equal(new Set(imported.files.map(file => file.repository_path)).size, imported.files.length);
  for (const file of imported.files) {
    assert.ok(!file.repository_path.startsWith('apps/marketing-site/'));
    assert.equal(sha(read(file.repository_path)), file.sha256, file.repository_path);
    if (file.package_path !== 'SHA256SUMS.txt') assert.equal(file.sha256, approved.get(file.package_path), file.package_path);
  }
});

test('web and admin mappings use approved fingerprints, aliases, and icon purposes', () => {
  for (const root of ['web', 'apps/control-panel/public']) {
    for (const asset of manifest.web_copy_map) {
      assert.equal(sha(read(root + asset.public_url)), asset.sha256, root + asset.public_url);
      assert.ok(asset.public_url.includes(asset.sha256.slice(0, 12)));
      if (asset.root_fallback_alias) assert.equal(sha(read(root + asset.root_fallback_alias)), asset.sha256);
    }
    const html = read(root === 'web' ? 'web/index.html' : 'apps/control-panel/index.html').toString();
    const icons = [...html.matchAll(/<link\s+rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)];
    assert.equal(icons.length, 4);
    for (const [, url] of icons) assert.ok(manifest.web_copy_map.some(asset => asset.public_url === '/' + url.replace(/^\//, '')));
  }
  const web = json('web/manifest.json');
  assert.equal(web.name, 'Lythaus');
  assert.equal(web.start_url, '.');
  assert.equal(web.display, 'standalone');
  assert.equal(web.orientation, 'portrait-primary');
  assert.equal(web.background_color, manifest.colors.ink);
  assert.equal(web.theme_color, manifest.colors.ink);
  assert.deepEqual(web.icons.map(icon => icon.purpose), ['any', 'any', 'maskable', 'maskable']);
  for (const icon of web.icons) {
    assert.equal(pngSize(read('web/' + icon.src)).join('x'), icon.sizes);
    assert.ok(manifest.web_copy_map.some(asset => asset.public_url === '/' + icon.src));
  }
});

test('native catalogs retain their size, scale and resource mappings', () => {
  for (const platform of ['ios', 'macos']) {
    const root = platform + '/Runner/Assets.xcassets/AppIcon.appiconset/';
    for (const image of json(root + 'Contents.json').images) {
      const pixels = image.size.split('x').map(value => Number(value) * Number(image.scale.replace('x', '')));
      assert.deepEqual(pngSize(read(root + image.filename)), pixels, root + image.filename);
      const supplied = manifest.native_exports.find(asset => asset.platform === platform && path.basename(asset.package_path) === image.filename);
      assert.ok(supplied, image.filename);
      assert.equal(sha(read(root + image.filename)), supplied.sha256);
    }
  }
  for (const asset of manifest.native_exports.filter(asset => asset.platform === 'android')) {
    const file = 'android/app/src/main/res/' + asset.package_path.replace('native/android/', '');
    assert.deepEqual(pngSize(read(file)), asset.pixels);
    assert.equal(sha(read(file)), asset.sha256);
  }
  const ico = read('windows/runner/resources/app_icon.ico');
  const frames = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
    const offset = 6 + index * 16;
    return [ico[offset] || 256, ico[offset + 1] || 256];
  });
  assert.deepEqual(frames, manifest.native_exports.find(asset => asset.platform === 'windows').frames);
  assert.match(read('windows/runner/Runner.rc').toString(), /IDI_APP_ICON\s+ICON/);
  for (const version of [26, 33]) {
    const xml = read('android/app/src/main/res/mipmap-anydpi-v' + version + '/ic_launcher.xml').toString();
    assert.match(xml, /@color\/launcher_background/);
    assert.match(xml, /@drawable\/ic_launcher_foreground/);
    assert.equal(xml.includes('@drawable/ic_launcher_monochrome'), version === 33);
  }
  assert.match(read('android/app/src/main/res/values/brand_colors.xml').toString(), /#11110F/);
  assert.match(read('lib/services/push/push_notification_service.dart').toString(), /@drawable\/ic_launcher_monochrome/);
});

test('named admin headers use approved standalone wordmarks, never combined lockups', () => {
  const nav = read('apps/control-panel/src/components/Nav.jsx').toString();
  const images = [...nav.matchAll(/<img[^>]*src="([^"]+)"[^>]*alt="Lythaus"/g)];
  assert.deepEqual(images.map(match => match[1]), [
    '/brand/lythaus-v1/lythaus-wordmark-white.5ba0451347e2.svg',
    '/brand/lythaus-v1/lythaus-wordmark-black.e450176663e0.svg',
  ]);
  for (const [, asset] of images) {
    const supplied = manifest.web_copy_map.find(entry => entry.public_url === asset);
    assert.ok(supplied);
    assert.equal(sha(read('apps/control-panel/public' + asset)), supplied.sha256);
  }
  assert.ok(!nav.includes('lockup'));
});

test('fingerprinted assets are immutable while stable aliases and documents revalidate', () => {
  for (const file of ['web/_headers', 'apps/control-panel/public/_headers']) {
    const headers = read(file).toString();
    assert.match(headers, /\/brand\/lythaus-v1\/\*\n  Cache-Control: public, max-age=31536000, immutable/);
    assert.match(headers, /\/icons\/lythaus-v1\/\*\n  Cache-Control: public, max-age=31536000, immutable/);
    assert.ok(headers.includes('must-revalidate'));
    assert.ok(!headers.includes('/favicon.ico\n  Cache-Control: public'));
  }
});
