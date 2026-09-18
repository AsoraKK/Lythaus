import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), 'research/wp007j-r1');

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
}

test('WP007J-R1 preserves SAFE-A identity and representation controls', () => {
  const freeze = read('safe-freeze-reference.json');
  const probe = read('representation-probe-results.json');
  const decision = read('safe-b-not-justified.json');
  assert.equal(freeze.checkpointSha256, 'b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e');
  assert.equal(freeze.threshold, 0.5864923000335693);
  assert.equal(probe.embeddingDimension, 512);
  assert.equal(probe.embeddingFinite, true);
  assert.equal(probe.maxFeatureForwardLogitDelta, 0);
  assert.equal(decision.primaryDecision, 'SAFE_B_NOT_JUSTIFIED');
  assert.equal(decision.headDecision.fitLinearHead, false);
  assert.equal(decision.headDecision.fitMlp, false);
});

test('missed generator representation evidence is explicit and not a SAFE-B success claim', () => {
  const analysis = read('representation-analysis.json');
  for (const family of ['Seedream-4', 'Imagen-4']) {
    assert.equal(analysis.missedFamilyCases[family].case, 'C_REAL_IMAGE_SPACE');
    assert.ok(analysis.missedFamilyCases[family].medianCosineToRealCentroid < analysis.missedFamilyCases[family].medianCosineToEasyCentroid);
  }
  assert.equal(analysis.linearProbeDecision.plausibleSeparationSignal, false);
});

test('JPEG laboratory contains actual encoded descendants and records the encoder boundary', () => {
  const curves = read('jpeg-safe-curves.json');
  const inspector = read('jpeg-inspector-validation.json');
  const crosscheck = read('jpeg-inspector-pillow-crosscheck.json');
  assert.equal(curves.scoreRows, 2140);
  assert.equal(curves.threshold, 0.5864923000335693);
  assert.equal(curves.pillowByQuality['100'].syntheticN, 40);
  assert.equal(curves.pillowByQuality['100'].syntheticDetected, 0);
  assert.equal(curves.pillowByQuality['95'].syntheticDetected, 0);
  assert.equal(curves.pillowBySubsampling['4:4:4'].syntheticDetected, 0);
  assert.equal(curves.sharpBySubsampling['4:2:0'].syntheticDetected, 0);
  assert.equal(inspector.summary.qualityEstimateExactRate, 1);
  assert.equal(crosscheck.mismatches.length, 0);
  assert.equal(inspector.summary.independentSamplingAgreementCount, 2080);
});

test('phase/DCT fixtures pass without silently promoting a feature to a detector', () => {
  const result = read('phase-dct-effect-sizes.json');
  const rescue = read('phase-dct-rescue-assessment.json');
  assert.equal(result.knownAnswerFixtures.passed, true);
  assert.equal(result.classifierFitted, false);
  assert.equal(result.thresholdsFitted, false);
  assert.equal(rescue.status, 'PHASE_CONTEXT_ONLY');
  assert.equal(rescue.rescueDecision.uniqueRescueDemonstrated, false);
});

test('FLUX.1 diagnostic is independent and all FLUX.2 access remains zero', () => {
  const diagnostic = read('flux1-representation-diagnostic.json');
  const independent = read('flux1-representation-independent-check.json');
  const sealed = read('flux2-zero-access-assertion.json');
  assert.equal(diagnostic.status, 'POST_HOC_DIAGNOSTIC_ONLY');
  assert.equal(independent.pass, true);
  assert.equal(independent.maxAbsoluteDelta, 0);
  assert.equal(diagnostic.cohort.flux2PixelAccess, false);
  assert.equal(diagnostic.cohort.flux2ProviderCalls, 0);
  assert.equal(sealed.publicBenchmarkPixelsAccessed, false);
  assert.equal(sealed.providerCallCount, 0);
});

test('paper extraction has twelve structured primary-source records and no reconnaissance placeholders', () => {
  const extraction = read('core-paper-extraction.json');
  assert.equal(extraction.papers.length, 12);
  const serialized = JSON.stringify(extraction);
  assert.equal(serialized.includes('paper-specific'), false);
  assert.equal(serialized.includes('not transcribed'), false);
  for (const paper of extraction.papers) {
    assert.ok(paper.primaryUrl.startsWith('http'));
    assert.ok(paper.authors.length >= 3);
    assert.ok(paper.lythausInference);
  }
});

test('eligibility proposal keeps JPEG facts separate from authenticity truth', () => {
  const eligibility = read('eligibility-analysis.json');
  assert.equal(eligibility.status, 'JPEG_ELIGIBILITY_BOUNDARY_NOT_SIMPLE');
  assert.ok(eligibility.reliabilityBoundary.reliablyMeasurable.includes('Current JPEG DQT values'));
  assert.ok(eligibility.reliabilityBoundary.notProvableFromFinalBytesAlone.some((item) => item.startsWith('That a PNG was never JPEG-compressed')));
  assert.ok(eligibility.proposedResearchEligibility.tierC_UNSUPPORTED_FOR_CERTIFICATION.SAFEAuthority.includes('low SAFE-A score'));
  assert.equal(eligibility.productionAuthorization, 'NO');
});
