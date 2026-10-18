import assert from 'node:assert/strict';
import {containedWordmarkRect} from './brand-artwork-pixels.mjs';
import {regionPixels} from './full-login-pixels.mjs';

export function assertLoginLayout(layout, scale) {
  assert.equal(layout.semanticsEnabled, false, 'First paint precedes Dart semantics');
  assert.equal(layout.brands.length, 1, 'One real brand layout box');
  assert.deepEqual(layout.scales, [scale], 'Effective production text scale');
  for (const field of ['Email', 'Password']) assert.equal(layout.fields[field]?.length, 1, field + ' layout');
}

export function assertMatchingLoginLayout(before, after, tolerance = 0) {
  for (const [name, left, right] of [
    ['brand', before.brands[0], after.brands[0]],
    ...['Email', 'Password'].map(name => [name, before.fields[name][0], after.fields[name][0]]),
  ]) for (const key of ['x', 'y', 'width', 'height']) {
    assert.ok(Math.abs(left[key] - right[key]) <= tolerance, `${name}.${key} matches saved first-paint geometry`);
  }
  assert.deepEqual(before.scales, after.scales);
}

export function loginFirstPaintPixels(png, layout) {
  const artwork = containedWordmarkRect(layout.brands[0]);
  const rectangles = {brand: artwork, email: layout.fields.Email[0], password: layout.fields.Password[0]};
  const pixels = {};
  for (const [name, rect] of Object.entries(rectangles)) {
    assert.ok(Object.values(rect).every(Number.isFinite) && rect.width > 0 && rect.height > 0 &&
      rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= png.width && rect.y + rect.height <= png.height,
    `${name} first-paint layout is inside the saved PNG`);
    pixels[name] = regionPixels(png, rect);
  }
  return {artwork, rectangles, pixels};
}

export function assertLoginFirstPaintPixels(measured) {
  for (const [name, pixels] of Object.entries(measured.pixels)) {
    assert.ok(pixels.nonblank, `${name} did not paint in the original pre-semantics PNG`);
  }
}
