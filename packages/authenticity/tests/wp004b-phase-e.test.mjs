import assert from 'node:assert/strict';
import Ajv from 'ajv';
import test from 'node:test';
import {
  EVIDENCE_PACKET_SCHEMA_VERSION,
  JUDGE_JSON_SCHEMA_VERSION,
  JUDGE_MAX_OUTPUT_TOKENS,
  JUDGE_RECOMMENDATION_SCHEMA_VERSION,
  JUDGE_SYSTEM_PROMPT,
  ORIGIN_HYPOTHESES,
  WHITELISTED_ADDITIONAL_TESTS,
  assertJudgeRecommendation,
  buildEvidencePacket,
  buildJudgeJsonSchema,
  buildJudgeRequest,
  createInsufficientEvidenceRecommendation,
  packetReferenceIds,
  VISION_ESCALATION_REASONS,
  VISION_OBSERVER_CATEGORIES,
} from '../src/wp004a.ts';
import {
  auditWp004bRationale,
  createWp004bLiveCalibrationCases,
  evaluateWp004bLiveRecommendation,
} from '../src/wp004b.ts';

const cases = createWp004bLiveCalibrationCases();

function compile(packet) {
  return new Ajv({ strict: true }).compile(buildJudgeJsonSchema(packet));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function positiveRecommendation(packet) {
  return {
    ...createInsufficientEvidenceRecommendation('The calibrated research control supports a localized alteration.'),
    primaryHypothesis: 'LOCALLY_MANIPULATED',
    supportingEvidence: [{
      evidenceId: `${packet.caseId}:ef5-calibrated`,
      rationale: 'The versioned calibrated EF5 fixture supports a localized alteration.',
    }],
    missingEvidence: [],
    uncertainty: 'MODERATE',
  };
}

function phaseDNeutralRecommendation() {
  return {
    ...createInsufficientEvidenceRecommendation('The available EF2 and EF4 measurements are unvalidated proxies and do not provide directional evidence for camera native or synthetic origin. Origin axes indicate uncertain camera evidence and no positive synthetic evidence. Thus the evidence is insufficient to support any specific origin hypothesis.'),
    alternativeHypotheses: [
      { hypothesis: 'CAMERA_NATIVE', rationale: 'No validated directional evidence supports native camera acquisition; EF2 and EF4 are uncalibrated proxies.' },
      { hypothesis: 'SYNTHETIC', rationale: 'No synthetic evidence is present and synthetic origin is not supported by the data.' },
    ],
    missingEvidence: [
      { requestId: 'req-ef3', request: 'Generative forensics evidence to detect synthetic content', evidenceFamily: null },
      { requestId: 'req-ef5', request: 'Local manipulation reconstruction evidence', evidenceFamily: null },
    ],
  };
}

function emptyPacket() {
  return buildEvidencePacket({
    runId: 'wp004b-phase-e-empty',
    caseId: 'WP004B_PHASE_E_EMPTY_PACKET',
    sampleId: 'WP004B_PHASE_E_EMPTY_PACKET',
    sourceFamilyId: 'WP004B_PHASE_E',
    preflight: { inputHash: 'a'.repeat(64), mime: 'image/png', dimensions: null },
    now: '2026-01-01T00:00:00.000Z',
  });
}

test('packet-aware Judge JSON Schema is explicit, deterministic, and Ajv-compilable', () => {
  for (const item of [...cases, { packet: emptyPacket() }]) {
    const first = buildJudgeJsonSchema(item.packet);
    const second = buildJudgeJsonSchema(item.packet);
    assert.deepEqual(first, second);
    assert.equal(first.$id, JUDGE_JSON_SCHEMA_VERSION);
    assert.doesNotThrow(() => new Ajv({ strict: true }).compile(first));
  }
});

test('schema represents the actual eleven-field canonical Judge contract', () => {
  const schema = buildJudgeJsonSchema(cases[0].packet);
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.required.length, 11);
  assert.deepEqual(schema.required, [
    'schemaVersion',
    'primaryHypothesis',
    'alternativeHypotheses',
    'supportingEvidence',
    'contradictoryEvidence',
    'missingEvidence',
    'uncertainty',
    'requiresReview',
    'recommendedAdditionalTests',
    'rationale',
    'enforcementAuthority',
  ]);
  assert.deepEqual(Object.keys(schema.properties).sort(), [...schema.required].sort());
  assert.equal(schema.properties.schemaVersion.const, JUDGE_RECOMMENDATION_SCHEMA_VERSION);
  assert.deepEqual(schema.properties.primaryHypothesis.enum, ORIGIN_HYPOTHESES);
  assert.deepEqual(schema.properties.uncertainty.enum, ['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH']);
  assert.deepEqual(schema.properties.recommendedAdditionalTests.items.enum, WHITELISTED_ADDITIONAL_TESTS);
  assert.equal(schema.properties.enforcementAuthority.const, false);
});

test('schema derives packet evidence and observation IDs while excluding Safety context', () => {
  const packet = cases[0].packet;
  const schema = buildJudgeJsonSchema(packet);
  const expectedReferences = [...packetReferenceIds(packet)]
    .filter((id) => id !== packet.safetyContext.contextId)
    .sort();
  assert.deepEqual(schema.properties.supportingEvidence.items.properties.evidenceId.enum, expectedReferences);
  assert.ok(!expectedReferences.includes(packet.safetyContext.contextId));
  assert.deepEqual(schema.properties.missingEvidence.items.properties.observationId.enum, [packet.observations[0].observationId]);
  assert.deepEqual(schema.properties.missingEvidence.items.properties.category.enum, VISION_OBSERVER_CATEGORIES);
  assert.deepEqual(schema.properties.missingEvidence.items.properties.reasonCode.enum, VISION_ESCALATION_REASONS);
  const serialized = JSON.stringify(schema);
  for (const forbidden of ['groundTruth', 'expectedHypothesis', 'caseExpectation', 'SUPPORTS', 'CONTRADICTS', 'UNVALIDATED']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('empty packet reference universe forbids reference items without an empty enum', () => {
  const packet = emptyPacket();
  const schema = buildJudgeJsonSchema(packet);
  assert.equal(schema.properties.supportingEvidence.maxItems, 0);
  assert.equal(schema.properties.contradictoryEvidence.maxItems, 0);
  assert.equal(schema.properties.supportingEvidence.items, undefined);
  assert.equal(schema.properties.missingEvidence.items.properties.observationId, undefined);
  assert.equal(compile(packet)(createInsufficientEvidenceRecommendation()), true);
});

test('schema bounds nested structures and canonical region coordinates', () => {
  const packet = cases[0].packet;
  const schema = buildJudgeJsonSchema(packet);
  const validate = compile(packet);
  const base = createInsufficientEvidenceRecommendation();
  base.missingEvidence[0].targetRegion = {
    coordinateSpace: 'NORMALIZED',
    x: 0,
    y: 0,
    width: 0.5,
    height: 0.5,
  };
  assert.equal(validate(base), true);
  assert.equal(schema.properties.alternativeHypotheses.maxItems, 6);
  assert.equal(schema.properties.supportingEvidence.maxItems, 20);
  assert.equal(schema.properties.contradictoryEvidence.maxItems, 20);
  assert.equal(schema.properties.missingEvidence.maxItems, 12);
  assert.equal(schema.properties.rationale.maxLength, 2400);
  assert.equal(schema.properties.alternativeHypotheses.items.properties.rationale.maxLength, 1200);
  assert.equal(schema.properties.supportingEvidence.items.properties.rationale.maxLength, 1200);
  assert.equal(schema.properties.missingEvidence.items.properties.request.maxLength, 1200);
  assert.equal(schema.properties.recommendedAdditionalTests.maxItems, 8);
});

test('known-good neutral and calibrated recommendations pass schema and canonical parser', () => {
  const neutralPacket = cases[0].packet;
  const neutral = createInsufficientEvidenceRecommendation();
  assert.equal(compile(neutralPacket)(neutral), true);
  assert.doesNotThrow(() => assertJudgeRecommendation(neutral, neutralPacket));

  const calibratedPacket = cases[2].packet;
  const calibrated = positiveRecommendation(calibratedPacket);
  assert.equal(compile(calibratedPacket)(calibrated), true);
  assert.doesNotThrow(() => assertJudgeRecommendation(calibrated, calibratedPacket));
});

test('schema rejects invalid enums, references, bounds, forbidden fields, and extra properties', () => {
  const packet = cases[0].packet;
  const validate = compile(packet);
  const base = createInsufficientEvidenceRecommendation();
  const invalidValues = [
    ['invalid primary hypothesis', { ...clone(base), primaryHypothesis: 'UNKNOWN' }],
    ['invalid uncertainty', { ...clone(base), uncertainty: 'MEDIUM' }],
    ['enforcement enabled', { ...clone(base), enforcementAuthority: true }],
    ['unknown top-level property', { ...clone(base), extra: true }],
    ['missing required property', (() => { const value = clone(base); delete value.rationale; return value; })()],
    ['invented evidence ID', { ...clone(base), supportingEvidence: [{ evidenceId: 'invented', rationale: 'x' }] }],
    ['Safety context ID', { ...clone(base), supportingEvidence: [{ evidenceId: packet.safetyContext.contextId, rationale: 'x' }] }],
    ['invalid additional test', { ...clone(base), recommendedAdditionalTests: ['NOT_A_TEST'] }],
    ['too many alternatives', { ...clone(base), alternativeHypotheses: Array.from({ length: 7 }, () => ({ hypothesis: 'SYNTHETIC', rationale: 'x' })) }],
    ['too many references', { ...clone(base), supportingEvidence: Array.from({ length: 21 }, () => ({ evidenceId: packet.evidence[0].evidenceId, rationale: 'x' })) }],
    ['too many missing requests', { ...clone(base), missingEvidence: Array.from({ length: 13 }, () => ({ requestId: 'x', request: 'x', evidenceFamily: null })) }],
    ['invalid category', { ...clone(base), missingEvidence: [{ requestId: 'x', request: 'x', evidenceFamily: null, category: 'NOT_A_CATEGORY' }] }],
    ['invalid reason code', { ...clone(base), missingEvidence: [{ requestId: 'x', request: 'x', evidenceFamily: null, reasonCode: 'NOT_A_REASON' }] }],
    ['unknown observation ID', { ...clone(base), missingEvidence: [{ requestId: 'x', request: 'x', evidenceFamily: null, observationId: 'invented-observation' }] }],
    ['invalid region type', { ...clone(base), missingEvidence: [{ requestId: 'x', request: 'x', evidenceFamily: null, targetRegion: { coordinateSpace: 'NORMALIZED', x: '0', y: 0, width: 0.5, height: 0.5 } }] }],
    ['region coordinate outside bounds', { ...clone(base), missingEvidence: [{ requestId: 'x', request: 'x', evidenceFamily: null, targetRegion: { coordinateSpace: 'NORMALIZED', x: 0, y: 0, width: 1.1, height: 0.5 } }] }],
    ['forbidden raw reasoning field', { ...clone(base), rawReasoning: 'PRIVATE' }],
  ];
  for (const [label, value] of invalidValues) assert.equal(validate(value), false, label);
});

test('default request remains JSON_OBJECT and JSON_SCHEMA is explicit opt-in', () => {
  const packet = cases[0].packet;
  const defaultRequest = buildJudgeRequest(packet);
  const schemaRequest = buildJudgeRequest(packet, { structuredOutputMode: 'JSON_SCHEMA' });
  assert.deepEqual(defaultRequest.response_format, { type: 'json_object' });
  assert.equal(schemaRequest.response_format.type, 'json_schema');
  assert.equal(schemaRequest.response_format.json_schema.$id, JUDGE_JSON_SCHEMA_VERSION);
  assert.deepEqual(schemaRequest.messages, defaultRequest.messages);
  assert.equal(schemaRequest.temperature, defaultRequest.temperature);
  assert.equal(schemaRequest.max_tokens, JUDGE_MAX_OUTPUT_TOKENS);
  assert.equal(defaultRequest.max_tokens, 2400);
  assert.equal(JUDGE_SYSTEM_PROMPT, defaultRequest.messages[0].content);
  assert.equal(JSON.stringify(schemaRequest.messages), JSON.stringify(defaultRequest.messages));
});

test('schema mode preserves packet, prompt, and epistemic invariants', () => {
  const packet = cases[2].packet;
  const request = buildJudgeRequest(packet, { structuredOutputMode: 'JSON_SCHEMA' });
  const serialized = JSON.stringify(request);
  assert.equal(packet.schemaVersion, EVIDENCE_PACKET_SCHEMA_VERSION);
  assert.equal(packet.enforcementAuthority, false);
  assert.doesNotMatch(serialized, /groundTruth|expectedHypothesis|caseExpectation|SUPPORTS|CONTRADICTS|UNVALIDATED/);
  assert.doesNotMatch(serialized, /json_object/);
  assert.equal(request.response_format.json_schema.properties.enforcementAuthority.const, false);
});

test('Phase D B1 rationale is disciplined, and B3 calibrated EF5 remains disciplined', () => {
  const b1 = cases[0];
  const b1Recommendation = phaseDNeutralRecommendation();
  const b1Evaluation = evaluateWp004bLiveRecommendation(b1.packet, b1Recommendation, b1.expectation);
  assert.equal(b1Evaluation.epistemic.valid, true);
  const b1Audit = auditWp004bRationale({ caseId: b1.caseId, packet: b1.packet, recommendation: b1Recommendation, evaluation: b1Evaluation });
  assert.equal(b1Audit.auditKind, 'SUPPLEMENTARY');
  assert.equal(b1Audit.ef2, 'DISCIPLINED');
  assert.equal(b1Audit.ef4, 'DISCIPLINED');

  const b3 = cases[2];
  const b3Recommendation = positiveRecommendation(b3.packet);
  const b3Evaluation = evaluateWp004bLiveRecommendation(b3.packet, b3Recommendation, b3.expectation);
  assert.equal(b3Evaluation.epistemic.valid, true);
  const b3Audit = auditWp004bRationale({ caseId: b3.caseId, packet: b3.packet, recommendation: b3Recommendation, evaluation: b3Evaluation });
  assert.equal(b3Audit.calibratedEf5, 'DISCIPLINED');
  assert.equal(b3Audit.auditKind, 'SUPPLEMENTARY');
});
