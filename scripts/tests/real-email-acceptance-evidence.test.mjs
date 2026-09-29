import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseRealEmailAcceptanceEvidence,
  REAL_EMAIL_ACCEPTANCE_FORMAT_VERSION,
} from '../ci/real-email-acceptance-evidence.mjs';

const releaseSha = 'a'.repeat(40);
const candidate = {
  workerName: 'lythaus-public-api-development',
  workerVersionId: '11111111-1111-4111-8111-111111111111',
  uploadedAt: '2026-08-29T10:00:00.000Z',
  stagedAt: '2026-08-29T10:01:00.000Z',
};

function at(minutes) {
  return new Date(Date.parse(candidate.uploadedAt) + minutes * 60_000).toISOString();
}

function challenge(id, createdAt, supersededAt) {
  return { id, createdAt, ...(supersededAt ? { supersededAt } : {}) };
}

function delivery({ challengeId, outboxId, purpose, providerMessageId, requestedAt, fixtureCreatedAt, previousChallenge, challengeCreatedAt, verificationCompletedAt, verificationConsumedAt, replayAttemptedAt, replayRejectedAt, reset }) {
  const requestOffset = (Date.parse(requestedAt) - Date.parse(candidate.uploadedAt)) / 60_000;
  return {
    requestedAt,
    ...(fixtureCreatedAt ? { fixtureCreatedAt } : {}),
    ...(previousChallenge ? { previousChallenge } : {}),
    challenge: challenge(challengeId, challengeCreatedAt),
    outbox: {
      id: outboxId,
      purpose,
      challengeId,
      createdAt: at(requestOffset + 2),
      provider: 'cloudflare-email',
      providerMessageId,
      acceptedAt: at(requestOffset + 3),
      lifecycle: {
        eventType: 'message.delivered',
        providerMessageId,
        occurredAt: at(requestOffset + 4),
        observedAt: at(requestOffset + 5),
      },
    },
    verification: {
      challengeId,
      completedAt: verificationCompletedAt,
      consumedAt: verificationConsumedAt,
    },
    replay: { attemptedAt: replayAttemptedAt, rejectedAt: replayRejectedAt },
    ...(reset ? { reset } : {}),
  };
}

function validEvidence() {
  const initialChallengeId = '22222222-2222-4222-8222-222222222222';
  const resendPreviousChallengeId = '33333333-3333-4333-8333-333333333333';
  const resendChallengeId = '44444444-4444-4444-8444-444444444444';
  const resetChallengeId = '55555555-5555-4555-8555-555555555555';
  const initial = delivery({
    challengeId: initialChallengeId,
    outboxId: '66666666-6666-4666-8666-666666666666',
    purpose: 'verification',
    providerMessageId: 'cf-msg-initial-001',
    requestedAt: at(4),
    challengeCreatedAt: at(5),
    verificationCompletedAt: at(10),
    verificationConsumedAt: at(11),
    replayAttemptedAt: at(12),
    replayRejectedAt: at(13),
  });
  const resend = delivery({
    challengeId: resendChallengeId,
    outboxId: '77777777-7777-4777-8777-777777777777',
    purpose: 'verification',
    providerMessageId: 'cf-msg-resend-002',
    fixtureCreatedAt: at(17),
    requestedAt: at(18),
    previousChallenge: challenge(resendPreviousChallengeId, at(17), at(19)),
    challengeCreatedAt: at(20),
    verificationCompletedAt: at(25),
    verificationConsumedAt: at(26),
    replayAttemptedAt: at(27),
    replayRejectedAt: at(28),
  });
  const reset = delivery({
    challengeId: resetChallengeId,
    outboxId: '88888888-8888-4888-8888-888888888888',
    purpose: 'password_reset',
    providerMessageId: 'cf-msg-reset-003',
    requestedAt: at(29),
    challengeCreatedAt: at(30),
    verificationCompletedAt: at(35),
    verificationConsumedAt: at(36),
    replayAttemptedAt: at(37),
    replayRejectedAt: at(38),
    reset: {
      completedAt: at(35),
      consumedAt: at(36),
      replayAttemptedAt: at(37),
      replayRejectedAt: at(38),
      sessionsRevokedAt: at(39),
      oldPasswordRejectedAt: at(40),
      newPasswordAcceptedAt: at(41),
    },
  });
  return {
    formatVersion: REAL_EMAIL_ACCEPTANCE_FORMAT_VERSION,
    source: 'runtime_observation',
    status: 'PASSED',
    releaseSha,
    acceptanceRunId: '99999999-9999-4999-8999-999999999999',
    candidate: { ...candidate },
    mailboxProviders: { source: 'dns_mx_observation', initial: 'google', resend: 'microsoft', observedAt: at(43) },
    lifecycleSubscription: {
      source: 'cloudflare_email_sending_queue_subscription_observation',
      domain: 'mail.lythaus.co',
      status: 'enabled',
      events: ['delivered', 'deferred', 'bounced', 'failed', 'rejected', 'complained'],
      observedAt: at(43),
    },
    outboxSummary: {
      source: 'read_only_database_query',
      lifecycleSource: 'authenticated_lifecycle_handler',
      capturedAt: at(42),
      rows: [
        { purpose: 'verification', state: 'delivered', provider: 'cloudflare-email', providerErrorCategory: null, rowCount: 2, providerMessageIdCount: 2, distinctProviderMessageIdCount: 2, acceptedCount: 2, deliveredCount: 2 },
        { purpose: 'password_reset', state: 'delivered', provider: 'cloudflare-email', providerErrorCategory: null, rowCount: 1, providerMessageIdCount: 1, distinctProviderMessageIdCount: 1, acceptedCount: 1, deliveredCount: 1 },
      ],
    },
    acceptanceAccount: { class: 'production_acceptance', createdAt: at(2), metricIsolation: 'excluded' },
    turnstile: { status: 'verified', observedAt: at(3), hostname: 'api.lythaus.co', action: 'email_auth' },
    initialVerification: initial,
    resendVerification: resend,
    passwordReset: reset,
    login: { completedAt: at(14) },
    refresh: { completedAt: at(15) },
    logout: { completedAt: at(16) },
  };
}

test('generated runtime observation accepts complete exact-candidate proof', () => {
  const evidence = parseRealEmailAcceptanceEvidence(validEvidence(), releaseSha, candidate);
  assert.equal(evidence.status, 'PASSED');
  assert.equal(evidence.candidate.workerVersionId, candidate.workerVersionId);
  assert.equal(evidence.initialVerification.outbox.provider, 'cloudflare-email');
});

test('two aliases or domains on the same mailbox provider cannot certify restoration', () => {
  const evidence=validEvidence();delete evidence.mailboxProviders;
  assert.throws(()=>parseRealEmailAcceptanceEvidence(evidence,releaseSha,candidate),/mailbox_providers_missing/);
  evidence.mailboxProviders={source:'dns_mx_observation',initial:'google',resend:'google',observedAt:at(43)};
  assert.throws(()=>parseRealEmailAcceptanceEvidence(evidence,releaseSha,candidate),/independent_mailbox_providers_required/);
});

test('owner-entered Google and Zoho require complete private authorization and candidate product proof', () => {
  const evidence=validEvidence();
  evidence.mailboxProviders.resend='zoho';
  evidence.logout.completedAt=at(43);
  evidence.ownerAuthorization={source:'keeper_human_runtime',runCreatedAt:at(1),authorizedAt:at(1.5),primaryReference:'aaaa1111-1111-4111-8111-111111111111',secondaryReference:'bbbb1111-1111-4111-8111-111111111111'};
  evidence.productAcceptance={source:'exact_candidate_keeper_session',cases:['A03','A05','A06','A07','A08','A09','A10','A11','A12','A13','A14'].map(id=>({id,completedAt:at(42)}))};
  const expected={...candidate,ownerOperated:true};
  assert.equal(parseRealEmailAcceptanceEvidence(evidence,releaseSha,expected).status,'PASSED');
  for(const change of [
    v=>{delete v.ownerAuthorization;},v=>{delete v.productAcceptance;},
    v=>{v.ownerAuthorization.email='private@example.invalid';},v=>{v.ownerAuthorization.source='manual';},
    v=>{v.ownerAuthorization.primaryReference=v.ownerAuthorization.secondaryReference;},
    v=>{v.ownerAuthorization.authorizedAt=at(0);},v=>{v.ownerAuthorization.authorizedAt=at(3);},
    v=>{v.productAcceptance.cases.pop();},v=>{v.productAcceptance.cases[0].completedAt=at(0);},
    v=>{v.productAcceptance.cases[0].completedAt=at(44);},v=>{v.productAcceptance.cases[0].token='sensitive';},
    v=>{v.productAcceptance.cases[0].id='A05';},v=>{v.mailboxProviders.resend='google';},
  ]) { const invalid=structuredClone(evidence);change(invalid);assert.throws(()=>parseRealEmailAcceptanceEvidence(invalid,releaseSha,expected)); }
  assert.throws(()=>parseRealEmailAcceptanceEvidence(validEvidence(),releaseSha,expected),/owner_authorization_missing/);
});

test('canonical ADR-003 executes with no destination/password secrets and fails on incomplete owner proof', () => {
  const directory=mkdtempSync(join(tmpdir(),'lythaus-owner-harness-'));
  const input=join(directory,'observer.json'),output=join(directory,'evidence.json');
  const evidence=validEvidence();evidence.logout.completedAt=at(43);evidence.mailboxProviders.resend='zoho';
  evidence.ownerAuthorization={source:'keeper_human_runtime',runCreatedAt:at(1),authorizedAt:at(1.5),primaryReference:'aaaa1111-1111-4111-8111-111111111111',secondaryReference:'bbbb1111-1111-4111-8111-111111111111'};
  evidence.productAcceptance={source:'exact_candidate_keeper_session',cases:['A03','A05','A06','A07','A08','A09','A10','A11','A12','A13','A14'].map(id=>({id,completedAt:at(42)}))};
  const script=`globalThis.fetch=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path==='/internal/readiness/database-identity')return Response.json({branchFingerprint:'unknown',schemaFingerprint:'fixture',relationCount:97,identityContactEmails:true,budgetLedgerApplied:true,schemaVersion:'fixture.sql',roleClass:'login_non_superuser',readiness:'pass'});
    if(path==='/api/health'&&options.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'https://app.example.invalid'}});
    if(path==='/api/auth/email/verify'||path==='/api/auth/password/reset/complete')return Response.json({}, {status:400});
    if(path==='/')return new Response('local fixture',{headers:{'content-security-policy':"default-src 'self'"}});
    throw new Error('Unexpected network operation');
  };await import('./scripts/ci/run-adr003-authenticated-acceptance.mjs');`;
  const env={...process.env,RELEASE_SHA:releaseSha,GITHUB_SHA:releaseSha,ADR003_OWNER_OPERATED:'true',ADR003_TEST_EMAIL:'',ADR003_TEST_PASSWORD:'',
    ADR003_API_BASE_URL:'https://api.example.invalid/api',DATABASE_READINESS_TOKEN:'synthetic-readiness',EXPECTED_DATABASE_RELATION_COUNT:'97',
    EXPECTED_DATABASE_SCHEMA_FINGERPRINT:'fixture',EXPECTED_DATABASE_SCHEMA_VERSION:'fixture.sql',EXPECTED_DATABASE_BUDGET_LEDGER_APPLIED:'true',
    HYPERDRIVE_VERIFIED_MAIN:'true',ADR003_WORKER_NAME:candidate.workerName,ADR003_WORKER_VERSION_ID:candidate.workerVersionId,
    ADR003_ACCEPTANCE_RUN_ID:evidence.acceptanceRunId,ADR003_AUTH_ACCEPTANCE_EVIDENCE_PATH:input,ADR003_EVIDENCE_PATH:output,
    ADR003_GUEST_ACCEPTED:'true',ADR003_WEB_ORIGIN:'https://app.example.invalid',ADR003_WEB_HEALTH_URL:'https://app.example.invalid/',
    ADR003_RUN_DESTRUCTIVE_ACCOUNT_DELETION:'false'};
  try {
    writeFileSync(input,JSON.stringify(evidence));
    let result=spawnSync(process.execPath,['--input-type=module','-e',script],{env,encoding:'utf8'});
    assert.equal(result.status,0,result.stdout+result.stderr);
    const parsed=JSON.parse(readFileSync(output,'utf8'));
    assert.equal(parsed.status,'PASSED');
    assert.equal(parsed.cases.filter(item=>item.acceptanceNote==='exact_candidate_keeper_session:runtime_observed').length,11);
    delete evidence.productAcceptance;
    writeFileSync(input,JSON.stringify(evidence));
    result=spawnSync(process.execPath,['--input-type=module','-e',script],{env,encoding:'utf8'});
    assert.equal(result.status,1);
    assert.equal(JSON.parse(readFileSync(output,'utf8')).status,'BLOCKED');
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('runtime observation preserves the exact candidate and reused dependency set', () => {
  const evidence = validEvidence();
  const sourceCandidate = { ...candidate, sourceReleaseSha: releaseSha };
  const candidateDependencies = {
    public: { workerName: 'lythaus-public-api-development', versionId: candidate.workerVersionId, sourceSha: releaseSha, status: 'NEW_CANDIDATE', provenance: 'BUILT_FROM_RELEASE_SHA' },
    admin: { workerName: 'lythaus-admin-api-development', versionId: '22222222-2222-4222-8222-222222222222', sourceSha: 'b'.repeat(40), status: 'REUSED_PRODUCTION', provenance: 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION' },
    jobs: { workerName: 'lythaus-jobs-development', versionId: '33333333-3333-4333-8333-333333333333', sourceSha: 'c'.repeat(40), status: 'REUSED_PRODUCTION', provenance: 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION' },
    coordinator: { workerName: 'lythaus-auth-acceptance-coordinator-development', versionId: '44444444-4444-4444-8444-444444444444', sourceSha: 'd'.repeat(40), status: 'REUSED_PRODUCTION', provenance: 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION' },
  };
  evidence.candidate = sourceCandidate;
  evidence.candidateDependencies = candidateDependencies;
  const parsed = parseRealEmailAcceptanceEvidence(evidence, releaseSha, { ...sourceCandidate, candidateDependencies });
  assert.deepEqual(parsed.candidateDependencies, candidateDependencies);

  const drifted = structuredClone(evidence);
  drifted.candidateDependencies.jobs.versionId = '55555555-5555-4555-8555-555555555555';
  assert.throws(
    () => parseRealEmailAcceptanceEvidence(drifted, releaseSha, { ...sourceCandidate, candidateDependencies }),
    /candidate_dependency_mismatch/,
  );
});

test('generated runtime observation accepts UUIDv7 acceptance and auth identifiers', () => {
  const evidence = validEvidence();
  evidence.acceptanceRunId = '99999999-9999-7999-8999-999999999999';
  evidence.initialVerification.challenge.id = '22222222-2222-7222-8222-222222222222';
  evidence.initialVerification.outbox.id = '66666666-6666-7666-8666-666666666666';
  evidence.initialVerification.outbox.challengeId = evidence.initialVerification.challenge.id;
  evidence.initialVerification.outbox.lifecycle.providerMessageId = evidence.initialVerification.outbox.providerMessageId;
  evidence.initialVerification.verification.challengeId = evidence.initialVerification.challenge.id;
  const parsed = parseRealEmailAcceptanceEvidence(evidence, releaseSha, candidate);
  assert.equal(parsed.status, 'PASSED');
  assert.equal(parsed.acceptanceRunId, evidence.acceptanceRunId);
});

test('runtime observation rejects legacy manually asserted booleans and unknown fields', () => {
  const legacy = {
    ...validEvidence(),
    freshSignup: { requested: true, providerAccepted: true, messageObserved: true },
  };
  assert.throws(() => parseRealEmailAcceptanceEvidence(legacy, releaseSha, candidate), /unknown_field/);

  const manual = { ...validEvidence(), source: 'manual' };
  assert.throws(() => parseRealEmailAcceptanceEvidence(manual, releaseSha, candidate), /source_invalid/);
});

test('runtime observation rejects stale pre-candidate flow chronology', () => {
  const stale = validEvidence();
  stale.initialVerification.requestedAt = at(0);
  assert.throws(
    () => parseRealEmailAcceptanceEvidence(stale, releaseSha, candidate),
    /initial_request_before_candidate_stage/,
  );
});

test('runtime observation rejects a candidate timestamp mismatch', () => {
  const mismatched = validEvidence();
  mismatched.candidate.stagedAt = at(2);
  assert.throws(
    () => parseRealEmailAcceptanceEvidence(mismatched, releaseSha, candidate),
    /candidate_staged_at_mismatch/,
  );
});

test('runtime observation rejects digest-like or duplicate provider message ids', () => {
  const digest = validEvidence();
  digest.initialVerification.outbox.providerMessageId = 'f'.repeat(64);
  assert.throws(() => parseRealEmailAcceptanceEvidence(digest, releaseSha, candidate), /provider_message_id_invalid/);

  const duplicate = validEvidence();
  duplicate.resendVerification.outbox.providerMessageId = duplicate.initialVerification.outbox.providerMessageId;
  duplicate.resendVerification.outbox.lifecycle.providerMessageId = duplicate.initialVerification.outbox.providerMessageId;
  assert.throws(() => parseRealEmailAcceptanceEvidence(duplicate, releaseSha, candidate), /provider_message_ids_not_distinct/);
});

test('database outbox evidence rejects raw identifiers in the aggregate result', () => {
  const exposed = validEvidence();
  exposed.outboxSummary.rows[0].providerMessageId = 'raw-provider-id';
  assert.throws(() => parseRealEmailAcceptanceEvidence(exposed, releaseSha, candidate), /outbox_summary_row_unknown_field/);
});

test('runtime observation rejects missing or incomplete lifecycle queue configuration', () => {
  const missing = validEvidence();
  delete missing.lifecycleSubscription;
  assert.throws(() => parseRealEmailAcceptanceEvidence(missing, releaseSha, candidate), /lifecycle_subscription_missing/);

  const incomplete = validEvidence();
  incomplete.lifecycleSubscription.events = ['delivered'];
  assert.throws(() => parseRealEmailAcceptanceEvidence(incomplete, releaseSha, candidate), /lifecycle_subscription_events_invalid/);

  const disabled = validEvidence();
  disabled.lifecycleSubscription.status = 'disabled';
  assert.throws(() => parseRealEmailAcceptanceEvidence(disabled, releaseSha, candidate), /lifecycle_subscription_not_enabled/);
});

test('runtime observation rejects a lifecycle queue configured before candidate staging', () => {
  const stale = validEvidence();
  stale.lifecycleSubscription.observedAt = candidate.uploadedAt;
  assert.throws(
    () => parseRealEmailAcceptanceEvidence(stale, releaseSha, candidate),
    /lifecycle_subscription_before_candidate_stage/,
  );
});

test('human Turnstile or mailbox work is an explicit non-pass outcome', () => {
  const human = validEvidence();
  human.status = 'HUMAN_ACCEPTANCE_REQUIRED';
  human.reason = 'turnstile_requires_human';
  delete human.acceptanceAccount;
  delete human.turnstile;
  delete human.initialVerification;
  delete human.resendVerification;
  delete human.passwordReset;
  delete human.login;
  delete human.refresh;
  delete human.logout;
  const parsed = parseRealEmailAcceptanceEvidence(human, releaseSha, candidate);
  assert.equal(parsed.status, 'HUMAN_ACCEPTANCE_REQUIRED');

  const blocked = validEvidence();
  delete blocked.passwordReset;
  assert.throws(() => parseRealEmailAcceptanceEvidence(blocked, releaseSha, candidate), /passwordReset_missing/);

  const turnstileNotVerified = validEvidence();
  turnstileNotVerified.turnstile.status = 'human_required';
  assert.throws(() => parseRealEmailAcceptanceEvidence(turnstileNotVerified, releaseSha, candidate), /turnstile_not_verified/);
});
