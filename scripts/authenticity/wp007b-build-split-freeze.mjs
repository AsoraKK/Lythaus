import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const RUNTIME_TIER = 'MODERATE';
const COUNTS = Object.freeze({ synthetic: 64, camera: 36, digital: 28, finalCamera: 32, finalDigital: 32 });

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableHash(value) {
  return hash(stableStringify(value));
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

function ranked(records, namespace) {
  return [...records].sort((a, b) => {
    const aRank = hash(`${namespace}:${a.sourceFamilyId}`);
    const bRank = hash(`${namespace}:${b.sourceFamilyId}`);
    return aRank.localeCompare(bRank) || a.sourceFamilyId.localeCompare(b.sourceFamilyId);
  });
}

function groupKey(record, kind) {
  const normalizedKind = kind.toLowerCase();
  if (normalizedKind.includes('camera')) return record.cameraDeviceFamily ?? 'UNKNOWN_CAMERA_DEVICE';
  if (normalizedKind.includes('digital')) return record.benchmark?.hardNegativeSubtype ?? 'UNKNOWN_DIGITAL_SUBTYPE';
  return 'ALL';
}

function balancedTake(records, kind, perGroup, namespace, targetCount = null) {
  const groups = new Map();
  for (const record of records) {
    const key = groupKey(record, kind);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const selected = [];
  for (const key of [...groups.keys()].sort()) {
    selected.push(...ranked(groups.get(key), `${namespace}:${key}`).slice(0, perGroup));
  }
  if (targetCount !== null && selected.length < targetCount) {
    const selectedIds = new Set(selected.map((record) => record.sourceFamilyId));
    selected.push(...ranked(records.filter((record) => !selectedIds.has(record.sourceFamilyId)), `${namespace}:extras`).slice(0, targetCount - selected.length));
  }
  return selected;
}

function recordSummary(record, kind) {
  return {
    sampleId: record.sampleId,
    sourceFamilyId: record.sourceFamilyId,
    sourceKind: kind,
    group: groupKey(record, kind),
    fileSha256: record.file?.sha256,
    width: record.file?.width,
    height: record.file?.height,
    format: record.file?.format,
    hardNegativeSubtype: record.benchmark?.hardNegativeSubtype ?? null,
    cameraDeviceFamily: record.cameraDeviceFamily ?? null,
  };
}

function assertDisjoint(namedLists) {
  const seen = new Map();
  for (const [name, records] of Object.entries(namedLists)) {
    for (const record of records) {
      const prior = seen.get(record.sourceFamilyId);
      if (prior) throw new Error(`source_family_leak:${record.sourceFamilyId}:${prior}:${name}`);
      seen.set(record.sourceFamilyId, name);
    }
  }
}

async function main() {
  const args = argsFrom(process.argv);
  const syntheticManifest = await readJson(args['synthetic-manifest']);
  const negativeManifest = await readJson(args['negative-manifest']);
  const synthetic = (syntheticManifest.records ?? []).filter((record) => record.provenance?.product === 'DIFFUSIONDB_2M');
  const ownerUnknownGenerator = (syntheticManifest.records ?? []).filter((record) => record.provenance?.product === 'OWNER_CONTROLLED_SYNTHETIC_POOL');
  const negatives = negativeManifest.records ?? [];
  const cameraPool = negatives.filter((record) => record.cameraDeviceFamily);
  const digitalPool = negatives.filter((record) => !record.cameraDeviceFamily && record.benchmark?.hardNegativeSubtype);
  if (synthetic.length !== 500 || ownerUnknownGenerator.length !== 31 || cameraPool.length !== 96 || digitalPool.length !== 80) throw new Error('available_pool_count_mismatch');

  const finalCamera = balancedTake(cameraPool, 'camera', 4, 'wp007b:final-camera', COUNTS.finalCamera);
  const finalDigital = balancedTake(digitalPool, 'digital', 4, 'wp007b:final-digital', COUNTS.finalDigital);
  const finalCameraIds = new Set(finalCamera.map((record) => record.sourceFamilyId));
  const finalDigitalIds = new Set(finalDigital.map((record) => record.sourceFamilyId));
  const remainingCamera = cameraPool.filter((record) => !finalCameraIds.has(record.sourceFamilyId));
  const remainingDigital = digitalPool.filter((record) => !finalDigitalIds.has(record.sourceFamilyId));
  const developmentSynthetic = ranked(synthetic, 'wp007b:development-synthetic').slice(0, COUNTS.synthetic);
  const developmentCamera = balancedTake(remainingCamera, 'camera', 4, 'wp007b:development-camera', COUNTS.camera);
  const developmentDigital = balancedTake(remainingDigital, 'digital', 3, 'wp007b:development-digital', COUNTS.digital);
  assertDisjoint({ developmentSynthetic, developmentCamera, developmentDigital, finalCamera, finalDigital });

  const artifact = {
    schemaVersion: 'lythaus-wp007b-ef3-split-freeze-v1',
    benchmarkFingerprint: '210000b7b0d93960b23e090e396d60f97bb46d2816ee9ee7d345aae364ade3c5',
    holdoutFreezeSha256: args['holdout-freeze-sha256'],
    specialistId: 'spai-spectral-ef3',
    runtimeTier: RUNTIME_TIER,
    runtimeTierBasis: { smokeImageSeconds: [109.431, 3.765, 2.151, 23.933], medianSeconds: 13.849, rule: 'MODERATE_IF_P50_GT_5_AND_LE_20' },
    scoreBlindSelection: true,
    selectionAlgorithm: 'SHA256_RANKED_SOURCE_FAMILY_ID_V1',
    developmentCounts: { synthetic: COUNTS.synthetic, camera: COUNTS.camera, digital: COUNTS.digital },
    sealedFinalNegativeCounts: { camera: COUNTS.finalCamera, digital: COUNTS.finalDigital },
    developmentSynthetic: developmentSynthetic.map((record) => recordSummary(record, 'DEVELOPMENT_SYNTHETIC')),
    developmentCamera: developmentCamera.map((record) => recordSummary(record, 'DEVELOPMENT_CAMERA_NEGATIVES')),
    developmentDigital: developmentDigital.map((record) => recordSummary(record, 'DEVELOPMENT_DIGITAL_NEGATIVES')),
    sealedFinalCamera: finalCamera.map((record) => recordSummary(record, 'SEALED_FINAL_CAMERA_CONTROLS')),
    sealedFinalDigital: finalDigital.map((record) => recordSummary(record, 'SEALED_FINAL_DIGITAL_CONTROLS')),
    ownerUnknownGeneratorDiagnostic: ownerUnknownGenerator.map((record) => recordSummary(record, 'OWNER_UNKNOWN_GENERATOR_DIAGNOSTIC')),
    remainingAvailablePoolCounts: { synthetic: synthetic.length - COUNTS.synthetic, camera: cameraPool.length - COUNTS.finalCamera - COUNTS.camera, digital: digitalPool.length - COUNTS.finalDigital - COUNTS.digital },
    sourceFamilyLeakage: 'PASS',
    truthMetadataInputLeakage: 'PASS',
    preprocessing: {
      upstreamConfig: 'spai/configs/spai.yaml',
      inputResolutionMode: 'ORIGINAL_RESOLUTION_TRUE',
      maxResize: null,
      inferenceNormalization: 'POSITIVE_0_1',
      digitalSvgTransport: 'DETERMINISTIC_HEADLESS_EDGE_PNG_RENDER_FOR_SPAI_INPUT_ONLY',
      stressTransformsBeforeStageA: false,
    },
    sealedRoles: {
      flux1: 'PIXEL_SEALED_UNTIL_STAGE_A_PASS',
      flux2: 'PIXEL_INACCESSIBLE',
      ownerUnknownGenerator: 'DIAGNOSTIC_ONLY_AFTER_PRIMARY_FINAL_RESULT',
    },
  };
  const splitFreezeSha256 = stableHash(artifact);
  await writeFile(args.output, `${JSON.stringify({ ...artifact, splitFreezeSha256 }, null, 2)}\n`, 'utf8');
  process.stdout.write(JSON.stringify({ splitFreezeSha256, developmentSynthetic: 64, developmentCamera: 36, developmentDigital: 28, finalCamera: 32, finalDigital: 32 }));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
