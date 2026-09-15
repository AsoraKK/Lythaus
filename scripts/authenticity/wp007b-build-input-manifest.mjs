import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashBytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableHash(value) {
  return hashBytes(stableStringify(value));
}

function argsFrom(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) throw new Error(`unexpected_argument:${argv[index]}`);
    args[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function indexDirectory(directory) {
  const index = new Map();
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    if (!(await stat(path)).isFile()) continue;
    index.set(name.replace(/\.(?:png|jpe?g)$/iu, ''), path);
  }
  return index;
}

async function main() {
  const args = argsFrom(process.argv);
  const split = await readJson(args['split-freeze']);
  const developmentDirectory = args['development-directory'];
  const finalDirectory = args['final-directory'];
  const developmentIndex = await indexDirectory(developmentDirectory);
  const finalIndex = await indexDirectory(finalDirectory);
  const groups = [
    ['developmentSynthetic', developmentIndex],
    ['developmentCamera', developmentIndex],
    ['developmentDigital', developmentIndex],
    ['sealedFinalCamera', finalIndex],
    ['sealedFinalDigital', finalIndex],
  ];
  const records = [];
  for (const [groupName, index] of groups) {
    for (const record of split[groupName] ?? []) {
      const inputPath = index.get(record.sampleId);
      if (!inputPath) throw new Error(`staged_input_missing:${record.sampleId}`);
      const bytes = await readFile(inputPath);
      const inputExtension = extname(inputPath).slice(1).toUpperCase();
      records.push({
        split: groupName,
        sampleId: record.sampleId,
        sourceFamilyId: record.sourceFamilyId,
        sourceFormat: record.format,
        sourceSha256: record.fileSha256,
        width: record.width,
        height: record.height,
        inferenceInputFormat: inputExtension,
        inferenceInputSha256: hashBytes(bytes),
        inferenceInputBytes: bytes.length,
        preprocessing: record.format === 'SVG' ? 'SVG_TO_PNG_DETERMINISTIC_HEADLESS_EDGE_RENDER_V1' : 'SOURCE_BYTES_UNCHANGED',
      });
    }
  }
  if (records.length !== 192 || new Set(records.map((record) => record.sourceFamilyId)).size !== 192) throw new Error('input_manifest_count_or_uniqueness_mismatch');
  const artifact = {
    schemaVersion: 'lythaus-wp007b-ef3-input-manifest-v1',
    splitFreezeSha256: split.splitFreezeSha256,
    scoreBlind: true,
    records,
    pixelAccessPurpose: 'SPAI_INPUT_PREPROCESSING_ONLY_BEFORE_FINAL_UNBLIND',
  };
  const inputManifestSha256 = stableHash(artifact);
  await writeFile(args.output, `${JSON.stringify({ ...artifact, inputManifestSha256 }, null, 2)}\n`, 'utf8');
  process.stdout.write(JSON.stringify({ inputManifestSha256, records: records.length, svgInputs: records.filter((record) => record.sourceFormat === 'SVG').length }));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
