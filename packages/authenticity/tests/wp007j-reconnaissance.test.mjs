import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectBytes, estimateStandardQuality } from '../../../scripts/authenticity/wp007j_jpeg_inspector.mjs';
import { dct2d, summarizeGrid } from '../../../scripts/authenticity/wp007j_phase_dct_probe.mjs';

function tinyJpeg() {
  const values = Array.from({ length: 64 }, () => 16);
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xdb, 0x00, 0x43, 0x00, ...values,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x08, 0x00, 0x08, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function tinyPng() {
  return Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 8, 0, 0, 0, 8, 8, 6, 0, 0, 0, 0, 0, 0, 0,
  ]);
}

test('JPEG inspector preserves exact container facts and refuses history claims', () => {
  const result = inspectBytes(tinyJpeg());
  assert.equal(result.format, 'JPEG');
  assert.equal(result.valid, true);
  assert.deepEqual(result.dimensions, { width: 8, height: 8, pixelCount: 64 });
  assert.equal(result.quantizationTables.length, 1);
  assert.equal(result.currentEncodingFacts.doubleJpeg, 'NOT_INFERRED');
  assert.equal(result.currentEncodingFacts.previousJpegHistory, 'UNDETERMINED_FROM_FINAL_BYTES');
});

test('JPEG quality estimator is bounded and table-match only', () => {
  const estimate = estimateStandardQuality([{ id: 0, values: Array.from({ length: 64 }, () => 16) }]);
  assert.ok(estimate.quality >= 1 && estimate.quality <= 100);
  assert.match(estimate.confidence, /TABLE_MATCH|UNAVAILABLE/);
});

test('PNG container does not prove a lossless prior history', () => {
  const result = inspectBytes(tinyPng());
  assert.equal(result.format, 'PNG');
  assert.equal(result.currentEncodingFacts.previousJpegHistory, 'UNDETERMINED_FROM_FINAL_BYTES');
});

test('phase/DCT prototype is measurement-only and deterministic', () => {
  const grid = Array.from({ length: 64 }, (_, index) => index);
  const first = summarizeGrid(grid);
  const second = summarizeGrid(grid);
  assert.deepEqual(first, second);
  assert.equal(first.measurementOnly, true);
  assert.equal(first.classifierInvoked, false);
  assert.ok(Math.abs(dct2d(Array.from({ length: 64 }, () => 1))[0][0] - 8) < 1e-9);
});

test('reconnaissance prototypes cannot emit authenticity authority', () => {
  const result = summarizeGrid(Array.from({ length: 64 }, () => 0));
  assert.equal(result.productAuthority, 'NONE');
  assert.equal(result.evidenceRole, 'EF4_MEASUREMENT_CANDIDATE_ONLY');
});
