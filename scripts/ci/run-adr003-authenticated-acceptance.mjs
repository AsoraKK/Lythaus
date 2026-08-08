#!/usr/bin/env node

import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const apiBase = required('ADR003_API_BASE_URL').replace(/\/$/, '');
const readinessToken = required('DATABASE_READINESS_TOKEN');
const expected = {
  relationCount: Number(process.env.EXPECTED_DATABASE_RELATION_COUNT ?? 78),
  schemaFingerprint: required('EXPECTED_DATABASE_SCHEMA_FINGERPRINT'),
  schemaVersion: required('EXPECTED_DATABASE_SCHEMA_VERSION'),
  budgetLedgerApplied: process.env.EXPECTED_DATABASE_BUDGET_LEDGER_APPLIED === 'true',
};
const hyperdriveVerifiedMain = process.env.HYPERDRIVE_VERIFIED_MAIN === 'true';
const evidencePath = process.env.ADR003_EVIDENCE_PATH;
const results = [];
let readiness = null;
let accessToken = '';
let refreshToken = '';
let replacementRefreshToken = '';
let postId = '';

class BlockedCase extends Error {
  constructor(code) {
    super(code);
    this.name = 'BlockedCase';
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function unwrap(body) {
  return body && typeof body === 'object' && body.data && typeof body.data === 'object' ? body.data : body;
}

function correlationId(response, body) {
  const header = response.headers.get('x-correlation-id');
  const value = header ?? (body && typeof body === 'object' ? body.correlationId : undefined);
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,160}$/.test(value) ? value : undefined;
}

async function requestJson(route, options = {}) {
  const headers = new Headers(options.headers ?? {});
  headers.set('accept', 'application/json');
  if (options.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', typeof options.body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json');
  }
  const body = options.body === undefined || typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  const response = await fetch(`${apiBase}${route}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* response body is intentionally not retained */ }
  return { response, body: json, correlationId: correlationId(response, json) };
}

function expectStatus(result, statuses, label) {
  if (!statuses.includes(result.response.status)) throw new Error(`${label}:http_${result.response.status}`);
}

function expect(condition, code) {
  if (!condition) throw new Error(code);
}

function requireReady() {
  if (!readiness) throw new BlockedCase('database_probe_unavailable');
  if (readiness.readiness !== 'pass') throw new BlockedCase('database_probe_failed');
}

function manualFlag(name, code) {
  if (process.env[name] !== 'true') throw new BlockedCase(code);
}

function failureReason(error) {
  if (error instanceof BlockedCase) return error.message;
  const message = error instanceof Error ? error.message : '';
  if (/^.*:http_\d+$/.test(message)) return message.split(':').at(-1);
  if (/timeout|fetch|network/i.test(message)) return 'network_error';
  return 'assertion_failed';
}

async function runCase(id, action) {
  try {
    const result = await action();
    results.push({ id, outcome: 'passed', ...(result?.correlationId ? { correlationId: result.correlationId } : {}) });
  } catch (error) {
    results.push({ id, outcome: error instanceof BlockedCase ? 'blocked' : 'failed', reason: failureReason(error) });
  }
}

async function runAuthenticatedCase(action) {
  requireReady();
  if (!accessToken) throw new BlockedCase('authenticated_session_unavailable');
  return action();
}

function bearer() {
  return { authorization: `Bearer ${accessToken}` };
}

async function webSecurityCheck() {
  const webUrl = process.env.ADR003_WEB_HEALTH_URL?.trim();
  if (!webUrl) throw new BlockedCase('web_security_url_unconfigured');
  const response = await fetch(webUrl, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  if (!response.ok && response.status !== 3_0_1 && response.status !== 3_0_2) throw new Error(`web:http_${response.status}`);
  expect(Boolean(response.headers.get('content-security-policy')), 'csp_header_missing');
}

async function writeEvidence(databaseReport) {
  const evidence = {
    formatVersion: 'lythaus-adr003-acceptance-v1',
    status: results.every((item) => item.outcome === 'passed') ? 'PASSED' : 'BLOCKED',
    capturedAt: new Date().toISOString(),
    releaseSha: process.env.GITHUB_SHA ?? 'local',
    githubActionsRunId: process.env.GITHUB_RUN_ID ?? 'local',
    database: databaseReport,
    workerVersions: parseSanitizedJson(process.env.ADR003_WORKER_VERSIONS_JSON, 'workerVersions'),
    hyperdriveIds: parseSanitizedJson(process.env.ADR003_HYPERDRIVE_IDS_JSON, 'hyperdriveIds'),
    manualAcceptance: {
      guestBrowse: process.env.ADR003_GUEST_ACCEPTED === 'true',
      emailDelivery: process.env.ADR003_EMAIL_DELIVERY_ACCEPTED === 'true',
      emailLinkReplay: process.env.ADR003_EMAIL_LINK_REPLAY_VERIFIED === 'true',
      webEmailFlow: process.env.ADR003_WEB_EMAIL_ACCEPTED === 'true',
      mobileEmailFlow: process.env.ADR003_MOBILE_EMAIL_ACCEPTED === 'true',
    },
    cases: results,
  };
  if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return evidence;
}

function parseSanitizedJson(value, label) {
  if (!value) return { status: 'not_provided' };
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error(`${label}_invalid`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label}_invalid`);
  return parsed;
}

await runCase('GATE-ROUTING', async () => {
  expect(hyperdriveVerifiedMain, 'hyperdrive_main_proof_missing');
  const result = await requestJson('/internal/readiness/database-identity', {
    headers: { authorization: `Bearer ${readinessToken}` },
  });
  expectStatus(result, [200], 'database_probe');
  const body = unwrap(result.body);
  expect(body && typeof body === 'object', 'database_probe_body_invalid');
  expect(body.branchFingerprint === 'unknown', 'runtime_branch_must_remain_unknown');
  expect(body.schemaFingerprint === expected.schemaFingerprint, 'schema_fingerprint_mismatch');
  expect(body.relationCount === expected.relationCount, 'relation_count_mismatch');
  expect(body.identityContactEmails === true, 'contact_emails_missing');
  expect(body.budgetLedgerApplied === expected.budgetLedgerApplied, 'budget_ledger_state_mismatch');
  expect(body.schemaVersion === expected.schemaVersion, 'schema_version_mismatch');
  expect(body.roleClass === 'login_non_superuser', 'runtime_role_invalid');
  expect(body.readiness === 'pass', 'database_probe_not_ready');
  readiness = {
    databaseEnvironment: body.databaseEnvironment,
    branchFingerprint: 'main',
    schemaFingerprint: body.schemaFingerprint,
    relationCount: body.relationCount,
    identityContactEmails: body.identityContactEmails,
    budgetLedgerApplied: body.budgetLedgerApplied,
    schemaVersion: body.schemaVersion,
    roleClass: body.roleClass,
    readiness: body.readiness,
  };
  return result;
});

await runCase('A01', async () => manualFlag('ADR003_GUEST_ACCEPTED', 'guest_browse_kyle_owned'));
await runCase('A02', async () => manualFlag('ADR003_NEW_USER_ACCEPTED', 'new_user_creation_kyle_owned'));

await runCase('A03', async () => {
  requireReady();
  const email = required('ADR003_TEST_EMAIL');
  const password = required('ADR003_TEST_PASSWORD');
  const result = await requestJson('/api/auth/email', { method: 'POST', body: { email, password } });
  expectStatus(result, [200], 'existing_user_sign_in');
  const body = unwrap(result.body);
  accessToken = typeof body?.accessToken === 'string' ? body.accessToken : '';
  refreshToken = typeof body?.refreshToken === 'string' ? body.refreshToken : '';
  expect(Boolean(accessToken && refreshToken), 'session_tokens_missing');
  return result;
});

await runCase('A04', async () => manualFlag('ADR003_EMAIL_DELIVERY_ACCEPTED', 'email_delivery_kyle_owned'));

await runCase('A05', () => runAuthenticatedCase(async () => {
  const result = await requestJson('/api/auth/userinfo', { headers: bearer() });
  expectStatus(result, [200], 'contact_email_lookup');
  const body = unwrap(result.body);
  expect(typeof body?.email === 'string' && body.email.length > 3, 'contact_email_unavailable');
  return result;
}));

await runCase('A06', async () => {
  requireReady();
  expect(Boolean(accessToken && refreshToken), 'session_issuance_missing');
});

await runCase('A07', () => runAuthenticatedCase(async () => {
  const result = await requestJson('/api/auth/refresh', { method: 'POST', body: { refreshToken } });
  expectStatus(result, [200], 'refresh_rotation');
  const body = unwrap(result.body);
  replacementRefreshToken = typeof body?.refreshToken === 'string' ? body.refreshToken : '';
  accessToken = typeof body?.accessToken === 'string' ? body.accessToken : accessToken;
  expect(Boolean(replacementRefreshToken && replacementRefreshToken !== refreshToken), 'refresh_token_not_rotated');
  return result;
}));

await runCase('A08', async () => {
  requireReady();
  expect(Boolean(replacementRefreshToken), 'refresh_rotation_missing');
  const result = await requestJson('/api/auth/refresh', { method: 'POST', body: { refreshToken } });
  expectStatus(result, [400], 'refresh_replay');
  refreshToken = replacementRefreshToken;
  return result;
});

await runCase('A11', () => runAuthenticatedCase(async () => {
  const read = await requestJson('/api/users/me', { headers: bearer() });
  expectStatus(read, [200], 'profile_read');
  const update = await requestJson('/api/users/me', {
    method: 'PATCH',
    headers: { ...bearer(), 'idempotency-key': randomUUID() },
    body: { bio: 'ADR-003 acceptance fixture' },
  });
  expectStatus(update, [200], 'profile_write');
  return update;
}));

await runCase('A12', () => runAuthenticatedCase(async () => {
  const result = await requestJson('/api/posts', {
    method: 'POST',
    headers: { ...bearer(), 'idempotency-key': randomUUID() },
    body: { body: 'ADR-003 acceptance fixture', declaredCreationMode: 'human', geoScope: 'none' },
  });
  expectStatus(result, [201], 'post_submission');
  const body = unwrap(result.body);
  postId = typeof body?.postId === 'string' ? body.postId : '';
  expect(Boolean(postId), 'post_id_missing');
  return result;
}));

await runCase('A13', () => runAuthenticatedCase(async () => {
  expect(Boolean(postId), 'moderation_target_missing');
  const result = await requestJson('/api/flags', {
    method: 'POST',
    headers: { ...bearer(), 'idempotency-key': randomUUID() },
    body: { contentType: 'post', contentId: postId, reasonCode: 'acceptance_test' },
  });
  expectStatus(result, [201], 'moderation_submission');
  return result;
}));

await runCase('A14', () => runAuthenticatedCase(async () => {
  const result = await requestJson('/api/privacy/requests', {
    method: 'POST',
    headers: { ...bearer(), 'idempotency-key': randomUUID() },
    body: { requestType: 'export' },
  });
  expectStatus(result, [202], 'privacy_request_submission');
  return result;
}));

await runCase('A15', async () => {
  if (process.env.ADR003_RUN_DESTRUCTIVE_ACCOUNT_DELETION !== 'true') throw new BlockedCase('account_deletion_requires_explicit_flag');
  return runAuthenticatedCase(async () => {
    const result = await requestJson('/api/privacy/requests', {
      method: 'POST',
      headers: { ...bearer(), 'idempotency-key': randomUUID() },
      body: { requestType: 'delete' },
    });
    expectStatus(result, [202], 'account_deletion_request');
    return result;
  });
});

await runCase('A09', () => runAuthenticatedCase(async () => {
  const result = await requestJson('/api/auth/logout', { method: 'POST', headers: bearer() });
  expectStatus(result, [200], 'logout');
  return result;
}));

await runCase('A10', async () => {
  requireReady();
  const result = await requestJson('/api/users/me', { headers: bearer() });
  expectStatus(result, [401], 'session_revocation');
  return result;
});

await runCase('A16', async () => {
  const result = await requestJson('/api/auth/email/verify?token=invalid-email-verification-token-for-acceptance');
  expectStatus(result, [400], 'invalid_email_verification_token');
  return result;
});

await runCase('A17', async () => {
  const result = await requestJson('/api/auth/password/reset/complete', {
    method: 'POST',
    body: {
      token: 'invalid-password-reset-token-for-acceptance',
      password: 'AcceptanceOnly-Reset-Password-2026!',
    },
  });
  expectStatus(result, [400], 'invalid_password_reset_token');
  return result;
});

await runCase('A18', async () => manualFlag('ADR003_EMAIL_LINK_REPLAY_VERIFIED', 'email_link_replay_kyle_owned'));

await runCase('A19', async () => {
  const origin = required('ADR003_WEB_ORIGIN');
  const result = await requestJson('/api/health', {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'Authorization, Content-Type',
    },
  });
  expectStatus(result, [204], 'cors_preflight');
  expect(result.response.headers.get('access-control-allow-origin') === origin, 'cors_origin_mismatch');
  return result;
});

await runCase('A20', async () => {
  await webSecurityCheck();
  manualFlag('ADR003_WEB_EMAIL_ACCEPTED', 'web_email_flow_kyle_owned');
  manualFlag('ADR003_MOBILE_EMAIL_ACCEPTED', 'mobile_email_flow_kyle_owned');
});

const evidence = await writeEvidence(readiness ?? { branchFingerprint: hyperdriveVerifiedMain ? 'main' : 'unknown', readiness: 'blocked' });
const summary = Object.fromEntries(results.map((item) => [item.id, item.outcome]));
console.log(JSON.stringify({ status: evidence.status, cases: summary, evidencePath: evidencePath ?? null }));
if (evidence.status !== 'PASSED') process.exitCode = 1;
