import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const EXPECTED = Object.freeze({
  benchmarkFingerprint: '210000b7b0d93960b23e090e396d60f97bb46d2816ee9ee7d345aae364ade3c5',
  historicalFreezeSha256: '87982112412059bd1615bd2d36ee9cf8ad72828b4042cb93839d725b6b533514',
  amendmentSha256: '2294cfeb9220be2becf08e70abb848267dcb5db2f213411e54c8883bc753431a',
  authorizationSha256: 'eaa403c2a5519bcc130a33062ef1f4bbb67ba724eb9b003f57c3e609400d91ab',
  flux1ModelId: '@cf/black-forest-labs/flux-1-schnell',
  flux1Family: 'FLUX_1_SCHNELL',
  submittedSeedState: 'NOT_SENT_ROUTE_UNSUPPORTED',
  flux2ReserveFreezeSha256: '56ae0bd15b8bc21d77b28c9e6faea8149440aab8a9d101db523a43aedb98e054',
});

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function stableHash(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function argsFrom(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unexpected_argument:${token}`);
    args[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function requireEqual(actual, expected, field) {
  if (actual !== expected) throw new Error(`${field}_mismatch`);
}

function sanitizeRecord(record) {
  return {
    sampleId: record.sampleId,
    sourceFamilyId: record.sourceFamilyId,
    promptId: record.promptId,
    generatorModelId: record.generatorModelId,
    generatorFamily: record.generatorFamily,
    generationRoute: record.generationRoute,
    promptBankVersion: record.promptBankVersion,
    requestContract: { prompt: 'FROZEN_PROMPT_TEXT_UNCHANGED', steps: 4, seedField: 'OMITTED' },
    file: {
      sha256: record.file?.sha256,
      width: record.file?.width,
      height: record.file?.height,
      format: record.file?.format,
      byteSize: record.file?.byteSize,
      cacheId: record.file?.cacheId,
    },
    originalDerivedSeed: record.originalDerivedSeed,
    submittedSeedState: record.submittedSeedState,
    contractAmendmentSha256: record.contractAmendmentSha256,
    rightsAuditId: record.rightsAuditId,
    trainingEligibility: record.trainingEligibility,
    evaluationEligibility: record.evaluationEligibility,
    benchmarkRole: record.benchmarkRole,
  };
}

async function main() {
  const args = argsFrom(process.argv);
  const generation = await readJson(args['generation-manifest']);
  const runMetadata = await readJson(args['run-metadata']);
  const records = Array.isArray(generation.records) ? generation.records : [];
  requireEqual(generation.status, 'HR4_FLUX1_MATERIALIZED', 'generation_status');
  requireEqual(generation.valid, 40, 'generation_valid');
  requireEqual(generation.failed, 0, 'generation_failed');
  requireEqual(generation.requested?.FLUX_1_SCHNELL, 40, 'generation_requested');
  if (records.length !== 40) throw new Error('generation_record_count_mismatch');
  const sanitizedRecords = records.map((record) => {
    requireEqual(record.generatorModelId, EXPECTED.flux1ModelId, 'record_model');
    requireEqual(record.generatorFamily, EXPECTED.flux1Family, 'record_family');
    requireEqual(record.submittedSeedState, EXPECTED.submittedSeedState, 'record_submitted_seed_state');
    requireEqual(record.seed, EXPECTED.submittedSeedState, 'record_seed_state');
    requireEqual(record.contractAmendmentSha256, EXPECTED.amendmentSha256, 'record_amendment');
    requireEqual(record.generationParameters?.steps, 4, 'record_steps');
    if (!record.file?.cacheId?.startsWith('wp007ah-cloudflare/')) throw new Error('record_cache_prefix_missing');
    if (record.file.cacheId.split('wp007ah-cloudflare/').length !== 2) throw new Error('record_cache_prefix_duplicated');
    return sanitizeRecord(record);
  });
  const sampleIds = sanitizedRecords.map((record) => record.sampleId);
  const sourceFamilyIds = sanitizedRecords.map((record) => record.sourceFamilyId);
  const promptIds = sanitizedRecords.map((record) => record.promptId);
  const hashes = sanitizedRecords.map((record) => record.file.sha256);
  if (new Set(sampleIds).size !== 40 || new Set(sourceFamilyIds).size !== 40 || new Set(promptIds).size !== 40 || new Set(hashes).size !== 40) {
    throw new Error('holdout_uniqueness_mismatch');
  }
  requireEqual(String(runMetadata.workflowRunId), String(args['workflow-run-id']), 'workflow_run_id');
  requireEqual(runMetadata.workflowCommit, args['workflow-commit'], 'workflow_commit');
  requireEqual(runMetadata.githubRef, 'refs/heads/main', 'workflow_ref');
  requireEqual(runMetadata.executionMode, 'HR4_FLUX1_AMENDED_CONTRACT', 'workflow_mode');
  requireEqual(runMetadata.generationFreezeSha256, EXPECTED.historicalFreezeSha256, 'workflow_freeze');
  requireEqual(runMetadata.contractAmendmentSha256, EXPECTED.amendmentSha256, 'workflow_amendment');
  const artifact = {
    schemaVersion: 'lythaus-wp007ahr4-combined-holdout-freeze-v1',
    materialisation: 'WP007AHR4_FLUX1_PLUS_FLUX2_RESERVE',
    benchmarkFingerprint: EXPECTED.benchmarkFingerprint,
    historicalGenerationFreezeSha256: EXPECTED.historicalFreezeSha256,
    executionAuthorizationSha256: EXPECTED.authorizationSha256,
    contractAmendmentSha256: EXPECTED.amendmentSha256,
    trustedWorkflow: {
      ref: 'refs/heads/main',
      commit: args['workflow-commit'],
      runId: Number(args['workflow-run-id']),
      mode: 'hr4_flux1_execute',
      confirmation: 'EXECUTE_HR4_FLUX1_AMENDED',
    },
    artifact: {
      id: Number(args['artifact-id']),
      name: args['artifact-name'],
      zipSha256: args['artifact-zip-sha256'],
      retentionDays: 1,
      privateTransfer: true,
    },
    flux1: {
      modelId: EXPECTED.flux1ModelId,
      generatorFamily: EXPECTED.flux1Family,
      requested: 40,
      valid: 40,
      failed: 0,
      providerAttempts: 40,
      attemptedCostUsd: generation.attemptedCostUsd,
      requestContract: {
        method: 'POST',
        contentType: 'application/json',
        body: { prompt: 'FROZEN_PROMPT_TEXT_UNCHANGED', steps: 4 },
        seedField: 'OMITTED',
        submittedSeedState: EXPECTED.submittedSeedState,
      },
      sampleIds,
      sourceFamilyIds,
      promptIds,
      imageSha256: hashes,
      records: sanitizedRecords,
      failures: generation.failures ?? [],
      localHashVerification: args['local-hash-verification'],
      pixelAccessBeforeFreeze: false,
    },
    flux2: {
      reserveFreezeSha256: EXPECTED.flux2ReserveFreezeSha256,
      status: 'SEALED_FUTURE_RESERVE',
      providerCallsInHr4: 0,
      regeneratedInHr4: false,
      pixelAccessBeforeFreeze: false,
      spaiAccess: 'FORBIDDEN',
    },
    roles: {
      flux1: 'SEALED_FOR_WP007B',
      flux2: 'SEALED_FUTURE_RESERVE',
      detectorInferenceBeforeFreeze: false,
      training: false,
      transformations: false,
      humanForensicSelection: false,
    },
    rights: {
      flux1: 'EVALUATION_ONLY; AUTHORIZED_FOR_BOUNDED_HOLDOUT_ONLY',
      flux2: 'EVALUATION_ONLY; AUTHORIZED_FOR_BOUNDED_HOLDOUT_ONLY',
    },
    limitations: [
      'FLUX.1 executable route omits seed because the live route rejects /seed.',
      'originalDerivedSeed is provenance only and was not submitted to the provider.',
      'This freeze is research-only and does not authorize production integration.',
    ],
  };
  if (artifact.flux1.localHashVerification !== 'PASS') throw new Error('local_hash_verification_not_pass');
  const freezeSha256 = stableHash(artifact);
  await writeFile(args.output, `${JSON.stringify({ ...artifact, freezeSha256 }, null, 2)}\n`, 'utf8');
  process.stdout.write(JSON.stringify({ freezeSha256, valid: 40, flux2ProviderCalls: 0 }));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
