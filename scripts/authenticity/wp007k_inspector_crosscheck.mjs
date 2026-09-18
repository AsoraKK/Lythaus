import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectBytes } from './wp007j_jpeg_inspector.mjs';
import sharp from 'sharp';

const [, , manifestPath, featurePath, rootDir, outputPath] = process.argv;
if (!manifestPath || !featurePath || !rootDir || !outputPath) {
  throw new Error('usage: node wp007k_inspector_crosscheck.mjs <manifest> <features> <root> <output>');
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const features = JSON.parse(await readFile(featurePath, 'utf8'));
const featureById = new Map(features.records.map((row) => [row.recordId, row]));
const counters = {
  valid: 0,
  formatMatch: 0,
  dimensionMatch: 0,
  samplingMatch: 0,
  qualityMatch: 0,
  sha256Match: 0,
  independentFormatMatch: 0,
  independentDimensionMatch: 0,
  independentSamplingAgreement: 0,
  progressiveAgreement: 0,
};
const mismatches = [];

for (const row of manifest.records) {
  const filePath = path.join(rootDir, row.relativePath);
  const bytes = new Uint8Array(await readFile(filePath));
  const digest = createHash('sha256').update(bytes).digest('hex');
  const inspected = inspectBytes(bytes);
  const feature = featureById.get(row.recordId);
  const expectedFormat = row.relativePath.toLowerCase().endsWith('.png') ? 'PNG' : 'JPEG';
  const dimensionMatch = !feature || (
    inspected.dimensions?.width === feature.decodedWidth &&
    inspected.dimensions?.height === feature.decodedHeight
  );
  const featureCodec = feature?.codecFacts || {};
  const samplingMatch = expectedFormat === 'PNG' || !feature || inspected.sampling === featureCodec.sampling;
  const qualityMatch = expectedFormat === 'PNG' || !feature || inspected.estimatedStandardQuality.quality === featureCodec.estimatedQuality;
  const formatMatch = inspected.format === expectedFormat && inspected.valid;
  const independent = await sharp(filePath).metadata();
  const independentFormat = expectedFormat === 'PNG' ? independent.format === 'png' : independent.format === 'jpeg';
  const independentDimensions = !feature || (independent.width === feature.decodedWidth && independent.height === feature.decodedHeight);
  const independentSampling = expectedFormat === 'PNG' || !feature || independent.chromaSubsampling === featureCodec.sampling;
  const progressiveMatch = expectedFormat === 'PNG' || !feature || Boolean(independent.isProgressive) === Boolean(featureCodec.progressive);
  counters.valid += inspected.valid ? 1 : 0;
  counters.formatMatch += formatMatch ? 1 : 0;
  counters.dimensionMatch += dimensionMatch ? 1 : 0;
  counters.samplingMatch += samplingMatch ? 1 : 0;
  counters.qualityMatch += qualityMatch ? 1 : 0;
  counters.sha256Match += digest === row.sha256 ? 1 : 0;
  counters.independentFormatMatch += independentFormat ? 1 : 0;
  counters.independentDimensionMatch += independentDimensions ? 1 : 0;
  counters.independentSamplingAgreement += independentSampling ? 1 : 0;
  counters.progressiveAgreement += progressiveMatch ? 1 : 0;
  if (!formatMatch || !dimensionMatch || !samplingMatch || !qualityMatch || digest !== row.sha256 || !independentFormat || !independentDimensions || !independentSampling || !progressiveMatch) {
    mismatches.push({
      recordId: row.recordId,
      relativePath: row.relativePath,
      expectedSha256: row.sha256,
      actualSha256: digest,
      expectedFormat,
      observedFormat: inspected.format,
      dimensionMatch,
      samplingMatch,
      qualityMatch,
      independent: {
        format: independent.format,
        width: independent.width,
        height: independent.height,
        chromaSubsampling: independent.chromaSubsampling,
        isProgressive: independent.isProgressive,
      },
    });
  }
}

const output = {
  schemaVersion: 'lythaus-wp007k-jpeg-inspector-crosscheck-v1',
  manifestSha256: createHash('sha256').update(await readFile(manifestPath)).digest('hex'),
  featureSha256: createHash('sha256').update(await readFile(featurePath)).digest('hex'),
  inspector: 'wp007j_jpeg_inspector.mjs',
  independentDecoder: `sharp-${sharp.versions.sharp} / libvips-${sharp.versions.vips}`,
  recordCount: manifest.records.length,
  counters,
  mismatchCount: mismatches.length,
  mismatches,
  currentByteFactsOnly: true,
  previousJpegHistory: 'UNDETERMINED_FROM_FINAL_BYTES',
  flux2PixelAccess: false,
  flux2ProviderCalls: 0,
};
await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ recordCount: output.recordCount, counters, mismatchCount: output.mismatchCount, flux2PixelAccess: false, flux2ProviderCalls: 0 }));
