import { createDecisionAudit, type ForensicFeatureBundle, type TransformationKind, type TransformationRun } from './contracts.ts';
import { generateForensicFeatureBundle, type DecodedImage } from './forensics.ts';
import { uuidv7, type UUIDv7 } from './uuid.ts';

export const DEFAULT_TRANSFORMATIONS: readonly TransformationKind[] = [
  'JPEG_QUALITY_95',
  'JPEG_QUALITY_75',
  'RESIZE_75',
  'RESIZE_50',
  'CROP_10',
  'MILD_BLUR',
  'MILD_SHARPEN',
  'METADATA_STRIPPED',
  'SCREENSHOT_STYLE_RESAMPLING',
];

export interface TransformationImageInput {
  bytes: Uint8Array;
  decoded?: DecodedImage;
  mime: string;
}

export interface TransformationImageOutput extends TransformationImageInput {}

export type TransformationExecutor = (kind: TransformationKind, input: TransformationImageInput) => Promise<TransformationImageOutput>;
export type DetectorScore = (bundle: ForensicFeatureBundle) => Promise<number>;

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function pixelAt(image: DecodedImage, x: number, y: number, channel: number): number {
  const safeX = Math.max(0, Math.min(image.width - 1, x));
  const safeY = Math.max(0, Math.min(image.height - 1, y));
  const value = image.pixels[(safeY * image.width + safeX) * image.channels + Math.min(channel, image.channels - 1)] ?? 0;
  return Number(value);
}

function createPixels(image: DecodedImage, width: number, height: number, mapper: (x: number, y: number, channel: number) => number): DecodedImage {
  const pixels = image.pixels instanceof Float32Array ? new Float32Array(width * height * image.channels) : new Uint8Array(width * height * image.channels);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) for (let channel = 0; channel < image.channels; channel += 1) {
    const value = mapper(x, y, channel);
    pixels[(y * width + x) * image.channels + channel] = image.pixels instanceof Float32Array ? value : clampByte(value);
  }
  return { ...image, width, height, pixels };
}

function resizeImage(image: DecodedImage, scale: number): DecodedImage {
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  return createPixels(image, width, height, (x, y, channel) => pixelAt(image, Math.floor(x / scale), Math.floor(y / scale), channel));
}

function cropImage(image: DecodedImage, percentage: number): DecodedImage {
  const marginX = Math.floor(image.width * percentage / 2);
  const marginY = Math.floor(image.height * percentage / 2);
  const width = Math.max(1, image.width - marginX * 2);
  const height = Math.max(1, image.height - marginY * 2);
  return createPixels(image, width, height, (x, y, channel) => pixelAt(image, x + marginX, y + marginY, channel));
}

function blurImage(image: DecodedImage): DecodedImage {
  return createPixels(image, image.width, image.height, (x, y, channel) => {
    let total = 0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) total += pixelAt(image, x + dx, y + dy, channel);
    return total / 9;
  });
}

function sharpenImage(image: DecodedImage): DecodedImage {
  const blurred = blurImage(image);
  return createPixels(image, image.width, image.height, (x, y, channel) => pixelAt(image, x, y, channel) + 0.5 * (pixelAt(image, x, y, channel) - pixelAt(blurred, x, y, channel)));
}

function quantizeImage(image: DecodedImage, quality: 95 | 75): DecodedImage {
  const step = quality === 95 ? 2 : 8;
  return createPixels(image, image.width, image.height, (x, y, channel) => Math.round(pixelAt(image, x, y, channel) / step) * step);
}

function applyDecodedTransformation(kind: TransformationKind, image: DecodedImage): DecodedImage {
  switch (kind) {
    case 'JPEG_QUALITY_95': return quantizeImage(image, 95);
    case 'JPEG_QUALITY_75': return quantizeImage(image, 75);
    case 'RESIZE_75': return resizeImage(image, 0.75);
    case 'RESIZE_50': return resizeImage(image, 0.5);
    case 'CROP_10': return cropImage(image, 0.1);
    case 'MILD_BLUR': return blurImage(image);
    case 'MILD_SHARPEN': return sharpenImage(image);
    case 'SCREENSHOT_STYLE_RESAMPLING': return resizeImage(resizeImage(image, 0.5), 2);
    case 'METADATA_STRIPPED': return image;
  }
}

function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes.slice();
  const output: number[] = [0xff, 0xd8];
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      output.push(...bytes.slice(offset));
      break;
    }
    const markerStart = offset;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9 || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      output.push(...bytes.slice(markerStart));
      break;
    }
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) {
      output.push(...bytes.slice(markerStart));
      break;
    }
    const remove = marker === 0xfe || marker === 0xe1 || marker === 0xe2 || marker === 0xed;
    if (!remove) output.push(...bytes.slice(markerStart, offset + length));
    offset += length;
  }
  return new Uint8Array(output);
}

function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 8) return bytes.slice();
  const output: number[] = [...bytes.slice(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
    const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (end > bytes.length) return bytes.slice();
    const remove = ['eXIf', 'iTXt', 'tEXt', 'zTXt', 'iCCP'].includes(type);
    if (!remove) output.push(...bytes.slice(offset, end));
    offset = end;
    if (type === 'IEND') break;
  }
  return new Uint8Array(output);
}

function stripMetadata(input: TransformationImageInput): TransformationImageOutput {
  const bytes = input.mime === 'image/jpeg' ? stripJpegMetadata(input.bytes) : input.mime === 'image/png' ? stripPngMetadata(input.bytes) : input.bytes.slice();
  return { ...input, bytes };
}

export const defaultTransformationExecutor: TransformationExecutor = async (kind, input) => {
  if (kind === 'METADATA_STRIPPED') return stripMetadata(input);
  if (!input.decoded) return { ...input, bytes: input.bytes.slice() };
  return { ...input, bytes: input.bytes.slice(), decoded: applyDecodedTransformation(kind, input.decoded) };
};

function distance(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  if (length === 0) return 0;
  let total = 0;
  for (let index = 0; index < length; index += 1) total += ((left[index] ?? 0) - (right[index] ?? 0)) ** 2;
  return Math.sqrt(total / length);
}

function variance(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
}

export async function runTransformationLab(input: {
  caseId: UUIDv7;
  inputBundle: ForensicFeatureBundle;
  original: TransformationImageInput;
  transformations?: readonly TransformationKind[];
  execute?: TransformationExecutor;
  detectorScore?: DetectorScore;
  now?: string;
}): Promise<readonly TransformationRun[]> {
  const execute = input.execute ?? defaultTransformationExecutor;
  const originalScore = input.detectorScore ? await input.detectorScore(input.inputBundle) : null;
  const results: TransformationRun[] = [];
  for (const transformation of input.transformations ?? DEFAULT_TRANSFORMATIONS) {
    const transformed = await execute(transformation, input.original);
    const bundle = await generateForensicFeatureBundle({ caseId: input.caseId, mime: transformed.mime, bytes: transformed.bytes, decoded: transformed.decoded, now: input.now });
    const transformedScore = input.detectorScore ? await input.detectorScore(bundle) : null;
    const scores = originalScore === null || transformedScore === null ? [] : [originalScore, transformedScore];
    results.push({
      id: uuidv7(),
      caseId: input.caseId,
      inputBundleId: input.inputBundle.id,
      transformation,
      originalFeatureVector: input.inputBundle.featureVector,
      transformedFeatureVector: bundle.featureVector,
      featureDistance: distance(input.inputBundle.featureVector, bundle.featureVector),
      detectorScoreIfAvailable: transformedScore,
      scoreVariance: variance(scores),
      audit: createDecisionAudit({
        timestamp: input.now,
        reasonCodes: ['TRANSFORMATION_STABILITY_MEASUREMENT_ONLY', 'NOT_USED_FOR_ENFORCEMENT'],
        executionMs: bundle.audit.executionMs,
        costEstimateUsd: 0,
        modelVersion: null,
        uncertainty: { grade: 'unknown', lowerBound: null, upperBound: null, rationale: 'Transformation stability requires evaluation and calibration.' },
      }),
    });
  }
  return results;
}
