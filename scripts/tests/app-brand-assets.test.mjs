import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inflateSync } from 'node:zlib';

const root = new URL('../../', import.meta.url);
const read = (file) => readFile(new URL(file, root));

function assertDecodablePng(bytes) {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8, 'The existing icons use eight-bit channels');
  assert.ok([2, 6].includes(bytes[25]), 'The existing icons use RGB or RGBA');
  assert.equal(bytes[28], 0, 'The existing icons are not interlaced');
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    assert.ok(offset + length + 12 <= bytes.length, 'PNG chunk is complete');
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(chunks));
  assert.equal(pixels.length, height * (1 + width * (bytes[25] === 6 ? 4 : 3)));
}

for (const [source, app] of [
  ['brand/lythaus-mark.svg', 'assets/brand/lythaus_mark.svg'],
  ['icons/lythaus-192.png', 'web/favicon.png'],
  ['icons/lythaus-192.png', 'web/icons/Icon-192.png'],
  ['icons/lythaus-512.png', 'web/icons/Icon-512.png'],
  ['icons/lythaus-512-maskable.png', 'web/icons/Icon-maskable-512.png'],
]) {
  test(`${app} reuses the approved marketing asset byte for byte`, async () => {
    const bytes = await read(app);
    assert.deepEqual(bytes, await read(`apps/marketing-site/public/${source}`));
    if (app.endsWith('.png')) assertDecodablePng(bytes);
  });
}

test('static app wordmark preserves the approved vector geometry', async () => {
  const marketing = (await read('apps/marketing-site/src/components/OpeningWordmark.astro')).toString();
  const app = (await read('assets/brand/lythaus_wordmark.svg')).toString();
  assert.equal(app.match(/ d="([^"]+)"/)[1], marketing.match(/id="wordmark-material" d="([^"]+)"/)[1]);
  assert.match(app, /viewBox="0 -5 1000 174"/);
});

test('manifest icons resolve to correctly sized approved assets', async () => {
  const manifest = JSON.parse(await read('web/manifest.json'));
  assert.equal(manifest.name, 'Lythaus');
  assert.equal(manifest.short_name, 'Lythaus');
  assert.equal(manifest.theme_color, '#070706');
  assert.equal(manifest.background_color, '#070706');
  assert.equal(manifest.orientation, undefined);
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const bytes = await read(`web/${icon.src}`);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
  }
  const html = (await read('web/index.html')).toString();
  assert.match(html, /rel="icon" type="image\/png" href="favicon.png"/);
  assert.match(html, /rel="apple-touch-icon" href="icons\/Icon-192.png"/);
  const favicon = await read('web/favicon.png');
  assert.equal(favicon.readUInt32BE(16), 192);
  assert.equal(favicon.readUInt32BE(20), 192);
});
