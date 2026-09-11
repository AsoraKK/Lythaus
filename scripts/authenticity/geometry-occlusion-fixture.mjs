import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const GEOMETRY_OCCLUSION_FIXTURE_ID = 'WP004A_GEOMETRY_OCCLUSION_01';
export const GEOMETRY_OCCLUSION_FIXTURE_VERSION = 'v1';
export const GEOMETRY_OCCLUSION_GENERATOR_VERSION = 'lythaus-wp004a-geometry-occlusion-generator-v1';
export const GEOMETRY_OCCLUSION_WIDTH = 512;
export const GEOMETRY_OCCLUSION_HEIGHT = 512;
export const GEOMETRY_OCCLUSION_CHANNELS = 3;

export const GEOMETRY_OCCLUSION_LAYOUT = Object.freeze({
  background: { color: '#eeeeea' },
  redRectangle: { x: 96, y: 176, width: 248, height: 144, color: '#d92d3f', drawOrder: 2 },
  blueRectangle: { x: 248, y: 232, width: 192, height: 144, color: '#2f6fdb', drawOrder: 3 },
  greenCircle: { cx: 426, cy: 104, radius: 42, color: '#2e9e58', drawOrder: 4 },
});

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function hasPngSignature(bytes) {
  return bytes.byteLength >= PNG_SIGNATURE.byteLength
    && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function buildGeometryOcclusionSvg() {
  const { background, redRectangle, blueRectangle, greenCircle } = GEOMETRY_OCCLUSION_LAYOUT;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GEOMETRY_OCCLUSION_WIDTH}" height="${GEOMETRY_OCCLUSION_HEIGHT}" viewBox="0 0 ${GEOMETRY_OCCLUSION_WIDTH} ${GEOMETRY_OCCLUSION_HEIGHT}"><rect x="0" y="0" width="${GEOMETRY_OCCLUSION_WIDTH}" height="${GEOMETRY_OCCLUSION_HEIGHT}" fill="${background.color}"/><rect x="${redRectangle.x}" y="${redRectangle.y}" width="${redRectangle.width}" height="${redRectangle.height}" fill="${redRectangle.color}"/><rect x="${blueRectangle.x}" y="${blueRectangle.y}" width="${blueRectangle.width}" height="${blueRectangle.height}" fill="${blueRectangle.color}"/><circle cx="${greenCircle.cx}" cy="${greenCircle.cy}" r="${greenCircle.radius}" fill="${greenCircle.color}"/></svg>`;
}

export async function renderGeometryOcclusionPng() {
  const svg = Buffer.from(buildGeometryOcclusionSvg(), 'utf8');
  const png = await sharp(svg, { failOn: 'error' })
    .flatten({ background: { r: 238, g: 238, b: 234 } })
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  return new Uint8Array(png);
}

export async function validateGeometryOcclusionPng(bytes) {
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
    return {
      valid: true,
      fixtureId: GEOMETRY_OCCLUSION_FIXTURE_ID,
      fixtureVersion: GEOMETRY_OCCLUSION_FIXTURE_VERSION,
      generatorVersion: GEOMETRY_OCCLUSION_GENERATOR_VERSION,
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

export async function createGeometryOcclusionPng(outputPath) {
  const bytes = await renderGeometryOcclusionPng();
  const validation = await validateGeometryOcclusionPng(bytes);
  if (!validation.valid) throw new Error(`geometry_fixture_invalid:${validation.reason}`);
  const resolvedOutputPath = path.resolve(outputPath);
  await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, bytes);
  return validation;
}
