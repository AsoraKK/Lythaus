import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const REQUIRED_FIELDS = [
  'sampleId',
  'sourceFamilyId',
  'provider',
  'product',
  'generatorFamily',
  'benchmarkRole',
  'trainingEligibility',
  'rightsClass',
];
const ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/u;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function rejectPrivatePath(value, field) {
  if (typeof value === 'string' && ABSOLUTE_PATH.test(value)) throw new Error(`wp007a_import_private_path:${field}`);
}

function sanitizedRecord(input, index) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`wp007a_import_record_invalid:${index}`);
  for (const field of REQUIRED_FIELDS) if (typeof input[field] !== 'string' || input[field].trim() === '') throw new Error(`wp007a_import_required:${field}`);
  for (const [field, value] of Object.entries(input)) rejectPrivatePath(value, field);
  if (input.filePath) throw new Error('wp007a_import_file_path_not_persisted');
  if (!/^[a-f0-9]{64}$/u.test(String(input.sha256 ?? ''))) throw new Error(`wp007a_import_hash_required:${index}`);
  if (!Number.isInteger(input.width) || input.width < 1 || !Number.isInteger(input.height) || input.height < 1) throw new Error(`wp007a_import_dimensions_required:${index}`);
  if (typeof input.format !== 'string' || input.format.trim() === '') throw new Error(`wp007a_import_format_required:${index}`);
  return {
    sampleId: input.sampleId,
    sourceFamilyId: input.sourceFamilyId,
    parentSourceFamilyId: input.parentSourceFamilyId ?? null,
    artifactTruth: {
      physicalCameraAcquisition: 'FALSE',
      syntheticDepictedContent: 'TRUE',
      localManipulation: 'FALSE',
      digitalCapture: 'TRUE',
      screenRecapture: 'FALSE',
    },
    provenance: {
      provider: input.provider,
      product: input.product,
      generatorFamily: input.generatorFamily,
      generatorModel: input.generatorModel ?? 'UNKNOWN',
      generatorVersion: input.generatorVersion ?? 'UNKNOWN',
      generationRoute: input.generationRoute ?? 'OWNER_SUPPLIED_PROVIDER_OUTPUT',
      promptId: input.promptId ?? null,
      prompt: input.prompt ?? null,
      seed: input.seed ?? 'NOT_SUPPORTED',
      createdAt: input.createdAt ?? null,
      truthSource: input.truthSource ?? 'OWNER_SUPPLIED_PROVENANCE',
    },
    rights: {
      sourceLicense: input.sourceLicense ?? 'PROVIDER_OUTPUT_TERMS_REVIEW',
      providerTermsClass: input.rightsClass,
      trainingEligibility: input.trainingEligibility,
      evaluationEligibility: Boolean(input.evaluationEligibility),
      commercialConstraint: input.commercialConstraint ?? 'ROUTE_SPECIFIC_REVIEW_REQUIRED',
      rightsAuditId: input.rightsAuditId ?? null,
    },
    file: { sha256: input.sha256, width: input.width, height: input.height, format: input.format.toUpperCase() },
    benchmark: { role: input.benchmarkRole, generatorHoldoutGroup: input.generatorHoldoutGroup ?? null, hardNegativeSubtype: null, promptTaxonomy: input.promptTaxonomy ?? null, mixedOrigin: false, duplicateGroupId: null, nearDuplicateReviewStatus: 'NOT_ASSESSED' },
  };
}

export function providerImportTemplate() {
  return {
    schemaVersion: 'lythaus-wp007a-provider-image-import-v1',
    instructions: 'Provide metadata only; the importer derives sha256 from local bytes and never persists private paths.',
    records: [{
      sampleId: 'OWNER_PROVIDER_001',
      sourceFamilyId: 'OWNER_PROVIDER_FAMILY_001',
      provider: 'OPENAI',
      product: 'CHATGPT_IMAGE',
      generatorFamily: 'OPENAI_CHATGPT_IMAGE',
      generatorVersion: 'UNKNOWN',
      promptId: 'PROMPT_001',
      prompt: null,
      seed: 'NOT_SUPPORTED',
      width: 1024,
      height: 1024,
      createdAt: null,
      sha256: null,
      truthSource: 'OWNER_SUPPLIED_PROVENANCE',
      rightsClass: 'REVIEW_REQUIRED',
      trainingEligibility: 'REVIEW_REQUIRED',
      evaluationEligibility: false,
      benchmarkRole: 'EXTERNAL_PROVIDER_HOLDOUT',
      rightsAuditId: 'WP007A-RIGHTS-OPENAI-CHATGPT',
    }],
  };
}

export async function importProviderImages({ inputPath, outputPath, deriveFromFiles = false } = {}) {
  if (!inputPath || !outputPath) throw new Error('wp007a_import_paths_required');
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  if (!Array.isArray(input.records)) throw new Error('wp007a_import_records_missing');
  const records = [];
  for (let index = 0; index < input.records.length; index += 1) {
    const source = input.records[index];
    if (deriveFromFiles && source.filePath) {
      const bytes = await readFile(source.filePath);
      source.sha256 = sha256(bytes);
      const metadata = await sharp(bytes, { failOn: 'none' }).metadata();
      source.width = metadata.width;
      source.height = metadata.height;
      source.format = metadata.format?.toUpperCase();
      source.filePath = undefined;
    }
    records.push(sanitizedRecord(source, index));
  }
  const output = { schemaVersion: 'lythaus-wp007a-provider-image-import-v1', recordCount: records.length, records };
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  return output;
}

async function main(argv) {
  if (argv.includes('--template')) {
    const output = path.resolve(argv[argv.indexOf('--template') + 1] ?? 'research/wp007a/provider-image-import-template.json');
    await writeFile(output, `${JSON.stringify(providerImportTemplate(), null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ status: 'template_written', output: 'provider-image-import-template.json' }));
    return;
  }
  const inputPath = argv.includes('--input') ? path.resolve(argv[argv.indexOf('--input') + 1]) : null;
  const outputPath = argv.includes('--output') ? path.resolve(argv[argv.indexOf('--output') + 1]) : null;
  if (!inputPath || !outputPath) throw new Error('usage: --template PATH or --input PATH --output PATH');
  const result = await importProviderImages({ inputPath, outputPath, deriveFromFiles: argv.includes('--derive-from-files') });
  console.log(JSON.stringify({ status: 'imported', recordCount: result.recordCount }));
}

if (process.argv[1] && path.basename(process.argv[1]) === path.basename(new URL(import.meta.url).pathname)) await main(process.argv.slice(2));
