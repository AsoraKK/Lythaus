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
