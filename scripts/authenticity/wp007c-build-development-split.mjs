import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SOURCE_SPLIT_SHA256 = 'e3a2d819e7fd4f74c27710d7eafaba0ec4af85b3680dbf5cae576b2581438977';
const HOLDOUT_FREEZE_SHA256 = 'b1be6115a6ed3cb5d72c5ad3e90575ededbb4c969bd2bb248ec2806da32885c4';
const BENCHMARK_FINGERPRINT = '210000b7b0d93960b23e090e396d60f97bb46d2816ee9ee7d345aae364ade3c5';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
const fail = (message) => {
  throw new Error(`WP007C_DEVELOPMENT_SPLIT_INVALID:${message}`);
};

const source = readJson('research/wp007b/ef3-split-freeze.json');
if (source.splitFreezeSha256 !== SOURCE_SPLIT_SHA256) fail('source split hash mismatch');
if (source.holdoutFreezeSha256 !== HOLDOUT_FREEZE_SHA256) fail('holdout hash mismatch');
if (source.benchmarkFingerprint !== BENCHMARK_FINGERPRINT) fail('benchmark fingerprint mismatch');
if (source.scoreBlindSelection !== true) fail('source split is not score blind');
if (source.sourceFamilyLeakage !== 'PASS') fail('source-family leakage is not PASS');
if (source.truthMetadataInputLeakage !== 'PASS') fail('truth/metadata leakage is not PASS');

const development = {
  synthetic: clone(source.developmentSynthetic),
  camera: clone(source.developmentCamera),
  digital: clone(source.developmentDigital),
};
const sealedFinal = {
  camera: clone(source.sealedFinalCamera),
  digital: clone(source.sealedFinalDigital),
};
const ownerUnknown = clone(source.ownerUnknownGeneratorDiagnostic ?? []);

if (development.synthetic.length !== 64 || development.camera.length !== 36 || development.digital.length !== 28) {
  fail('unexpected development counts');
}
if (sealedFinal.camera.length !== 32 || sealedFinal.digital.length !== 32) {
  fail('unexpected sealed final counts');
}
if (ownerUnknown.length !== 31) fail('unexpected owner diagnostic count');

const allDevelopment = [...development.synthetic, ...development.camera, ...development.digital];
const allFinal = [...sealedFinal.camera, ...sealedFinal.digital];
const allFamilies = [...allDevelopment, ...allFinal, ...ownerUnknown].map((record) => record.sourceFamilyId);
if (new Set(allFamilies).size !== allFamilies.length) fail('source-family overlap');
if (allDevelopment.some((record) => record.sourceKind === 'OWNER_UNKNOWN_GENERATOR_DIAGNOSTIC')) {
  fail('owner diagnostic entered development');
}

const candidateSet = [
  {
    candidateId: 'SPAI_NATIVE_CPU_OPT',
    measurementType: 'SPECTRAL_GENERATIVE_CONSISTENCY',
    implementation: 'official_spai_upstream_native_resolution_cpu_with_one_bounded_optimization_cycle',
    checkpoint: 'spai.pth_sha256_24159f27d7c8c2cd0cb6c4019189eb89ad0874a0d9d15f8dc9afd39ca9648a55',
    preprocessing: 'NATIVE_DECODED_PIXELS_UPSTREAM_SEMANTICS',
    rightsGate: 'INHERITS_SPAI_RESEARCH_EVALUATION_PASS',
  },
  {
    candidateId: 'SPAI_C512',
    measurementType: 'SPECTRAL_GENERATIVE_CONSISTENCY_C512',
    implementation: 'official_spai_checkpoint_with_deterministic_512x512_center_crop',
    checkpoint: 'spai.pth_sha256_24159f27d7c8c2cd0cb6c4019189eb89ad0874a0d9d15f8dc9afd39ca9648a55',
    preprocessing: 'DETERMINISTIC_CENTER_CROP_512_NO_RESIZE',
    rightsGate: 'INHERITS_SPAI_RESEARCH_EVALUATION_PASS',
  },
  {
    candidateId: 'PATCHCRAFT_OFFICIAL',
    measurementType: 'PATCHCRAFT_PUBLISHED_DETECTOR_SCORE',
    implementation: 'authoritative_upstream_evaluation_path_only_if_rights_pass',
    checkpoint: 'NOT_RETRIEVED_BEFORE_RIGHTS_GATE',
    preprocessing: 'UPSTREAM_ONLY_IF_RIGHTS_PASS',
    rightsGate: 'REQUIRED_BEFORE_RETRIEVAL_OR_INFERENCE',
  },
  {
    candidateId: 'LYTHAUS_SPECTRAL_LITE_V0',
    measurementType: 'SPECTRAL_GENERATIVE_CONSISTENCY_LITE',
    implementation: 'bounded_classical_radial_fft_and_high_frequency_statistics',
    checkpoint: 'NONE',
    preprocessing: 'DETERMINISTIC_SPECTRAL_FEATURE_COMPUTATION',
    rightsGate: 'LYTHAUS_IMPLEMENTATION_RIGHTS_CLEAN',
  },
];

const currentMainSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const result = {
  schemaVersion: 'lythaus-wp007c-development-split-v1',
  baseSha: currentMainSha,
  benchmarkFingerprint: BENCHMARK_FINGERPRINT,
  holdoutFreezeSha256: HOLDOUT_FREEZE_SHA256,
  sourceSplitFreezeSha256: SOURCE_SPLIT_SHA256,
  scoreBlind: true,
  candidateSetFrozenBeforeScoring: true,
  candidateSet,
  commonDevelopment: {
    synthetic: development.synthetic,
    camera: development.camera,
    digital: development.digital,
  },
  sealedFinalNegatives: sealedFinal,
  ownerUnknownGeneratorDiagnostic: ownerUnknown,
  counts: {
    developmentSynthetic: development.synthetic.length,
    developmentCamera: development.camera.length,
    developmentDigital: development.digital.length,
    sealedFinalCamera: sealedFinal.camera.length,
    sealedFinalDigital: sealedFinal.digital.length,
    ownerUnknownGeneratorDiagnostic: ownerUnknown.length,
  },
  selectionPolicy: {
    candidateScoresMustUseIdenticalDevelopmentFamilies: true,
    ownerUnknownGeneratorEntersOnlyAfterPrimaryFinalResult: true,
    holdoutPixelAccessBeforeStageAFinalization: false,
    flux1PixelAccessBeforeCalibrationFreeze: false,
    flux2PixelAccess: false,
    threshold: 'PER_CANDIDATE_95TH_PERCENTILE_POOLED_DEVELOPMENT_NEGATIVES_IF_HIGHER_SCORE_IS_SYNTHETIC',
    transformationStressOnlyAfterStageA: true,
    winnerSelection: [
      'exclude_rights_blocked_runtime_not_practical_high_shortcut_high_non_camera_confounding',
      'lower_overall_negative_fpr',
      'higher_synthetic_recall',
      'lower_digital_negative_fpr',
      'better_transformation_robustness',
      'faster_runtime',
      'simpler_faster_measurement_when_materially_tied',
    ],
  },
  holdoutAccessGuard: {
    developmentRunnersReceiveDevelopmentInputPathsOnly: true,
    holdoutIdsHashesRolesMayBeKnown: true,
    holdoutPixelsForbiddenBeforeCalibrationFreeze: true,
    flux2PixelsForbiddenAlways: true,
    forbiddenOperationsBeforeCalibrationFreeze: ['inference', 'thumbnailing', 'fft', 'histogram', 'crop', 'resize', 'vlm', 'manual_forensic_review', 'feature_extraction'],
  },
};

result.developmentSplitSha256 = sha256(JSON.stringify(result));
fs.mkdirSync('research/wp007c', { recursive: true });
fs.writeFileSync('research/wp007c/development-split.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(`WP007C_DEVELOPMENT_SPLIT_SHA256=${result.developmentSplitSha256}`);
console.log(`WP007C_BASE_SHA=${currentMainSha}`);
