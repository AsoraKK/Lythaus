import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

test('the installed image decoder includes the patched libheif runtime', () => {
  const version = sharp.versions.heif.split('.').map(Number);
  assert.ok(version[0] > 1 || (version[0] === 1 && (version[1] > 23 || (version[1] === 23 && version[2] >= 2))));
});

for (const format of ['jpeg', 'avif']) {
  test(`materialisation decodes and transforms a synthetic ${format} image`, async () => {
    const image = sharp({ create: { width: 16, height: 12, channels: 3, background: { r: 40, g: 120, b: 200 } } });
    const bytes = await image[format]().toBuffer();
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, format === 'avif' ? 'heif' : format);
    assert.equal(metadata.width, 16);
    assert.equal(metadata.height, 12);

    const { data, info } = await sharp(bytes).greyscale().resize(32, 32, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 1);
    assert.equal(data.byteLength, 32 * 32);

    const transformed = await sharp(bytes).resize(8, 6).jpeg({ quality: 95 }).toBuffer();
    const output = await sharp(transformed).metadata();
    assert.equal(output.format, 'jpeg');
    assert.equal(output.width, 8);
    assert.equal(output.height, 6);
  });
}
