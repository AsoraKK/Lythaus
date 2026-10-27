import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => readFile(path.join(root, file));
const json = async file => JSON.parse(await read(file));
const original = await json('docs/brand/approved-v1/INTEGRATION-MANIFEST.json');
const imports = await json('docs/brand/approved-v1/import-map.json');
const tokens = (await json('design/tokens.json')).color.dark;
const rgb = hex => hex.slice(1).match(/../g).map(value => parseInt(value, 16));
const sourceBackground = rgb(original.colors.ink);
const sourceForeground = rgb(original.colors.warm);
const targetBackground = rgb(tokens.canvas);
const targetForeground = rgb(tokens.accent);
const sourceVector = sourceForeground.map((value, index) => value - sourceBackground[index]);
const denominator = sourceVector.reduce((sum, value) => sum + value * value, 0);

export function coverage(pixel, background = sourceBackground, foreground = sourceForeground) {
  const vector = foreground.map((value, index) => value - background[index]);
  const length = vector.reduce((sum, value) => sum + value * value, 0);
  return Math.max(0, Math.min(1, vector.reduce((sum, value, index) => sum + (pixel[index] - background[index]) * value, 0) / length));
}

export async function palettePng(bytes) {
  const metadata = await sharp(bytes).metadata();
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  const output = Buffer.from(data);
  for (let offset = 0; offset < data.length; offset += 4) {
    const amount = Math.max(0, Math.min(1,
      sourceVector.reduce((sum, value, channel) => sum + (data[offset + channel] - sourceBackground[channel]) * value, 0) / denominator));
    for (let channel = 0; channel < 3; channel++) output[offset + channel] = Math.round(targetBackground[channel] + amount * (targetForeground[channel] - targetBackground[channel]));
  }
  let image = sharp(output, { raw: { width: info.width, height: info.height, channels: 4 } });
  if (!metadata.hasAlpha) image = image.removeAlpha();
  return image.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
}

export function icoFrames(bytes) {
  assert.equal(bytes.readUInt16LE(0), 0);
  assert.equal(bytes.readUInt16LE(2), 1);
  return Array.from({ length: bytes.readUInt16LE(4) }, (_, index) => {
    const entry = bytes.subarray(6 + 16 * index, 22 + 16 * index);
    const length = entry.readUInt32LE(8), offset = entry.readUInt32LE(12);
    const png = bytes.subarray(offset, offset + length);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    return { entry: Buffer.from(entry), png, width: entry[0] || 256, height: entry[1] || 256 };
  });
}

async function paletteIco(bytes) {
  const frames = icoFrames(bytes);
  const header = Buffer.from(bytes.subarray(0, 6));
  let offset = 6 + frames.length * 16;
  const entries = [], images = [];
  for (const frame of frames) {
    const image = await palettePng(frame.png);
    frame.entry.writeUInt32LE(image.length, 8);
    frame.entry.writeUInt32LE(offset, 12);
    entries.push(frame.entry); images.push(image); offset += image.length;
  }
  return Buffer.concat([header, ...entries, ...images]);
}

export function paletteVector(source) {
  return source
    .replaceAll('#FFF2C98D', '#FF' + tokens.accent.slice(1))
    .replaceAll('#FFFFFFFF', '#FF' + tokens.text.slice(1))
    .replaceAll(original.colors.ink, tokens.canvas)
    .replaceAll(original.colors.warm, tokens.accent)
    .replaceAll(original.colors.white, tokens.text);
}

export async function buildDerivedAssets() {
  const outputs = new Map(), entries = [], web = {};
  async function derive(source, destination, expected, transform, metadata = {}) {
    const input = await read(source);
    assert.equal(sha(input), expected, `Immutable source changed: ${source}`);
    const bytes = Buffer.from(await transform(input));
    const digest = sha(bytes);
    const target = destination.replace('{hash}', digest.slice(0, 12));
    outputs.set(target, bytes);
    entries.push({ source, source_sha256: expected, path: target, sha256: digest, ...metadata });
    return target;
  }
  const transform = extension => extension === '.png' ? palettePng : extension === '.ico' ? paletteIco : bytes => paletteVector(bytes.toString());
  for (const asset of original.web_copy_map.filter(asset => asset.public_url.startsWith('/icons/'))) {
    const name = path.basename(asset.public_url).replace(/\.[a-f\d]{12}(?=\.)/, '.{hash}');
    const extension = path.extname(name);
    const source = 'web' + asset.public_url;
    const key = name.replace('.{hash}', '');
    for (const targetRoot of ['web', 'apps/marketing-site/public']) {
      const target = await derive(source, `${targetRoot}/icons/lythaus-four-colour/${name}`, asset.sha256, transform(extension), { role: 'browser-icon' });
      web[key] = '/' + target.slice(targetRoot.length + 1);
    }
  }
  const socialSource = 'apps/marketing-site/public/brand/lythaus-v1/lythaus-social-card-1200x630.78f698ef4283.png';
  for (const targetRoot of ['web', 'apps/marketing-site/public']) {
    const target = await derive(socialSource, `${targetRoot}/brand/lythaus-four-colour/lythaus-social-card-1200x630.{hash}.png`, '78f698ef4283dcc19de07672fe95bbfd6655da04bc45f93fdc7ceff181402eab', palettePng, { role: 'social-preview' });
    web['social.png'] = '/' + target.slice(targetRoot.length + 1);
  }
  for (const asset of original.native_exports) {
    const source = imports.files.find(file => file.package_path === asset.package_path)?.repository_path;
    if (!source || !['ios', 'macos', 'android', 'windows', 'android-adaptive-vector'].includes(asset.platform)) continue;
    let target;
    if (['ios', 'macos'].includes(asset.platform)) target = source.replace('/AppIcon.appiconset/', '/AppIconFourColour.appiconset/');
    else if (asset.platform === 'windows') target = source.replace('app_icon.ico', 'app_icon_four_colour.ico');
    else target = source.replace(/ic_launcher(?=[_.])/, 'ic_launcher_four_colour');
    await derive(source, target, asset.sha256, transform(path.extname(source)), { role: asset.platform });
  }
  for (const platform of ['ios', 'macos']) {
    const source = `${platform}/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json`;
    const bytes = await read(source);
    await derive(source, source.replace('/AppIcon.appiconset/', '/AppIconFourColour.appiconset/'), sha(bytes), input => input, { role: 'native-catalog' });
  }
  for (const version of [26, 33]) {
    const source = `android/app/src/main/res/mipmap-anydpi-v${version}/ic_launcher.xml`;
    const bytes = await read(source);
    await derive(source, source.replace('/ic_launcher.xml', '/ic_launcher_four_colour.xml'), sha(bytes), input => input.toString()
      .replace('@color/launcher_background', '@color/lythaus_canvas')
      .replaceAll('@drawable/ic_launcher_', '@drawable/ic_launcher_four_colour_'), { role: 'android-adaptive' });
  }
  const manifest = {
    version: 'lythaus-four-colour-2026-10-27',
    source_package_sha256: imports.package_sha256,
    palette: { canvas: tokens.canvas, surface: tokens.surface, text: tokens.text, accent: tokens.accent },
    method: 'No resizing or resampling. Preserve dimensions, alpha and outline coverage; project original raster antialias values onto canvas/accent, clamping original resampling overshoot. Vector edits replace colour attributes only. ICO frames and Apple catalog declarations retain their original order and dimensions.',
    web,
    aliases: {
      web: Object.fromEntries([
        ['/favicon.ico', 'favicon.ico'], ['/favicon.png', 'favicon-96x96.png'], ['/apple-touch-icon.png', 'apple-touch-icon.png'],
        ['/icons/Icon-192.png', 'pwa-icon-192x192.png'], ['/icons/Icon-512.png', 'pwa-icon-512x512.png'],
        ['/icons/Icon-maskable-192.png', 'pwa-maskable-192x192.png'], ['/icons/Icon-maskable-512.png', 'pwa-maskable-512x512.png'],
      ].map(([alias, key]) => [alias, web[key]])),
      marketing: Object.fromEntries([
        ['/favicon.ico', 'favicon.ico'], ['/favicon.png', 'favicon-96x96.png'], ['/apple-touch-icon.png', 'apple-touch-icon.png'],
        ['/icons/lythaus-192.png', 'pwa-icon-192x192.png'], ['/icons/lythaus-512.png', 'pwa-icon-512x512.png'],
        ['/icons/lythaus-512-maskable.png', 'pwa-maskable-512x512.png'],
      ].map(([alias, key]) => [alias, web[key]])),
    },
    entries,
  };
  outputs.set('docs/brand/four-colour/manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  return { outputs, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { outputs } = await buildDerivedAssets();
  for (const [file, bytes] of outputs) {
    if (process.argv.includes('--check')) assert.deepEqual(await read(file), bytes, `Derived asset is stale: ${file}`);
    else { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), bytes); }
  }
  console.log(`${process.argv.includes('--check') ? 'Verified' : 'Generated'} ${outputs.size} deterministic derived files; original files unchanged.`);
}
