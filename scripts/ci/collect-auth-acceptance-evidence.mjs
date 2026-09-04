#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseRealEmailAcceptanceEvidence } from './real-email-acceptance-evidence.mjs';

const releaseSha = required('RELEASE_SHA');
const workerName = required('ADR003_WORKER_NAME');
const workerVersionId = required('ADR003_WORKER_VERSION_ID');
const acceptanceRunId = required('ADR003_ACCEPTANCE_RUN_ID');
const evidencePath = required('ADR003_AUTH_ACCEPTANCE_EVIDENCE_PATH');
const source = required('ADR003_AUTH_ACCEPTANCE_EVIDENCE_SOURCE');
if (!['protected_probe', 'read_only_query_artifact'].includes(source)) throw new Error('auth_acceptance_observer_source_invalid');
const readinessToken = source === 'protected_probe' ? required('DATABASE_READINESS_TOKEN') : '';
const queryOutputPath = source === 'read_only_query_artifact' ? required('ADR003_AUTH_ACCEPTANCE_QUERY_OUTPUT_PATH') : '';
const accessClientId = process.env.CF_ACCESS_CLIENT_ID?.trim() ?? '';
const accessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET?.trim() ?? '';
if (Boolean(accessClientId) !== Boolean(accessClientSecret)) {
  throw new Error('auth_acceptance_observer_access_service_token_incomplete');
}
const expectedCandidate = {
  workerName,
  workerVersionId,
  sourceReleaseSha: process.env.ADR003_CANDIDATE_SOURCE_SHA?.trim() || releaseSha,
  ...(process.env.ADR003_CANDIDATE_DEPENDENCIES_JSON ? { candidateDependencies: JSON.parse(process.env.ADR003_CANDIDATE_DEPENDENCIES_JSON) } : {}),
  ...(process.env.ADR003_CANDIDATE_UPLOADED_AT ? { uploadedAt: process.env.ADR003_CANDIDATE_UPLOADED_AT } : {}),
  ...(process.env.ADR003_CANDIDATE_STAGED_AT ? { stagedAt: process.env.ADR003_CANDIDATE_STAGED_AT } : {}),
};

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function candidateFromEnvironment() {
  if (!expectedCandidate.uploadedAt || !expectedCandidate.stagedAt) return null;
  return {
    workerName,
    workerVersionId,
    sourceReleaseSha: expectedCandidate.sourceReleaseSha,
    uploadedAt: expectedCandidate.uploadedAt,
    stagedAt: expectedCandidate.stagedAt,
  };
}

function observationUrl() {
  const configured = required('ADR003_AUTH_ACCEPTANCE_EVIDENCE_URL');
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('auth_acceptance_observer_url_invalid');
  return url;
}

function readQueryArtifact() {
  const raw = fs.readFileSync(queryOutputPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('auth_acceptance_query_artifact_invalid');
  }
}

function fallbackEvidence(status, reason) {
  const candidate = candidateFromEnvironment();
  if (!candidate) throw new Error('auth_acceptance_candidate_timestamps_missing');
  return {
    formatVersion: 'lythaus-real-email-acceptance-v2',
    source: 'runtime_observation',
    status,
    ...(reason ? { reason } : {}),
    releaseSha,
    acceptanceRunId,
    candidate,
    ...(expectedCandidate.candidateDependencies ? { candidateDependencies: expectedCandidate.candidateDependencies } : {}),
  };
}

function writeEvidence(evidence) {
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

async function collect() {
  let response;
  let body;
  if (source === 'read_only_query_artifact') {
    body = readQueryArtifact();
  } else {
    const url = observationUrl();
    url.searchParams.set('releaseSha', releaseSha);
    url.searchParams.set('candidateWorker', workerName);
    url.searchParams.set('candidateVersion', workerVersionId);
    const headers = new Headers({
      accept: 'application/json',
      authorization: `Bearer ${readinessToken}`,
      'x-lythaus-acceptance-run-id': acceptanceRunId,
      'Cloudflare-Workers-Version-Overrides': `${workerName}="${workerVersionId}"`,
    });
    if (accessClientId) {
      headers.set('CF-Access-Client-Id', accessClientId);
      headers.set('CF-Access-Client-Secret', accessClientSecret);
    }
    response = await fetch(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  }

  if (response?.status === 428 || body?.status === 'HUMAN_ACCEPTANCE_REQUIRED') {
    const evidence = { ...body, source: 'runtime_observation', status: 'HUMAN_ACCEPTANCE_REQUIRED' };
    const parsed = parseRealEmailAcceptanceEvidence(evidence, releaseSha, expectedCandidate);
    writeEvidence(parsed);
    return parsed;
  }
  if (response && !response.ok) {
    const evidence = fallbackEvidence('BLOCKED', `auth_acceptance_observer_http_${response.status}`);
    writeEvidence(evidence);
    return evidence;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const evidence = fallbackEvidence('BLOCKED', 'auth_acceptance_observer_payload_invalid');
    writeEvidence(evidence);
    return evidence;
  }
  const evidence = { ...body, source: 'runtime_observation' };
  const parsed = parseRealEmailAcceptanceEvidence(evidence, releaseSha, expectedCandidate);
  writeEvidence(parsed);
  return parsed;
}

let evidence;
try {
  evidence = await collect();
} catch (error) {
  const rawReason = error instanceof Error ? error.message : 'auth_acceptance_observer_failed';
  const reason = rawReason.startsWith('real_email_acceptance_lifecycle_subscription')
    ? 'provider_configuration_missing'
    : (/^[a-z0-9_:-]{3,120}$/iu.test(rawReason) ? rawReason : 'auth_acceptance_observer_failed');
  try {
    evidence = fallbackEvidence('BLOCKED', reason.replace(/[^a-z0-9_:-]/giu, '_').slice(0, 120));
    writeEvidence(evidence);
  } catch {
    throw error;
  }
}

console.log(JSON.stringify({ status: evidence.status, reason: evidence.reason ?? null, evidencePath }));
if (evidence.status === 'HUMAN_ACCEPTANCE_REQUIRED') process.exitCode = 2;
else if (evidence.status !== 'PASSED') process.exitCode = 1;
