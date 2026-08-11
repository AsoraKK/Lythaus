import {
  createDecisionAudit,
  type CompressionFeatures,
  type CameraEvidenceLevel,
  type FileProvenanceFeatures,
  type ForensicFeatureBundle,
  type ImageDimensions,
  type MetadataFeatures,
} from './contracts.ts';
import { uuidv7, type UUIDv7 } from './uuid.ts';

export interface DecodedImage {
  width: number;
  height: number;
  channels: 1 | 3 | 4;
  pixels: Uint8Array | Float32Array;
}

export interface MediaInspection {
  format: string;
  dimensions: ImageDimensions | null;
  metadata: MetadataFeatures;
  encoderInformation: string | null;
  compression: CompressionFeatures;
  screenshotIndicatorScore: number | null;
}

export interface ForensicInput {
  caseId: UUIDv7;
  mime: string;
  bytes: Uint8Array;
  decoded?: DecodedImage;
  now?: string;
}

interface ParsedContainer extends MediaInspection {
  progressive: boolean | null;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function hasSequence(bytes: Uint8Array, sequence: Uint8Array): boolean {
  if (sequence.length === 0 || sequence.length > bytes.length) return false;
  outer: for (let offset = 0; offset <= bytes.length - sequence.length; offset += 1) {
    for (let index = 0; index < sequence.length; index += 1) {
      if (bytes[offset + index] !== sequence[index]) continue outer;
    }
    return true;
  }
  return false;
}

function hasAscii(bytes: Uint8Array, value: string): boolean {
  return hasSequence(bytes, new TextEncoder().encode(value));
}

function u16(bytes: Uint8Array, offset: number): number {
  return offset + 1 < bytes.length ? (bytes[offset] << 8) | bytes[offset + 1] : 0;
}

function u32(bytes: Uint8Array, offset: number): number {
  return offset + 3 < bytes.length
    ? ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0
    : 0;
}

function u32le(bytes: Uint8Array, offset: number): number {
  return offset + 3 < bytes.length
    ? (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] * 0x1000000)) >>> 0
    : 0;
}

function u24(bytes: Uint8Array, offset: number): number {
  return offset + 2 < bytes.length ? bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) : 0;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder().decode(bytes.slice(start, Math.min(bytes.length, start + length))).replace(/[\u0000\u0001-\u001f]+/g, ' ').trim();
}

function dimensions(width: number, height: number): ImageDimensions | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  return { width, height, pixelCount: width * height };
}

function metadataFromBytes(bytes: Uint8Array, keys: string[] = []): MetadataFeatures {
  const exifPresent = hasAscii(bytes, 'Exif\u0000\u0000') || hasAscii(bytes, 'eXIf');
  const xmpPresent = hasAscii(bytes, 'http://ns.adobe.com/xap/1.0/') || hasAscii(bytes, 'XMP');
  const c2paPresent = hasAscii(bytes, 'c2pa') || hasAscii(bytes, 'C2PA');
  const encoderPresent = hasAscii(bytes, 'JFIF') || hasAscii(bytes, 'Adobe') || hasAscii(bytes, 'Software');
  const detected = [...keys];
  if (exifPresent) detected.push('EXIF');
  if (xmpPresent) detected.push('XMP');
  if (c2paPresent) detected.push('C2PA_INTERFACE');
  if (encoderPresent) detected.push('ENCODER_MARKER');
  return { exifPresent, xmpPresent, c2paPresent, c2pa: { status: c2paPresent ? 'PRESENT_UNVERIFIED' : 'ABSENT', manifestCount: c2paPresent ? 1 : 0 }, encoderPresent, metadataAbsent: detected.length === 0, keys: [...new Set(detected)] };
}

function emptyCompression(format: string, byteLength: number, imageDimensions: ImageDimensions | null): CompressionFeatures {
  return {
    format,
    progressive: null,
    quantisationTableCount: null,
    quantisationMean: null,
    doubleCompressionIndicator: null,
    compressionRatio: imageDimensions ? byteLength / imageDimensions.pixelCount : null,
  };
}

function parseJpeg(bytes: Uint8Array, mime: string): ParsedContainer {
  let offset = 2;
  let imageDimensions: ImageDimensions | null = null;
  let progressive: boolean | null = null;
  let quantisationTableCount = 0;
  const quantisationMeans: number[] = [];
  let encoderInformation: string | null = null;
  const keys: string[] = [];
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = u16(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;
    const dataStart = offset + 2;
    const dataEnd = offset + length;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 7) {
      imageDimensions = dimensions(u16(bytes, dataStart + 1), u16(bytes, dataStart + 3));
      progressive = marker === 0xc2 || marker === 0xca;
    }
    if (marker === 0xdb) {
      let cursor = dataStart;
      while (cursor < dataEnd) {
        const info = bytes[cursor++];
        const precisionBytes = (info >> 4) === 1 ? 128 : 64;
        if (cursor + precisionBytes > dataEnd) break;
        let total = 0;
        const valueCount = precisionBytes === 128 ? 64 : 64;
        for (let index = 0; index < valueCount; index += 1) total += precisionBytes === 128 ? u16(bytes, cursor + index * 2) : bytes[cursor + index];
        quantisationTableCount += 1;
        quantisationMeans.push(total / valueCount);
        cursor += precisionBytes;
      }
    }
    if (marker === 0xe0 || marker === 0xee || marker === 0xfe) {
      const markerText = ascii(bytes, dataStart, Math.min(120, dataEnd - dataStart));
      if (markerText) encoderInformation = encoderInformation ?? markerText;
    }
    if (marker === 0xe1 && hasAscii(bytes.slice(dataStart, dataEnd), 'Exif\u0000\u0000')) keys.push('EXIF');
    if (marker === 0xe1 && hasAscii(bytes.slice(dataStart, dataEnd), 'http://ns.adobe.com/xap/1.0/')) keys.push('XMP');
    if (marker === 0xeb && hasAscii(bytes.slice(dataStart, dataEnd), 'c2pa')) keys.push('C2PA_INTERFACE');
    offset = dataEnd;
  }
  const metadata = metadataFromBytes(bytes, keys);
  const quantisationMean = quantisationMeans.length === 0 ? null : quantisationMeans.reduce((sum, value) => sum + value, 0) / quantisationMeans.length;
  const compression: CompressionFeatures = {
    format: mime || 'image/jpeg',
    progressive,
    quantisationTableCount: quantisationTableCount || null,
    quantisationMean,
    doubleCompressionIndicator: quantisationTableCount > 1 ? Math.min(1, (quantisationTableCount - 1) / 3) : 0,
    compressionRatio: imageDimensions ? bytes.length / imageDimensions.pixelCount : null,
  };
  return {
    format: 'JPEG',
    dimensions: imageDimensions,
    metadata,
    encoderInformation,
    compression,
    screenshotIndicatorScore: metadata.metadataAbsent ? 0.2 : 0,
    progressive,
  };
}

function parsePng(bytes: Uint8Array, mime: string): ParsedContainer {
  let offset = 8;
  let imageDimensions: ImageDimensions | null = null;
  let idatCount = 0;
  const keys: string[] = [];
  let encoderInformation: string | null = null;
  while (offset + 12 <= bytes.length) {
    const length = u32(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;
    if (type === 'IHDR' && length >= 13) imageDimensions = dimensions(u32(bytes, dataStart), u32(bytes, dataStart + 4));
    if (type === 'IDAT') idatCount += 1;
    if (type === 'eXIf') keys.push('EXIF');
    if (type === 'iTXt' || type === 'tEXt' || type === 'zTXt') {
      const text = ascii(bytes, dataStart, Math.min(length, 512));
      if (/xmp/i.test(text)) keys.push('XMP');
      if (/software|creator/i.test(text)) encoderInformation = text;
    }
    if (type.toLowerCase() === 'c2pa') keys.push('C2PA_INTERFACE');
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }
  const metadata = metadataFromBytes(bytes, keys);
  return {
    format: 'PNG',
    dimensions: imageDimensions,
    metadata,
    encoderInformation,
    compression: {
      ...emptyCompression(mime || 'image/png', bytes.length, imageDimensions),
      quantisationTableCount: null,
      doubleCompressionIndicator: idatCount > 1 ? Math.min(1, (idatCount - 1) / 8) : 0,
    },
    screenshotIndicatorScore: metadata.metadataAbsent ? 0.25 : 0,
    progressive: null,
  };
}

function parseWebp(bytes: Uint8Array, mime: string): ParsedContainer {
  let imageDimensions: ImageDimensions | null = null;
  const keys: string[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const length = u32le(bytes, offset + 4);
    const dataStart = offset + 8;
    if (type === 'VP8X' && length >= 10) imageDimensions = dimensions(1 + u24(bytes, dataStart + 4), 1 + u24(bytes, dataStart + 7));
    if (type === 'EXIF') keys.push('EXIF');
    if (type === 'XMP ') keys.push('XMP');
    if (type === 'C2PA') keys.push('C2PA_INTERFACE');
    offset = dataStart + length + (length % 2);
  }
  const metadata = metadataFromBytes(bytes, keys);
  return {
    format: 'WEBP',
    dimensions: imageDimensions,
    metadata,
    encoderInformation: null,
    compression: emptyCompression(mime || 'image/webp', bytes.length, imageDimensions),
    screenshotIndicatorScore: metadata.metadataAbsent ? 0.15 : 0,
    progressive: null,
  };
}

function parseAvif(bytes: Uint8Array, mime: string): ParsedContainer {
  let imageDimensions: ImageDimensions | null = null;
  for (let offset = 0; offset + 16 <= bytes.length; offset += 1) {
    if (ascii(bytes, offset, 4) !== 'ispe') continue;
    imageDimensions = dimensions(u32(bytes, offset + 8), u32(bytes, offset + 12));
    break;
  }
  const metadata = metadataFromBytes(bytes);
  return {
    format: 'AVIF',
    dimensions: imageDimensions,
    metadata,
    encoderInformation: null,
    compression: emptyCompression(mime || 'image/avif', bytes.length, imageDimensions),
    screenshotIndicatorScore: metadata.metadataAbsent ? 0.1 : 0,
    progressive: null,
  };
}

export function inspectMedia(bytes: Uint8Array, mime = ''): MediaInspection {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return parseJpeg(bytes, mime);
  if (bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return parsePng(bytes, mime);
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return parseWebp(bytes, mime);
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp' && ['avif', 'avis'].includes(ascii(bytes, 8, 4))) return parseAvif(bytes, mime);
  return {
    format: mime || 'UNKNOWN',
    dimensions: null,
    metadata: metadataFromBytes(bytes),
    encoderInformation: null,
    compression: emptyCompression(mime || 'unknown', bytes.length, null),
    screenshotIndicatorScore: null,
  };
}

function grayscaleGrid(decoded: DecodedImage | undefined, bytes: Uint8Array, size: number): { grid: number[]; decoded: boolean; width: number; height: number } {
  if (decoded && decoded.width > 0 && decoded.height > 0 && decoded.pixels.length >= decoded.width * decoded.height * decoded.channels) {
    const grid: number[] = [];
    for (let gy = 0; gy < size; gy += 1) {
      const sourceY = Math.min(decoded.height - 1, Math.floor((gy / size) * decoded.height));
      for (let gx = 0; gx < size; gx += 1) {
        const sourceX = Math.min(decoded.width - 1, Math.floor((gx / size) * decoded.width));
        const base = (sourceY * decoded.width + sourceX) * decoded.channels;
        const red = Number(decoded.pixels[base] ?? 0);
        const green = Number(decoded.pixels[base + Math.min(1, decoded.channels - 1)] ?? red);
        const blue = Number(decoded.pixels[base + Math.min(2, decoded.channels - 1)] ?? green);
        grid.push((0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255);
      }
    }
    return { grid, decoded: true, width: decoded.width, height: decoded.height };
  }
  const grid = Array.from({ length: size * size }, (_, index) => (bytes.length === 0 ? 0 : bytes[index % bytes.length] / 255));
  return { grid, decoded: false, width: 0, height: 0 };
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: readonly number[], average = mean(values)): number {
  return values.length === 0 ? 0 : mean(values.map((value) => (value - average) ** 2));
}

function dftFeatures(grid: readonly number[], size: number): { magnitude: number[]; phase: number[] } {
  const magnitude: number[] = [];
  const phase: number[] = [];
  for (let v = 0; v < size; v += 1) {
    for (let u = 0; u < size; u += 1) {
      let real = 0;
      let imaginary = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const angle = (2 * Math.PI * ((u * x) + (v * y))) / size;
          const sample = grid[y * size + x] ?? 0;
          real += sample * Math.cos(angle);
          imaginary -= sample * Math.sin(angle);
        }
      }
      magnitude.push(Math.hypot(real, imaginary) / (size * size));
      phase.push(Math.atan2(imaginary, real) / Math.PI);
    }
  }
  return { magnitude, phase };
}

function dctFeatures(grid: readonly number[], size: number): number[] {
  const output: number[] = [];
  for (let v = 0; v < size; v += 1) {
    for (let u = 0; u < size; u += 1) {
      let total = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) total += (grid[y * size + x] ?? 0) * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size));
      }
      const alphaU = u === 0 ? Math.sqrt(1 / size) : Math.sqrt(2 / size);
      const alphaV = v === 0 ? Math.sqrt(1 / size) : Math.sqrt(2 / size);
      output.push(total * alphaU * alphaV);
    }
  }
  return output;
}

function waveletFeatures(grid: readonly number[], size: number): number[] {
  const output: number[] = [];
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const a = grid[y * size + x] ?? 0;
      const b = grid[y * size + x + 1] ?? a;
      const c = grid[(y + 1) * size + x] ?? a;
      const d = grid[(y + 1) * size + x + 1] ?? a;
      output.push((a + b + c + d) / 4, (a + b - c - d) / 4, (a - b + c - d) / 4, (a - b - c + d) / 4);
    }
  }
  return output;
}

function residualFeatures(grid: readonly number[], size: number): number[] {
  const output: number[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const current = grid[y * size + x] ?? 0;
      if (x + 1 < size) output.push(current - (grid[y * size + x + 1] ?? current));
      if (y + 1 < size) output.push(current - (grid[(y + 1) * size + x] ?? current));
    }
  }
  return output;
}

function perceptualHash(grid: readonly number[], size: number): string {
  const average = mean(grid);
  let value = 0n;
  for (let index = 0; index < Math.min(64, grid.length); index += 1) if ((grid[index] ?? 0) >= average) value |= 1n << BigInt(63 - index);
  return value.toString(16).padStart(16, '0');
}

export function computePerceptualHash(bytes: Uint8Array, decoded?: DecodedImage): string {
  return perceptualHash(grayscaleGrid(decoded, bytes, 8).grid, 8);
}

function imagePyramid(width: number, height: number, grid: readonly number[]): readonly { scale: number; width: number; height: number; mean: number; variance: number }[] {
  const levels = [1, 0.5, 0.25, 0.125];
  return levels.map((scale) => {
    const levelWidth = width > 0 ? Math.max(1, Math.round(width * scale)) : 0;
    const levelHeight = height > 0 ? Math.max(1, Math.round(height * scale)) : 0;
    if (levelWidth === 0 || levelHeight === 0 || grid.length === 0) return { scale, width: levelWidth, height: levelHeight, mean: 0, variance: 0 };
    const samples: number[] = [];
    const sourceWidth = Math.max(1, Math.round(Math.sqrt(grid.length)));
    for (let y = 0; y < levelHeight; y += 1) {
      for (let x = 0; x < levelWidth; x += 1) {
        const sourceX = Math.min(sourceWidth - 1, Math.floor((x / levelWidth) * sourceWidth));
        const sourceY = Math.min(sourceWidth - 1, Math.floor((y / levelHeight) * sourceWidth));
        samples.push(grid[sourceY * sourceWidth + sourceX] ?? 0);
      }
    }
    const average = mean(samples);
    return { scale, width: levelWidth, height: levelHeight, mean: average, variance: variance(samples, average) };
  });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function periodicMoireScore(grid: readonly number[], size: number): number {
  if (grid.length < size * size || size < 8) return 0;
  const magnitude = dftFeatures(grid, size).magnitude;
  const band = magnitude.filter((_, index) => {
    const x = index % size;
    const y = Math.floor(index / size);
    return x >= 2 && x <= size - 3 && y >= 2 && y <= size - 3;
  });
  if (band.length === 0) return 0;
  const ratio = Math.max(...band) / (mean(band) + 1e-9);
  return clamp01((ratio - 3) / 3);
}

function channelCorrelation(decoded: DecodedImage | undefined, leftChannel: number, rightChannel: number): number | null {
  if (!decoded || decoded.channels < 3 || decoded.pixels.length < decoded.width * decoded.height * decoded.channels) return null;
  const left: number[] = [];
  const right: number[] = [];
  for (let index = 0; index < decoded.width * decoded.height; index += 1) {
    left.push(Number(decoded.pixels[index * decoded.channels + leftChannel] ?? 0));
    right.push(Number(decoded.pixels[index * decoded.channels + rightChannel] ?? 0));
  }
  const leftMean = mean(left);
  const rightMean = mean(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * ((right[index] ?? 0) - rightMean), 0);
  const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) * right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0));
  return denominator === 0 ? null : clamp01((numerator / denominator + 1) / 2);
}

function cameraEvidenceFromDecoded(input: { decoded?: DecodedImage; parsed: MediaInspection; residuals: readonly number[]; edgeMagnitude: readonly number[]; moireScore: number | null }) {
  const correlations = [channelCorrelation(input.decoded, 0, 1), channelCorrelation(input.decoded, 0, 2), channelCorrelation(input.decoded, 1, 2)].filter((value): value is number => value !== null);
  const cfaProxy = correlations.length === 0 ? null : mean(correlations);
  const noiseVariance = input.decoded ? variance(input.residuals) : null;
  const edgeGradientCoherence = input.decoded ? clamp01(1 - variance(input.edgeMagnitude) * 8) : null;
  const chromaticAberrationProxy = correlations.length === 0 ? null : clamp01(1 - Math.abs((correlations[0] ?? 0) - (correlations[2] ?? 0)));
  const metadataEvidence = [
    input.parsed.metadata.exifPresent ? 'EXIF_PRESENT' : null,
    input.parsed.metadata.xmpPresent ? 'XMP_PRESENT' : null,
    input.parsed.encoderInformation ? 'ENCODER_PRESENT' : null,
    input.parsed.compression.quantisationTableCount !== null ? 'QUANTISATION_TABLES_PRESENT' : null,
  ].filter((value): value is string => value !== null);
  const cameraPipelineConsistency = metadataEvidence.length === 0 ? null : clamp01(metadataEvidence.length / 4);
  const sensorNoiseScore = noiseVariance === null ? null : clamp01(noiseVariance * 32);
  const opticalCharacteristicsScore = chromaticAberrationProxy;
  const screenRecaptureScore = input.parsed.screenshotIndicatorScore === null
    ? input.moireScore
    : clamp01(Math.max(input.parsed.screenshotIndicatorScore, input.moireScore ?? 0));
  const screenRecaptureIndicators = [
    (input.parsed.screenshotIndicatorScore ?? 0) >= 0.5 ? 'CONTAINER_SCREENSHOT_MARKER' : null,
    (input.moireScore ?? 0) >= 0.5 ? 'PERIODIC_MOIRE_PROXY' : null,
  ].filter((value): value is string => value !== null);
  let cameraOrigin: CameraEvidenceLevel = 'CAMERA_EVIDENCE_ABSENT';
  if (screenRecaptureScore !== null && screenRecaptureScore >= 0.7) cameraOrigin = 'SCREEN_RECAPTURE_LIKELY';
  else if (cameraPipelineConsistency !== null && cameraPipelineConsistency >= 0.5 && cfaProxy !== null) cameraOrigin = 'CAMERA_NATIVE_LIKELY';
  else if (input.decoded) cameraOrigin = 'CAMERA_ORIGIN_UNCERTAIN';
  return {
    cameraPipelineConsistency,
    cfaDemosaicingScore: cfaProxy,
    sensorNoiseScore,
    opticalCharacteristicsScore,
    screenRecaptureScore,
    moireScore: input.moireScore,
    cameraEvidenceApplicability: input.decoded ? 'applicable' as const : 'unavailable' as const,
    cameraOrigin,
    evidenceDetails: {
      metadataEvidence,
      cfaProxy,
      noiseVariance,
      edgeGradientCoherence,
      chromaticAberrationProxy,
      screenRecaptureIndicators,
    },
  };
}

export function featureVectorFromBundle(bundle: Pick<ForensicFeatureBundle, 'fileProvenance' | 'physicalAcquisition' | 'spectralStability' | 'reconstruction'>): readonly number[] {
  const values = [
    bundle.fileProvenance.compression.quantisationMean ?? 0,
    bundle.fileProvenance.compression.doubleCompressionIndicator ?? 0,
    bundle.fileProvenance.screenshotIndicatorScore ?? 0,
    bundle.physicalAcquisition.screenRecaptureScore ?? 0,
    bundle.spectralStability.mean ?? 0,
    bundle.spectralStability.variance ?? 0,
    bundle.reconstruction.regionalInconsistencyScore ?? 0,
    ...bundle.spectralStability.fftMagnitude.slice(0, 8),
    ...bundle.spectralStability.fftPhase.slice(0, 8),
    ...bundle.spectralStability.dct.slice(0, 8),
    ...bundle.spectralStability.wavelets.slice(0, 8),
    ...bundle.spectralStability.residuals.slice(0, 8),
    bundle.spectralStability.edgeStatistics.meanMagnitude ?? 0,
    bundle.spectralStability.edgeStatistics.variance ?? 0,
  ];
  return values.map((value) => Number.isFinite(value) ? value : 0);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function generateForensicFeatureBundle(input: ForensicInput): Promise<ForensicFeatureBundle> {
  const startedAt = Date.now();
  const parsed = inspectMedia(input.bytes, input.mime);
  const samples = grayscaleGrid(input.decoded, input.bytes, 8);
  const dft = dftFeatures(samples.grid, 8);
  const dct = dctFeatures(samples.grid, 8);
  const wavelets = waveletFeatures(samples.grid, 8);
  const residuals = residualFeatures(samples.grid, 8);
  const sampleMean = mean(samples.grid);
  const sampleVariance = variance(samples.grid, sampleMean);
  const edgeMagnitude = residuals.map(Math.abs);
  const edgeMean = samples.decoded ? mean(edgeMagnitude) : null;
  const edgeVariance = samples.decoded ? variance(edgeMagnitude) : null;
  const moireScore = samples.decoded ? clamp01(mean(edgeMagnitude) * 4) : null;
  const sha256 = await sha256Hex(input.bytes);
  const fileProvenance: FileProvenanceFeatures = {
    sha256,
    perceptualHash: perceptualHash(samples.grid, 8),
    mime: input.mime,
    dimensions: parsed.dimensions,
    metadata: parsed.metadata,
    encoderInformation: parsed.encoderInformation,
    compression: parsed.compression,
    screenshotIndicatorScore: parsed.screenshotIndicatorScore,
  };
  const physicalAcquisition = {
    cameraPipelineConsistency: null,
    cfaDemosaicingScore: null,
    sensorNoiseScore: null,
    opticalCharacteristicsScore: null,
    screenRecaptureScore: moireScore,
    moireScore,
    cameraEvidenceApplicability: 'unavailable' as const,
    cameraOrigin: parsed.metadata.exifPresent ? 'CAMERA_ORIGIN_UNCERTAIN' as const : 'CAMERA_EVIDENCE_ABSENT' as const,
  };
  const spectralStability = {
    fftMagnitude: dft.magnitude,
    fftPhase: dft.phase,
    dct,
    wavelets,
    residuals,
    transformedImageScores: [],
    featureMovement: null,
    mean: sampleMean,
    variance: sampleVariance,
    edgeStatistics: { meanMagnitude: edgeMean, variance: edgeVariance, sampleCount: samples.decoded ? edgeMagnitude.length : 0 },
    robustnessGrade: 'unknown' as const,
  };
  const reconstruction = {
    inpaintingScore: null,
    localGenerationScore: null,
    reconstructionCharacteristics: [],
    mixedOriginScore: null,
    manipulationMasks: [],
    regionalInconsistencyScore: null,
  };
  const generativeForensics = {
    syntheticFeatureScore: null,
    textureStatisticsScore: null,
    latentDecoderScore: null,
    globalStructureScore: null,
    generatorFamilyEmbedding: null,
    localSyntheticRegions: [],
    syntheticEvidence: 'NO_POSITIVE_SYNTHETIC_EVIDENCE' as const,
  };
  const bundleWithoutVector = { fileProvenance, physicalAcquisition, spectralStability, reconstruction };
  const featureVector = featureVectorFromBundle(bundleWithoutVector);
  return {
    id: uuidv7(),
    caseId: input.caseId,
    featureVersion: 'lythaus-forensics-v0',
    fileProvenance,
    physicalAcquisition,
    generativeForensics,
    spectralStability,
    reconstruction,
    imagePyramid: imagePyramid(samples.width || parsed.dimensions?.width || 0, samples.height || parsed.dimensions?.height || 0, samples.grid),
    featureVector,
    audit: createDecisionAudit({
      timestamp: input.now,
      reasonCodes: samples.decoded ? ['DETERMINISTIC_BASE_FEATURES_GENERATED', 'PHYSICAL_ACQUISITION_MODEL_NOT_RUN'] : ['DECODED_PIXELS_UNAVAILABLE', 'RAW_CONTAINER_FEATURES_ONLY', 'PHYSICAL_ACQUISITION_MODEL_NOT_RUN'],
      applicability: samples.decoded ? 'applicable' : 'unavailable',
      executionMs: Date.now() - startedAt,
      costEstimateUsd: 0,
      uncertainty: { grade: 'unknown', lowerBound: null, upperBound: null, rationale: 'No trained authenticity detector is invoked by deterministic forensics v0.' },
    }),
  };
}

export async function generateForensicFeatureBundleV1(input: ForensicInput): Promise<ForensicFeatureBundle> {
  const startedAt = Date.now();
  const parsed = inspectMedia(input.bytes, input.mime);
  const scaleDefinitions = [8, 16];
  const scaleFeatures = scaleDefinitions.map((scale) => {
    const samples = grayscaleGrid(input.decoded, input.bytes, scale);
    const dft = dftFeatures(samples.grid, scale);
    return {
      scale,
      grid: samples,
      fftMagnitude: dft.magnitude,
      fftPhase: dft.phase,
      dct: dctFeatures(samples.grid, scale),
      wavelets: waveletFeatures(samples.grid, scale),
      residuals: residualFeatures(samples.grid, scale),
    };
  });
  const base = scaleFeatures[0];
  const sampleMean = mean(base.grid.grid);
  const sampleVariance = variance(base.grid.grid, sampleMean);
  const edgeMagnitude = base.residuals.map(Math.abs);
  const moireScore = base.grid.decoded ? periodicMoireScore(base.grid.grid, base.scale) : null;
  const camera = cameraEvidenceFromDecoded({ decoded: input.decoded, parsed, residuals: base.residuals, edgeMagnitude, moireScore });
  const sha256 = await sha256Hex(input.bytes);
  const fileProvenance: FileProvenanceFeatures = {
    sha256,
    perceptualHash: perceptualHash(base.grid.grid, base.grid.grid.length === 0 ? 8 : base.scale),
    mime: input.mime,
    dimensions: parsed.dimensions,
    metadata: parsed.metadata,
    encoderInformation: parsed.encoderInformation,
    compression: parsed.compression,
    screenshotIndicatorScore: parsed.screenshotIndicatorScore,
  };
  const spectralStability = {
    fftMagnitude: base.fftMagnitude,
    fftPhase: base.fftPhase,
    dct: base.dct,
    wavelets: base.wavelets,
    residuals: base.residuals,
    transformedImageScores: [],
    featureMovement: null,
    mean: sampleMean,
    variance: sampleVariance,
    edgeStatistics: { meanMagnitude: base.grid.decoded ? mean(edgeMagnitude) : null, variance: base.grid.decoded ? variance(edgeMagnitude) : null, sampleCount: base.grid.decoded ? edgeMagnitude.length : 0 },
    robustnessGrade: 'unknown' as const,
    multiScale: scaleFeatures.map(({ scale, fftMagnitude, fftPhase, dct, wavelets, residuals }) => ({ scale, fftMagnitude, fftPhase, dct, wavelets, residuals })),
    featureLabels: ['fft_magnitude', 'fft_phase', 'dct', 'wavelets', 'residuals', 'camera_pipeline', 'cfa_proxy', 'sensor_noise', 'optical_proxy', 'screen_recapture'],
  };
  const reconstruction = {
    inpaintingScore: null,
    localGenerationScore: null,
    reconstructionCharacteristics: [],
    mixedOriginScore: null,
    manipulationMasks: [],
    regionalInconsistencyScore: null,
  };
  const generativeForensics = {
    syntheticFeatureScore: null,
    textureStatisticsScore: null,
    latentDecoderScore: null,
    globalStructureScore: null,
    generatorFamilyEmbedding: null,
    localSyntheticRegions: [],
    syntheticEvidence: 'NO_POSITIVE_SYNTHETIC_EVIDENCE' as const,
  };
  const featureVector = [
    fileProvenance.metadata.exifPresent ? 1 : 0,
    fileProvenance.metadata.xmpPresent ? 1 : 0,
    fileProvenance.encoderInformation ? 1 : 0,
    fileProvenance.compression.quantisationTableCount !== null ? 1 : 0,
    camera.cameraPipelineConsistency ?? 0,
    camera.cfaDemosaicingScore ?? 0,
    camera.sensorNoiseScore ?? 0,
    camera.opticalCharacteristicsScore ?? 0,
    camera.screenRecaptureScore ?? 0,
    ...scaleFeatures.flatMap((scale) => [
      ...scale.fftMagnitude.slice(0, 16),
      ...scale.fftPhase.slice(0, 16),
      ...scale.dct.slice(0, 16),
      ...scale.wavelets.slice(0, 16),
      ...scale.residuals.slice(0, 16),
    ]),
  ].map((value) => Number.isFinite(value) ? value : 0);
  return {
    id: uuidv7(),
    caseId: input.caseId,
    featureVersion: 'lythaus-forensics-v1',
    fileProvenance,
    physicalAcquisition: camera,
    generativeForensics,
    spectralStability,
    reconstruction,
    imagePyramid: imagePyramid(base.grid.width || parsed.dimensions?.width || 0, base.grid.height || parsed.dimensions?.height || 0, base.grid.grid),
    featureVector,
    audit: createDecisionAudit({
      timestamp: input.now,
      reasonCodes: base.grid.decoded ? ['DETERMINISTIC_V1_SPECTRAL_FEATURES_GENERATED', 'CAMERA_ORIGIN_EVIDENCE_ONLY', 'NO_ENFORCEMENT'] : ['DECODED_PIXELS_UNAVAILABLE', 'RAW_CONTAINER_FEATURES_ONLY', 'NO_ENFORCEMENT'],
      applicability: base.grid.decoded ? 'applicable' : 'unavailable',
      executionMs: Date.now() - startedAt,
      costEstimateUsd: 0,
      uncertainty: { grade: 'unknown', lowerBound: null, upperBound: null, rationale: 'v1 features are deterministic evidence and require benchmark calibration.' },
    }),
  };
}
