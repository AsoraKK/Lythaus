import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { mkdtemp, readFile, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectFixture, evaluateCorpus, validateCorpus, assertObservationBindings, hash, syntheticTransport, SYNTHETIC_ENDPOINT } from './harness.ts';
import { fixtures } from './fixtures.mjs';
import { rate, summarize } from './metrics.ts';
import { runSyntheticEvaluation, evaluateSafeProtocols, writeReportAtomically } from './run.mjs';
import { createOpenAIModerationProvider } from '../../src/openai-moderation.ts';

const clone = value => structuredClone(value);
const get = family => fixtures.find(fixture => fixture.familyId === family);

test('complete offline corpus reports separate axes and never uses ambient network', async () => {
  const network = mock.method(globalThis, 'fetch', () => { throw new Error('OUTBOUND_DENIED'); });
  try {
    const report = await runSyntheticEvaluation();
    assert.equal(network.mock.callCount(), 0);
    assert.equal(report.observations.length, 32);
    assert.equal(report.externalRequests, 0);
    assert.equal(report.thresholdRecommendation.status, 'UNEVALUATED');
    for (const key of ['safetyAllowMaximum', 'safetyBlockMinimum', 'authorshipAllowMaximum', 'authorshipBlockMinimum'])
      assert.equal(report.thresholdRecommendation[key], null);
    for (const row of report.observations) {
      assert.equal(row.authorship.qualifiedTextDetector, false);
      assert.equal(row.authorship.band, 'ABSTAIN');
      assert.equal(row.authority.publicationEligible, false);
      assert.equal(row.authority.safetyApprovalProvesHumanAuthorship, false);
      assert.equal(row.provenance.transportCalls, 1);
      assert.equal(row.safety.executionMs, 25);
      assert.match(row.provenance.fixtureHash, /^[a-f0-9]{64}$/);
      assert.equal(row.inputHash, await hash(get(row.familyId).body));
    }
    assert.equal(report.bySplit.calibration.safety.sampleCount, 16);
    assert.equal(report.bySplit.holdout.safety.sampleCount, 16);
    assert.equal(report.bySplit.holdout.safety.falseAcceptance.value, 1);
    assert.equal(report.bySplit.calibration.authorship.abstentionRate.value, 1);
    assert.equal(report.bySplit.holdout.authorship.abstentionRate.value, 1);
    assert.equal(report.bySplit.calibration.authorship.matrix.human_scenario.ABSTAIN, 13);
    assert.equal(report.bySplit.holdout.authorship.matrix.ai_involvement_scenario.ABSTAIN, 4);
    assert.equal(Object.hasOwn(report.bySplit.holdout.authorship.matrix, 'violation'), false);
    assert.equal(report.bySlice.unicode.holdout.safety.sampleCount, 2);
    const serialized = JSON.stringify(report);
    for (const secret of ['UNSAFE_RAW_DIAGNOSTIC', 'RAW_LLM_ERROR', 'synthetic-fixture-only', 'Scripted rationale:'])
      assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes(get('morning-note').body), false);
  } finally { network.mock.restore(); }
});

test('safety flags, scores, model, modalities, schema and uncertainty survive without implying authorship', async () => {
  const benign = await collectFixture(get('morning-note'));
  const sensitive = await collectFixture(get('sensitive-support'));
  assert.equal(benign.safety.schemaValid, true);
  assert.equal(benign.safety.band, 'ALLOW_EVIDENCE');
  assert.equal(benign.safety.flagged, false);
  assert.equal(Object.keys(benign.safety.categoryFlags).length, 13);
  assert.equal(sensitive.safety.band, 'REVIEW');
  assert.equal(sensitive.safety.categoryFlags.harassment, true);
  assert.equal(sensitive.safety.categoryScores.harassment, 0.85);
  assert.deepEqual(sensitive.safety.appliedInputTypes.harassment, ['text']);
  assert.equal(sensitive.safety.requestedModel, 'omni-moderation-latest');
  assert.equal(sensitive.safety.responseModel, 'omni-moderation-latest');
  assert.equal(sensitive.provenance.providerSnapshotKnown, false);
  assert.equal(sensitive.safety.uncertainty, 'UNCALIBRATED_PROVIDER_SCORES');
  assert.equal(benign.authorship.finding, 'INCONCLUSIVE');
  assert.equal(benign.authorship.execution, 'unsupported');
});

test('adapter acceptance does not hide partial or contradictory evaluation metadata', async () => {
  for (const family of ['missing-categories', 'adversarial-json']) {
    const row = await collectFixture(get(family));
    assert.equal(row.safety.adapterAccepted, true);
    assert.equal(row.safety.schemaValid, false);
    assert.equal(row.safety.band, 'ABSTAIN');
    assert.equal(row.safety.failure, 'EVALUATION_SCHEMA_OR_CONSISTENCY_FAILURE');
  }
});

test('outage, rate limit, timeout, redirect, malformed and nullable schemas remain missing findings', async () => {
  for (const [family, failure, status] of [
    ['outage', 'HTTP_SERVER_FAILURE', 503], ['rate-limit', 'HTTP_RATE_LIMITED', 429],
    ['timeout', 'TIMEOUT', null], ['redirect', 'HTTP_FAILURE', 307],
    ['invalid-json', 'MALFORMED_RESPONSE', 200], ['nullable-illicit', 'UNEXPECTED_SCHEMA', 200],
    ['model-drift', 'UNEXPECTED_SCHEMA', 200],
  ]) {
    const row = await collectFixture(get(family));
    assert.equal(row.safety.adapterAccepted, false, family);
    assert.equal(row.safety.band, 'ABSTAIN', family);
    assert.equal(row.safety.failure, failure, family);
    assert.equal(row.safety.httpStatus, status, family);
    assert.equal(row.safety.flagged, null, family);
    assert.equal(row.authority.publicPosting, 'WITHHELD');
  }
  const drift = await collectFixture(get('model-drift'));
  assert.equal(drift.safety.responseModel, 'omni-moderation-unexpected-version');
});

test('invalid LLM JSON and provider failure cannot be interpreted as confidence or human detection', async () => {
  const invalid = await collectFixture(get('llm-invalid-json'));
  assert.equal(invalid.authorship.legacyModel.schemaValid, false);
  assert.equal(invalid.authorship.legacyModel.normalizedRiskScore, 1);
  assert.deepEqual(invalid.authorship.legacyModel.selfConfidence, [1]);
  assert.equal(invalid.authorship.legacyModel.reviewRequired, true);
  assert.equal(invalid.authorship.band, 'ABSTAIN');
  const failed = await collectFixture(get('llm-network-error'));
  assert.equal(failed.authorship.legacyModel.status, 'PROVIDER_FAILURE');
  assert.equal(failed.authorship.legacyModel.normalizedRiskScore, null);
  assert.equal(failed.authorship.band, 'ABSTAIN');
});

test('missing credentials and transport/authentication failures stay sanitized and distinct from content findings', async () => {
  let calls = 0;
  const missing = await createOpenAIModerationProvider({
    fetchImpl: async () => { calls += 1; throw new Error('NO_REAL_NETWORK'); },
  }).analyseText({ caseId: fixtures[0].id, text: fixtures[0].body });
  assert.equal(calls, 0);
  assert.equal(missing.providerEvidence.errorCategory, 'MISSING_CREDENTIAL');
  for (const status of [401, 403]) {
    const auth = await createOpenAIModerationProvider({ apiKey: 'synthetic-fixture-only',
      fetchImpl: async () => Response.json({ error: { type: 'invalid_request_error', code: 'invalid_api_key',
        message: 'RAW_CREDENTIAL_MESSAGE_MUST_NOT_APPEAR' } }, { status }),
    }).analyseText({ caseId: fixtures[0].id, text: fixtures[0].body });
    assert.equal(auth.providerEvidence.errorCategory, 'HTTP_AUTHENTICATION_FAILURE');
    assert.equal(auth.providerEvidence.httpStatus, status);
    assert.equal(JSON.stringify(auth).includes('RAW_CREDENTIAL_MESSAGE'), false);
  }
  const row = await collectFixture(fixtures[0], async () => { throw new Error('RAW_TRANSPORT_MESSAGE_MUST_NOT_APPEAR'); });
  assert.equal(row.safety.failure, 'NETWORK_FAILURE');
  assert.equal(row.safety.band, 'ABSTAIN');
  assert.equal(JSON.stringify(row).includes('RAW_TRANSPORT_MESSAGE'), false);
});

test('disclosure and Unicode use the existing deterministic contract independently of safety', async () => {
  for (const [family, status, code, count] of [
    ['generated-labelled', 'NONCOMPLIANT', 'ai_generated_public_content_blocked', null],
    ['assisted-limit-249', 'COMPLIANT', null, 249],
    ['assisted-limit-250', 'NONCOMPLIANT', 'ai_assisted_character_limit_exceeded', null],
    ['disclosed-long', 'NONCOMPLIANT', 'ai_assisted_character_limit_exceeded', null],
    ['empty-disclosure', 'NONCOMPLIANT', 'invalid_post', null],
  ]) {
    const row = await collectFixture(get(family));
    assert.equal(row.declaration.status, status);
    assert.equal(row.declaration.errorCode, code);
    assert.equal(row.declaration.characterCount, count);
    assert.equal(row.safety.band, 'ALLOW_EVIDENCE');
    assert.equal(row.declaration.honestyVerified, false);
    assert.equal(row.authority.publicationEligible, false);
  }
});

test('disjoint split validation rejects related families, NFC duplicates, invalid IDs and empty splits', async () => {
  const valid = [clone(fixtures[0]), clone(fixtures[1])];
  await validateCorpus(valid);
  await assert.rejects(validateCorpus([]), /empty_corpus/);
  await assert.rejects(validateCorpus([valid[0]]), /both_splits_required/);
  await assert.rejects(validateCorpus([valid[0], { ...valid[1], id: valid[0].id }]), /duplicate_or_invalid_id/);
  await assert.rejects(validateCorpus([valid[0], { ...valid[1], familyId: valid[0].familyId }]), /family_leakage/);
  await assert.rejects(validateCorpus([{ ...valid[0], body: ' Café ' }, { ...valid[1], body: 'Cafe\u0301' }]), /duplicate_normalized_body/);
  for (const fields of [{ revision: 0 }, { truthViolation: 'false' }, { response: 'arbitrary-provider' }, { slices: ['raw explanation'] }])
    await assert.rejects(validateCorpus([{ ...valid[0], ...fields }, valid[1]]), /invalid_fixture/);
});

test('missing, duplicate, replayed, stale revision, hash and label bindings reject evaluation', async () => {
  const corpus = [fixtures[0], fixtures[1]];
  const observations = await Promise.all(corpus.map(fixture => collectFixture(fixture)));
  await assertObservationBindings(corpus, observations);
  await assert.rejects(evaluateCorpus(corpus, [observations[0]]), /incomplete_or_interrupted/);
  await assert.rejects(evaluateCorpus(corpus, [observations[0], observations[0]]), /duplicate_or_replayed/);
  for (const fields of [{ revision: 2 }, { inputHash: 'f'.repeat(64) }, { truthViolation: true },
    { split: 'holdout' }, { slices: ['invented'] }, { familyId: 'different' }]) {
    const stale = { ...observations[0], ...fields };
    await assert.rejects(evaluateCorpus(corpus, [stale, observations[1]]), /stale_or_misbound/);
  }
  const changed = corpus.map(clone);
  changed[0].body += ' edited';
  await assert.rejects(evaluateCorpus(changed, observations), /stale_or_misbound/);
});

test('authority, provenance and inconsistent measurement axes cannot be smuggled into a report', async () => {
  const corpus = [fixtures[0], fixtures[1]];
  const observations = await Promise.all(corpus.map(fixture => collectFixture(fixture)));
  for (const change of [
    row => { row.authority.publicationEligible = true; },
    row => { row.authority.safetyApprovalProvesHumanAuthorship = true; },
    row => { row.provenance.mode = 'LIVE'; },
    row => { row.provenance.externalRequests = 1; },
    row => { row.safety.band = 'BLOCK_EVIDENCE'; },
    row => { row.authorship.band = 'ALLOW_EVIDENCE'; },
    row => { row.declaration.status = 'NONCOMPLIANT'; },
    row => { row.safety.responseModel = 'other-model'; },
  ]) {
    const altered = observations.map(clone);
    change(altered[0]);
    await assert.rejects(evaluateCorpus(corpus, altered), /provenance_or_authority_violation|inconsistent_axes/);
  }
});

test('retries and concurrent fixture attempts remain deterministic without claiming call deduplication', async () => {
  const first = await collectFixture(fixtures[0]);
  const retry = await collectFixture(fixtures[0]);
  assert.deepEqual(first, retry);
  const [left, right] = await Promise.all([collectFixture(fixtures[0]), collectFixture(fixtures[0])]);
  assert.deepEqual(left, right);
  assert.equal(left.provenance.transportCalls + right.provenance.transportCalls, 2);
  await assert.rejects(evaluateCorpus([fixtures[0], fixtures[1]], [left, right]), /duplicate_or_replayed/);
});

test('synthetic receipts reject coherent measurement, response-hash, failure, source and extra-field tampering', async () => {
  const corpus = [fixtures[0], fixtures[1]];
  const observations = await Promise.all(corpus.map(fixture => collectFixture(fixture)));
  const network = mock.method(globalThis, 'fetch', () => { throw new Error('OUTBOUND_DENIED'); });
  try {
    for (const change of [
      row => {
        row.safety.adapterStatus = 'REVIEW'; row.safety.flagged = true;
        row.safety.categoryFlags.harassment = true; row.safety.categoryScores.harassment = 0.85;
        row.safety.band = 'REVIEW';
      },
      row => { row.provenance.responseHash = 'f'.repeat(64); },
      row => { row.provenance.responseHash = null; },
      row => { row.safety.failure = 'HTTP_AUTHENTICATION_FAILURE'; },
      row => { row.safety.httpStatus = 403; },
      row => { row.safety.latencySource = 'PROVIDER_LATENCY'; },
      row => { row.safety.executionMs = 1; },
      row => { row.safety.categoryScores.harassment = 0.7; },
      row => { row.safety.explanation = 'Invented finding'; },
      row => { row.authorship.legacyModel.normalizedRiskScore = 0.8; },
      row => { row.authorship.missingModalities = []; },
      row => { row.extra = undefined; },
      row => { row.safety.rawDiagnostic = 'UNSAFE_RAW_DIAGNOSTIC'; },
      row => { row.provenance.receiptSource = 'live'; },
      row => { row.authority.hiddenDecision = true; },
    ]) {
      const altered = observations.map(clone);
      change(altered[0]);
      await assert.rejects(evaluateCorpus(corpus, altered), /synthetic_receipt_mismatch/);
    }
    const reordered = observations.map(row => Object.fromEntries(Object.entries(row).reverse()));
    await assertObservationBindings(corpus, reordered);
    assert.equal(network.mock.callCount(), 0);
  } finally { network.mock.restore(); }
});

test('synthetic transport rejects arbitrary destinations and real provider endpoints', async () => {
  const transport = syntheticTransport(fixtures[0]);
  for (const endpoint of ['https://api.openai.com/v1/moderations', 'https://example.com', `${SYNTHETIC_ENDPOINT}/other`])
    await assert.rejects(transport(endpoint, { method: 'POST', redirect: 'manual' }), /outbound_denied/);
  await assert.rejects(transport(SYNTHETIC_ENDPOINT, { method: 'GET' }), /outbound_denied/);
  const interrupted = new AbortController(); interrupted.abort();
  await assert.rejects(runSyntheticEvaluation({ signal: interrupted.signal }), /interrupted/);
  const during = new AbortController();
  const pending = runSyntheticEvaluation({ signal: during.signal });
  during.abort();
  await assert.rejects(pending, /interrupted/);
});

test('known-answer confusion matrices retain abstentions, unknown labels, denominators and finite-sample uncertainty', () => {
  const rows = [false, true].flatMap((truthViolation, index) => ['ALLOW_EVIDENCE', 'REVIEW', 'BLOCK_EVIDENCE', 'ABSTAIN']
    .map((band, offset) => ({ familyId: `group-${index}-${offset}`, truthViolation, band })));
  rows.push({ familyId: 'unknown', truthViolation: null, band: 'ALLOW_EVIDENCE' });
  const result = summarize(rows);
  assert.deepEqual(result.matrix.safe, { ALLOW_EVIDENCE: 1, REVIEW: 1, BLOCK_EVIDENCE: 1, ABSTAIN: 1 });
  assert.deepEqual(result.matrix.violation, result.matrix.safe);
  assert.equal(result.falseRejection.value, 0.25);
  assert.equal(result.falseAcceptance.value, 0.25);
  assert.equal(result.safeReviewBurden.value, 0.25);
  assert.equal(result.reviewRate.value, 2 / 9);
  assert.equal(result.abstentionRate.value, 2 / 9);
  assert.equal(result.coverage.value, 7 / 9);
  assert.equal(summarize([]).falseAcceptance.value, null);
  assert.equal(summarize([{ familyId: 'one', truthViolation: null, band: 'ABSTAIN' }]).falseRejection.value, null);
  assert.equal(rate(0, 0).wilson95, null);
  assert.equal(rate(0, 3).wilson95[0], 0);
  assert.equal(rate(1, 1).wilson95[1], 1);
  assert.ok(Math.abs(rate(0, 100).wilson95[1] - 0.0369934982069857) < 1e-12);
  assert.ok(rate(0, 16).wilson95[1] > 0.19);
  assert.equal(summarize(rows.map(row => ({ ...row, familyId: 'related' }))).falseRejection.wilson95, null);
  for (const args of [[-1, 10], [2, 1], [0.5, 1], [1, NaN]]) assert.throws(() => rate(...args), /invalid_rate_counts/);
});

test('frozen SAFE protocol boundaries preserve support, failure and positive-only semantics', () => {
  const cases = evaluateSafeProtocols();
  assert.equal(cases[0].finding, 'NO_POSITIVE_SAFE_EVIDENCE');
  assert.equal(cases[1].finding, 'SYNTHETIC_LIKE_EVIDENCE');
  assert.equal(cases[2].finding, 'SYNTHETIC_LIKE_EVIDENCE');
  for (const row of cases.slice(3, 6)) { assert.equal(row.finding, 'INCONCLUSIVE'); assert.equal(row.rawThresholdCrossing, true); }
  assert.equal(cases[6].finding, 'UNAVAILABLE');
  for (const row of cases) { assert.equal(row.humanAuthorshipEstablished, false); assert.equal(row.publicationEligible, false); }
});

test('report writes are atomic, interrupted runs preserve prior evidence and failed commits leave no temporary files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lythaus-evaluation-'));
  const output = join(directory, 'report.json');
  await writeReportAtomically({ evidence: 'prior' }, output);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(writeReportAtomically({ evidence: 'partial' }, output, { signal: aborted.signal }), /interrupted/);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), { evidence: 'prior' });
  await Promise.all([writeReportAtomically({ evidence: 'one' }, output), writeReportAtomically({ evidence: 'two' }, output)]);
  assert.ok(['one', 'two'].includes(JSON.parse(await readFile(output, 'utf8')).evidence));
  const bad = join(directory, 'directory-target'); await mkdir(bad);
  await assert.rejects(writeReportAtomically({ evidence: 'failed' }, bad));
  assert.deepEqual((await readdir(directory)).sort(), ['directory-target', 'report.json']);
});
