import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const NEUTRAL_PNG_WIDTH = 128;
export const NEUTRAL_PNG_HEIGHT = 128;
export const NEUTRAL_PNG_CHANNELS = 3;
export const NEUTRAL_PNG_GREY = 238;

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function hasPngSignature(bytes) {
  return bytes.byteLength >= PNG_SIGNATURE.byteLength
    && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

export async function validateNeutralPng(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return { valid: false, reason: 'empty_input' };
  if (!hasPngSignature(bytes)) return { valid: false, reason: 'png_signature_invalid' };
  try {
    const metadata = await sharp(bytes, { failOn: 'error' }).metadata();
    const decoded = await sharp(bytes, { failOn: 'error' }).raw().toBuffer({ resolveWithObject: true });
    const pixelBytes = NEUTRAL_PNG_WIDTH * NEUTRAL_PNG_HEIGHT * NEUTRAL_PNG_CHANNELS;
    if (metadata.format !== 'png') return { valid: false, reason: 'format_invalid' };
    if (metadata.width !== NEUTRAL_PNG_WIDTH || metadata.height !== NEUTRAL_PNG_HEIGHT) return { valid: false, reason: 'dimensions_invalid' };
    if (decoded.info.channels !== NEUTRAL_PNG_CHANNELS) return { valid: false, reason: 'channels_invalid' };
    if (decoded.data.byteLength !== pixelBytes || decoded.data.byteLength === 0) return { valid: false, reason: 'pixel_bytes_invalid' };
    return {
      valid: true,
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      channels: decoded.info.channels,
      pixelBytes: decoded.data.byteLength,
    };
  } catch {
    return { valid: false, reason: 'decode_failed' };
  }
}

export async function createNeutralPng(outputPath) {
  const bytes = await sharp({
    create: {
      width: NEUTRAL_PNG_WIDTH,
      height: NEUTRAL_PNG_HEIGHT,
      channels: NEUTRAL_PNG_CHANNELS,
      background: { r: NEUTRAL_PNG_GREY, g: NEUTRAL_PNG_GREY, b: NEUTRAL_PNG_GREY },
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  const validation = await validateNeutralPng(new Uint8Array(bytes));
  if (!validation.valid) throw new Error(`neutral_fixture_invalid:${validation.reason}`);
  const resolvedOutputPath = path.resolve(outputPath);
  await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, bytes);
  return validation;
}
