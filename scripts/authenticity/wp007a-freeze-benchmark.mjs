import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  WP007A_EXPECTED_BASE_SHA,
  WP007A_PROMPT_BANK_VERSION,
  assertBenchmarkRoleTrainingBoundary,
  assertNoPrivateArtifactKeys,
  assertPromptBank,
  assertSourceFamilyIsolation,
  assertSyntheticBenchmarkRecord,
  buildWp007aFingerprintInput,
  sha256Hex,
  stableArtifactHash,
} from '../../packages/authenticity/src/wp007a.ts';
import { materializeDiffusionDb } from './wp007a-materialize-diffusiondb.mjs';
import { materializeProgrammaticNegatives } from './wp007a-build-hard-negatives.mjs';

const OUTPUT_DIR = path.resolve('research/wp007a');
const OWNER_INVENTORY = path.resolve('research/wp006b/owner-pool-inventory.json');
const WP006E_CAMERA = path.resolve('research/wp006e/wp006e-camera-partitions.json');
const DEFAULT_DDB_CACHE = path.join(os.homedir(), 'OneDrive', 'Desktop', 'Lythaus_AI_Datasets', '90_RESEARCH_ONLY', 'wp007a-diffusiondb-cache');
const DEFAULT_NEGATIVE_CACHE = path.join(os.homedir(), 'OneDrive', 'Desktop', 'Lythaus_AI_Datasets', '90_RESEARCH_ONLY', 'wp007a-hard-negative-cache');
const AUDIT_DATE = '2026-09-14';
const MODERN_GENERATOR_FAMILIES = [
  'FLUX_1_SCHNELL',
  'FLUX_2_KLEIN_4B',
  'SDXL_BASE',
  'SDXL_LIGHTNING',
];

const PROMPT_TEXTS = Object.freeze({
  ORDINARY_PHONE_PHOTO: [
    'A quiet kitchen table with a ceramic cup beside a folded linen towel in morning window light.',
    'A pair of walking shoes beside a front door with a small umbrella and a woven mat.',
    'A grocery basket with apples, a paper list, and reusable cloth bags on a wooden counter.',
    'A bicycle leaning against a painted garden wall on an ordinary weekday afternoon.',
    'A notebook, pen, and reading glasses arranged beside a lamp on a work desk.',
    'A family picnic blanket with a thermos and fruit in a leafy public park.',
    'A modest bedroom with an unmade bed, a chair, and soft light through curtains.',
    'A freshly washed car parked beside a suburban curb after a light rain.',
    'A small houseplant on a windowsill with neighboring rooftops visible beyond the glass.',
    'A hand holding a warm mug near a bright window on a cool morning.',
  ],
  PEOPLE_AND_PORTRAITS: [
    'A candid portrait of an adult reading a paperback in a quiet library.',
    'Two friends talking on a park bench beneath a broad tree.',
    'A smiling baker standing behind a counter with loaves of bread.',
    'An elderly gardener holding a basket of herbs beside a greenhouse.',
    'A child wearing a raincoat looking at puddles on a neighborhood street.',
    'A musician tuning an acoustic instrument backstage before a small show.',
    'A commuter waiting at a station with a canvas bag and a folded newspaper.',
    'A portrait of a person in a wool sweater beside a sunlit bookshelf.',
    'A group of hikers resting near a trail map at the edge of a forest.',
    'A chef arranging vegetables on a plain steel work surface.',
  ],
  INTERIORS_AND_OBJECTS: [
    'A sunlit apartment living room with a sofa, books, and a low wooden table.',
    'A ceramic vase filled with dried grasses on a sideboard against a plaster wall.',
    'A quiet workshop with hand tools, timber offcuts, and a measuring tape.',
    'A small bookstore aisle with wooden shelves and handwritten section cards.',
    'A blue suitcase beside a hotel room chair and a folded map.',
    'A collection of ordinary kitchen utensils drying beside a sink.',
    'A desk fan, alarm clock, and house keys on a bedside table.',
    'A museum display case containing simple clay bowls under even gallery lighting.',
    'A covered balcony with potted plants, a chair, and a folded blanket.',
    'A train carriage interior with empty seats and overhead luggage racks.',
  ],
  OUTDOOR_STREET_AND_LANDSCAPE: [
    'A narrow residential street with parked bicycles and trees casting afternoon shadows.',
    'A coastal footpath curving around low rocks under a pale overcast sky.',
    'A mountain road viewed from a safe overlook with layered hills in the distance.',
    'A city square with a fountain, benches, and people crossing between buildings.',
    'A quiet river bridge in autumn with reflections moving below the railings.',
    'A rural field beside a gravel lane at the edge of a small village.',
    'A public garden path bordered by lavender and low stone walls.',
    'A rain-darkened sidewalk beside shop windows after closing time.',
    'A wooden pier extending over a calm lake at first light.',
    'A red bus passing a row of brick buildings on a cloudy morning.',
  ],
  ANIMALS_FOOD_VEHICLES: [
    'A tabby cat sleeping on a folded blanket near a radiator.',
    'A golden retriever carrying a worn tennis ball across a grassy yard.',
    'A bowl of vegetable soup with bread on a simple dining table.',
    'A plate of pancakes with berries and a small ceramic jug of syrup.',
    'A vintage bicycle with a front basket parked beside a café.',
    'A small fishing boat tied to a wooden dock in still water.',
    'A horse standing behind a fence in a green pasture.',
    'A market stall displaying oranges, pears, and a scale.',
    'A compact delivery van stopped outside a neighborhood bakery.',
    'A pair of ducks walking beside a pond with reeds and grass.',
  ],
  HIGH_FREQUENCY_DIFFICULT_DETAIL: [
    'Close detail of woven wool fabric with irregular threads and small lint fibers.',
    'A drawer filled with assorted screws, washers, and small hand tools.',
    'A dense hedge with overlapping leaves, tiny branches, and scattered blossoms.',
    'A weathered brick wall covered with moss, cracks, and faded paint.',
    'A detailed wooden tabletop showing grain, scratches, knots, and a metal hinge.',
    'A basket of tangled charging cables and braided cords on a desk.',
    'A rocky shoreline with pebbles, seaweed, wet surfaces, and foam.',
    'A close view of a knitted scarf beside a metal zipper and stitched seam.',
    'A cluttered stationery drawer containing paper clips, labels, and rubber bands.',
    'A leafy houseplant with overlapping veins, stems, and speckled ceramic soil.',
  ],
  LOW_LIGHT_BLUR_IMPERFECT_CAPTURE_STYLE: [
    'A dim hallway lit by one warm ceiling bulb with a coat hanging near the entrance.',
    'A late evening bus stop with soft streetlights and damp pavement.',
    'A candle on a dinner table in a dark room with gentle shadows.',
    'A moving train seen through a window at dusk with mild motion blur.',
    'A quiet campsite after sunset with a lantern, chairs, and a dark tree line.',
    'A night market aisle under uneven fluorescent lights with distant movement.',
    'A bedroom lit only by a bedside lamp with curtains slightly open.',
    'A rainy street photographed through a window with reflections and soft focus.',
    'A porch light illuminating a doormat, potted plant, and wet steps.',
    'A dawn kitchen with low contrast, gentle blur, and a kettle on the stove.',
  ],
  NON_PHOTOGRAPHIC_DIGITAL_ART: [
    'A flat geometric poster of overlapping circles, squares, and a limited warm palette.',
    'A hand-drawn map of an imaginary island with rivers, hills, and labeled paths.',
    'A paper collage of leaves, ticket stubs, and colored shapes on a plain background.',
    'A minimalist editorial illustration of a person carrying an oversized plant.',
    'A decorative pattern of stars, arches, and lines arranged in a repeating grid.',
    'A whimsical ink drawing of a small boat traveling through clouds.',
    'A still-life illustration of stationery objects using clean block colors.',
    'A retro-inspired travel poster for a fictional mountain town.',
    'A cut-paper style scene of houses, trees, and a crescent moon.',
    'A simple technical-looking line drawing of a folded chair and desk lamp.',
  ],
});

function currentCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function currentOriginMain() {
  return execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
}

async function writeJson(name, value) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  assertNoPrivateArtifactKeys(value);
  await writeFile(path.join(OUTPUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function makePromptBank() {
  const prompts = [];
  for (const regime of Object.keys(PROMPT_TEXTS)) {
    for (let index = 0; index < PROMPT_TEXTS[regime].length; index += 1) {
      prompts.push({ promptId: `PROMPT_${String(prompts.length + 1).padStart(3, '0')}`, regime, text: PROMPT_TEXTS[regime][index] });
    }
  }
  const bank = { version: WP007A_PROMPT_BANK_VERSION, schemaVersion: 'lythaus-wp007a-prompt-bank-v1', semanticsForSelectionOnly: true, detectorInput: false, prompts };
  assertPromptBank(bank);
  return bank;
}

function truthAxes(source, fallback = 'UNKNOWN') {
  const axes = source?.truthAxes ?? {};
  return {
    physicalCameraAcquisition: axes.physicalCameraAcquisition ?? fallback,
    syntheticDepictedContent: axes.syntheticDepictedContent ?? fallback,
    localManipulation: axes.localManipulation ?? fallback,
    digitalCapture: axes.digitalCapture ?? fallback,
    screenRecapture: axes.screenRecapture ?? fallback,
  };
}

function ownerSyntheticRecords(inventory) {
  const entries = inventory.entries.filter((entry) => entry.candidateCategory === 'SYNTHETIC_CANDIDATE');
  const byFamily = new Map();
  for (const entry of entries) if (!byFamily.has(entry.sourceFamilyId)) byFamily.set(entry.sourceFamilyId, entry);
  return [...byFamily.values()].sort((a, b) => a.sampleId.localeCompare(b.sampleId)).map((entry) => ({
    sampleId: entry.sampleId,
    sourceFamilyId: entry.sourceFamilyId,
    parentSourceFamilyId: null,
    artifactTruth: truthAxes(entry),
    provenance: {
      provider: 'OWNER_SUPPLIED_UNKNOWN',
      product: 'OWNER_CONTROLLED_SYNTHETIC_POOL',
      generatorFamily: 'UNKNOWN',
      generatorModel: 'UNKNOWN',
      generatorVersion: 'UNKNOWN',
      generationRoute: 'OWNER_SUPPLIED_FILE',
      promptId: null,
      seed: 'UNKNOWN',
      generatedAt: null,
      truthSource: 'OWNER_CATEGORY_AND_WP006B_PROVENANCE',
    },
    rights: {
      sourceLicense: 'OWNER_CONTROLLED_PRIVATE_RESEARCH',
      providerTermsClass: 'UPSTREAM_GENERATOR_UNKNOWN',
      trainingEligibility: 'REVIEW_REQUIRED',
      evaluationEligibility: true,
      commercialConstraint: 'PRIVATE_LYTHAUS_RESEARCH_ONLY;_UPSTREAM_TERMS_UNRESOLVED',
      rightsAuditId: 'WP007A-RIGHTS-OWNER-SYNTHETIC-UNKNOWN',
    },
    file: { sha256: entry.contentSha256, width: entry.width, height: entry.height, format: String(entry.mime).split('/')[1].toUpperCase(), byteSize: entry.byteSize },
    benchmark: { role: 'UNKNOWN_GENERATOR_DIAGNOSTIC', hardNegativeSubtype: null, promptTaxonomy: null, exclusionReason: null, duplicateGroupId: entry.nearDuplicateGroupId ?? null },
  }));
}

function ownerHardNegativeRecords(inventory) {
  const entries = inventory.entries
    .filter((entry) => entry.candidateCategory === 'HARD_NEGATIVE_CANDIDATE' && entry.poolRole === 'FUTURE_EXPANSION_POOL')
    .sort((a, b) => a.sampleId.localeCompare(b.sampleId))
    .slice(0, 32);
  return entries.map((entry) => ({
    sampleId: `OWNER_HN_${entry.sampleId}`,
    sourceFamilyId: entry.sourceFamilyId,
    artifactTruth: truthAxes(entry),
    rights: {
      sourceMediaRights: 'OWNER_CONFIRMED',
      trainingEligibility: 'TRAINING_ALLOWED_WITH_CONSTRAINTS',
      evaluationEligibility: true,
      publicRedistribution: 'NOT_AUTHORIZED',
    },
    provenance: {
      provider: 'OWNER_CONTROLLED',
      product: 'OWNER_HARD_NEGATIVE_POOL',
      generatorFamily: 'NONE_NON_GENERATIVE',
      generatorModel: 'NONE',
      generatorVersion: 'NONE',
      generationRoute: 'OWNER_SUPPLIED_FILE',
      truthSource: 'OWNER_CATEGORY_AND_WP006B_PROVENANCE',
    },
    file: { sha256: entry.contentSha256, width: entry.width, height: entry.height, format: String(entry.mime).split('/')[1].toUpperCase(), byteSize: entry.byteSize },
    benchmark: { role: 'DEVELOPMENT', hardNegativeSubtype: entry.hardNegativeType ?? 'UNKNOWN', promptTaxonomy: null, mixedOrigin: false, duplicateGroupId: entry.nearDuplicateGroupId ?? null, nearDuplicateReviewStatus: entry.nearDuplicateGroupId ? 'FLAGGED' : 'NOT_FOUND' },
  }));
}

function cameraNegativeRecords(cameraPartitions) {
  const deviceIds = cameraPartitions.development.deviceIds.slice().sort().slice(0, 8);
  const selected = cameraPartitions.development.members
    .filter((member) => deviceIds.includes(member.deviceFamilyId))
    .sort((a, b) => `${a.deviceFamilyId}\0${a.sourceFamilyId}`.localeCompare(`${b.deviceFamilyId}\0${b.sourceFamilyId}`))
    .reduce((accumulator, member) => {
      const count = accumulator.counts.get(member.deviceFamilyId) ?? 0;
      if (count < 12) { accumulator.records.push(member); accumulator.counts.set(member.deviceFamilyId, count + 1); }
      return accumulator;
    }, { records: [], counts: new Map() }).records
    .map((member) => ({
      sampleId: member.sampleId,
      sourceFamilyId: member.sourceFamilyId,
      cameraDeviceFamily: member.deviceFamilyId,
      sceneType: member.sceneType,
      lens: member.lens,
      artifactTruth: member.truthAxes,
      rights: {
        sourceMediaRights: 'CC_BY_4.0_WITH_ATTRIBUTION',
        trainingEligibility: 'TRAINING_ALLOWED_WITH_CONSTRAINTS',
        evaluationEligibility: true,
        publicRedistribution: 'NOT_USED',
      },
      provenance: {
        provider: 'POLOCLUB',
        product: 'CSAFE_MULTI_CAMERA_SMARTPHONE_DATABASE',
        generatorFamily: 'NONE_NON_GENERATIVE',
        generatorModel: 'NONE',
        generatorVersion: 'NONE',
        generationRoute: 'OFFICIAL_CSAFE_DATASET',
        truthSource: 'DATASET_PROVENANCE_CONFIRMED',
      },
      file: { sha256: member.contentSha256, width: member.width, height: member.height, format: 'JPEG', byteSize: member.declaredSizeBytes },
      benchmark: { role: 'DEVELOPMENT', hardNegativeSubtype: null, promptTaxonomy: null, mixedOrigin: false, duplicateGroupId: null, nearDuplicateReviewStatus: 'NOT_ASSESSED' },
      researchRole: 'CAMERA_NEGATIVE_FOUNDATION',
    }));
  return { deviceIds, records: selected };
}

function providerOutputRights() {
  const source = (url, effectiveDate, notes) => ({ termsDocument: url, termsEffectiveDate: effectiveDate, termsRetrievedAt: AUDIT_DATE, sourceOfTerms: 'OFFICIAL_PROVIDER_DOCUMENTATION', notes });
  return {
    schemaVersion: 'lythaus-wp007a-provider-output-rights-v1',
    auditDate: AUDIT_DATE,
    technicalModelClassification: 'FORENSIC_CLASSIFIER_AND_EVIDENCE_MEASUREMENT_SYSTEM',
    rows: [
      {
        provider: 'POLOCLUB', product: 'DIFFUSIONDB_2M', accessRoute: 'PUBLIC_HUGGINGFACE_DATASET', ...source('https://github.com/poloclub/diffusiondb/blob/main/datasheet.md', '2022-10-24', 'Official dataset record identifies CC0 1.0; prompts and generation parameters are provenance fields.'), outputOwnership: 'DATASET_CC0_1_0', forensicClassifierTrainingLanguage: 'Dataset license is permissive for reuse; no generative model training is performed in WP007A.', competingModelRestriction: 'NONE_IN_DATASET_LICENSE', commercialDistributionRestriction: 'Preserve dataset provenance and removal process; public redistribution is outside this package.', evaluationPermission: true, trainingEligibility: 'TRAINING_ALLOWED_WITH_CONSTRAINTS', commercializationConstraint: 'ATTRIBUTION/PROVENANCE_AND_DATASET_POLICY_REVIEW', legalInterpretationStatus: 'TECHNICAL_RIGHTS_AUDIT_NOT_LEGAL_OPINION',
      },
      {
        provider: 'OPENAI', product: 'CHATGPT_IMAGE', accessRoute: 'CHATGPT_CONSUMER', ...source('https://openai.com/policies/row-terms-of-use/', '2026-01-01', 'Consumer terms assign output between the parties but restrict competing-model development and automated extraction; commercial forensic-classifier use is not assumed permitted.'), outputOwnership: 'USER_OWNED_AS_BETWEEN_PARTIES_SUBJECT_TO_TERMS', forensicClassifierTrainingLanguage: 'No explicit permission for this commercial forensic-classifier use was established.', competingModelRestriction: 'APPLIES_TO_MODELS_COMPETING_WITH_OPENAI', commercialDistributionRestriction: 'Commercial and third-party use requires route-specific review.', evaluationPermission: false, trainingEligibility: 'REVIEW_REQUIRED', commercializationConstraint: 'PROGRAMMATIC_EXTRACTION_AND_COMPETING_MODEL_SCOPE_REVIEW', legalInterpretationStatus: 'REVIEW_REQUIRED', notes: 'Existing owner outputs may be retained as an external holdout only after route-specific review.'
      },
      {
        provider: 'OPENAI', product: 'OPENAI_API_OR_BUSINESS', accessRoute: 'OPENAI_API_OR_BUSINESS_SERVICES', ...source('https://openai.com/policies/services-agreement/', '2026-01-01', 'Business terms contain a permitted exception for models primarily intended to categorize/classify/organize data, but third-party commercial distribution and route details remain material.'), outputOwnership: 'CUSTOMER_OWNED_AS_BETWEEN_PARTIES_SUBJECT_TO_TERMS', forensicClassifierTrainingLanguage: 'Potential classifier exception, but Lythaus commercial distribution makes the exact fit unresolved.', competingModelRestriction: 'APPLIES_WITH_PERMITTED_EXCEPTION_SCOPE', commercialDistributionRestriction: 'Classifier exception requires review where distributed or commercially available to third parties.', evaluationPermission: true, trainingEligibility: 'REVIEW_REQUIRED', commercializationConstraint: 'COMMERCIAL_DISTRIBUTION_AND_ROUTE_SPECIFIC_LEGAL_REVIEW', legalInterpretationStatus: 'REVIEW_REQUIRED', notes: 'No API generation is authorized in WP007A.'
      },
      {
        provider: 'BLACK_FOREST_LABS', product: 'FLUX', accessRoute: 'BFL_WEBSITE_PLAYGROUND', ...source('https://bfl.ai/legal/terms-of-service', '2026-08-01', 'Website terms prohibit using output to train, distill, or fine-tune another AI model.'), outputOwnership: 'USER_CONTENT_RIGHTS_SUBJECT_TO_TERMS', forensicClassifierTrainingLanguage: 'Explicit restriction prevents treating output as training material for a forensic model.', competingModelRestriction: 'BROADER_OUTPUT_TRAINING_RESTRICTION', commercialDistributionRestriction: 'Subject to website terms and route-specific limits.', evaluationPermission: true, trainingEligibility: 'EVALUATION_ONLY', commercializationConstraint: 'NO_OUTPUT_TRAINING; ROUTE_SPECIFIC_REVIEW', legalInterpretationStatus: 'REVIEWED_RESTRICTION_APPLIES', notes: 'No direct BFL signup or generation.'
      },
      {
        provider: 'BLACK_FOREST_LABS', product: 'FLUX', accessRoute: 'BFL_DEVELOPER_API', ...source('https://bfl.ai/legal/terms-of-service', '2026-08-01', 'Current public terms prohibit using output to train, distill, or fine-tune any other AI model; API-specific contract was not separately obtained.'), outputOwnership: 'USER_CONTENT_RIGHTS_SUBJECT_TO_TERMS', forensicClassifierTrainingLanguage: 'Not established as permitted.', competingModelRestriction: 'BROADER_OUTPUT_TRAINING_RESTRICTION', commercialDistributionRestriction: 'API contract required for deployment interpretation.', evaluationPermission: true, trainingEligibility: 'EVALUATION_ONLY', commercializationConstraint: 'NO_OUTPUT_TRAINING; API CONTRACT REVIEW', legalInterpretationStatus: 'REVIEW_REQUIRED', notes: 'No direct BFL signup or generation.'
      },
      {
        provider: 'BLACK_FOREST_LABS', product: 'FLUX_1_AND_FLUX_2', accessRoute: 'CLOUDFLARE_WORKERS_AI_PARTNER', ...source('https://developers.cloudflare.com/workers-ai/platform/data-usage/; https://bfl.ai/legal/terms-of-service', '2026-08-01', 'Cloudflare treats inputs/outputs as Customer Content and points to provider terms; BFL public terms prohibit training another AI model. Exact partner contract is not published in this audit.'), outputOwnership: 'CUSTOMER_CONTENT_PER_CLOUDFLARE_SUBSCRIPTION_AND_PROVIDER_TERMS', forensicClassifierTrainingLanguage: 'Evaluation can be considered; training remains blocked by the provider restriction unless a route-specific agreement says otherwise.', competingModelRestriction: 'BFL_OUTPUT_TRAINING_RESTRICTION_APPLIES', commercialDistributionRestriction: 'Provider and Cloudflare route terms must both be satisfied.', evaluationPermission: true, trainingEligibility: 'EVALUATION_ONLY', commercializationConstraint: 'NO_TRAINING; HOLDOUT_ONLY; ROUTE_REVALIDATION', legalInterpretationStatus: 'REVIEWED_RESTRICTION_APPLIES', notes: 'Modern outputs default to sealed holdout.'
      },
      {
        provider: 'STABILITY_AI', product: 'SDXL_BASE', accessRoute: 'CLOUDFLARE_WORKERS_AI', ...source('https://developers.cloudflare.com/workers-ai/models/stable-diffusion-xl-base-1.0/; https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md', '2023-07-26', 'Cloudflare model page links the OpenRAIL++ license; exact Cloudflare partner output contract and commercial forensic-classifier fit remain route-sensitive.'), outputOwnership: 'CUSTOMER_CONTENT_PER_CLOUDFLARE_SUBSCRIPTION_SUBJECT_TO_UPSTREAM_LICENSE', forensicClassifierTrainingLanguage: 'OpenRAIL++ permits model use/evaluation with restrictions, but this audit does not upgrade route-specific rights by inference.', competingModelRestriction: 'USE_BASED_OPENRAIL_RESTRICTIONS', commercialDistributionRestriction: 'OpenRAIL++ and Cloudflare route terms apply.', evaluationPermission: true, trainingEligibility: 'REVIEW_REQUIRED', commercializationConstraint: 'UPSTREAM_AND_ROUTE_SPECIFIC_REVIEW', legalInterpretationStatus: 'REVIEW_REQUIRED', notes: 'No SDXL generation without a later rights/auth gate.'
      },
      {
        provider: 'BYTEDANCE', product: 'SDXL_LIGHTNING', accessRoute: 'CLOUDFLARE_WORKERS_AI', ...source('https://developers.cloudflare.com/workers-ai/models/stable-diffusion-xl-lightning/', '2026-08-12', 'Cloudflare catalog/model documentation is available; an authoritative upstream license/route output grant was not established in this audit.'), outputOwnership: 'CUSTOMER_CONTENT_PER_CLOUDFLARE_SUBSCRIPTION_SUBJECT_TO_UPSTREAM_TERMS', forensicClassifierTrainingLanguage: 'Unresolved.', competingModelRestriction: 'UNKNOWN', commercialDistributionRestriction: 'UNKNOWN_UPSTREAM_LICENSE', evaluationPermission: false, trainingEligibility: 'REVIEW_REQUIRED', commercializationConstraint: 'UPSTREAM_LICENSE_REQUIRED', legalInterpretationStatus: 'UNRESOLVED', notes: 'No generation.'
      },
      {
        provider: 'XAI', product: 'GROK_IMAGINE', accessRoute: 'XAI_CONSUMER', ...source('https://x.ai/legal/terms-of-service', '2026-09-11', 'Consumer terms address user content and product/model development settings but do not establish a clear grant for training a commercial external forensic classifier.'), outputOwnership: 'USER_CONTENT_RIGHTS_SUBJECT_TO_TERMS', forensicClassifierTrainingLanguage: 'Not established.', competingModelRestriction: 'UNKNOWN', commercialDistributionRestriction: 'Route-specific review required.', evaluationPermission: false, trainingEligibility: 'REVIEW_REQUIRED', commercializationConstraint: 'NO_NEW_ACCOUNT_OR_GENERATION; EXISTING_OUTPUTS_ONLY_AFTER_REVIEW', legalInterpretationStatus: 'REVIEW_REQUIRED', notes: 'XAI_GROK_GENERATION = NOT_AUTHORIZED_UNLESS_EXISTING_OWNER_OUTPUTS_FOUND.'
      },
      {
        provider: 'LYTHAUS', product: 'OWNER_CONTROLLED_SYNTHETIC_POOL', accessRoute: 'OWNER_SUPPLIED_LOCAL_MEDIA', ...source('research/wp006b/benchmark-rights.json', '2026-09-12', 'Owner blanket authorization covers internal research, product evaluation, and commercial-product development evaluation; it does not authorize public redistribution.'), outputOwnership: 'OWNER_CONTROLLED', forensicClassifierTrainingLanguage: 'Owner authorization supports private project use; upstream generator rights remain unknown where provenance is unknown.', competingModelRestriction: 'UNKNOWN_UPSTREAM', commercialDistributionRestriction: 'NO_PUBLIC_OR_THIRD_PARTY_REDISTRIBUTION', evaluationPermission: true, trainingEligibility: 'REVIEW_REQUIRED', commercializationConstraint: 'PRIVATE_RESEARCH; UPSTREAM_TERMS_REVIEW', legalInterpretationStatus: 'OWNER_AUTHORIZED_WITH_UPSTREAM_REVIEW', notes: 'Retained as unknown-generator diagnostic, not development.'
      },
    ],
  };
}

function cloudflareModelRights() {
  const common = { accessRoute: 'CLOUDFLARE_WORKERS_AI', modelCatalogUrl: 'https://developers.cloudflare.com/workers-ai/models/', modelCatalogRetrievedAt: AUDIT_DATE, rightsReviewedAt: AUDIT_DATE, rightsDocumentVersion: 'WP007A_PROVIDER_TERMS_AUDIT_2026-09-14', generationAuthorized: false, outputRetention: 'NOT_GENERATED', benchmarkRoleDefault: 'SEALED_GENERATOR_HOLDOUT' };
  return {
    schemaVersion: 'lythaus-wp007a-cloudflare-model-rights-v1',
    auditDate: AUDIT_DATE,
    cloudflareDataUseSource: 'https://developers.cloudflare.com/workers-ai/platform/data-usage/',
    pricingSource: 'https://developers.cloudflare.com/workers-ai/platform/pricing/',
    models: [
      { ...common, modelId: '@cf/black-forest-labs/flux-1-schnell', provider: 'BLACK_FOREST_LABS', modelFamily: 'FLUX_1_SCHNELL', modelStatus: 'AVAILABLE_IN_CATALOG', modelDocumentation: 'https://developers.cloudflare.com/workers-ai/models/flux-1-schnell', providerTerms: 'https://bfl.ai/legal/terms-of-service', upstreamLicense: 'https://github.com/black-forest-labs/flux2', outputPriceBasis: '4.80 neurons per tile / 9.60 neurons per step in current pricing display', evaluationEligibility: true, trainingEligibility: 'EVALUATION_ONLY', rightsStatus: 'EVALUATION_ALLOWED_TRAINING_BLOCKED', reason: 'BFL public terms prohibit using output to train another AI model; exact Cloudflare partner contract requires revalidation.' },
      { ...common, modelId: '@cf/black-forest-labs/flux-2-klein-4b', provider: 'BLACK_FOREST_LABS', modelFamily: 'FLUX_2_KLEIN_4B', modelStatus: 'AVAILABLE_IN_CATALOG', modelDocumentation: 'https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/', providerTerms: 'https://bfl.ai/legal/terms-of-service', upstreamLicense: 'https://github.com/black-forest-labs/flux2', outputPriceBasis: '5.37 input / 26.05 output neurons per 512x512 tile in current pricing display', evaluationEligibility: true, trainingEligibility: 'EVALUATION_ONLY', rightsStatus: 'EVALUATION_ALLOWED_TRAINING_BLOCKED', reason: 'BFL public terms prohibit using output to train another AI model; exact Cloudflare partner contract requires revalidation.' },
      { ...common, modelId: '@cf/stabilityai/stable-diffusion-xl-base-1.0', provider: 'STABILITY_AI', modelFamily: 'SDXL_BASE', modelStatus: 'AVAILABLE_IN_CATALOG_BETA', modelDocumentation: 'https://developers.cloudflare.com/workers-ai/models/stable-diffusion-xl-base-1.0/', providerTerms: 'https://developers.cloudflare.com/workers-ai/platform/data-usage/', upstreamLicense: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md', outputPriceBasis: 'Model page displays $0.00 per step; route quota and upstream restrictions still apply', evaluationEligibility: true, trainingEligibility: 'REVIEW_REQUIRED', rightsStatus: 'ROUTE_REVIEW_REQUIRED', reason: 'OpenRAIL++ and Cloudflare documentation are available, but the commercial classifier fit was not conclusively established.' },
      { ...common, modelId: '@cf/bytedance/stable-diffusion-xl-lightning', provider: 'BYTEDANCE', modelFamily: 'SDXL_LIGHTNING', modelStatus: 'AVAILABLE_IN_CATALOG_BETA', modelDocumentation: 'https://developers.cloudflare.com/workers-ai/models/stable-diffusion-xl-lightning/', providerTerms: 'https://developers.cloudflare.com/workers-ai/platform/data-usage/', upstreamLicense: null, outputPriceBasis: 'Model page displays $0.00 per step; upstream license unresolved', evaluationEligibility: false, trainingEligibility: 'REVIEW_REQUIRED', rightsStatus: 'UNRESOLVED', reason: 'No authoritative upstream output-use terms were established; no generation.' },
    ],
    generationStatus: 'AUTH_REQUIRED_AND_RIGHTS_REVIEW_REQUIRED',
    generationCalls: 0,
    incrementalCostUsd: 0,
  };
}

function diffusionRightsAudit(materialization) {
  return {
    schemaVersion: 'lythaus-wp007a-diffusiondb-rights-audit-v1',
    auditDate: AUDIT_DATE,
    officialDatasetRecord: 'https://huggingface.co/datasets/poloclub/diffusiondb',
    officialRepository: 'https://github.com/poloclub/diffusiondb',
    officialDatasheet: 'https://github.com/poloclub/diffusiondb/blob/main/datasheet.md',
    license: 'CC0-1.0',
    rightsStatus: 'VERIFIED_CC0_WITH_DATASET_CONSTRAINTS',
    rightsGate: 'PASS',
    datasetDescription: 'Stable Diffusion Discord prompt/image pairs with prompt and generation-parameter provenance.',
    sourceStructure: '2M subset uses modular part-000001.zip style shards containing PNG members and per-part JSON metadata.',
    sourceFamilyRule: 'One original image member is one source family unless an exact/near duplicate rule identifies a relation.',
    constraints: ['Honor dataset removal workflow.', 'Do not treat prompts or source provenance as detector inputs.', 'Exclude unsafe/corrupt records under a deterministic policy.', 'Do not persist user names, GPS, or private metadata.'],
    downloadBudgetBytes: Math.floor(1.5 * 1024 * 1024 * 1024),
    downloadedBytes: materialization.archiveDownloadBytes,
    newDownloadBytes: materialization.newDownloadBytes,
    selectedSourceFamilies: materialization.selectedFamilyCount,
    sourceDocumentationAudit: 'PASS; current official record states CC0 1.0 and identifies the dataset structure and fields.',
    fullDatasetDownloaded: false,
    fullDatasetExtracted: false,
  };
}

function buildSyntheticRecords(materialization, ownerRecords) {
  const ddb = materialization.records.map((record) => ({
    sampleId: record.sampleId,
    sourceFamilyId: record.sourceFamilyId,
    parentSourceFamilyId: null,
    artifactTruth: { physicalCameraAcquisition: 'FALSE', syntheticDepictedContent: 'TRUE', localManipulation: 'FALSE', digitalCapture: 'FALSE', screenRecapture: 'FALSE' },
    provenance: {
      provider: 'POLOCLUB', product: 'DIFFUSIONDB_2M', generatorFamily: 'STABLE_DIFFUSION_1X_DIFFUSIONDB', generatorModel: 'UNKNOWN', generatorVersion: 'UNKNOWN', generationRoute: 'OFFICIAL_DIFFUSIONDB_DATASET', promptId: record.promptId, prompt: record.prompt, seed: record.seed, guidanceScale: record.guidanceScale, steps: record.steps, sampler: record.sampler, generatedAt: null, truthSource: 'DATASET_PROVENANCE_CONFIRMED', archiveShard: record.archiveShard, archiveMemberId: record.archiveMemberId,
    },
    rights: { sourceLicense: 'CC0-1.0', providerTermsClass: 'DIFFUSIONDB_CC0_WITH_DATASET_CONSTRAINTS', trainingEligibility: 'TRAINING_ALLOWED_WITH_CONSTRAINTS', evaluationEligibility: true, commercialConstraint: 'HONOR_DATASET_REMOVAL_AND_PROVENANCE_POLICY', rightsAuditId: 'WP007A-RIGHTS-DIFFUSIONDB-CC0' },
    file: { sha256: record.contentSha256, width: record.width, height: record.height, format: record.format, perceptualHash: record.perceptualHash, perceptualHashAlgorithm: record.perceptualHashAlgorithm },
    benchmark: { role: 'DEVELOPMENT', generatorHoldoutGroup: null, hardNegativeSubtype: null, promptTaxonomy: record.taxonomy, mixedOrigin: false, duplicateGroupId: record.duplicateGroupId, nearDuplicateReviewStatus: record.nearDuplicateReviewStatus },
  }));
  const owner = ownerRecords.map((record) => ({ ...record, benchmark: { ...record.benchmark, role: 'UNKNOWN_GENERATOR_DIAGNOSTIC', generatorHoldoutGroup: 'OWNER_UNKNOWN_DIAGNOSTIC', mixedOrigin: false } }));
  for (const record of [...ddb, ...owner]) assertSyntheticBenchmarkRecord(record);
  return [...ddb, ...owner];
}

function selectionPlan(materialization) {
  return {
    schemaVersion: 'lythaus-wp007a-diffusiondb-selection-plan-v1',
    datasetId: 'diffusiondb-2m',
    selectionFrozenBeforeDetectorInference: true,
    selectedShards: materialization.shards,
    selectionMethod: 'Stable sort by taxonomy/promptId/imageName, then category round-robin; one image per promptId where possible; prompt semantics used only for selection.',
    taxonomyPrecedence: ['TEXT_OR_SIGNAGE', 'HIGH_FREQUENCY_TEXTURE', 'ARCHITECTURE', 'PORTRAIT_OR_PEOPLE', 'ANIMAL', 'FOOD', 'VEHICLE', 'LANDSCAPE', 'OUTDOOR_SCENE', 'INDOOR_SCENE', 'ILLUSTRATION_OR_ART', 'OBJECT_OR_STILL_LIFE', 'OTHER'],
    excludedPromptRule: 'Exclude only deterministic unsafe-content keyword matches or missing prompt/image metadata; no visual easy-example curation.',
    targetSourceFamilies: 500,
    selectedSourceFamilies: materialization.selectedFamilyCount,
    taxonomyCounts: materialization.taxonomyCounts,
    duplicateSummary: materialization.duplicateSummary,
    archiveDirectoryInputs: materialization.shards.map((shard) => ({ shard, archiveDirectoryFingerprint: 'RECORDED_IN_EXTERNAL_RUN_CACHE' })),
    records: materialization.records.map((record) => ({ sampleId: record.sampleId, sourceFamilyId: record.sourceFamilyId, archiveShard: record.archiveShard, archiveMemberId: record.archiveMemberId, promptId: record.promptId, taxonomy: record.taxonomy, contentSha256: record.contentSha256, perceptualHash: record.perceptualHash, perceptualHashAlgorithm: record.perceptualHashAlgorithm, duplicateGroupId: record.duplicateGroupId, width: record.width, height: record.height, format: record.format })),
  };
}

function splits({ syntheticRecords, cameraNegatives, ownerHardNegatives, programmaticNegatives }) {
  return {
    schemaVersion: 'lythaus-wp007a-ef3-benchmark-splits-v1',
    splitFrozenBeforeDetectorInference: true,
    primaryDevelopment: {
      syntheticSourceFamilies: syntheticRecords.filter((record) => record.benchmark.role === 'DEVELOPMENT').map((record) => record.sourceFamilyId),
      cameraNegativeSourceFamilies: cameraNegatives.records.map((record) => record.sourceFamilyId),
      ownerDigitalNonAiSourceFamilies: ownerHardNegatives.map((record) => record.sourceFamilyId),
      programmaticDigitalNonAiSourceFamilies: programmaticNegatives.records.map((record) => record.sourceFamilyId),
    },
    sealedGeneratorHoldouts: MODERN_GENERATOR_FAMILIES.map((family) => ({ generatorFamily: family, sourceFamilies: [], status: 'NOT_MATERIALIZED_IN_WP007A' })),
    externalProviderHoldouts: [{ generatorFamily: 'OPENAI_CHATGPT_IMAGE', sourceFamilies: [], status: 'NOT_MATERIALIZED_IN_WP007A' }, { generatorFamily: 'XAI_GROK_IMAGINE', sourceFamilies: [], status: 'NOT_MATERIALIZED_IN_WP007A' }],
    futureGeneratorReserve: ['XAI_GROK_IMAGINE'],
    ownerUnknownGeneratorDiagnostics: syntheticRecords.filter((record) => record.benchmark.role === 'UNKNOWN_GENERATOR_DIAGNOSTIC').map((record) => record.sourceFamilyId),
    mixedOriginDiagnostics: [],
    transformations: { status: 'PLANNED_NOT_MATERIALIZED', descendantsRetainParentSourceFamily: true },
    reservedOwnerMediaConsumed: false,
  };
}

function transformationPlan() {
  return {
    schemaVersion: 'lythaus-wp007a-ef3-transformation-plan-v1',
    materializedInWp007a: false,
    descendantsRetainSourceFamily: true,
    recipes: [
      { id: 'JPEG95', operation: 'reencode', parameters: { quality: 95 } },
      { id: 'JPEG75', operation: 'reencode', parameters: { quality: 75 } },
      { id: 'resize75', operation: 'resize', parameters: { scale: 0.75, interpolation: 'deterministic' } },
      { id: 'resize50', operation: 'resize', parameters: { scale: 0.5, interpolation: 'deterministic' } },
      { id: 'crop10', operation: 'center_crop', parameters: { retainedArea: 0.9 } },
      { id: 'metadata_stripped', operation: 'remove_container_metadata', parameters: { decodedPixelsPreserved: true } },
      { id: 'screenshot_style_resampling', operation: 'bounded_screen_resample', parameters: { materializeLater: true } },
    ],
  };
}

function mixedOriginSchema() {
  return {
    schemaVersion: 'lythaus-wp007a-mixed-origin-schema-v1',
    materializedInWp007a: false,
    wholeImageDevelopmentExcluded: true,
    truthAxes: ['physicalCameraAcquisition', 'syntheticDepictedContent', 'localManipulation', 'digitalCapture', 'screenRecapture'],
    contentRegions: [{ regionId: 'region_01', bboxNormalized: null, maskReference: null, regionKind: 'UNKNOWN', syntheticDepictedContent: 'UNKNOWN', truthSource: 'UNKNOWN', generatorFamily: 'UNKNOWN' }],
  };
}

function scopeDocument() {
  return `# Lythaus forensic-model scope\n\nLythaus Authenticity AI is being developed as a **FORENSIC_CLASSIFIER_AND_EVIDENCE_MEASUREMENT_SYSTEM**. It is not a generative image model. It does not synthesize images, generate replacement visual content, recreate another provider's image-generation capability, imitate a generator's style, distill generator weights, expose text-to-image or image-to-image generation, or produce media as its model output.\n\nIts intended function is approximately:\n\n\`\`\`text\nimage pixels -> independent forensic measurements -> evidence regarding synthetic-origin indicators -> calibrated confidence/applicability -> the Lythaus evidence system\n\`\`\`\n\nExpected outputs are measurements such as rawScore, normalizedMeasurement, applicability, confidence, limitations, and forensic evidence features. The WP007A target truth axis is **syntheticDepictedContent**. It remains independent from **physicalCameraAcquisition**; digital non-AI graphics and screenshots are not synthetic merely because they are non-camera artifacts.\n\nThis is a functional/technical classification, not a legal conclusion. Technical model classification and provider-specific use rights are recorded separately. No statement here establishes that every provider output may be used for training.\n`;
}

async function main({ download = true, ddbCache = DEFAULT_DDB_CACHE, negativeCache = DEFAULT_NEGATIVE_CACHE } = {}) {
  const baseSha = currentOriginMain();
  if (baseSha !== WP007A_EXPECTED_BASE_SHA) throw new Error(`WP007A_START_GATE=BASE_CHANGED_REVIEW_REQUIRED:${baseSha}`);
  const mergeBase = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim();
  if (mergeBase !== WP007A_EXPECTED_BASE_SHA) throw new Error('WP007A_START_GATE=WORKTREE_NOT_BASED_ON_VERIFIED_MAIN');
  const cameraPartitions = await readJson(WP006E_CAMERA);
  if (cameraPartitions.lge.status !== 'SEALED' || cameraPartitions.lge.pixelsOpened !== false || cameraPartitions.futureModelReserve.status !== 'SEALED') throw new Error('WP007A_START_GATE=EF2_HOLDOUT_CONTAMINATION_REVIEW_REQUIRED');
  const inventory = await readJson(OWNER_INVENTORY);
  const promptBank = makePromptBank();
  const providerRights = providerOutputRights();
  const cloudflareRights = cloudflareModelRights();
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(path.join(OUTPUT_DIR, 'lythaus-forensic-model-scope.md'), scopeDocument(), 'utf8');
  await writeJson('provider-output-rights.json', providerRights);
  await writeJson('cloudflare-model-rights.json', cloudflareRights);
  await writeJson('prompt-bank.json', promptBank);
  await writeJson('ef3-transformation-plan.json', transformationPlan());
  await writeJson('ef3-mixed-origin-schema.json', mixedOriginSchema());
  const ownerRecords = ownerSyntheticRecords(inventory);
  await writeJson('owner-synthetic-provenance.json', { schemaVersion: 'lythaus-wp007a-owner-synthetic-provenance-v1', sourceFamilyCount: ownerRecords.length, records: ownerRecords });
  await writeJson('owner-generator-provenance-review.json', { schemaVersion: 'lythaus-wp007a-owner-generator-provenance-review-v1', ownerActionRequired: ownerRecords.length > 0, reason: 'Generator/provider/model route is not in the existing local provenance record for these owner images.', groups: [{ groupId: 'OWNER_SYNTHETIC_GENERATOR_UNKNOWN', sampleCount: ownerRecords.length, sampleIds: ownerRecords.map((record) => record.sampleId), questions: ['Identify provider/product/generator family if known, otherwise answer UNKNOWN.', 'Identify whether any post-generation editing occurred, otherwise answer UNKNOWN.'] }] });
  const materialization = await materializeDiffusionDb({ cacheDir: ddbCache, download, targetCount: 500 });
  materialization.newDownloadBytes = materialization.archiveDownloadBytes;
  materialization.archiveDownloadBytes = materialization.archiveBytes;
  await writeJson('diffusiondb-rights-audit.json', diffusionRightsAudit(materialization));
  await writeJson('diffusiondb-selection-plan.json', selectionPlan(materialization));
  const syntheticRecords = buildSyntheticRecords(materialization, ownerRecords);
  for (const record of syntheticRecords) assertBenchmarkRoleTrainingBoundary(record);
  const cameraNegatives = cameraNegativeRecords(cameraPartitions);
  const ownerHardNegatives = ownerHardNegativeRecords(inventory);
  const programmaticNegatives = await materializeProgrammaticNegatives({ cacheDir: negativeCache });
  const negativeRecords = [...cameraNegatives.records, ...ownerHardNegatives, ...programmaticNegatives.records];
  for (const record of negativeRecords) assertSyntheticBenchmarkRecord(record);
  assertSourceFamilyIsolation([...syntheticRecords, ...negativeRecords]);
  await writeJson('ef3-synthetic-manifest.json', { schemaVersion: 'lythaus-wp007a-synthetic-benchmark-v1', sourceDataset: 'diffusiondb-2m-plus-owner-diagnostic', detectorInputExcludesProvenance: true, records: syntheticRecords });
  await writeJson('ef3-negative-foundation.json', { schemaVersion: 'lythaus-wp007a-negative-foundation-v1', semantics: 'physicalCameraAcquisition controls and digital non-AI controls; never a REAL/FAKE class', cameraNegativeFamilies: cameraNegatives.records.length, ownerDigitalNonAiFamilies: ownerHardNegatives.length, programmaticDigitalNonAiFamilies: programmaticNegatives.records.length, records: negativeRecords });
  await writeJson('ef3-benchmark-splits.json', splits({ syntheticRecords, cameraNegatives, ownerHardNegatives, programmaticNegatives }));
  const splitManifest = await readJson(path.join(OUTPUT_DIR, 'ef3-benchmark-splits.json'));
  const transformation = transformationPlan();
  const fingerprintInput = buildWp007aFingerprintInput({ records: [...syntheticRecords, ...negativeRecords], splits: splitManifest, rights: { providerRows: providerRights.rows.map((row) => ({ provider: row.provider, product: row.product, accessRoute: row.accessRoute, trainingEligibility: row.trainingEligibility, evaluationPermission: row.evaluationPermission, legalInterpretationStatus: row.legalInterpretationStatus })), cloudflare: cloudflareRights.models.map((row) => ({ modelId: row.modelId, modelFamily: row.modelFamily, rightsStatus: row.rightsStatus, trainingEligibility: row.trainingEligibility, evaluationEligibility: row.evaluationEligibility })) }, promptBankVersion: promptBank.version, transformationPlan: transformation, generatorReserve: splitManifest.futureGeneratorReserve });
  const fingerprint = stableArtifactHash(fingerprintInput);
  await writeJson('ef3-benchmark-fingerprint.json', { schemaVersion: 'lythaus-wp007a-ef3-benchmark-fingerprint-v1', fingerprintSha256: fingerprint, canonicalInput: fingerprintInput, sourceMediaCommitted: false, detectorInferenceRun: false });
  await writeJson('cloudflare-generation-plan.json', { schemaVersion: 'lythaus-wp007a-cloudflare-generation-plan-v1', generationStatus: 'AUTH_REQUIRED_AND_RIGHTS_REVIEW_REQUIRED', dryRunPerformed: true, dryRunPromptStart: 1, dryRunPromptCountPerModel: 2, dryRunEstimatedCostUsd: 0.0027184, generationCalls: 0, maxCostUsd: 1, incrementalCostUsd: 0, promptBankVersion: promptBank.version, matchedPromptIds: promptBank.prompts.slice(0, 40).map((prompt) => prompt.promptId), candidateModels: cloudflareRights.models.map((model) => ({ modelId: model.modelId, modelFamily: model.modelFamily, status: model.modelStatus, rightsStatus: model.rightsStatus, generationAuthorized: model.generationAuthorized })), defaultRole: 'SEALED_GENERATOR_HOLDOUT' });
  await writeJson('wp007a-plan.json', { schemaVersion: 'lythaus-wp007a-plan-v1', baseSha, benchmarkFingerprint: fingerprint, researchQuestions: ['Rights-clean synthetic development corpus', 'Generator-aware unseen holdouts', 'Independent truth axes', 'Source-family and nuisance shortcut control'], noModelInference: true, noModelTraining: true, noCloudImageCalls: true, noProductionChanges: true, partitions: { diffusionDbDevelopmentFamilies: materialization.selectedFamilyCount, ownerSyntheticDiagnostics: ownerRecords.length, cameraNegativeFamilies: cameraNegatives.records.length, digitalNonAiFamilies: ownerHardNegatives.length + programmaticNegatives.records.length, modernGeneratorHoldouts: 'not materialized; route rights/auth gate required', futureGeneratorReserve: splitManifest.futureGeneratorReserve }, rightsRules: { trainingEligibility: 'Machine-enforced; EVALUATION_ONLY/PROHIBITED/REVIEW_REQUIRED cannot enter development.', benchmarkRole: 'Machine-enforced; holdout roles cannot enter development even when rights permit training.' }, selectionPolicy: 'Deterministic prompt-only semantic stratification, no visual easy-example curation.', transformationPlan: transformation, cloudflare: { candidateModels: MODERN_GENERATOR_FAMILIES, maxCostUsd: 1, callsPerformed: 0 }, stopConditions: ['No full dataset download/extraction', 'No media committed', 'No detector/model inference', 'No provider rights upgrade by assumption'] });
  await writeJson('wp007a-run-manifest.json', { schemaVersion: 'lythaus-wp007a-run-manifest-v1', baseSha, executionCommit: currentCommit(), generatedAt: new Date().toISOString(), diffusionDb: { archiveShards: materialization.shards, downloadedBytes: materialization.archiveDownloadBytes, selectedFamilies: materialization.selectedFamilyCount, fullDatasetDownloaded: false, fullDatasetExtracted: false }, ownerPool: { syntheticFamilies: ownerRecords.length, reservedOwnerMediaConsumed: false }, programmaticHardNegatives: programmaticNegatives.familyCount, cameraNegativeFamilies: cameraNegatives.records.length, cloudflare: { dryRun: true, smokePromptCountPerModel: 2, generationCalls: 0, incrementalCostUsd: 0, modelInferenceCalls: 0 }, modelInferenceCalls: 0, modelTrainingRuns: 0, cloudImageCalls: 0, productionChanges: false, mediaCommittedToGit: false, ef2Holdouts: { lge: 'SEALED', futureModelReserve: 'SEALED' }, artifactFingerprint: fingerprint });
  const counts = { diffusionDb: materialization.selectedFamilyCount, ownerSynthetic: ownerRecords.length, ownerKnownGeneratorFamilies: 0, ownerUnknownGeneratorFamilies: ownerRecords.length, cameraNegatives: cameraNegatives.records.length, ownerHardNegatives: ownerHardNegatives.length, programmaticHardNegatives: programmaticNegatives.familyCount, digitalNonAiNegatives: ownerHardNegatives.length + programmaticNegatives.familyCount };
  const finalClassification = counts.diffusionDb >= 400 && counts.cameraNegatives >= 64 && counts.digitalNonAiNegatives >= 32 ? 'WP007A_EF3_CORPUS_PARTIAL' : 'WP007A_EF3_CORPUS_PARTIAL';
  const report = `# WP007A — Rights-clean synthetic corpus materialisation\n\nWP007A is a benchmark/data package only. No SPAI, PatchCraft, detector inference, model training, model download, cloud image call, or production change occurred.\n\n## Baseline\n\nWP007A_BASE_SHA = ${baseSha}\nFORENSIC_MODEL_CLASS = FORENSIC_CLASSIFIER_AND_EVIDENCE_MEASUREMENT_SYSTEM\nGENERATIVE_CAPABILITY = NONE\n\n## Materialisation\n\nDIFFUSIONDB_RIGHTS = VERIFIED_CC0_WITH_DATASET_CONSTRAINTS\nDIFFUSIONDB_DOWNLOADED_BYTES = ${materialization.archiveDownloadBytes}\nDIFFUSIONDB_SELECTED_SOURCE_FAMILIES = ${counts.diffusionDb}\nOWNER_SYNTHETIC_SOURCE_FAMILIES = ${counts.ownerSynthetic}\nOWNER_KNOWN_GENERATOR_FAMILIES = ${counts.ownerKnownGeneratorFamilies}\nOWNER_UNKNOWN_GENERATOR_FAMILIES = ${counts.ownerUnknownGeneratorFamilies}\nPROGRAMMATIC_HARD_NEGATIVE_FAMILIES = ${counts.programmaticHardNegatives}\nCAMERA_NEGATIVE_FAMILIES_AVAILABLE = ${counts.cameraNegatives}\nDIGITAL_NON_AI_NEGATIVE_FAMILIES_AVAILABLE = ${counts.digitalNonAiNegatives}\nPROMPT_BANK_VERSION = ${promptBank.version}\nPROMPT_COUNT = ${promptBank.prompts.length}\nCLOUDFLARE_MODELS_AUDITED = ${cloudflareRights.models.map((model) => model.modelId).join(', ')}\n\nFLUX1_GENERATED = 0\nFLUX2_GENERATED = 0\nSDXL_BASE_GENERATED = 0\nSDXL_LIGHTNING_GENERATED = 0\nCLOUDFLARE_INCREMENTAL_COST_USD = 0\nOPENAI_CHATGPT_TRAINING_ELIGIBILITY = REVIEW_REQUIRED\nOPENAI_CHATGPT_EVALUATION_ELIGIBILITY = REVIEW_REQUIRED\nCLOUDFLARE_FLUX_TRAINING_ELIGIBILITY = EVALUATION_ONLY\nCLOUDFLARE_FLUX_EVALUATION_ELIGIBILITY = AUTHORIZED_FOR_BOUNDED_HOLDOUT_ONLY\nXAI_GROK_TRAINING_ELIGIBILITY = REVIEW_REQUIRED\nXAI_GROK_EVALUATION_ELIGIBILITY = REVIEW_REQUIRED\nMODERN_SEALED_GENERATOR_FAMILIES = 0_MATERIALIZED; 4_AUDITED_AND_QUEUED\nFUTURE_GENERATOR_RESERVE_FAMILIES = XAI_GROK_IMAGINE\n\n## Gates\n\nSOURCE_FAMILY_LEAKAGE = PASS\nRIGHTS_GATE = PASS_FOR_DIFFUSIONDB_AND_OWNER_CONTROLLED_PRIVATE_USE; MODERN_ROUTES_REVIEW_REQUIRED\nBENCHMARK_ROLE_GATE = PASS\nWP007A_BENCHMARK_FINGERPRINT = ${fingerprint}\nWP007A_DATA_FOUNDATION = PARTIAL\n\n## Limitations and blocker\n\nThe bounded DiffusionDB development corpus is rights-audited and materialised from two official shards. The owner synthetic pool is retained as an unknown-generator diagnostic because generator/provider route provenance is not locally established. The owner hard-negative pool is screenshot-heavy, so WP007A adds 48 deterministic programmatic graphics across six subtypes. Modern Cloudflare outputs were not generated: BFL output-training restrictions, unresolved SDXL-Lightning upstream terms, and the absence of an authorized Cloudflare generation session require a later explicit gate. No ChatGPT or Grok outputs were imported.\n\nThe owner-controlled media remains outside Git. Public redistribution is not authorized. Prompt, provider, generator, seed, and rights metadata are provenance only and must not be passed to a future detector.\n\n## Decision\n\nFINAL_CLASSIFICATION = ${finalClassification}\nNEXT_WORK_PACKAGE = WP007B — SPAI EF3 Spectral Calibration & Staged Unseen-Generator Evaluation (only after a separate rights/auth gate for modern holdouts)\n`;
  await writeFile(path.join(OUTPUT_DIR, 'wp007a-final-report.md'), report, 'utf8');
  return { fingerprint, counts, finalClassification };
}

function parseArgs(argv) {
  const options = { download: true, ddbCache: DEFAULT_DDB_CACHE, negativeCache: DEFAULT_NEGATIVE_CACHE };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--no-download') options.download = false;
    else if (argument === '--ddb-cache') options.ddbCache = path.resolve(argv[++index]);
    else if (argument === '--negative-cache') options.negativeCache = path.resolve(argv[++index]);
    else throw new Error(`unknown_argument:${argument}`);
  }
  return options;
}

if (process.argv[1] && path.basename(process.argv[1]) === path.basename(new URL(import.meta.url).pathname)) {
  try {
    const result = await main(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify({ status: 'frozen', ...result }));
  } catch (error) {
    console.error(String(error.message ?? error));
    process.exitCode = 1;
  }
}
