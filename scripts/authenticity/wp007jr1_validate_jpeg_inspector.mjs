import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectBytes } from './wp007j_jpeg_inspector.mjs';

function parseArgs() {
  return Object.fromEntries(process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.split('=');
    return [key.replace(/^--/, ''), rest.join('=')];
  }));
}

function expectedSampling(value) {
  if (value === '4:4:4' || value === '4:2:2' || value === '4:2:0') return value;
  return null;
}

async function validateManifest({ manifestPath, root, sharp, rows }) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const record of manifest.records) {
    const filePath = path.join(root, record.relativeOutputPath);
    const bytes = new Uint8Array(await readFile(filePath));
    const inspected = inspectBytes(bytes);
    const metadata = await sharp(filePath).metadata();
    const expectedFormat = record.operation === 'JPEG_TO_PNG' ? 'PNG' : 'JPEG';
    const expectedSamplingValue = expectedSampling(record.requestedSubsampling);
    const sharpSampling = metadata.chromaSubsampling ?? null;
    rows.push({
      derivedId: record.derivedId,
      operation: record.operation,
      encoder: record.encoder,
      requestedQuality: record.requestedQuality,
      requestedSubsampling: record.requestedSubsampling,
      fileSha256: record.sha256,
      inspector: {
        valid: inspected.valid,
        format: inspected.format,
        dimensions: inspected.dimensions,
        sampling: inspected.sampling,
        progressive: inspected.progressive,
        estimatedQuality: inspected.estimatedStandardQuality,
        quantizationTableCount: inspected.quantizationTables?.length ?? 0,
        metadata: inspected.metadata,
      },
      independentSharp: {
        format: String(metadata.format || '').toUpperCase(),
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        chromaSubsampling: sharpSampling,
        isProgressive: metadata.isProgressive ?? null,
      },
      checks: {
        inspectorValid: inspected.valid === true,
        formatMatches: inspected.format === expectedFormat,
        dimensionsMatch: Boolean(inspected.dimensions && inspected.dimensions.width === metadata.width && inspected.dimensions.height === metadata.height),
        samplingMatchesRequested: expectedSamplingValue === null || inspected.sampling === expectedSamplingValue,
        independentFormatMatches: String(metadata.format || '').toUpperCase() === expectedFormat,
        independentDimensionsMatch: metadata.width === inspected.dimensions?.width && metadata.height === inspected.dimensions?.height,
        independentSamplingAgreement: expectedSamplingValue === null || sharpSampling === expectedSamplingValue || (expectedSamplingValue === '4:4:4' && sharpSampling === '4:4:4'),
        progressiveAgreement: expectedFormat !== 'JPEG' || inspected.progressive === (metadata.isProgressive ?? null),
        qualityEstimateAvailable: record.requestedQuality === null || inspected.estimatedStandardQuality?.quality !== null,
      },
    });
  }
  return manifest;
}

async function main() {
  const args = parseArgs();
  for (const key of ['pillow-manifest', 'pillow-root', 'sharp-manifest', 'sharp-root', 'output', 'sharp-package-json']) {
    if (!args[key]) throw new Error(`MISSING_ARG:${key}`);
  }
  const sharp = createRequire(path.resolve(args['sharp-package-json']))('sharp');
  const rows = [];
  const pillow = await validateManifest({ manifestPath: args['pillow-manifest'], root: args['pillow-root'], sharp, rows });
  const sharpManifest = await validateManifest({ manifestPath: args['sharp-manifest'], root: args['sharp-root'], sharp, rows });
  const mismatches = rows.flatMap((row) => Object.entries(row.checks).filter(([, value]) => !value).map(([check]) => ({ derivedId: row.derivedId, check })));
  const qualityRows = rows.filter((row) => row.requestedQuality !== null && row.operation !== 'JPEG_TO_PNG');
  const qualityExact = qualityRows.filter((row) => row.inspector.estimatedQuality?.quality === row.requestedQuality).length;
  const output = {
    schemaVersion: 'lythaus-wp007jr1-jpeg-inspector-validation-v1',
    inspector: 'research/wp007j_jpeg_inspector.mjs',
    independentDecoder: `sharp-${sharp.versions?.sharp ?? 'unknown'} / libvips-${sharp.versions?.vips ?? 'unknown'}`,
    pillowManifestSha256: pillow.generatedManifestSha256,
    sharpManifestSha256: sharpManifest.generatedManifestSha256,
    records: rows.length,
    mismatches,
    summary: {
      validCount: rows.filter((row) => row.checks.inspectorValid).length,
      formatMatchCount: rows.filter((row) => row.checks.formatMatches).length,
      dimensionMatchCount: rows.filter((row) => row.checks.dimensionsMatch).length,
      samplingMatchCount: rows.filter((row) => row.checks.samplingMatchesRequested).length,
      independentFormatMatchCount: rows.filter((row) => row.checks.independentFormatMatches).length,
      independentDimensionMatchCount: rows.filter((row) => row.checks.independentDimensionsMatch).length,
      independentSamplingAgreementCount: rows.filter((row) => row.checks.independentSamplingAgreement).length,
      progressiveAgreementCount: rows.filter((row) => row.checks.progressiveAgreement).length,
      qualityRows: qualityRows.length,
      qualityEstimateExactCount: qualityExact,
      qualityEstimateExactRate: qualityRows.length ? qualityExact / qualityRows.length : null,
      sharpUnsupportedRequestedSubsampling: ['4:2:2'],
    },
    currentByteFactsOnly: true,
    priorJpegHistoryInference: 'UNDETERMINED_FROM_FINAL_BYTES',
    flux2PixelAccess: false,
    flux2ProviderCalls: 0,
    rows,
  };
  await writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ records: rows.length, mismatches: mismatches.length, qualityExactRate: output.summary.qualityEstimateExactRate }));
}

await main();
