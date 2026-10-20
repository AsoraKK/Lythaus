import assert from 'node:assert/strict';
import test from 'node:test';

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

function hours(value) {
  return new Date(Date.parse(candidate.uploadedAt) + value * 60 * 60_000).toISOString();
}

function challenge(id, createdAt, supersededAt) {
  return { id, createdAt, ...(supersededAt ? { supersededAt } : {}) };
}

function delivery({ challengeId, outboxId, purpose, providerMessageId, mailboxProvider = 'google', requestedAt, fixtureCreatedAt, previousChallenge, challengeCreatedAt, verificationCompletedAt, verificationConsumedAt, replayAttemptedAt, replayRejectedAt, reset, cooldown }) {
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
        source: 'cloudflare_email_sending_lifecycle',
        eventType: 'message.delivered',
        providerMessageId,
        occurredAt: at(requestOffset + 4),
        observedAt: at(requestOffset + 5),
      },
    },
    mailboxReceipt: { source: 'protected_human_mailbox_link_completion', provider: mailboxProvider, observedAt: verificationCompletedAt },
    verification: {
      challengeId,
      completedAt: verificationCompletedAt,
      consumedAt: verificationConsumedAt,
    },
    replay: { attemptedAt: replayAttemptedAt, rejectedAt: replayRejectedAt },
    ...(cooldown ? { cooldown } : {}),
    ...(reset ? { reset } : {}),
  };
}

function validEvidence() {
  const initialChallengeId = '22222222-2222-4222-8222-222222222222';
  const resendPreviousChallengeId = '33333333-3333-4333-8333-333333333333';
  const resendChallengeId = '44444444-4444-4444-8444-444444444444';
  const resetChallengeId = '55555555-5555-4555-8555-555555555555';
  const candidateSource = { ...candidate, sourceReleaseSha: releaseSha };
  const candidateDependencies = {
    public: { workerName: candidate.workerName, versionId: candidate.workerVersionId, sourceSha: releaseSha, status: 'NEW_CANDIDATE', provenance: 'BUILT_FROM_RELEASE_SHA' },
    admin: { workerName: 'lythaus-admin-api-development', versionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sourceSha: releaseSha, status: 'NEW_CANDIDATE', provenance: 'BUILT_FROM_RELEASE_SHA' },
    jobs: { workerName: 'lythaus-jobs-development', versionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', sourceSha: releaseSha, status: 'NEW_CANDIDATE', provenance: 'BUILT_FROM_RELEASE_SHA' },
    coordinator: { workerName: 'lythaus-auth-acceptance-coordinator-development', versionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', sourceSha: releaseSha, status: 'NEW_CANDIDATE', provenance: 'BUILT_FROM_RELEASE_SHA' },
  };
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
    mailboxProvider: 'microsoft',
    fixtureCreatedAt: at(17),
    requestedAt: at(44),
    previousChallenge: { ...challenge(resendPreviousChallengeId, hours(-25), at(41)), expiresAt: hours(-24.5) },
    challengeCreatedAt: at(44),
    verificationCompletedAt: at(55),
    verificationConsumedAt: at(56),
    replayAttemptedAt: at(57),
    replayRejectedAt: at(58),
    cooldown: { source: 'candidate_api_resend_cooldown_observation', requestedAt: at(42), retryAfterSeconds: 1, responseStatus: 202, outboxDelta: 0 },
  });
  const reset = delivery({
    challengeId: resetChallengeId,
    outboxId: '88888888-8888-4888-8888-888888888888',
    purpose: 'password_reset',
    providerMessageId: 'cf-msg-reset-003',
    requestedAt: at(60),
    challengeCreatedAt: at(61),
    verificationCompletedAt: at(65),
    verificationConsumedAt: at(66),
    replayAttemptedAt: at(67),
    replayRejectedAt: at(68),
    reset: {
      completedAt: at(65),
      consumedAt: at(66),
      replayAttemptedAt: at(67),
      replayRejectedAt: at(68),
      sessionsRevokedAt: at(69),
      oldPasswordRejectedAt: at(70),
      newPasswordAcceptedAt: at(71),
    },
  });
  return {
    formatVersion: REAL_EMAIL_ACCEPTANCE_FORMAT_VERSION,
    source: 'runtime_observation',
    status: 'PASSED',
    releaseSha,
    acceptanceRunId: '99999999-9999-4999-8999-999999999999',
    candidate: candidateSource,
    candidateDependencies,
    mailboxProviders: { source: 'dns_mx_observation', initial: 'google', resend: 'microsoft', observedAt: at(80) },
    lifecycleSubscription: {
      source: 'cloudflare_email_sending_queue_subscription_observation',
      domain: 'mail.lythaus.co',
      status: 'enabled',
      events: ['delivered', 'deferred', 'bounced', 'failed', 'rejected', 'complained'],
      observedAt: at(80),
    },
    outboxSummary: {
      source: 'read_only_database_query',
      lifecycleSource: 'authenticated_lifecycle_handler',
      capturedAt: at(80),
      rows: [
        { purpose: 'verification', state: 'delivered', provider: 'cloudflare-email', providerErrorCategory: null, rowCount: 4, providerMessageIdCount: 4, distinctProviderMessageIdCount: 4, acceptedCount: 4, deliveredCount: 4 },
        { purpose: 'password_reset', state: 'delivered', provider: 'cloudflare-email', providerErrorCategory: null, rowCount: 1, providerMessageIdCount: 1, distinctProviderMessageIdCount: 1, acceptedCount: 1, deliveredCount: 1 },
      ],
    },
    acceptanceAccount: { class: 'production_acceptance', createdAt: at(2), metricIsolation: 'excluded' },
    turnstile: { status: 'verified', observedAt: at(3), hostname: 'api.lythaus.co', action: 'email_auth' },
    initialVerification: initial,
    resendVerification: { ...resend, cooldown: resend.cooldown },
    expiredVerification: {
      source: 'candidate_auth_email_verification_endpoint',
      challengeId: resendPreviousChallengeId,
      createdAt: hours(-25),
      expiresAt: hours(-24.5),
      supersededAt: at(41),
      provider: 'cloudflare-email',
      providerMessageId: 'cf-msg-expired-001',
      acceptedAt: at(18),
      deliveredAt: at(19),
      mailboxReceipt: { source: 'protected_human_expired_link_open', provider: 'microsoft', observedAt: at(20) },
      attemptedAt: at(20),
      rejectedAt: at(21),
      responseStatus: 400,
      errorCode: 'verification_token_invalid',
      ageMode: 'controlled_25h_fixture',
    },
    accountSwitch: {
      source: 'candidate_api_session_identity_observation',
      completedAt: at(78.5),
      primaryAccountRef: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      secondaryAccountRef: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      primaryLoginAt: at(72),
      secondaryLoginAt: at(73),
      primaryAfterSecondaryLoginAt: at(74),
      secondaryLogoutAt: at(75),
      secondaryRejectedAt: at(76),
      primaryAfterSecondaryLogoutAt: at(77),
      primaryLogoutAt: at(78),
      primaryRejectedAt: at(78.2),
      distinctSubjects: true,
      primarySessionRetainedAfterSecondaryLogin: true,
      primarySessionRetainedAfterSecondaryLogout: true,
      secondarySessionRevoked: true,
      primarySessionRevoked: true,
    },
    passwordReset: reset,
    login: { completedAt: at(14) },
    refresh: { completedAt: at(15) },
    logout: { completedAt: at(79) },
  };
}

test('generated runtime observation accepts complete exact-candidate proof', () => {
  const evidence = parseRealEmailAcceptanceEvidence(validEvidence(), releaseSha, candidate);
  assert.equal(evidence.status, 'PASSED');
  assert.equal(evidence.candidate.workerVersionId, candidate.workerVersionId);
  assert.equal(evidence.initialVerification.outbox.provider, 'cloudflare-email');
});

test('PASSED evidence requires pinned dependencies and real provider and mailbox receipt sources', () => {
  const missingDependencies = validEvidence();
  delete missingDependencies.candidateDependencies;
  assert.throws(() => parseRealEmailAcceptanceEvidence(missingDependencies, releaseSha, candidate), /candidate_dependencies_missing/);

  const mockedLifecycle = validEvidence();
  mockedLifecycle.resendVerification.outbox.lifecycle.source = 'synthetic_local_provider';
  assert.throws(() => parseRealEmailAcceptanceEvidence(mockedLifecycle, releaseSha, candidate), /provider_receipt_source_invalid/);

  const mockedMailbox = validEvidence();
  mockedMailbox.expiredVerification.mailboxReceipt.source = 'synthetic_mailbox_capture';
  assert.throws(() => parseRealEmailAcceptanceEvidence(mockedMailbox, releaseSha, candidate), /expired_verification_mailbox_receipt_source_invalid/);
});

test('expired verification and resend cooldown evidence cannot be omitted or relaxed', () => {
  const missingExpired = validEvidence();
  delete missingExpired.expiredVerification;
  assert.throws(() => parseRealEmailAcceptanceEvidence(missingExpired, releaseSha, candidate), /expired_verification_missing/);

  const cooldownSentEmail = validEvidence();
  cooldownSentEmail.resendVerification.cooldown.outboxDelta = 1;
  assert.throws(() => parseRealEmailAcceptanceEvidence(cooldownSentEmail, releaseSha, candidate), /resend_cooldown_observation_invalid/);

  const resendTooEarly = validEvidence();
  resendTooEarly.resendVerification.requestedAt = at(42);
  resendTooEarly.resendVerification.challenge.createdAt = at(42);
  assert.throws(() => parseRealEmailAcceptanceEvidence(resendTooEarly, releaseSha, candidate), /resend_before_cooldown_elapsed/);
});

test('two aliases or domains on the same mailbox provider cannot certify restoration', () => {
  const evidence=validEvidence();delete evidence.mailboxProviders;
  assert.throws(()=>parseRealEmailAcceptanceEvidence(evidence,releaseSha,candidate),/mailbox_providers_missing/);
  evidence.mailboxProviders={source:'dns_mx_observation',initial:'google',resend:'google',observedAt:at(43)};
  assert.throws(()=>parseRealEmailAcceptanceEvidence(evidence,releaseSha,candidate),/independent_mailbox_providers_required/);
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
