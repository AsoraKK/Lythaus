import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalSha(value) {
  return sha256(Buffer.from(JSON.stringify(canonicalize(value))));
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.split('=');
    return [key.replace(/^--/, ''), rest.join('=')];
  }));
  for (const key of ['cohort', 'media-root', 'output-root', 'manifest-output', 'sharp-package-json']) {
  if (!args[key]) throw new Error(`MISSING_ARG:${key}`);
  }
  const sharp = createRequire(path.resolve(args['sharp-package-json']))('sharp');
  const sharpVersion = sharp.versions?.sharp ?? null;
  const libvipsVersion = sharp.versions?.vips ?? null;
  const cohort = JSON.parse(await readFile(args.cohort, 'utf8'));
  if (!cohort.scoreBlind || cohort.flux2PixelAccess || cohort.flux2ProviderCalls !== 0) throw new Error('JPEG_COHORT_NOT_FROZEN_OR_SEALED');
  const all = cohort.records;
  const subset = [
    ...all.filter((row) => row.role === 'JPEG_LAB_SYNTHETIC'),
    ...all.filter((row) => row.sourceSubtype === 'CAMERA_NATIVE').slice(0, 10),
    ...all.filter((row) => row.sourceSubtype !== 'CAMERA_NATIVE').slice(0, 10),
  ];
  const unique = [...new Map(subset.map((row) => [row.sampleId, row])).values()].sort((a, b) => a.sampleId.localeCompare(b.sampleId));
  const root = path.resolve(args['media-root']);
  const outputRoot = path.resolve(args['output-root']);
  const records = [];
  await mkdir(outputRoot, { recursive: true });
  for (const parent of unique) {
    const inputPath = path.join(root, parent.relativePath);
    const inputBytes = await readFile(inputPath);
    if (sha256(inputBytes) !== parent.sha256) throw new Error(`PARENT_HASH_MISMATCH:${parent.sampleId}`);
    const safeName = parent.sampleId.replace(/[\\/]/g, '_');
    for (const chromaSubsampling of ['4:4:4', '4:2:0']) {
      const outputPath = path.join(outputRoot, chromaSubsampling.replaceAll(':', ''), `${safeName}.jpg`);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await sharp(inputBytes).removeAlpha().jpeg({ quality: 95, chromaSubsampling, progressive: false, mozjpeg: false }).toFile(outputPath);
      const outputBytes = await readFile(outputPath);
      records.push({
        derivedId: `${parent.sampleId}__JPEG95_SHARP_${chromaSubsampling.replaceAll(':', '')}__SHARP_LIBVIPS__jpg`,
        parentSampleId: parent.sampleId,
        sourceFamilyId: parent.sourceFamilyId,
        generatorFamily: parent.generatorFamily,
        truthLabel: parent.label,
        sourceSubtype: parent.sourceSubtype,
        operation: 'JPEG95_SHARP_SUBSAMPLING',
        encoder: 'SHARP_LIBVIPS',
        requestedQuality: 95,
        requestedSubsampling: chromaSubsampling,
        relativeOutputPath: path.relative(outputRoot, outputPath).replaceAll('\\', '/'),
        bytes: outputBytes.length,
        sha256: sha256(outputBytes),
        sourceSha256: parent.sha256,
      });
    }
  }
  records.sort((a, b) => a.derivedId.localeCompare(b.derivedId));
  const payload = {
    schemaVersion: 'lythaus-wp007jr1-jpeg-lab-sharp-v1',
    sourceCohortFreezeSha256: cohort.freezeSha256,
    scoreBlind: true,
    flux2PixelAccess: false,
    flux2ProviderCalls: 0,
    encoder: 'SHARP_LIBVIPS',
    sharpVersion,
    libvipsVersion,
    supportedSubsampling: ['4:4:4', '4:2:0'],
    unsupportedRequestedSubsampling: ['4:2:2'],
    records,
  };
  payload.generatedManifestSha256 = canonicalSha(payload);
  await writeFile(args['manifest-output'], `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ parents: unique.length, generated: records.length, manifestSha256: payload.generatedManifestSha256 }));
}

await main();
