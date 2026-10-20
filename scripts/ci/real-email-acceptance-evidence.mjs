const FORMAT_VERSION = 'lythaus-real-email-acceptance-v3';
// RFC 9562 UUIDs include the UUIDv7 identifiers emitted by the acceptance
// coordinator and auth workers. Keep the variant and shape strict.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{6,200}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const FLOW_NAMES = ['initialVerification', 'resendVerification', 'passwordReset'];
const REQUIRED_LIFECYCLE_EVENTS = ['delivered', 'deferred', 'bounced', 'failed', 'rejected', 'complained'];
const ACCEPTANCE_DEPENDENCY_WORKERS = {
  public: 'lythaus-public-api-development',
  admin: 'lythaus-admin-api-development',
  jobs: 'lythaus-jobs-development',
  coordinator: 'lythaus-auth-acceptance-coordinator-development',
};
const ACCEPTANCE_DEPENDENCY_COMPONENTS = Object.keys(ACCEPTANCE_DEPENDENCY_WORKERS);

function assertObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
}

function assertOnlyKeys(value, keys, code) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(code);
  }
}

function timestamp(value, code) {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(code);
  }
  return Date.parse(value);
}

function identifier(value, code, { uuid = false } = {}) {
  if (typeof value !== 'string' || !(uuid ? UUID.test(value) : SAFE_IDENTIFIER.test(value))) throw new Error(code);
  if (!uuid && (/^[0-9a-f]{64}$/iu.test(value) || value.toLowerCase() === 'accepted')) throw new Error(code);
  return value;
}

function assertAtOrAfter(left, right, code) {
  if (timestamp(left, `${code}_left_invalid`) < timestamp(right, `${code}_right_invalid`)) throw new Error(code);
}

function validateCandidate(candidate, releaseSha, expectedCandidate = {}) {
  assertObject(candidate, 'real_email_acceptance_candidate_missing');
  assertOnlyKeys(candidate, ['workerName', 'workerVersionId', 'sourceReleaseSha', 'uploadedAt', 'stagedAt'], 'real_email_acceptance_candidate_unknown_field');
  if (typeof candidate.workerName !== 'string' || !/^[a-z0-9-]+$/u.test(candidate.workerName)) {
    throw new Error('real_email_acceptance_candidate_worker_invalid');
  }
  identifier(candidate.workerVersionId, 'real_email_acceptance_candidate_version_invalid', { uuid: true });
  timestamp(candidate.uploadedAt, 'real_email_acceptance_candidate_uploaded_at_invalid');
  timestamp(candidate.stagedAt, 'real_email_acceptance_candidate_staged_at_invalid');
  if (candidate.workerName !== (expectedCandidate.workerName ?? candidate.workerName)) {
    throw new Error('real_email_acceptance_candidate_worker_mismatch');
  }
  if (candidate.workerVersionId !== (expectedCandidate.workerVersionId ?? candidate.workerVersionId)) {
    throw new Error('real_email_acceptance_candidate_version_mismatch');
  }
  const sourceReleaseSha = candidate.sourceReleaseSha ?? releaseSha;
  if (typeof sourceReleaseSha !== 'string' || !/^[0-9a-f]{40}$/iu.test(sourceReleaseSha)) {
    throw new Error('real_email_acceptance_candidate_source_sha_invalid');
  }
  if (sourceReleaseSha.toLowerCase() !== (expectedCandidate.sourceReleaseSha ?? releaseSha).toLowerCase()) {
    throw new Error('real_email_acceptance_candidate_source_sha_mismatch');
  }
  if (candidate.uploadedAt !== (expectedCandidate.uploadedAt ?? candidate.uploadedAt)) {
    throw new Error('real_email_acceptance_candidate_uploaded_at_mismatch');
  }
  if (candidate.stagedAt !== (expectedCandidate.stagedAt ?? candidate.stagedAt)) {
    throw new Error('real_email_acceptance_candidate_staged_at_mismatch');
  }
  assertAtOrAfter(candidate.stagedAt, candidate.uploadedAt, 'real_email_acceptance_candidate_staged_before_upload');
}

function validateCandidateDependencies(value, candidate, expectedDependencies, releaseSha) {
  assertObject(value, 'real_email_acceptance_candidate_dependencies_invalid');
  if (Object.keys(value).sort().join(',') !== ACCEPTANCE_DEPENDENCY_COMPONENTS.slice().sort().join(',')) {
    throw new Error('real_email_acceptance_candidate_dependencies_invalid');
  }
  const normalized = {};
  for (const component of ACCEPTANCE_DEPENDENCY_COMPONENTS) {
    const dependency = value[component];
    assertObject(dependency, 'real_email_acceptance_candidate_dependency_invalid');
    assertOnlyKeys(dependency, ['workerName', 'versionId', 'sourceSha', 'status', 'provenance'], 'real_email_acceptance_candidate_dependency_unknown_field');
    if (dependency.workerName !== ACCEPTANCE_DEPENDENCY_WORKERS[component]
      || !UUID.test(dependency.versionId)
      || typeof dependency.sourceSha !== 'string' || !/^[0-9a-f]{40}$/iu.test(dependency.sourceSha)
      || !['NEW_CANDIDATE', 'REUSED_PRODUCTION'].includes(dependency.status)
      || !['BUILT_FROM_RELEASE_SHA', 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION'].includes(dependency.provenance)
      || (dependency.status === 'NEW_CANDIDATE' && dependency.provenance !== 'BUILT_FROM_RELEASE_SHA')
      || (dependency.status === 'REUSED_PRODUCTION' && dependency.provenance !== 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION')) {
      throw new Error('real_email_acceptance_candidate_dependency_invalid');
    }
    normalized[component] = {
      workerName: dependency.workerName,
      versionId: dependency.versionId,
      sourceSha: dependency.sourceSha.toLowerCase(),
      status: dependency.status,
      provenance: dependency.provenance,
    };
  }
  if (normalized.public.versionId !== candidate.workerVersionId || normalized.public.workerName !== candidate.workerName
    || normalized.public.sourceSha !== (candidate.sourceReleaseSha ?? '').toLowerCase()) {
    throw new Error('real_email_acceptance_candidate_dependency_public_mismatch');
  }
  if (Object.values(normalized).some((dependency) => (
    dependency.status === 'NEW_CANDIDATE' && dependency.sourceSha !== releaseSha.toLowerCase()
  ))) {
    throw new Error('real_email_acceptance_candidate_dependency_source_mismatch');
  }
  if (expectedDependencies !== undefined) {
    if (!expectedDependencies || typeof expectedDependencies !== 'object' || Array.isArray(expectedDependencies)) {
      throw new Error('real_email_acceptance_candidate_dependencies_expected_invalid');
    }
    for (const component of ACCEPTANCE_DEPENDENCY_COMPONENTS) {
      const expected = expectedDependencies[component];
      if (!expected || normalized[component].workerName !== expected.workerName
        || normalized[component].versionId !== expected.versionId
        || normalized[component].sourceSha !== String(expected.sourceSha ?? '').toLowerCase()
        || normalized[component].status !== expected.status
        || normalized[component].provenance !== expected.provenance) {
        throw new Error('real_email_acceptance_candidate_dependency_mismatch');
      }
    }
  }
  return normalized;
}

function validateDelivery(flow, flowName) {
  assertObject(flow, `real_email_acceptance_${flowName}_missing`);
  assertOnlyKeys(flow, ['requestedAt', 'fixtureCreatedAt', 'previousChallenge', 'cooldown', 'challenge', 'outbox', 'mailboxReceipt', 'verification', 'replay', 'reset'], `real_email_acceptance_${flowName}_unknown_field`);
  timestamp(flow.requestedAt, `real_email_acceptance_${flowName}_requested_at_invalid`);
  if (flow.fixtureCreatedAt !== undefined) timestamp(flow.fixtureCreatedAt, `real_email_acceptance_${flowName}_fixture_created_at_invalid`);

  assertObject(flow.challenge, `real_email_acceptance_${flowName}_challenge_missing`);
  assertOnlyKeys(flow.challenge, ['id', 'createdAt', 'supersededAt'], `real_email_acceptance_${flowName}_challenge_unknown_field`);
  identifier(flow.challenge.id, `real_email_acceptance_${flowName}_challenge_id_invalid`, { uuid: true });
  timestamp(flow.challenge.createdAt, `real_email_acceptance_${flowName}_challenge_created_at_invalid`);
  if (flow.challenge.supersededAt !== undefined) timestamp(flow.challenge.supersededAt, `real_email_acceptance_${flowName}_challenge_superseded_at_invalid`);

  assertObject(flow.outbox, `real_email_acceptance_${flowName}_outbox_missing`);
  assertOnlyKeys(flow.outbox, ['id', 'purpose', 'challengeId', 'createdAt', 'provider', 'providerMessageId', 'acceptedAt', 'lifecycle'], `real_email_acceptance_${flowName}_outbox_unknown_field`);
  identifier(flow.outbox.id, `real_email_acceptance_${flowName}_outbox_id_invalid`, { uuid: true });
  identifier(flow.outbox.challengeId, `real_email_acceptance_${flowName}_outbox_challenge_id_invalid`, { uuid: true });
  if (flow.outbox.challengeId !== flow.challenge.id) throw new Error(`real_email_acceptance_${flowName}_outbox_challenge_mismatch`);
  if (!['verification', 'password_reset'].includes(flow.outbox.purpose)) throw new Error(`real_email_acceptance_${flowName}_outbox_purpose_invalid`);
  timestamp(flow.outbox.createdAt, `real_email_acceptance_${flowName}_outbox_created_at_invalid`);
  if (flow.outbox.provider !== 'cloudflare-email') throw new Error(`real_email_acceptance_${flowName}_provider_invalid`);
  identifier(flow.outbox.providerMessageId, `real_email_acceptance_${flowName}_provider_message_id_invalid`);
  timestamp(flow.outbox.acceptedAt, `real_email_acceptance_${flowName}_provider_accepted_at_invalid`);

  assertObject(flow.outbox.lifecycle, `real_email_acceptance_${flowName}_lifecycle_missing`);
  assertOnlyKeys(flow.outbox.lifecycle, ['source', 'eventType', 'providerMessageId', 'occurredAt', 'observedAt'], `real_email_acceptance_${flowName}_lifecycle_unknown_field`);
  if (flow.outbox.lifecycle.source !== 'cloudflare_email_sending_lifecycle') throw new Error(`real_email_acceptance_${flowName}_provider_receipt_source_invalid`);
  if (flow.outbox.lifecycle.eventType !== 'message.delivered') throw new Error(`real_email_acceptance_${flowName}_delivery_not_observed`);
  identifier(flow.outbox.lifecycle.providerMessageId, `real_email_acceptance_${flowName}_lifecycle_message_id_invalid`);
  if (flow.outbox.lifecycle.providerMessageId !== flow.outbox.providerMessageId) throw new Error(`real_email_acceptance_${flowName}_lifecycle_message_mismatch`);
  timestamp(flow.outbox.lifecycle.occurredAt, `real_email_acceptance_${flowName}_lifecycle_occurred_at_invalid`);
  timestamp(flow.outbox.lifecycle.observedAt, `real_email_acceptance_${flowName}_lifecycle_observed_at_invalid`);

  assertObject(flow.verification, `real_email_acceptance_${flowName}_verification_missing`);
  assertOnlyKeys(flow.verification, ['challengeId', 'completedAt', 'consumedAt'], `real_email_acceptance_${flowName}_verification_unknown_field`);
  identifier(flow.verification.challengeId, `real_email_acceptance_${flowName}_verification_challenge_id_invalid`, { uuid: true });
  if (flow.verification.challengeId !== flow.challenge.id) throw new Error(`real_email_acceptance_${flowName}_verification_challenge_mismatch`);
  timestamp(flow.verification.completedAt, `real_email_acceptance_${flowName}_verification_completed_at_invalid`);
  timestamp(flow.verification.consumedAt, `real_email_acceptance_${flowName}_verification_consumed_at_invalid`);

  assertObject(flow.replay, `real_email_acceptance_${flowName}_replay_missing`);
  assertOnlyKeys(flow.replay, ['attemptedAt', 'rejectedAt'], `real_email_acceptance_${flowName}_replay_unknown_field`);
  timestamp(flow.replay.attemptedAt, `real_email_acceptance_${flowName}_replay_attempted_at_invalid`);
  timestamp(flow.replay.rejectedAt, `real_email_acceptance_${flowName}_replay_rejected_at_invalid`);

  assertObject(flow.mailboxReceipt, `real_email_acceptance_${flowName}_mailbox_receipt_missing`);
  assertOnlyKeys(flow.mailboxReceipt, ['source', 'provider', 'observedAt'], `real_email_acceptance_${flowName}_mailbox_receipt_unknown_field`);
  if (flow.mailboxReceipt.source !== 'protected_human_mailbox_link_completion'
    || !['google', 'microsoft'].includes(flow.mailboxReceipt.provider)) {
    throw new Error(`real_email_acceptance_${flowName}_mailbox_receipt_source_invalid`);
  }
  timestamp(flow.mailboxReceipt.observedAt, `real_email_acceptance_${flowName}_mailbox_receipt_observed_at_invalid`);

  assertAtOrAfter(flow.requestedAt, flow.fixtureCreatedAt ?? flow.requestedAt, `real_email_acceptance_${flowName}_requested_before_fixture`);
  assertAtOrAfter(flow.challenge.createdAt, flow.requestedAt, `real_email_acceptance_${flowName}_challenge_before_request`);
  assertAtOrAfter(flow.outbox.createdAt, flow.challenge.createdAt, `real_email_acceptance_${flowName}_outbox_before_challenge`);
  assertAtOrAfter(flow.outbox.acceptedAt, flow.outbox.createdAt, `real_email_acceptance_${flowName}_provider_accepted_before_outbox`);
  assertAtOrAfter(flow.outbox.lifecycle.occurredAt, flow.outbox.acceptedAt, `real_email_acceptance_${flowName}_delivery_before_provider_acceptance`);
  assertAtOrAfter(flow.outbox.lifecycle.observedAt, flow.outbox.lifecycle.occurredAt, `real_email_acceptance_${flowName}_delivery_observed_before_event`);
  assertAtOrAfter(flow.verification.completedAt, flow.outbox.lifecycle.occurredAt, `real_email_acceptance_${flowName}_verification_before_delivery`);
  assertAtOrAfter(flow.mailboxReceipt.observedAt, flow.outbox.lifecycle.occurredAt, `real_email_acceptance_${flowName}_mailbox_receipt_before_delivery`);
  assertAtOrAfter(flow.mailboxReceipt.observedAt, flow.verification.completedAt, `real_email_acceptance_${flowName}_mailbox_receipt_before_link_completion`);
  assertAtOrAfter(flow.verification.consumedAt, flow.verification.completedAt, `real_email_acceptance_${flowName}_challenge_consumed_before_verification`);
  assertAtOrAfter(flow.replay.attemptedAt, flow.verification.completedAt, `real_email_acceptance_${flowName}_replay_before_verification`);
  assertAtOrAfter(flow.replay.rejectedAt, flow.replay.attemptedAt, `real_email_acceptance_${flowName}_replay_rejection_before_attempt`);
  if (flow.challenge.supersededAt !== undefined) assertAtOrAfter(flow.challenge.supersededAt, flow.challenge.createdAt, `real_email_acceptance_${flowName}_challenge_superseded_before_creation`);
  return flow;
}

function validateInitialAndAccount(evidence) {
  assertObject(evidence.acceptanceAccount, 'real_email_acceptance_account_missing');
  assertOnlyKeys(evidence.acceptanceAccount, ['class', 'createdAt', 'metricIsolation'], 'real_email_acceptance_account_unknown_field');
  if (evidence.acceptanceAccount.class !== 'production_acceptance') throw new Error('real_email_acceptance_account_class_invalid');
  if (evidence.acceptanceAccount.metricIsolation !== 'excluded') throw new Error('real_email_acceptance_account_isolation_invalid');
  timestamp(evidence.acceptanceAccount.createdAt, 'real_email_acceptance_account_created_at_invalid');

  assertObject(evidence.turnstile, 'real_email_acceptance_turnstile_missing');
  assertOnlyKeys(evidence.turnstile, ['status', 'observedAt', 'hostname', 'action'], 'real_email_acceptance_turnstile_unknown_field');
  if (!['verified', 'human_required'].includes(evidence.turnstile.status)) throw new Error('real_email_acceptance_turnstile_status_invalid');
  timestamp(evidence.turnstile.observedAt, 'real_email_acceptance_turnstile_observed_at_invalid');
  if (evidence.turnstile.status === 'verified') {
    if (typeof evidence.turnstile.hostname !== 'string' || !/^[A-Za-z0-9.-]{1,253}$/u.test(evidence.turnstile.hostname)) throw new Error('real_email_acceptance_turnstile_hostname_invalid');
    if (typeof evidence.turnstile.action !== 'string' || !/^[A-Za-z0-9._:-]{1,80}$/u.test(evidence.turnstile.action)) throw new Error('real_email_acceptance_turnstile_action_invalid');
  }
}

function count(value, code) {
  if (!Number.isInteger(value) || value < 0) throw new Error(code);
  return value;
}

function validateOutboxSummary(evidence) {
  assertObject(evidence.outboxSummary, 'real_email_acceptance_outbox_summary_missing');
  assertOnlyKeys(evidence.outboxSummary, ['source', 'lifecycleSource', 'capturedAt', 'rows'], 'real_email_acceptance_outbox_summary_unknown_field');
  if (evidence.outboxSummary.source !== 'read_only_database_query') throw new Error('real_email_acceptance_outbox_summary_source_invalid');
  if (evidence.outboxSummary.lifecycleSource !== 'authenticated_lifecycle_handler') throw new Error('real_email_acceptance_outbox_summary_lifecycle_source_invalid');
  const capturedAt = timestamp(evidence.outboxSummary.capturedAt, 'real_email_acceptance_outbox_summary_captured_at_invalid');
  if (capturedAt < timestamp(evidence.candidate.stagedAt, 'real_email_acceptance_candidate_staged_at_invalid')) {
    throw new Error('real_email_acceptance_outbox_summary_before_candidate_stage');
  }
  if (!Array.isArray(evidence.outboxSummary.rows) || evidence.outboxSummary.rows.length !== 2) {
    throw new Error('real_email_acceptance_outbox_summary_rows_invalid');
  }
  const totals = new Map();
  for (const row of evidence.outboxSummary.rows) {
    assertObject(row, 'real_email_acceptance_outbox_summary_row_invalid');
    assertOnlyKeys(row, [
      'purpose', 'state', 'provider', 'providerErrorCategory', 'rowCount',
      'providerMessageIdCount', 'distinctProviderMessageIdCount', 'acceptedCount', 'deliveredCount',
    ], 'real_email_acceptance_outbox_summary_row_unknown_field');
    if (!['verification', 'password_reset'].includes(row.purpose)) throw new Error('real_email_acceptance_outbox_summary_purpose_invalid');
    if (row.state !== 'delivered' || row.provider !== 'cloudflare-email') throw new Error('real_email_acceptance_outbox_summary_delivery_invalid');
    if (row.providerErrorCategory !== null) throw new Error('real_email_acceptance_outbox_summary_error_invalid');
    const values = Object.fromEntries([
      ['rowCount', 'rows'],
      ['providerMessageIdCount', 'provider_message_ids'],
      ['distinctProviderMessageIdCount', 'distinct_provider_message_ids'],
      ['acceptedCount', 'accepted'],
      ['deliveredCount', 'delivered'],
    ].map(([key, label]) => [key, count(row[key], `real_email_acceptance_outbox_summary_${label}_count_invalid`)]));
    if (values.providerMessageIdCount !== values.distinctProviderMessageIdCount) throw new Error('real_email_acceptance_outbox_summary_provider_ids_not_distinct');
    if (values.acceptedCount !== values.rowCount || values.deliveredCount !== values.rowCount || values.providerMessageIdCount !== values.rowCount) {
      throw new Error('real_email_acceptance_outbox_summary_counts_incomplete');
    }
    if (totals.has(row.purpose)) throw new Error('real_email_acceptance_outbox_summary_duplicate_purpose');
    totals.set(row.purpose, values);
  }
  const verification = totals.get('verification');
  const passwordReset = totals.get('password_reset');
  if (!verification || verification.rowCount !== 4 || !passwordReset || passwordReset.rowCount !== 1) {
    throw new Error('real_email_acceptance_outbox_summary_expected_flows_missing');
  }
}

function validateExpiredVerification(evidence) {
  const expired = evidence.expiredVerification;
  assertObject(expired, 'real_email_acceptance_expired_verification_missing');
  assertOnlyKeys(expired, [
    'source', 'challengeId', 'createdAt', 'expiresAt', 'supersededAt', 'provider', 'providerMessageId',
    'acceptedAt', 'deliveredAt', 'mailboxReceipt', 'attemptedAt', 'rejectedAt', 'responseStatus', 'errorCode', 'ageMode',
  ], 'real_email_acceptance_expired_verification_unknown_field');
  if (expired.source !== 'candidate_auth_email_verification_endpoint') throw new Error('real_email_acceptance_expired_verification_source_invalid');
  identifier(expired.challengeId, 'real_email_acceptance_expired_verification_challenge_id_invalid', { uuid: true });
  if (expired.provider !== 'cloudflare-email') throw new Error('real_email_acceptance_expired_verification_provider_invalid');
  identifier(expired.providerMessageId, 'real_email_acceptance_expired_verification_provider_message_id_invalid');
  if (expired.responseStatus !== 400 || expired.errorCode !== 'verification_token_invalid') throw new Error('real_email_acceptance_expired_verification_rejection_invalid');
  if (expired.ageMode !== 'controlled_25h_fixture') throw new Error('real_email_acceptance_expired_verification_age_mode_invalid');
  const createdAt = timestamp(expired.createdAt, 'real_email_acceptance_expired_verification_created_at_invalid');
  const expiresAt = timestamp(expired.expiresAt, 'real_email_acceptance_expired_verification_expires_at_invalid');
  const supersededAt = timestamp(expired.supersededAt, 'real_email_acceptance_expired_verification_superseded_at_invalid');
  const acceptedAt = timestamp(expired.acceptedAt, 'real_email_acceptance_expired_verification_accepted_at_invalid');
  const deliveredAt = timestamp(expired.deliveredAt, 'real_email_acceptance_expired_verification_delivered_at_invalid');
  const attemptedAt = timestamp(expired.attemptedAt, 'real_email_acceptance_expired_verification_attempted_at_invalid');
  const rejectedAt = timestamp(expired.rejectedAt, 'real_email_acceptance_expired_verification_rejected_at_invalid');
  assertAtOrAfter(expired.expiresAt, expired.createdAt, 'real_email_acceptance_expired_verification_expiry_before_creation');
  if (attemptedAt - createdAt < 24 * 60 * 60 * 1000 || expiresAt > attemptedAt || supersededAt <= rejectedAt) {
    throw new Error('real_email_acceptance_expired_verification_not_expired_before_unsuperseded_rejection');
  }
  assertAtOrAfter(expired.acceptedAt, evidence.candidate.stagedAt, 'real_email_acceptance_expired_verification_before_candidate_stage');
  if (deliveredAt < acceptedAt) throw new Error('real_email_acceptance_expired_verification_delivery_before_acceptance');
  if (deliveredAt > attemptedAt) throw new Error('real_email_acceptance_expired_verification_attempt_before_delivery');
  if (rejectedAt < attemptedAt) throw new Error('real_email_acceptance_expired_verification_rejection_before_attempt');
  assertObject(expired.mailboxReceipt, 'real_email_acceptance_expired_verification_mailbox_receipt_missing');
  assertOnlyKeys(expired.mailboxReceipt, ['source', 'provider', 'observedAt'], 'real_email_acceptance_expired_verification_mailbox_receipt_unknown_field');
  if (expired.mailboxReceipt.source !== 'protected_human_expired_link_open'
    || !['google', 'microsoft'].includes(expired.mailboxReceipt.provider)) {
    throw new Error('real_email_acceptance_expired_verification_mailbox_receipt_source_invalid');
  }
  const openedAt = timestamp(expired.mailboxReceipt.observedAt, 'real_email_acceptance_expired_verification_mailbox_receipt_at_invalid');
  if (openedAt < deliveredAt || openedAt > attemptedAt) throw new Error('real_email_acceptance_expired_verification_mailbox_receipt_order_invalid');
}

function validateResendCooldown(resend, expired) {
  const cooldown = resend.cooldown;
  assertObject(cooldown, 'real_email_acceptance_resend_cooldown_missing');
  assertOnlyKeys(cooldown, ['source', 'requestedAt', 'retryAfterSeconds', 'responseStatus', 'outboxDelta'], 'real_email_acceptance_resend_cooldown_unknown_field');
  if (cooldown.source !== 'candidate_api_resend_cooldown_observation') throw new Error('real_email_acceptance_resend_cooldown_source_invalid');
  timestamp(cooldown.requestedAt, 'real_email_acceptance_resend_cooldown_requested_at_invalid');
  if (!Number.isInteger(cooldown.retryAfterSeconds) || cooldown.retryAfterSeconds < 1 || cooldown.retryAfterSeconds > 30
    || cooldown.responseStatus !== 202 || cooldown.outboxDelta !== 0) {
    throw new Error('real_email_acceptance_resend_cooldown_observation_invalid');
  }
  assertAtOrAfter(cooldown.requestedAt, expired.rejectedAt, 'real_email_acceptance_resend_cooldown_before_expired_rejection');
  assertAtOrAfter(cooldown.requestedAt, resend.previousChallenge.supersededAt, 'real_email_acceptance_resend_cooldown_before_initial_resend');
  const latestChallengeAt = timestamp(resend.challenge.createdAt, 'real_email_acceptance_resend_challenge_created_at_invalid');
  if (latestChallengeAt < timestamp(cooldown.requestedAt, 'real_email_acceptance_resend_cooldown_requested_at_invalid') + cooldown.retryAfterSeconds * 1000) {
    throw new Error('real_email_acceptance_resend_before_cooldown_elapsed');
  }
}

function validateAccountSwitch(evidence) {
  const accountSwitch = evidence.accountSwitch;
  assertObject(accountSwitch, 'real_email_acceptance_account_switch_missing');
  const timeFields = [
    'primaryLoginAt', 'secondaryLoginAt', 'primaryAfterSecondaryLoginAt', 'secondaryLogoutAt',
    'secondaryRejectedAt', 'primaryAfterSecondaryLogoutAt', 'primaryLogoutAt', 'primaryRejectedAt',
  ];
  assertOnlyKeys(accountSwitch, [
    'source', 'completedAt', 'primaryAccountRef', 'secondaryAccountRef', ...timeFields,
    'distinctSubjects', 'primarySessionRetainedAfterSecondaryLogin', 'primarySessionRetainedAfterSecondaryLogout',
    'secondarySessionRevoked', 'primarySessionRevoked',
  ], 'real_email_acceptance_account_switch_unknown_field');
  if (accountSwitch.source !== 'candidate_api_session_identity_observation') throw new Error('real_email_acceptance_account_switch_source_invalid');
  identifier(accountSwitch.primaryAccountRef, 'real_email_acceptance_account_switch_primary_ref_invalid', { uuid: true });
  identifier(accountSwitch.secondaryAccountRef, 'real_email_acceptance_account_switch_secondary_ref_invalid', { uuid: true });
  if (accountSwitch.primaryAccountRef === accountSwitch.secondaryAccountRef) throw new Error('real_email_acceptance_account_switch_subjects_not_distinct');
  if (accountSwitch.distinctSubjects !== true || accountSwitch.primarySessionRetainedAfterSecondaryLogin !== true
    || accountSwitch.primarySessionRetainedAfterSecondaryLogout !== true || accountSwitch.secondarySessionRevoked !== true
    || accountSwitch.primarySessionRevoked !== true) throw new Error('real_email_acceptance_account_switch_outcome_invalid');
  const times = Object.fromEntries(timeFields.map((key) => [key, timestamp(accountSwitch[key], `real_email_acceptance_account_switch_${key}_invalid`)]));
  const completedAt = timestamp(accountSwitch.completedAt, 'real_email_acceptance_account_switch_completed_at_invalid');
  if (times.secondaryLoginAt < times.primaryLoginAt
    || times.primaryAfterSecondaryLoginAt < times.secondaryLoginAt
    || times.secondaryLogoutAt < times.secondaryLoginAt
    || times.secondaryRejectedAt < times.secondaryLogoutAt
    || times.primaryAfterSecondaryLogoutAt < times.secondaryLogoutAt
    || times.primaryLogoutAt < times.primaryAfterSecondaryLogoutAt
    || times.primaryRejectedAt < times.primaryLogoutAt
    || completedAt < times.primaryRejectedAt) throw new Error('real_email_acceptance_account_switch_chronology_invalid');
}

function validateLifecycleSubscription(evidence) {
  assertObject(evidence.lifecycleSubscription, 'real_email_acceptance_lifecycle_subscription_missing');
  assertOnlyKeys(evidence.lifecycleSubscription, ['source', 'domain', 'status', 'events', 'observedAt'], 'real_email_acceptance_lifecycle_subscription_unknown_field');
  if (evidence.lifecycleSubscription.source !== 'cloudflare_email_sending_queue_subscription_observation') {
    throw new Error('real_email_acceptance_lifecycle_subscription_source_invalid');
  }
  if (evidence.lifecycleSubscription.domain !== 'mail.lythaus.co') {
    throw new Error('real_email_acceptance_lifecycle_subscription_domain_invalid');
  }
  if (evidence.lifecycleSubscription.status !== 'enabled') {
    throw new Error('real_email_acceptance_lifecycle_subscription_not_enabled');
  }
  if (!Array.isArray(evidence.lifecycleSubscription.events)
    || evidence.lifecycleSubscription.events.length !== REQUIRED_LIFECYCLE_EVENTS.length
    || new Set(evidence.lifecycleSubscription.events).size !== REQUIRED_LIFECYCLE_EVENTS.length
    || REQUIRED_LIFECYCLE_EVENTS.some((event) => !evidence.lifecycleSubscription.events.includes(event))) {
    throw new Error('real_email_acceptance_lifecycle_subscription_events_invalid');
  }
  timestamp(evidence.lifecycleSubscription.observedAt, 'real_email_acceptance_lifecycle_subscription_observed_at_invalid');
  assertAtOrAfter(
    evidence.lifecycleSubscription.observedAt,
    evidence.candidate.stagedAt,
    'real_email_acceptance_lifecycle_subscription_before_candidate_stage',
  );
}

function validateCompleteEvidence(evidence, releaseSha) {
  if (evidence.candidateDependencies === undefined) throw new Error('real_email_acceptance_candidate_dependencies_missing');
  validateCandidateDependencies(evidence.candidateDependencies, evidence.candidate, undefined, releaseSha);
  validateInitialAndAccount(evidence);
  if (evidence.turnstile.status !== 'verified') throw new Error('real_email_acceptance_turnstile_not_verified');
  validateLifecycleSubscription(evidence);
  validateOutboxSummary(evidence);
  for (const flowName of FLOW_NAMES) validateDelivery(evidence[flowName], flowName);
  validateExpiredVerification(evidence);
  validateAccountSwitch(evidence);
  assertObject(evidence.login, 'real_email_acceptance_login_missing');
  assertOnlyKeys(evidence.login, ['completedAt'], 'real_email_acceptance_login_unknown_field');
  timestamp(evidence.login.completedAt, 'real_email_acceptance_login_completed_at_invalid');
  assertObject(evidence.refresh, 'real_email_acceptance_refresh_missing');
  assertOnlyKeys(evidence.refresh, ['completedAt'], 'real_email_acceptance_refresh_unknown_field');
  timestamp(evidence.refresh.completedAt, 'real_email_acceptance_refresh_completed_at_invalid');
  assertObject(evidence.logout, 'real_email_acceptance_logout_missing');
  assertOnlyKeys(evidence.logout, ['completedAt'], 'real_email_acceptance_logout_unknown_field');
  timestamp(evidence.logout.completedAt, 'real_email_acceptance_logout_completed_at_invalid');

  assertAtOrAfter(evidence.acceptanceAccount.createdAt, evidence.candidate.stagedAt, 'real_email_acceptance_account_before_candidate_stage');
  assertAtOrAfter(evidence.turnstile.observedAt, evidence.candidate.stagedAt, 'real_email_acceptance_turnstile_before_candidate_stage');
  assertAtOrAfter(evidence.initialVerification.requestedAt, evidence.candidate.stagedAt, 'real_email_acceptance_initial_request_before_candidate_stage');
  if (evidence.resendVerification.fixtureCreatedAt === undefined) throw new Error('real_email_acceptance_resend_fixture_missing');
  assertAtOrAfter(evidence.resendVerification.fixtureCreatedAt, evidence.candidate.stagedAt, 'real_email_acceptance_resend_fixture_before_candidate_stage');
  assertAtOrAfter(evidence.passwordReset.requestedAt, evidence.candidate.stagedAt, 'real_email_acceptance_reset_request_before_candidate_stage');
  assertAtOrAfter(evidence.initialVerification.requestedAt, evidence.acceptanceAccount.createdAt, 'real_email_acceptance_signup_before_account');
  assertAtOrAfter(evidence.login.completedAt, evidence.initialVerification.verification.completedAt, 'real_email_acceptance_login_before_verification');
  assertAtOrAfter(evidence.refresh.completedAt, evidence.login.completedAt, 'real_email_acceptance_refresh_before_login');
  assertAtOrAfter(evidence.logout.completedAt, evidence.refresh.completedAt, 'real_email_acceptance_logout_before_refresh');
  assertAtOrAfter(evidence.passwordReset.requestedAt, evidence.login.completedAt, 'real_email_acceptance_reset_request_before_login');

  const initialOutbox = evidence.initialVerification.outbox;
  const resendOutbox = evidence.resendVerification.outbox;
  const resetOutbox = evidence.passwordReset.outbox;
  if (new Set([initialOutbox.id, resendOutbox.id, resetOutbox.id]).size !== 3) throw new Error('real_email_acceptance_outbox_ids_not_distinct');
  if (new Set([initialOutbox.providerMessageId, resendOutbox.providerMessageId, resetOutbox.providerMessageId]).size !== 3) throw new Error('real_email_acceptance_provider_message_ids_not_distinct');
  if (initialOutbox.purpose !== 'verification' || resendOutbox.purpose !== 'verification' || resetOutbox.purpose !== 'password_reset') throw new Error('real_email_acceptance_outbox_purpose_mismatch');

  const resend = evidence.resendVerification;
  assertObject(resend.previousChallenge, 'real_email_acceptance_resend_previous_challenge_missing');
  assertOnlyKeys(resend.previousChallenge, ['id', 'createdAt', 'expiresAt', 'supersededAt'], 'real_email_acceptance_resend_previous_challenge_unknown_field');
  identifier(resend.previousChallenge.id, 'real_email_acceptance_resend_previous_challenge_id_invalid', { uuid: true });
  timestamp(resend.previousChallenge.createdAt, 'real_email_acceptance_resend_previous_challenge_created_at_invalid');
  timestamp(resend.previousChallenge.expiresAt, 'real_email_acceptance_resend_previous_challenge_expires_at_invalid');
  timestamp(resend.previousChallenge.supersededAt, 'real_email_acceptance_resend_previous_challenge_superseded_at_invalid');
  if (resend.previousChallenge.id === resend.challenge.id || resend.previousChallenge.id !== evidence.expiredVerification.challengeId) {
    throw new Error('real_email_acceptance_resend_challenges_not_distinct');
  }
  if (resend.previousChallenge.createdAt !== evidence.expiredVerification.createdAt
    || resend.previousChallenge.expiresAt !== evidence.expiredVerification.expiresAt
    || resend.previousChallenge.supersededAt !== evidence.expiredVerification.supersededAt) {
    throw new Error('real_email_acceptance_resend_expired_fixture_mismatch');
  }
  assertAtOrAfter(resend.requestedAt, resend.previousChallenge.supersededAt, 'real_email_acceptance_resend_supersede_before_request');
  assertAtOrAfter(resend.challenge.createdAt, resend.previousChallenge.supersededAt, 'real_email_acceptance_resend_new_challenge_before_supersede');
  assertAtOrAfter(resend.replay.attemptedAt, resend.challenge.createdAt, 'real_email_acceptance_resend_old_replay_before_new_challenge');
  validateResendCooldown(resend, evidence.expiredVerification);

  const reset = evidence.passwordReset;
  assertObject(reset.reset, 'real_email_acceptance_password_reset_missing');
  assertOnlyKeys(reset.reset, ['completedAt', 'consumedAt', 'replayAttemptedAt', 'replayRejectedAt', 'sessionsRevokedAt', 'oldPasswordRejectedAt', 'newPasswordAcceptedAt'], 'real_email_acceptance_password_reset_unknown_field');
  for (const key of ['completedAt', 'consumedAt', 'replayAttemptedAt', 'replayRejectedAt', 'sessionsRevokedAt', 'oldPasswordRejectedAt', 'newPasswordAcceptedAt']) {
    timestamp(reset.reset[key], `real_email_acceptance_password_reset_${key}_invalid`);
  }
  assertAtOrAfter(reset.reset.completedAt, reset.outbox.lifecycle.occurredAt, 'real_email_acceptance_password_reset_before_delivery');
  assertAtOrAfter(reset.reset.consumedAt, reset.reset.completedAt, 'real_email_acceptance_password_reset_consumed_before_completion');
  assertAtOrAfter(reset.reset.sessionsRevokedAt, reset.reset.completedAt, 'real_email_acceptance_password_reset_sessions_before_completion');
  assertAtOrAfter(reset.reset.replayAttemptedAt, reset.reset.completedAt, 'real_email_acceptance_password_reset_replay_before_completion');
  assertAtOrAfter(reset.reset.replayRejectedAt, reset.reset.replayAttemptedAt, 'real_email_acceptance_password_reset_replay_rejection_before_attempt');
  assertAtOrAfter(reset.reset.oldPasswordRejectedAt, reset.reset.completedAt, 'real_email_acceptance_password_reset_old_password_before_completion');
  assertAtOrAfter(reset.reset.newPasswordAcceptedAt, reset.reset.completedAt, 'real_email_acceptance_password_reset_new_password_before_completion');
  assertAtOrAfter(evidence.accountSwitch.completedAt, reset.reset.completedAt, 'real_email_acceptance_account_switch_before_reset');
  assertAtOrAfter(evidence.logout.completedAt, evidence.accountSwitch.completedAt, 'real_email_acceptance_logout_before_account_switch');
}

export function parseRealEmailAcceptanceEvidence(value, releaseSha, expectedCandidate = {}) {
  let evidence = value;
  if (typeof value === 'string') {
    try { evidence = JSON.parse(value); } catch { throw new Error('real_email_acceptance_evidence_invalid'); }
  }
  assertObject(evidence, 'real_email_acceptance_evidence_invalid');
  assertOnlyKeys(evidence, [
    'formatVersion', 'source', 'status', 'reason', 'releaseSha', 'acceptanceRunId', 'candidate',
    'candidateDependencies',
    'lifecycleSubscription', 'outboxSummary', 'mailboxProviders',
    'acceptanceAccount', 'turnstile', 'initialVerification', 'resendVerification', 'passwordReset',
    'expiredVerification', 'accountSwitch', 'login', 'refresh', 'logout',
  ], 'real_email_acceptance_evidence_unknown_field');
  if (evidence.formatVersion !== FORMAT_VERSION) throw new Error('real_email_acceptance_evidence_version_invalid');
  if (evidence.source !== 'runtime_observation') throw new Error('real_email_acceptance_evidence_source_invalid');
  if (!['PASSED', 'HUMAN_ACCEPTANCE_REQUIRED', 'BLOCKED'].includes(evidence.status)) throw new Error('real_email_acceptance_evidence_status_invalid');
  if (typeof evidence.releaseSha !== 'string' || evidence.releaseSha !== releaseSha) throw new Error('real_email_acceptance_release_sha_mismatch');
  identifier(evidence.acceptanceRunId, 'real_email_acceptance_run_id_invalid', { uuid: true });
  validateCandidate(evidence.candidate, releaseSha, expectedCandidate);
  if (expectedCandidate.candidateDependencies !== undefined && evidence.candidateDependencies === undefined) {
    throw new Error('real_email_acceptance_candidate_dependencies_missing');
  }
  if (evidence.candidateDependencies !== undefined) {
    validateCandidateDependencies(evidence.candidateDependencies, evidence.candidate, expectedCandidate.candidateDependencies, releaseSha);
  }

  if (evidence.status === 'HUMAN_ACCEPTANCE_REQUIRED') {
    if (typeof evidence.reason !== 'string' || !/^[a-z0-9_:-]{3,120}$/u.test(evidence.reason)) throw new Error('real_email_acceptance_human_reason_invalid');
    return evidence;
  }
  if (evidence.status === 'BLOCKED') {
    if (typeof evidence.reason !== 'string' || !/^[a-z0-9_:-]{3,120}$/u.test(evidence.reason)) throw new Error('real_email_acceptance_blocked_reason_invalid');
    return evidence;
  }
  if (evidence.reason !== undefined) throw new Error('real_email_acceptance_pass_reason_forbidden');
  validateCompleteEvidence(evidence, releaseSha);
  assertObject(evidence.mailboxProviders, 'real_email_acceptance_mailbox_providers_missing');
  assertOnlyKeys(evidence.mailboxProviders, ['source', 'initial', 'resend', 'observedAt'], 'real_email_acceptance_mailbox_providers_unknown_field');
  const mailboxes = evidence.mailboxProviders;
  if (mailboxes.source !== 'dns_mx_observation' || !['google', 'microsoft'].includes(mailboxes.initial)
    || !['google', 'microsoft'].includes(mailboxes.resend) || mailboxes.initial === mailboxes.resend) throw new Error('real_email_acceptance_independent_mailbox_providers_required');
  assertAtOrAfter(mailboxes.observedAt, evidence.candidate.stagedAt, 'real_email_acceptance_mailbox_observation_before_candidate');
  if (evidence.initialVerification.mailboxReceipt.provider !== mailboxes.initial
    || evidence.resendVerification.mailboxReceipt.provider !== mailboxes.resend
    || evidence.passwordReset.mailboxReceipt.provider !== mailboxes.initial
    || evidence.expiredVerification.mailboxReceipt.provider !== mailboxes.resend) {
    throw new Error('real_email_acceptance_mailbox_receipt_provider_mismatch');
  }
  return evidence;
}

export { FORMAT_VERSION as REAL_EMAIL_ACCEPTANCE_FORMAT_VERSION };
