import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  GEOMETRY_OCCLUSION_CHANNELS,
  GEOMETRY_OCCLUSION_HEIGHT,
  GEOMETRY_OCCLUSION_LAYOUT,
  GEOMETRY_OCCLUSION_WIDTH,
} from './geometry-occlusion-fixture.mjs';

export const GEOMETRY_FRONTBACK_FIXTURE_VERSION = 'v1';
export const GEOMETRY_FRONTBACK_GENERATOR_VERSION = 'lythaus-wp004a-geometry-occlusion-frontback-generator-v1';
export const GEOMETRY_FRONTBACK_VARIANTS = ['BLUE', 'RED'];
export const GEOMETRY_FRONTBACK_FIXTURE_IDS = Object.freeze({
  BLUE: 'WP004A_GEOMETRY_OCCLUSION_BLUE_FRONT_01',
  RED: 'WP004A_GEOMETRY_OCCLUSION_RED_FRONT_01',
});
export const GEOMETRY_FRONTBACK_QUERY_ID = 'GEOMETRY_FRONTBACK_01';
export const GEOMETRY_FRONTBACK_ALLOWED_ANSWERS = Object.freeze([
  'Blue rectangle is in front of red rectangle.',
  'Red rectangle is in front of blue rectangle.',
  'Front/back relationship is indeterminate.',
]);

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function assertVariant(front) {
  if (!GEOMETRY_FRONTBACK_VARIANTS.includes(front)) throw new Error('geometry_frontback_variant_invalid');
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hasPngSignature(bytes) {
  return bytes.byteLength >= PNG_SIGNATURE.byteLength
    && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

export function geometryFrontBackFixtureId(front) {
  assertVariant(front);
  return GEOMETRY_FRONTBACK_FIXTURE_IDS[front];
}

export function geometryFrontBackTruth(front) {
  assertVariant(front);
  return Object.freeze({
    fixtureId: geometryFrontBackFixtureId(front),
    category: 'GEOMETRY_OCCLUSION',
    truth: Object.freeze({ front, back: front === 'BLUE' ? 'RED' : 'BLUE' }),
  });
}

export function buildGeometryOcclusionFrontBackSvg(front) {
  assertVariant(front);
  const { background, redRectangle, blueRectangle, greenCircle } = GEOMETRY_OCCLUSION_LAYOUT;
  const primaryShapes = front === 'BLUE'
    ? [redRectangle, blueRectangle]
    : [blueRectangle, redRectangle];
  const rectangles = primaryShapes.map((shape) => `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${shape.color}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GEOMETRY_OCCLUSION_WIDTH}" height="${GEOMETRY_OCCLUSION_HEIGHT}" viewBox="0 0 ${GEOMETRY_OCCLUSION_WIDTH} ${GEOMETRY_OCCLUSION_HEIGHT}"><rect x="0" y="0" width="${GEOMETRY_OCCLUSION_WIDTH}" height="${GEOMETRY_OCCLUSION_HEIGHT}" fill="${background.color}"/>${rectangles}<circle cx="${greenCircle.cx}" cy="${greenCircle.cy}" r="${greenCircle.radius}" fill="${greenCircle.color}"/></svg>`;
}

export async function renderGeometryOcclusionFrontBackPng(front) {
  const svg = Buffer.from(buildGeometryOcclusionFrontBackSvg(front), 'utf8');
  const png = await sharp(svg, { failOn: 'error' })
    .flatten({ background: { r: 238, g: 238, b: 234 } })
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  return new Uint8Array(png);
}

function pixelAt(data, info, x, y) {
  const offset = (y * info.width + x) * info.channels;
  return Array.from(data.slice(offset, offset + 3));
}

function samePixel(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export async function validateGeometryOcclusionFrontBackPng(bytes, front) {
  assertVariant(front);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return { valid: false, reason: 'empty_input' };
  if (!hasPngSignature(bytes)) return { valid: false, reason: 'png_signature_invalid' };
  try {
    const metadata = await sharp(bytes, { failOn: 'error' }).metadata();
    const decoded = await sharp(bytes, { failOn: 'error' }).raw().toBuffer({ resolveWithObject: true });
    const pixelBytes = GEOMETRY_OCCLUSION_WIDTH * GEOMETRY_OCCLUSION_HEIGHT * GEOMETRY_OCCLUSION_CHANNELS;
    if (metadata.format !== 'png') return { valid: false, reason: 'format_invalid' };
    if (metadata.width !== GEOMETRY_OCCLUSION_WIDTH || metadata.height !== GEOMETRY_OCCLUSION_HEIGHT) return { valid: false, reason: 'dimensions_invalid' };
    if (decoded.info.channels !== GEOMETRY_OCCLUSION_CHANNELS) return { valid: false, reason: 'channels_invalid' };
    if (decoded.data.byteLength !== pixelBytes || decoded.data.byteLength === 0) return { valid: false, reason: 'pixel_bytes_invalid' };
    const expectedFrontColor = front === 'BLUE' ? [47, 111, 219] : [217, 45, 63];
    const expectedBackColor = front === 'BLUE' ? [217, 45, 63] : [47, 111, 219];
    if (!samePixel(pixelAt(decoded.data, decoded.info, 10, 10), [238, 238, 234])) return { valid: false, reason: 'background_pixel_invalid' };
    if (!samePixel(pixelAt(decoded.data, decoded.info, 120, 200), [217, 45, 63])) return { valid: false, reason: 'red_pixel_invalid' };
    if (!samePixel(pixelAt(decoded.data, decoded.info, 400, 300), [47, 111, 219])) return { valid: false, reason: 'blue_pixel_invalid' };
    if (!samePixel(pixelAt(decoded.data, decoded.info, 280, 260), expectedFrontColor)) return { valid: false, reason: 'front_overlap_pixel_invalid' };
    if (samePixel(pixelAt(decoded.data, decoded.info, 280, 260), expectedBackColor)) return { valid: false, reason: 'back_overlap_pixel_invalid' };
    if (!samePixel(pixelAt(decoded.data, decoded.info, 426, 104), [46, 158, 88])) return { valid: false, reason: 'green_pixel_invalid' };
    return {
      valid: true,
      fixtureId: geometryFrontBackFixtureId(front),
      fixtureVersion: GEOMETRY_FRONTBACK_FIXTURE_VERSION,
      generatorVersion: GEOMETRY_FRONTBACK_GENERATOR_VERSION,
      front,
      back: front === 'BLUE' ? 'RED' : 'BLUE',
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      channels: decoded.info.channels,
      pixelBytes: decoded.data.byteLength,
      sha256: sha256Hex(bytes),
    };
  } catch {
    return { valid: false, reason: 'decode_failed' };
  }
}

export async function createGeometryOcclusionFrontBackPng(outputPath, front) {
  const bytes = await renderGeometryOcclusionFrontBackPng(front);
  const validation = await validateGeometryOcclusionFrontBackPng(bytes, front);
  if (!validation.valid) throw new Error(`geometry_frontback_fixture_invalid:${validation.reason}`);
  const resolvedOutputPath = path.resolve(outputPath);
  await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, bytes);
  return validation;
}
