import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10,
  17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34,
  27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46,
  53, 60, 61, 54, 47, 55, 62, 63,
];

const LUMA_QTABLE = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

const CHROMA_QTABLE = [
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
];

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function u16(bytes, offset) {
  return offset + 1 < bytes.length ? (bytes[offset] << 8) | bytes[offset + 1] : null;
}

function u32(bytes, offset) {
  return offset + 3 < bytes.length
    ? (((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0)
    : null;
}

function ascii(bytes, start, length) {
  return new TextDecoder().decode(bytes.slice(start, Math.min(bytes.length, start + length))).replace(/[\u0000-\u001f]+/g, ' ').trim();
}

function hasSignature(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

function naturalTable(zigzagValues) {
  const natural = Array(64).fill(null);
  for (let index = 0; index < Math.min(64, zigzagValues.length); index += 1) natural[ZIGZAG[index]] = zigzagValues[index];
  return natural;
}

function scaledTable(base, quality) {
  const scale = quality < 50 ? Math.floor(5000 / quality) : 200 - (quality * 2);
  return base.map((value) => Math.min(255, Math.max(1, Math.floor((value * scale + 50) / 100))));
}

export function estimateStandardQuality(tables) {
  if (!tables?.length) return { quality: null, normalizedError: null, confidence: 'UNAVAILABLE' };
  let best = { quality: null, error: Number.POSITIVE_INFINITY };
  for (let quality = 1; quality <= 100; quality += 1) {
    let totalError = 0;
    let totalWeight = 0;
    for (const table of tables) {
      const base = table.id === 0 ? LUMA_QTABLE : CHROMA_QTABLE;
      const expected = scaledTable(base, quality);
      for (let index = 0; index < 64; index += 1) {
        const actual = table.values[index] ?? 0;
        totalError += Math.abs(actual - expected[index]);
        totalWeight += Math.max(1, expected[index]);
      }
    }
    const error = totalError / totalWeight;
    if (error < best.error) best = { quality, error };
  }
  return {
    quality: best.quality,
    normalizedError: Number(best.error.toFixed(6)),
    confidence: best.error <= 0.03 ? 'HIGH_TABLE_MATCH' : best.error <= 0.1 ? 'MEDIUM_TABLE_MATCH' : 'LOW_TABLE_MATCH',
  };
}

function samplingLabel(components) {
  if (!components.length) return 'UNKNOWN';
  const luma = components.find((component) => component.id === 1) ?? components[0];
  const chroma = components.filter((component) => component.id !== luma.id);
  if (!chroma.length) return 'GRAYSCALE_OR_SINGLE_COMPONENT';
  if (luma.h === 1 && luma.v === 1 && chroma.every((component) => component.h === 1 && component.v === 1)) return '4:4:4';
  if (luma.h === 2 && luma.v === 1 && chroma.every((component) => component.h === 1 && component.v === 1)) return '4:2:2';
  if (luma.h === 2 && luma.v === 2 && chroma.every((component) => component.h === 1 && component.v === 1)) return '4:2:0';
  return 'OTHER_OR_NONSTANDARD';
}

function markerText(marker) {
  if (marker === 0xe0) return 'APP0';
  if (marker === 0xe1) return 'APP1';
  if (marker === 0xe2) return 'APP2';
  if (marker === 0xeb) return 'APP11';
  if (marker === 0xee) return 'APP14';
  if (marker === 0xfe) return 'COM';
  if (SOF_MARKERS.has(marker)) return 'SOF';
  if (marker === 0xdb) return 'DQT';
  if (marker === 0xda) return 'SOS';
  if (marker === 0xd9) return 'EOI';
  return `0x${marker.toString(16).padStart(2, '0')}`;
}

function inspectJpeg(bytes) {
  const tables = [];
  const components = [];
  const metadata = new Set();
  const markers = [];
  let width = null;
  let height = null;
  let progressive = null;
  let offset = 2;
  let valid = true;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    markers.push(markerText(marker));
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xd8) continue;
    if (offset + 1 >= bytes.length) { valid = false; break; }
    const length = u16(bytes, offset);
    if (length === null || length < 2 || offset + length > bytes.length) { valid = false; break; }
    const dataStart = offset + 2;
    const dataEnd = offset + length;
    if (marker === 0xdb) {
      let cursor = dataStart;
      while (cursor < dataEnd) {
        const info = bytes[cursor++];
        const precision = info >> 4;
        const id = info & 0x0f;
        const count = precision === 0 ? 64 : precision === 1 ? 128 : 0;
        if (!count || cursor + count > dataEnd) { valid = false; break; }
        const raw = [];
        if (precision === 0) {
          for (let index = 0; index < 64; index += 1) raw.push(bytes[cursor + index]);
        } else {
          for (let index = 0; index < 64; index += 1) raw.push(u16(bytes, cursor + index * 2));
        }
        tables.push({ id, precisionBits: precision === 0 ? 8 : 16, values: naturalTable(raw) });
        cursor += count;
      }
    } else if (SOF_MARKERS.has(marker) && length >= 8) {
      height = u16(bytes, dataStart + 1);
      width = u16(bytes, dataStart + 3);
      progressive = marker === 0xc2 || marker === 0xca;
      const count = bytes[dataStart + 5] ?? 0;
      let cursor = dataStart + 6;
      for (let index = 0; index < count && cursor + 2 < dataEnd; index += 1) {
        const id = bytes[cursor];
        const hv = bytes[cursor + 1];
        components.push({ id, h: hv >> 4, v: hv & 0x0f, quantizationTable: bytes[cursor + 2] });
        cursor += 3;
      }
    } else if (marker === 0xe0 && ascii(bytes, dataStart, Math.min(32, dataEnd - dataStart)).startsWith('JFIF')) {
      metadata.add('JFIF');
    } else if (marker === 0xe1) {
      const text = ascii(bytes, dataStart, Math.min(512, dataEnd - dataStart));
      if (text.includes('Exif')) metadata.add('EXIF');
      if (/xmp|adobe/i.test(text)) metadata.add('XMP');
    } else if (marker === 0xe2) {
      const text = ascii(bytes, dataStart, Math.min(512, dataEnd - dataStart));
      if (/ICC_PROFILE/i.test(text)) metadata.add('ICC_PROFILE');
      if (/c2pa/i.test(text)) metadata.add('C2PA_INTERFACE');
    } else if (marker === 0xeb && /c2pa/i.test(ascii(bytes, dataStart, Math.min(512, dataEnd - dataStart)))) {
      metadata.add('C2PA_INTERFACE');
    } else if (marker === 0xee) {
      metadata.add('APP14');
    } else if (marker === 0xfe) {
      metadata.add('COM');
    }
    offset = dataEnd;
  }
  const quality = estimateStandardQuality(tables);
  return {
    format: 'JPEG',
    valid,
    dimensions: width && height ? { width, height, pixelCount: width * height } : null,
    progressive,
    sampling: samplingLabel(components),
    components,
    quantizationTables: tables,
    estimatedStandardQuality: quality,
    metadata: [...metadata].sort(),
    markers,
    currentEncodingFacts: {
      currentContainer: 'JPEG',
      qualityEstimateIsNotUniversal: true,
      previousJpegHistory: 'UNDETERMINED_FROM_FINAL_BYTES',
      doubleJpeg: 'NOT_INFERRED',
      resampling: 'NOT_INFERRED',
    },
  };
}

function inspectPng(bytes) {
  const chunks = [];
  let width = null;
  let height = null;
  const metadata = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = u32(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (length === null || offset + 12 + length > bytes.length) break;
    chunks.push(type);
    if (type === 'IHDR' && length >= 13) {
      width = u32(bytes, offset + 8);
      height = u32(bytes, offset + 12);
    }
    if (type === 'eXIf') metadata.push('EXIF');
    if (['iTXt', 'tEXt', 'zTXt'].includes(type)) {
      const text = ascii(bytes, offset + 8, Math.min(length, 512));
      if (/xmp/i.test(text)) metadata.push('XMP');
      if (/c2pa/i.test(text)) metadata.push('C2PA_INTERFACE');
    }
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return {
    format: 'PNG',
    valid: chunks.includes('IHDR'),
    dimensions: width && height ? { width, height, pixelCount: width * height } : null,
    progressive: null,
    sampling: 'NOT_APPLICABLE_TO_PNG_CONTAINER',
    components: [],
    quantizationTables: [],
    estimatedStandardQuality: { quality: null, normalizedError: null, confidence: 'NOT_APPLICABLE' },
    metadata: [...new Set(metadata)].sort(),
    markers: chunks,
    currentEncodingFacts: {
      currentContainer: 'PNG',
      losslessCurrentContainer: true,
      previousJpegHistory: 'UNDETERMINED_FROM_FINAL_BYTES',
      doubleJpeg: 'NOT_APPLICABLE_TO_CONTAINER',
      resampling: 'NOT_INFERRED',
    },
  };
}

export function inspectBytes(bytes) {
  if (hasSignature(bytes, [0xff, 0xd8])) return inspectJpeg(bytes);
  if (hasSignature(bytes, PNG_SIGNATURE)) return inspectPng(bytes);
  return {
    format: 'UNKNOWN',
    valid: false,
    dimensions: null,
    currentEncodingFacts: {
      previousJpegHistory: 'UNDETERMINED_FROM_FINAL_BYTES',
      syntheticEvidence: 'NOT_A_FUNCTION_OF_THIS_INSPECTOR',
    },
  };
}

async function main() {
  const pathIndex = process.argv.indexOf('--path');
  if (pathIndex < 0 || !process.argv[pathIndex + 1]) throw new Error('usage: node wp007j_jpeg_inspector.mjs --path <image> [--id <logical-id>]');
  const filePath = path.resolve(process.argv[pathIndex + 1]);
  const bytes = new Uint8Array(await readFile(filePath));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const idIndex = process.argv.indexOf('--id');
  const requestedId = idIndex >= 0 ? process.argv[idIndex + 1] : null;
  const result = inspectBytes(bytes);
  console.log(JSON.stringify({
    schemaVersion: 'lythaus-wp007j-jpeg-inspector-v1',
    sampleId: requestedId || `sample-${sha256.slice(0, 16)}`,
    sha256,
    byteLength: bytes.length,
    ...result,
    evidenceRole: 'INPUT_REGIME_CONTEXT_ONLY',
    productAuthority: 'NONE',
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
