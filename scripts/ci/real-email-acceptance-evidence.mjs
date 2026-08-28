const FORMAT_VERSION = 'lythaus-real-email-acceptance-v1';

const requiredBooleanFields = {
  freshSignup: ['requested', 'providerAccepted', 'messageObserved'],
  verification: ['completed', 'replayRejected'],
  passwordReset: ['requested', 'messageObserved', 'completed', 'replayRejected', 'oldPasswordRejected', 'newPasswordAccepted', 'sessionsRevoked'],
  resendVerification: ['requested', 'messageObserved', 'completed'],
};

function assertObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
}

function assertOnlyKeys(value, keys, code) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(code);
  }
}

export function parseRealEmailAcceptanceEvidence(value, releaseSha) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('real_email_acceptance_evidence_required');
  let evidence;
  try { evidence = JSON.parse(value); } catch { throw new Error('real_email_acceptance_evidence_invalid'); }
  assertObject(evidence, 'real_email_acceptance_evidence_invalid');
  assertOnlyKeys(evidence, ['formatVersion', 'releaseSha', 'mailbox', ...Object.keys(requiredBooleanFields)], 'real_email_acceptance_evidence_unknown_field');
  if (evidence.formatVersion !== FORMAT_VERSION) throw new Error('real_email_acceptance_evidence_version_invalid');
  if (evidence.releaseSha !== releaseSha) throw new Error('real_email_acceptance_release_sha_mismatch');

  assertObject(evidence.mailbox, 'real_email_acceptance_mailbox_missing');
  assertOnlyKeys(evidence.mailbox, ['provider', 'observedAt', 'messageDigests'], 'real_email_acceptance_mailbox_unknown_field');
  if (evidence.mailbox.provider !== 'gmail') throw new Error('real_email_acceptance_mailbox_provider_invalid');
  if (typeof evidence.mailbox.observedAt !== 'string' || Number.isNaN(Date.parse(evidence.mailbox.observedAt))) {
    throw new Error('real_email_acceptance_mailbox_timestamp_invalid');
  }
  assertObject(evidence.mailbox.messageDigests, 'real_email_acceptance_message_digests_missing');
  assertOnlyKeys(evidence.mailbox.messageDigests, ['signup', 'verification', 'passwordReset', 'resendVerification'], 'real_email_acceptance_message_digest_unknown_field');
  for (const key of ['signup', 'verification', 'passwordReset', 'resendVerification']) {
    if (typeof evidence.mailbox.messageDigests[key] !== 'string' || !/^[0-9a-f]{64}$/u.test(evidence.mailbox.messageDigests[key])) {
      throw new Error(`real_email_acceptance_${key}_digest_invalid`);
    }
  }

  for (const [section, fields] of Object.entries(requiredBooleanFields)) {
    assertObject(evidence[section], `real_email_acceptance_${section}_missing`);
    assertOnlyKeys(evidence[section], fields, `real_email_acceptance_${section}_unknown_field`);
    for (const field of fields) {
      if (evidence[section][field] !== true) throw new Error(`real_email_acceptance_${section}_${field}_missing`);
    }
  }

  const serialized = JSON.stringify(evidence).toLowerCase();
  if (serialized.includes('@') || serialized.includes('http://') || serialized.includes('https://')) {
    throw new Error('real_email_acceptance_evidence_contains_pii_or_link');
  }
  return evidence;
}

export { FORMAT_VERSION as REAL_EMAIL_ACCEPTANCE_FORMAT_VERSION };
