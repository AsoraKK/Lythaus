import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const script = 'scripts/ci/collect-auth-acceptance-evidence.mjs';
const releaseSha = 'a'.repeat(40);
const workerVersionId = '11111111-1111-4111-8111-111111111111';
const acceptanceRunId = '22222222-2222-4222-8222-222222222222';
const candidate = {
  workerName: 'lythaus-public-api-development',
  workerVersionId,
  uploadedAt: '2026-08-29T10:00:00.000Z',
  stagedAt: '2026-08-29T10:01:00.000Z',
};

test('collector validates a protected read-only query artifact without network access', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lythaus-auth-observer-'));
  const queryOutputPath = join(directory, 'query-output.json');
  const evidencePath = join(directory, 'evidence.json');
  writeFileSync(queryOutputPath, JSON.stringify({
    formatVersion: 'lythaus-real-email-acceptance-v2',
    source: 'runtime_observation',
    status: 'HUMAN_ACCEPTANCE_REQUIRED',
    reason: 'mailbox_requires_human',
    releaseSha,
    acceptanceRunId,
    candidate,
  }));
  try {
    let result;
    try {
      execFileSync(process.execPath, [script], {
        env: {
          ...process.env,
          RELEASE_SHA: releaseSha,
          ADR003_WORKER_NAME: candidate.workerName,
          ADR003_WORKER_VERSION_ID: workerVersionId,
          ADR003_ACCEPTANCE_RUN_ID: acceptanceRunId,
          ADR003_AUTH_ACCEPTANCE_EVIDENCE_SOURCE: 'read_only_query_artifact',
          ADR003_AUTH_ACCEPTANCE_QUERY_OUTPUT_PATH: queryOutputPath,
          ADR003_AUTH_ACCEPTANCE_EVIDENCE_PATH: evidencePath,
        },
        encoding: 'utf8',
      });
    } catch (error) {
      result = error;
    }
    assert.equal(result?.status, 2);
    assert.equal(JSON.parse(readFileSync(evidencePath, 'utf8')).status, 'HUMAN_ACCEPTANCE_REQUIRED');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('collector fails closed when lifecycle queue configuration is not observed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lythaus-auth-observer-'));
  const queryOutputPath = join(directory, 'query-output.json');
  const evidencePath = join(directory, 'evidence.json');
  writeFileSync(queryOutputPath, JSON.stringify({
    formatVersion: 'lythaus-real-email-acceptance-v2',
    source: 'runtime_observation',
    status: 'PASSED',
    releaseSha,
    acceptanceRunId,
    candidate,
    acceptanceAccount: { class: 'production_acceptance', createdAt: candidate.stagedAt, metricIsolation: 'excluded' },
    turnstile: { status: 'verified', observedAt: candidate.stagedAt, hostname: 'api.lythaus.co', action: 'email_auth' },
  }));
  try {
    let result;
    try {
      execFileSync(process.execPath, [script], {
        env: {
          ...process.env,
          RELEASE_SHA: releaseSha,
          ADR003_WORKER_NAME: candidate.workerName,
          ADR003_WORKER_VERSION_ID: workerVersionId,
          ADR003_ACCEPTANCE_RUN_ID: acceptanceRunId,
          ADR003_AUTH_ACCEPTANCE_EVIDENCE_SOURCE: 'read_only_query_artifact',
          ADR003_AUTH_ACCEPTANCE_QUERY_OUTPUT_PATH: queryOutputPath,
          ADR003_AUTH_ACCEPTANCE_EVIDENCE_PATH: evidencePath,
          ADR003_CANDIDATE_UPLOADED_AT: candidate.uploadedAt,
          ADR003_CANDIDATE_STAGED_AT: candidate.stagedAt,
        },
        encoding: 'utf8',
      });
    } catch (error) {
      result = error;
    }
    assert.equal(result?.status, 1);
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    assert.equal(evidence.status, 'BLOCKED');
    assert.equal(evidence.reason, 'provider_configuration_missing');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
