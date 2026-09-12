import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  buildJudgeRequest,
  createInsufficientEvidenceRecommendation,
  JUDGE_PROMPT_VERSION,
  JUDGE_SYSTEM_PROMPT,
} from '../src/wp004a.ts';
import {
  auditWp004bRationale,
  buildEvidenceDirectionPolicy,
  createWp004bLiveCalibrationCases,
  evaluateWp004bLiveRecommendation,
} from '../src/wp004b.ts';

const cases = createWp004bLiveCalibrationCases();

function b1Candidate() {
  const item = cases[0];
  return {
    ...createInsufficientEvidenceRecommendation('The EF2 and EF4 measurements support CAMERA_NATIVE.'),
    primaryHypothesis: 'CAMERA_NATIVE',
    uncertainty: 'LOW',
    requiresReview: false,
    supportingEvidence: [
      { evidenceId: `${item.caseId}:ef2-proxy`, rationale: 'The EF2 camera proxy supports CAMERA_NATIVE.' },
      { evidenceId: `${item.caseId}:ef4-spectral`, rationale: 'The EF4 spectral measurement supports CAMERA_NATIVE.' },
    ],
  };
}

function b3Candidate() {
  const item = cases[2];
  return {
    ...createInsufficientEvidenceRecommendation('The calibrated research control provides bounded directional evidence for a localized edit.'),
    primaryHypothesis: 'LOCALLY_MANIPULATED',
    uncertainty: 'MODERATE',
    supportingEvidence: [{ evidenceId: `${item.caseId}:ef5-calibrated`, rationale: 'The versioned calibrated EF5 fixture supports a localized alteration.' }],
  };
}

test('Judge prompt v3 is versioned and retains the canonical request invariants', () => {
  assert.equal(JUDGE_PROMPT_VERSION, 'lythaus-gpt-oss-judge-prompt-v3');
  const request = buildJudgeRequest(cases[0].packet);
  assert.equal(request.response_format.type, 'json_object');
  assert.equal(request.temperature, 0);
  assert.equal(request.max_tokens, 2400);
  assert.equal(request.messages[0].content, JUDGE_SYSTEM_PROMPT);
  assert.equal(request.messages[1].content, JSON.stringify(cases[0].packet));
});

test('Judge prompt v3 explicitly states evidence directionality and current Research V1 limits', () => {
  const anchors = [
    'Evidence being compatible with a hypothesis does not make it supporting evidence',
    'descriptive without being origin-directional',
    'validated directional relationship',
    'Absence of supporting evidence is not contradictory evidence',
    'Experimental, uncalibrated, proxy, or otherwise unvalidated measurements',
    'current EF2 experimental physical-acquisition proxies',
    'current EF4 experimental spectral/residual measurements',
    'unavailable EF3 and EF5 are missing evidence',
    'calibrated directional evidence may and should be used',
    'If the packet is PARTIAL and no validated directional origin evidence exists',
  ];
  for (const anchor of anchors) assert.ok(JUDGE_SYSTEM_PROMPT.includes(anchor), anchor);
  assert.match(JUDGE_SYSTEM_PROMPT, /EF2 MUST NOT support CAMERA_NATIVE or SYNTHETIC or contradict either origin/);
  assert.match(JUDGE_SYSTEM_PROMPT, /EF4 measurements are descriptive experimental observations/);
  assert.match(JUDGE_SYSTEM_PROMPT, /Each reference must be directionally eligible/);
});

test('B1 request receives directionality rules without evaluator expectations or direction labels', () => {
  const item = cases[0];
  const request = buildJudgeRequest(item.packet);
  const userContent = request.messages.find((message) => message.role === 'user').content;
  assert.equal(userContent, JSON.stringify(item.packet));
  assert.doesNotMatch(userContent, /SUPPORTS|CONTRADICTS|UNVALIDATED|expected|forbidden|groundTruth|epistemicPolicy/i);
  assert.match(request.messages[0].content, /EF2/);
  assert.match(request.messages[0].content, /EF4/);
  assert.match(request.messages[0].content, /unavailable EF3 and EF5 are missing evidence/);
});

test('v3 preserves calibrated positive evidence as an allowed direction', () => {
  const item = cases[2];
  const classification = buildEvidenceDirectionPolicy(item.packet).find((entry) => entry.evidenceId.endsWith(':ef5-calibrated'));
  assert.equal(classification.directionByHypothesis.LOCALLY_MANIPULATED, 'SUPPORTS');
  const evaluation = evaluateWp004bLiveRecommendation(item.packet, b3Candidate(), item.expectation);
  assert.equal(evaluation.epistemic.valid, true);
  assert.equal(evaluation.expectation.valid, true);
});

test('evidence-aware supplementary audit accepts B3 calibrated EF5 rationale', () => {
  const item = cases[2];
  const recommendation = b3Candidate();
  const evaluation = evaluateWp004bLiveRecommendation(item.packet, recommendation, item.expectation);
  assert.equal(evaluation.epistemic.valid, true);
  const audit = auditWp004bRationale({ caseId: item.caseId, packet: item.packet, recommendation, evaluation });
  assert.equal(audit.auditKind, 'SUPPLEMENTARY');
  assert.equal(audit.calibratedEf5, 'DISCIPLINED');
  assert.notEqual(audit.calibratedEf5, 'VIOLATION');
});

test('evidence-aware supplementary audit still flags B1 unvalidated EF2/EF4 support', () => {
  const item = cases[0];
  const recommendation = b1Candidate();
  const evaluation = evaluateWp004bLiveRecommendation(item.packet, recommendation, item.expectation);
  assert.equal(evaluation.epistemic.valid, false);
  assert.ok(evaluation.epistemic.violations.includes('EVIDENCE_DIRECTIONALITY_UNSUPPORTED'));
  const audit = auditWp004bRationale({ caseId: item.caseId, packet: item.packet, recommendation, evaluation });
  assert.equal(audit.ef2, 'VIOLATION');
  assert.equal(audit.ef4, 'VIOLATION');
});

test('prompt growth remains bounded for the surgical v3 addition', () => {
  const approximateTokens = Math.ceil(JUDGE_SYSTEM_PROMPT.length / 4);
  assert.ok(JUDGE_SYSTEM_PROMPT.length > 6376);
  assert.ok(JUDGE_SYSTEM_PROMPT.length < 10000);
  assert.ok(approximateTokens < 2500);
});

test('artifact upload uses an explicit non-hidden sanitized allowlist', async () => {
  const workflow = await readFile(path.resolve('.github/workflows/wp004b-judge-calibration.yml'), 'utf8');
  assert.match(workflow, /target="wp004b-sanitized-artifacts"/);
  assert.match(workflow, /final-result\.json/);
  assert.match(workflow, /call-accounting\.json/);
  assert.match(workflow, /budget-finalizer\.json/);
  assert.match(workflow, /path: wp004b-sanitized-artifacts/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.doesNotMatch(workflow, /include-hidden-files:\s*true/);
  assert.doesNotMatch(workflow, /path: \.artifacts\s*$/m);
});

test('Phase C leaves transport, schema, and enforcement invariants unchanged', () => {
  const serialized = JSON.stringify(buildJudgeRequest(cases[2].packet));
  assert.equal(cases[0].packet.schemaVersion, 'lythaus-evidence-packet-v1');
  assert.equal(cases[2].packet.enforcementAuthority, false);
  assert.doesNotMatch(serialized, /response_format[^}]*json_schema/);
  assert.doesNotMatch(serialized, /@cf\/openai\/gpt-oss-20b/);
});
