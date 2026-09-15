import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWp007ahManifest } from '../../packages/authenticity/src/wp007ah.ts';
import {
  WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256,
  WP007AHR4_FLUX1_MODEL_ID,
  WP007AHR4_FLUX1_SUBMITTED_SEED_STATE,
} from '../../packages/authenticity/src/wp007ahr4.ts';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertExternalCache(cachePath) {
  const absolute = path.resolve(cachePath);
  const relativeToRepository = path.relative(REPOSITORY_ROOT, absolute);
  if (relativeToRepository === '' || (!relativeToRepository.startsWith('..') && !path.isAbsolute(relativeToRepository))) throw new Error('wp007ahr_output_cache_inside_repository');
  const workspace = process.env.GITHUB_WORKSPACE;
  if (workspace) {
    const relativeToWorkspace = path.relative(path.resolve(workspace), absolute);
    if (relativeToWorkspace === '' || (!relativeToWorkspace.startsWith('..') && !path.isAbsolute(relativeToWorkspace))) throw new Error('wp007ahr_output_cache_inside_workspace');
  }
  return absolute;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function imageFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await imageFiles(root, child));
    else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(child);
  }
  return files;
}

export async function buildTransferManifest({ cachePath, environment = process.env } = {}) {
  const cache = assertExternalCache(cachePath);
  const manifestPath = path.join(cache, 'cloudflare-generation-manifest.json');
  const manifest = await readJson(manifestPath);
  assertWp007ahManifest(manifest);
  if (manifest.detectorInferenceRun !== false || manifest.modelTrainingRun !== false || manifest.transformationsRun !== false || manifest.mediaCommittedToGit !== false) throw new Error('wp007ahr_forbidden_postprocessing_state');
  if (manifest.executionMode === 'HR4_FLUX1_AMENDED_CONTRACT') {
    if (manifest.contractAmendmentSha256 !== WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256) throw new Error('wp007ahr4_transfer_amendment_hash_invalid');
    if (manifest.requestContract?.seedField !== 'OMITTED' || manifest.requestContract?.submittedSeedState !== WP007AHR4_FLUX1_SUBMITTED_SEED_STATE) throw new Error('wp007ahr4_transfer_request_contract_invalid');
    if (manifest.flux2ProviderCalls !== 0 || manifest.records.some((record) => record.generatorModelId !== WP007AHR4_FLUX1_MODEL_ID || record.contractAmendmentSha256 !== WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256 || record.submittedSeedState !== WP007AHR4_FLUX1_SUBMITTED_SEED_STATE)) throw new Error('wp007ahr4_transfer_contains_flux2_or_unamended_record');
  }

  const files = await imageFiles(cache);
  const hashes = [];
  for (const filePath of files) {
    const bytes = await readFile(filePath);
    const logicalPath = path.relative(cache, filePath).replaceAll('\\', '/');
    hashes.push({ logicalPath, sha256: hashBytes(bytes), byteSize: bytes.byteLength });
  }
  hashes.sort((left, right) => left.logicalPath.localeCompare(right.logicalPath));
  const hashesByPath = new Map(hashes.map((item) => [item.logicalPath, item]));
  for (const record of manifest.records) {
    if (typeof record.file.cacheId !== 'string' || !record.file.cacheId.startsWith('wp007ah-cloudflare/')) throw new Error(`wp007ahr_cache_id_missing:${record.sampleId}`);
    const logicalPath = record.file.cacheId.slice('wp007ah-cloudflare/'.length).replaceAll('\\', '/');
    if (!logicalPath || logicalPath.split('/').some((part) => !part || part === '..') || path.isAbsolute(logicalPath)) throw new Error(`wp007ahr_cache_id_invalid:${record.sampleId}`);
    const actual = hashesByPath.get(path.posix.join('wp007ah-cloudflare', logicalPath));
    if (!actual || actual.sha256 !== record.file.sha256 || actual.byteSize < 1) throw new Error(`wp007ahr_manifest_hash_mismatch:${record.sampleId}`);
  }

  const safeRecords = manifest.records.map((record) => ({
    sampleId: record.sampleId,
    sourceFamilyId: record.sourceFamilyId,
    generatorModelId: record.generatorModelId,
    generatorFamily: record.generatorFamily,
    promptId: record.promptId,
    seed: record.seed,
    sha256: record.file.sha256,
    width: record.file.width,
    height: record.file.height,
    format: record.file.format,
    cacheId: record.file.cacheId,
    benchmarkRole: record.benchmarkRole,
    trainingEligibility: record.trainingEligibility,
    evaluationEligibility: record.evaluationEligibility,
    ...(record.contractAmendmentSha256 ? {
      originalDerivedSeed: record.originalDerivedSeed,
      submittedSeedState: record.submittedSeedState,
      contractAmendmentSha256: record.contractAmendmentSha256,
    } : {}),
  }));
  const transferManifest = {
    schemaVersion: 'lythaus-wp007ahr-transfer-manifest-v1',
    generationStatus: manifest.generationStatus ?? 'UNKNOWN',
    executionMode: manifest.executionMode ?? null,
    contractAmendmentSha256: manifest.contractAmendmentSha256 ?? null,
    requestContract: manifest.requestContract ?? null,
    flux2ProviderCalls: manifest.flux2ProviderCalls ?? null,
    records: safeRecords,
    failures: manifest.failures,
    imageFiles: hashes,
    detectorInferenceRun: false,
    modelTrainingRun: false,
    transformationsRun: false,
    mediaCommittedToGit: false,
  };
  const runMetadata = {
    schemaVersion: 'lythaus-wp007ahr-run-metadata-v1',
    workflowPath: environment.GITHUB_WORKFLOW_PATH ?? '.github/workflows/wp007ah-cloudflare-holdout.yml',
    workflowCommit: environment.GITHUB_WORKFLOW_COMMIT ?? null,
    workflowRunId: environment.GITHUB_RUN_ID ?? null,
    workflowRunAttempt: environment.GITHUB_RUN_ATTEMPT ?? null,
    githubRef: environment.GITHUB_REF ?? null,
    githubSha: environment.GITHUB_SHA ?? null,
    generationFreezeSha256: environment.WP007AHR_EXPECTED_FREEZE_SHA256 ?? null,
    executionMode: manifest.executionMode ?? null,
    contractAmendmentSha256: manifest.contractAmendmentSha256 ?? null,
    requested: manifest.requested ?? null,
    valid: manifest.valid ?? safeRecords.length,
    failed: manifest.failed ?? manifest.failures.length,
    incrementalPaidCostUsd: manifest.incrementalPaidCostUsd ?? 0,
    roles: Object.fromEntries([...new Set(safeRecords.map((record) => record.generatorModelId))].sort().map((modelId) => [modelId, safeRecords.find((record) => record.generatorModelId === modelId)?.benchmarkRole ?? null])),
    detectorInferenceRun: false,
    modelTrainingRun: false,
    transformationsRun: false,
    mediaCommittedToGit: false,
  };
  await mkdir(cache, { recursive: true });
  await writeFile(path.join(cache, 'sha256-manifest.json'), `${JSON.stringify({ schemaVersion: 'lythaus-wp007ahr-sha256-manifest-v1', files: hashes }, null, 2)}\n`, 'utf8');
  await writeFile(path.join(cache, 'run-metadata.json'), `${JSON.stringify(runMetadata, null, 2)}\n`, 'utf8');
  return { transferManifest, runMetadata, hashes };
}

function parseArgs(argv) {
  const options = { cachePath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--output-cache') options.cachePath = argv[++index];
    else throw new Error(`unknown_argument:${argument}`);
  }
  if (!options.cachePath) throw new Error('wp007ahr_output_cache_required');
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const { cachePath } = parseArgs(process.argv.slice(2));
    const result = await buildTransferManifest({ cachePath });
    console.log(JSON.stringify({ status: 'TRANSFER_MANIFEST_READY', imageCount: result.hashes.length, credentialsPrinted: false }));
  } catch (error) {
    console.error(String(error?.message ?? error));
    process.exitCode = 1;
  }
}
