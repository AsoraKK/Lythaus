import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const wp = path.join(root, 'research', 'wp007l');

async function read(name) {
  return JSON.parse(await readFile(path.join(wp, name), 'utf8'));
}

test('WP007L inherits the verified parent and frozen SAFE-A identity', async () => {
  const audit = await read('current-state-audit.json');
  const ledger = await read('WP007L_GOAL_AND_COMPLETION_LEDGER.json');
  assert.equal(audit.parentSha, '8a5188c1bc41a2a6208860ae63b3d871ecebf387');
  assert.equal(audit.safeA.checkpointSha256, 'b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e');
  assert.equal(audit.safeA.threshold, 0.5864923000335693);
  assert.equal(ledger.globalControls.safeAWeightsModified, false);
  assert.equal(ledger.globalControls.safeAPreprocessingModified, false);
  assert.equal(ledger.globalControls.safeAThresholdModified, false);
});

test('the frozen descendant manifest is score-blind, unique, parent-linked and sealed', async () => {
  const manifest = await read('controlled-descendant-manifest.json');
  const ids = manifest.records.map((row) => row.sampleId);
  assert.equal(manifest.recordCount, 1460);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(manifest.scoreBlind, true);
  assert.equal(manifest.flux2PixelAccess, false);
  assert.equal(manifest.flux2ProviderCalls, 0);
  for (const row of manifest.records) {
    if (row.kind !== 'ORIGINAL') assert.ok(row.parentSampleId);
    assert.equal(String(row.sourceFamilyId).toLowerCase().includes('flux.2'), false);
  }
});

test('jpegio and jpeglib independently match Lythaus current-byte facts', async () => {
  const result = await read('jpegio-crosscheck.json');
  assert.equal(result.sampleCount, 60);
  for (const check of Object.values(result.checks)) assert.equal(check.matches, check.n);
  assert.equal(result.errors.length, 0);
});

test('ExifTool oracle cross-check is privacy-safe', async () => {
  const result = await read('exiftool-crosscheck.json');
  assert.equal(result.sampleCount, 36);
  assert.equal(result.oracleFileCount, 36);
  assert.equal(result.dimensionMatches, 36);
  assert.equal(result.formatMatches, 36);
  assert.equal(result.rawMetadataPersisted, false);
});

test('codec facts never become authorship truth', async () => {
  const features = await read('camera-profile-feature-definition.json');
  const boundary = await read('eligibility-boundary-analysis.json');
  assert.equal(features.originInference, 'FORBIDDEN');
  assert.match(features.semanticContract, /never directly emit AI/);
  assert.equal(boundary.researchStates.EVIDENCE_GRADE, 'NOT_DEMONSTRATED');
  assert.match(boundary.notAuthenticity.join(' '), /camera-looking profile is not human/);
  assert.match(boundary.notAuthenticity.join(' '), /PNG is not a lossless-history proof/);
});

test('synthetic profile spoof is measured and cannot earn supported status', async () => {
  const spoof = await read('safe-camera-profile-spoof-results.json');
  assert.equal(spoof.spoofCount, 20);
  assert.equal(spoof.profileMatchRates.dqt.numerator, 20);
  assert.equal(spoof.profileMatchRates.sampling.numerator, 20);
  assert.equal(spoof.safeHighRate.numerator, 0);
  assert.match(spoof.conclusion, /not authorship|origin/);
});

test('PRNU and CFA remain exploratory context, never identity or synthetic truth', async () => {
  const prnu = await read('prnu-results.json');
  const feasibility = await read('prnu-feasibility.json');
  const cfa = await read('cfa-feasibility.json');
  assert.match(prnu.interpretation, /not a device identity claim/);
  assert.equal(feasibility.productionIdentity, false);
  assert.equal(cfa.status, 'EXPLORATORY_MEASUREMENT');
  assert.match(cfa.interpretation, /No CFA classifier fitted/);
});

test('ZERO, Sherloq and ExifTool license roles remain external', async () => {
  const landscape = await read('github-forensic-tool-landscape.json');
  const rights = await read('external-tool-rights-matrix.json');
  const zero = landscape.sources.find((row) => row.repo === 'tinankh/ZERO');
  const sherloq = rights.entries.find((row) => row.repo === 'GuidoBartoli/sherloq');
  assert.equal(zero.decision, 'REFERENCE_FOR_REIMPLEMENTATION');
  assert.equal(zero.license, 'AGPL-3.0');
  assert.equal(sherloq.use, 'RESEARCH_ORACLE');
  assert.match(sherloq.copyingIntoLythaus, /FORBIDDEN/);
});

test('provenance remains separate from codec/authorship inference', async () => {
  const c2pa = await read('c2pa-feasibility.json');
  assert.equal(c2pa.role, 'EF1_PROVENANCE_VALIDATION_ONLY');
  assert.match(c2pa.semanticBoundary, /absent provenance is NO_PROVENANCE_EVIDENCE/);
});

test('privacy and production boundaries remain explicit', async () => {
  const inventory = await read('camera-source-inventory.json');
  const rights = await read('rights-training-manifest.json');
  const seal = await read('flux2-zero-access.json');
  assert.equal(inventory.privacy.rawGpsPersisted, false);
  assert.equal(inventory.privacy.rawSerialPersisted, false);
  assert.equal(rights.trainingPerformed, false);
  assert.equal(seal.pixelAccess, false);
  assert.equal(seal.providerCalls, 0);
  assert.equal(rights.productionDisposition, 'NO');
});

test('controlled operations remain contextual and source-level', async () => {
  const summary = await read('source-level-operation-summary.json');
  assert.equal(summary.primaryUnit, 'source parent');
  assert.ok(summary.rows.some((row) => row.operation === 'JPEG95_TO_JPEG85'));
  assert.ok(summary.rows.some((row) => row.operation === 'NON8_CROP_TO_JPEG95'));
  for (const row of summary.rows) assert.match(row.interpretation, /not complete edit-history proof/);
});

test('WP007L is research-only and does not promote CES-S', async () => {
  const audit = await read('current-state-audit.json');
  const ces = await read('tool-build-vs-adopt.json');
  assert.equal(audit.productionBoundary.productionAuthorization, 'NO');
  assert.equal(audit.productionBoundary.cesSPromoted, false);
  assert.match(ces.productionPath, /not authorized/);
});
