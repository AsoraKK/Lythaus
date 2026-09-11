import type { DecodedImage } from './forensics.ts';

export interface ResearchDecodeInput {
  bytes: Uint8Array;
  mime: string;
}

/**
 * Research-only decode boundary. This intentionally mirrors the existing
 * ml/evaluation/extract-features.mjs Sharp raw-buffer path.
 */
export async function decodeResearchImage(input: ResearchDecodeInput): Promise<DecodedImage | null> {
  if (input.bytes.byteLength === 0) return null;
  try {
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default;
    const decodedResult = await sharp(input.bytes).raw().toBuffer({ resolveWithObject: true });
    const channels = decodedResult.info.channels === 4 ? 4 : decodedResult.info.channels === 3 ? 3 : 1;
    if (!Number.isInteger(decodedResult.info.width) || decodedResult.info.width <= 0) return null;
    if (!Number.isInteger(decodedResult.info.height) || decodedResult.info.height <= 0) return null;
    if (decodedResult.data.byteLength < decodedResult.info.width * decodedResult.info.height * channels) return null;
    return {
      width: decodedResult.info.width,
      height: decodedResult.info.height,
      channels,
      pixels: decodedResult.data,
    };
  } catch {
    return null;
  }
}
