import { createOpenAIModerationProvider } from '../../src/openai-moderation.ts';
import { MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION, type ModerationAnalysis } from '../../src/moderation.ts';
import { OPENAI_MODERATION_MODEL, CLOUDFLARE_REASONER_MODEL } from '../../src/research-config.ts';
import { evaluateAuthenticity } from '../../src/index.ts';
import { compilePrivateAlphaText } from '../../src/private-alpha.ts';
import { enforceContentDeclaration } from '../../../contracts/src/content-policy.ts';
import { isUuidV7, type UUIDv7 } from '../../src/uuid.ts';
import { summarize, type Band } from './metrics.ts';

export const HARNESS_VERSION = 'lythaus-posting-feedback-evaluation-v2';
export const SYNTHETIC_ENDPOINT = 'https://moderation.synthetic.invalid/v1/moderations';
export const CATEGORIES = [
  'harassment', 'harassment/threatening', 'hate', 'hate/threatening', 'illicit', 'illicit/violent',
  'self-harm', 'self-harm/instructions', 'self-harm/intent', 'sexual', 'sexual/minors', 'violence', 'violence/graphic',
] as const;
type Category = typeof CATEGORIES[number];
export type ResponseCase = 'ok' | 'flag' | 'contradictory' | 'http_503' | 'http_429' | 'malformed'
  | 'timeout' | 'missing_categories' | 'model_drift' | 'nullable' | 'redirect';
const RESPONSE_CASES = ['ok', 'flag', 'contradictory', 'http_503', 'http_429', 'malformed',
  'timeout', 'missing_categories', 'model_drift', 'nullable', 'redirect'];
export interface Fixture {
  id: string; familyId: string; split: 'calibration' | 'holdout'; body: string;
  declaration: string; truthViolation: boolean | null; scenarioAuthorship: 'human' | 'assisted' | 'generated';
  slices: string[]; response: ResponseCase; revision: number; llmResponse: string;
}

export async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function validateCorpus(fixtures: readonly Fixture[]): Promise<void> {
  if (fixtures.length === 0) throw new Error('evaluation_empty_corpus');
  const ids = new Set<string>();
  const families = new Map<string, string>();
  const normalizedBodies = new Map<string, string>();
  for (const fixture of fixtures) {
    if (!isUuidV7(fixture.id) || ids.has(fixture.id)) throw new Error('evaluation_duplicate_or_invalid_id');
    ids.add(fixture.id);
    if (!/^[a-z0-9-]{1,100}$/.test(fixture.familyId) || !['calibration', 'holdout'].includes(fixture.split)
      || typeof fixture.body !== 'string' || !Number.isSafeInteger(fixture.revision) || fixture.revision < 1
      || typeof fixture.declaration !== 'string' || !RESPONSE_CASES.includes(fixture.response)
      || typeof fixture.llmResponse !== 'string' || fixture.llmResponse.length > 10_000
      || !['human', 'assisted', 'generated'].includes(fixture.scenarioAuthorship)
      || ![true, false, null].includes(fixture.truthViolation)
      || !Array.isArray(fixture.slices) || fixture.slices.length === 0
      || fixture.slices.some(slice => !/^[a-z_]{1,60}$/.test(slice))) throw new Error('evaluation_invalid_fixture');
    if (families.has(fixture.familyId) && families.get(fixture.familyId) !== fixture.split) throw new Error('evaluation_family_leakage');
    families.set(fixture.familyId, fixture.split);
    const bodyHash = await hash(fixture.body.normalize('NFC').trim());
    if (normalizedBodies.has(bodyHash)) throw new Error('evaluation_duplicate_normalized_body');
    normalizedBodies.set(bodyHash, fixture.split);
  }
  if (new Set(fixtures.map(fixture => fixture.split)).size !== 2) throw new Error('evaluation_both_splits_required');
}

export function scriptedResponse(fixture: Pick<Fixture, 'response'>): Response {
  if (fixture.response === 'http_503' || fixture.response === 'http_429') return Response.json({ error: {
    type: 'api_error', code: 'fixture_failure', message: 'UNSAFE_RAW_DIAGNOSTIC_MUST_NOT_APPEAR',
  } }, { status: fixture.response === 'http_503' ? 503 : 429 });
  if (fixture.response === 'redirect') return new Response(null, { status: 307,
    headers: { location: 'https://never-contact.synthetic.invalid/collect' } });
  if (fixture.response === 'malformed') return new Response('not JSON', { headers: { 'content-type': 'application/json' } });
  const flagged = fixture.response === 'flag';
  const categories: Record<string, boolean | null> = Object.fromEntries(CATEGORIES.map(category => [category, flagged && category === 'harassment']));
  const scores: Record<string, number | null> = Object.fromEntries(CATEGORIES.map(category => [category, flagged && category === 'harassment' ? 0.85 : 0.02]));
  const applied = Object.fromEntries(CATEGORIES.map(category => [category, ['text']]));
  if (fixture.response === 'contradictory') categories.harassment = true;
  if (fixture.response === 'nullable') { categories.illicit = null; scores.illicit = null; }
  if (fixture.response === 'missing_categories') { delete categories.hate; delete scores.hate; delete applied.hate; }
  return Response.json({ model: fixture.response === 'model_drift' ? 'omni-moderation-unexpected-version' : OPENAI_MODERATION_MODEL,
    results: [{ flagged, categories, category_scores: scores, category_applied_input_types: applied }] });
}

export function syntheticTransport(fixture: Fixture): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== SYNTHETIC_ENDPOINT || init?.method !== 'POST' || init.redirect !== 'manual') throw new Error('evaluation_outbound_denied');
    if (fixture.response === 'timeout') return new Promise<Response>((_, reject) => {
      const abort = () => reject(new DOMException('Interrupted fixture', 'AbortError'));
      if (init.signal?.aborted) abort();
      else init.signal?.addEventListener('abort', abort, { once: true });
    });
    return scriptedResponse(fixture);
  }) as typeof fetch;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function strictSafetySchema(analysis: ModerationAnalysis): boolean {
  const evidence = analysis.providerEvidence;
  if (!evidence || analysis.result === 'PROVIDER_FAILURE' || evidence.status !== 'SUCCESS'
    || evidence.schemaVersion !== MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION
    || evidence.provider !== 'openai' || evidence.model !== OPENAI_MODERATION_MODEL
    || analysis.modelVersion !== evidence.model || analysis.executionMs !== evidence.executionMs
    || !Number.isFinite(evidence.executionMs) || evidence.executionMs < 0) return false;
  const validKeys = (value: unknown) => record(value) && Object.keys(value).length === CATEGORIES.length
    && CATEGORIES.every(category => Object.hasOwn(value, category));
  if (![evidence.categories, evidence.categoryScores, evidence.categoryAppliedInputTypes].every(validKeys)) return false;
  if (!CATEGORIES.every(category => typeof evidence.categories[category] === 'boolean'
    && Number.isFinite(evidence.categoryScores[category]) && evidence.categoryScores[category] >= 0 && evidence.categoryScores[category] <= 1
    && Array.isArray(evidence.categoryAppliedInputTypes[category])
    && evidence.categoryAppliedInputTypes[category].length === 1 && evidence.categoryAppliedInputTypes[category][0] === 'text')) return false;
  return typeof evidence.flagged === 'boolean' && evidence.flagged === CATEGORIES.some(category => evidence.categories[category])
    && analysis.result === (evidence.flagged ? 'REVIEW' : 'ALLOW');
}

export function declarationResult(fixture: Fixture) {
  try {
    const result = enforceContentDeclaration({ body: fixture.body, declaredCreationMode: fixture.declaration });
    return { status: 'COMPLIANT', errorCode: null, characterCount: result.characterCount, declaredLabel: result.publicLabel,
      honestyVerified: false, policyVersion: 'existing-content-policy-at-reviewed-base' };
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known = ['invalid_post', 'ai_generated_public_content_blocked', 'ai_assisted_character_limit_exceeded'];
    return { status: 'NONCOMPLIANT', errorCode: known.includes(code) ? code : 'declaration_evaluation_failed',
      characterCount: null, declaredLabel: null, honestyVerified: false, policyVersion: 'existing-content-policy-at-reviewed-base' };
  }
}

export async function collectFixture(fixture: Fixture, transport: typeof fetch = syntheticTransport(fixture)) {
  let transportCalls = 0;
  const responseMetadata: { model: string | null; hash: string | null } = { model: null, hash: null };
  const guardedTransport = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== SYNTHETIC_ENDPOINT) throw new Error('evaluation_outbound_denied');
    transportCalls += 1;
    const response = await transport(input, init);
    const body = await response.clone().text();
    responseMetadata.hash = await hash(body);
    try {
      const parsed: unknown = JSON.parse(body);
      if (record(parsed) && typeof parsed.model === 'string' && /^[A-Za-z0-9@/_.-]{1,120}$/.test(parsed.model)) responseMetadata.model = parsed.model;
    } catch {}
    return response;
  }) as typeof fetch;
  let clock = 0;
  const analysis = await createOpenAIModerationProvider({ apiKey: 'synthetic-fixture-only', endpoint: SYNTHETIC_ENDPOINT,
    fetchImpl: guardedTransport, flaggedResult: 'REVIEW', timeoutMs: fixture.response === 'timeout' ? 20 : 1_000,
    now: () => (clock += 25),
  }).analyseText({ caseId: fixture.id as UUIDv7, text: fixture.body });
  const valid = strictSafetySchema(analysis);
  const evidence = analysis.providerEvidence;
  const allowedMap = <T>(values: Readonly<Record<string, T>> | undefined) => Object.fromEntries(CATEGORIES
    .filter(category => values && Object.hasOwn(values, category)).map(category => [category, values![category]])) as Partial<Record<Category, T>>;
  let legacy: Awaited<ReturnType<typeof evaluateAuthenticity>> | null = null;
  try {
    legacy = await evaluateAuthenticity({ kind: 'text', content: fixture.body, contentId: fixture.id,
      declaredCreationMode: fixture.declaration, modelId: CLOUDFLARE_REASONER_MODEL,
      runModel: async () => {
        if (fixture.llmResponse === '__NETWORK_FAILURE__') throw new Error('RAW_LLM_ERROR_MUST_NOT_APPEAR');
        return { response: fixture.llmResponse };
      },
    });
  } catch {}
  let llmSchemaValid = false;
  try {
    const parsed: unknown = JSON.parse(fixture.llmResponse);
    llmSchemaValid = record(parsed) && typeof parsed.riskScore === 'number' && Number.isFinite(parsed.riskScore)
      && parsed.riskScore >= 0 && parsed.riskScore <= 1 && Array.isArray(parsed.signals)
      && parsed.signals.every(signal => record(signal) && typeof signal.category === 'string'
        && typeof signal.confidence === 'number' && Number.isFinite(signal.confidence) && signal.confidence >= 0 && signal.confidence <= 1);
  } catch {}
  const privateText = compilePrivateAlphaText({ caseId: fixture.id, runId: fixture.id,
    inputHash: await hash(fixture.body), moderation: analysis });
  return {
    sampleId: fixture.id, familyId: fixture.familyId, revision: fixture.revision,
    inputHash: await hash(fixture.body), split: fixture.split, slices: [...fixture.slices],
    truthViolation: fixture.truthViolation, scenarioAuthorship: fixture.scenarioAuthorship,
    provenance: { mode: 'SYNTHETIC_SCRIPTED' as const, fixtureHash: await hash(JSON.stringify(fixture)),
      responseHash: responseMetadata.hash, externalRequests: 0, transportCalls, providerSnapshotKnown: false },
    safety: {
      adapterStatus: analysis.result, adapterAccepted: evidence?.status === 'SUCCESS',
      schemaValid: valid, requestedModel: OPENAI_MODERATION_MODEL, responseModel: responseMetadata.model,
      evidenceSchema: evidence?.schemaVersion ?? null, flagged: evidence?.flagged ?? null,
      categoryFlags: allowedMap(evidence?.categories), categoryScores: allowedMap(evidence?.categoryScores),
      appliedInputTypes: allowedMap(evidence?.categoryAppliedInputTypes),
      executionMs: analysis.executionMs, latencySource: 'SCRIPTED_CLOCK_NOT_PROVIDER_LATENCY',
      failure: evidence?.errorCategory ?? (valid ? null : 'EVALUATION_SCHEMA_OR_CONSISTENCY_FAILURE'),
      httpStatus: evidence?.httpStatus ?? null,
      band: (valid ? evidence?.flagged ? 'REVIEW' : 'ALLOW_EVIDENCE' : 'ABSTAIN') as Band,
      explanation: valid ? evidence?.flagged ? 'Provider flagged content; Lythaus policy review required.' : 'Provider did not flag content; authorship and publication remain unresolved.'
        : 'No usable safety finding; retain missingness and review requirements.',
      uncertainty: 'UNCALIBRATED_PROVIDER_SCORES',
    },
    authorship: { band: 'ABSTAIN' as Band, qualifiedTextDetector: false, finding: privateText.finding,
      support: privateText.support, execution: privateText.components.safe.execution,
      missingModalities: ['qualified_text_authorship', 'image_not_submitted', 'video_not_evaluated', 'audio_not_evaluated'],
      legacyModel: { model: CLOUDFLARE_REASONER_MODEL, policy: 'evaluation-only-v1', schemaValid: llmSchemaValid,
        status: legacy ? 'COMPLETED' : 'PROVIDER_FAILURE',
        normalizedRiskScore: legacy?.riskScore ?? null, selfConfidence: legacy?.signals.map(signal => signal.confidence) ?? [],
        reviewRequired: true, probabilityCalibration: 'NONE', explanation: 'Unqualified model claims; raw rationale withheld.' },
      uncertainty: 'NO_QUALIFIED_TEXT_AUTHORSHIP_EVIDENCE',
    },
    declaration: declarationResult(fixture),
    authority: { publicPosting: 'WITHHELD', publicationEligible: false, authenticityEnforcementEnabled: false,
      rewardsEligible: false, decisionWritten: false, safetyApprovalProvesHumanAuthorship: false },
  };
}

export type Observation = Awaited<ReturnType<typeof collectFixture>>;

function exactRecordedValue(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length
    && Object.keys(actual).length === Object.keys(expected).length
    && expected.every((value, index) => exactRecordedValue(actual[index], value));
  if (!record(actual) || !record(expected)) return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length
    && keys.every(key => Object.hasOwn(actual, key) && exactRecordedValue(actual[key], expected[key]));
}

export async function assertObservationBindings(fixtures: readonly Fixture[], observations: readonly Observation[]): Promise<void> {
  if (observations.length !== fixtures.length) throw new Error('evaluation_incomplete_or_interrupted_collection');
  const byId = new Map(fixtures.map(fixture => [fixture.id, fixture]));
  const seen = new Set<string>();
  for (const observation of observations) {
    if (seen.has(observation.sampleId)) throw new Error('evaluation_duplicate_or_replayed_observation');
    seen.add(observation.sampleId);
    const fixture = byId.get(observation.sampleId);
    if (!fixture || observation.revision !== fixture.revision || observation.inputHash !== await hash(fixture.body)
      || observation.provenance.fixtureHash !== await hash(JSON.stringify(fixture))
      || observation.familyId !== fixture.familyId || observation.split !== fixture.split
      || JSON.stringify(observation.slices) !== JSON.stringify(fixture.slices)
      || observation.truthViolation !== fixture.truthViolation || observation.scenarioAuthorship !== fixture.scenarioAuthorship)
      throw new Error('evaluation_stale_or_misbound_observation');
    if (observation.provenance.mode !== 'SYNTHETIC_SCRIPTED' || observation.provenance.externalRequests !== 0
      || observation.provenance.providerSnapshotKnown !== false || observation.provenance.transportCalls !== 1
      || observation.authority.publicPosting !== 'WITHHELD' || observation.authority.publicationEligible !== false
      || observation.authority.authenticityEnforcementEnabled !== false || observation.authority.rewardsEligible !== false
      || observation.authority.decisionWritten !== false || observation.authority.safetyApprovalProvesHumanAuthorship !== false)
      throw new Error('evaluation_provenance_or_authority_violation');
    const safety = observation.safety;
    const reconstructed = { provider: 'openai', result: safety.adapterStatus, modelVersion: safety.requestedModel,
      reasonCodes: [], executionMs: safety.executionMs, costEstimateUsd: 0,
      providerEvidence: { schemaVersion: safety.evidenceSchema, provider: 'openai', model: safety.responseModel,
        flagged: safety.flagged, categories: safety.categoryFlags, categoryScores: safety.categoryScores,
        categoryAppliedInputTypes: safety.appliedInputTypes, executionMs: safety.executionMs,
        status: safety.adapterAccepted ? 'SUCCESS' : 'PROVIDER_FAILURE' } } as ModerationAnalysis;
    if (safety.schemaValid !== strictSafetySchema(reconstructed)
      || safety.band !== (safety.schemaValid ? safety.flagged ? 'REVIEW' : 'ALLOW_EVIDENCE' : 'ABSTAIN')
      || observation.authorship.band !== 'ABSTAIN' || observation.authorship.qualifiedTextDetector !== false
      || JSON.stringify(observation.declaration) !== JSON.stringify(declarationResult(fixture)))
      throw new Error('evaluation_inconsistent_axes');
    // Synthetic receipts have a known raw response. Derive the entire normalized
    // observation again through the real adapter and reject any differing field,
    // including the raw-body hash, failure/status/timing source and extra fields.
    // This is not an importer or authenticity proof for future live receipts.
    const expected = await collectFixture(fixture);
    if (!exactRecordedValue(observation, expected)) throw new Error('evaluation_synthetic_receipt_mismatch');
  }
}

export async function evaluateCorpus(fixtures: readonly Fixture[], observations: readonly Observation[]) {
  await validateCorpus(fixtures);
  await assertObservationBindings(fixtures, observations);
  const authorshipMetrics = (selected: readonly Observation[]) => {
    const result = summarize(selected.map(row => ({ familyId: row.familyId,
      truthViolation: row.scenarioAuthorship !== 'human', band: row.authorship.band })));
    return { ...result, labelAxis: 'AI_INVOLVEMENT_SCENARIO_NOT_DECLARATION_POLICY',
      matrix: { human_scenario: result.matrix.safe, ai_involvement_scenario: result.matrix.violation, unknown: result.matrix.unknown } };
  };
  const metrics = (selected: readonly Observation[]) => ({
    safety: summarize(selected.map(row => ({ familyId: row.familyId, truthViolation: row.truthViolation, band: row.safety.band }))),
    authorship: authorshipMetrics(selected),
    declaration: { compliant: selected.filter(row => row.declaration.status === 'COMPLIANT').length,
      noncompliant: selected.filter(row => row.declaration.status === 'NONCOMPLIANT').length, honestyVerified: false },
  });
  const bySplit = Object.fromEntries(['calibration', 'holdout'].map(split => [split, metrics(observations.filter(row => row.split === split))]));
  const bySlice = Object.fromEntries([...new Set(fixtures.flatMap(fixture => fixture.slices))].sort().map(slice => [slice,
    Object.fromEntries(['calibration', 'holdout'].map(split => [split, metrics(observations.filter(row => row.split === split && row.slices.includes(slice)))])),
  ]));
  return { schemaVersion: HARNESS_VERSION, evidenceClass: 'SYNTHETIC_SCHEMA_AND_MEASUREMENT_TEST_ONLY',
    corpusHash: await hash(JSON.stringify(fixtures)), externalRequests: 0,
    publicationEligible: false, bySplit, bySlice,
    thresholdRecommendation: { version: 'lythaus-posting-bands-unevaluated-v1', status: 'UNEVALUATED',
      safetyAllowMaximum: null, safetyBlockMinimum: null, authorshipAllowMaximum: null, authorshipBlockMinimum: null,
      calibrationAttempted: false, holdoutUsedForTuning: false, activate: false,
      reason: 'Scripted outputs and scenario labels provide no provider accuracy or calibrated posting thresholds.' },
    observations,
  };
}
