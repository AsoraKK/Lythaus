import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRealEmailAcceptanceEvidence } from '../ci/real-email-acceptance-evidence.mjs';

const releaseSha = 'a'.repeat(40);
const sourceSha = 'b'.repeat(40);
const candidate = {
  workerName: 'lythaus-public-api-development',
  workerVersionId: '11111111-1111-4111-8111-111111111111',
  sourceReleaseSha: sourceSha,
  uploadedAt: '2026-09-03T00:00:00.000Z',
  stagedAt: '2026-09-03T00:01:00.000Z',
};

test('auth acceptance preserves the certified release separately from reused candidate source', () => {
  const evidence = parseRealEmailAcceptanceEvidence({
    formatVersion: 'lythaus-real-email-acceptance-v2',
    source: 'runtime_observation',
    status: 'HUMAN_ACCEPTANCE_REQUIRED',
    reason: 'keeper_flow_incomplete',
    releaseSha,
    acceptanceRunId: '22222222-2222-4222-8222-222222222222',
    candidate,
  }, releaseSha, { ...candidate });
  assert.equal(evidence.releaseSha, releaseSha);
  assert.equal(evidence.candidate.sourceReleaseSha, sourceSha);
});

test('auth acceptance rejects a candidate source identity mismatch', () => {
  assert.throws(() => parseRealEmailAcceptanceEvidence({
    formatVersion: 'lythaus-real-email-acceptance-v2',
    source: 'runtime_observation',
    status: 'HUMAN_ACCEPTANCE_REQUIRED',
    reason: 'keeper_flow_incomplete',
    releaseSha,
    acceptanceRunId: '22222222-2222-4222-8222-222222222222',
    candidate,
  }, releaseSha, { ...candidate, sourceReleaseSha: 'c'.repeat(40) }), /candidate_source_sha_mismatch/);
});
