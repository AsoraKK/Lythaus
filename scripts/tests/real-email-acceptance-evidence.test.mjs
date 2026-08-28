import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseRealEmailAcceptanceEvidence,
  REAL_EMAIL_ACCEPTANCE_FORMAT_VERSION,
} from '../ci/real-email-acceptance-evidence.mjs';

const releaseSha = 'a'.repeat(40);

function validEvidence() {
  return JSON.stringify({
    formatVersion: REAL_EMAIL_ACCEPTANCE_FORMAT_VERSION,
    releaseSha,
    mailbox: {
      provider: 'gmail',
      observedAt: '2026-08-29T10:00:00.000Z',
      messageDigests: {
        signup: '1'.repeat(64),
        verification: '2'.repeat(64),
        passwordReset: '3'.repeat(64),
        resendVerification: '4'.repeat(64),
      },
    },
    freshSignup: { requested: true, providerAccepted: true, messageObserved: true },
    verification: { completed: true, replayRejected: true },
    passwordReset: {
      requested: true,
      messageObserved: true,
      completed: true,
      replayRejected: true,
      oldPasswordRejected: true,
      newPasswordAccepted: true,
      sessionsRevoked: true,
    },
    resendVerification: { requested: true, messageObserved: true, completed: true },
  });
}

test('real email acceptance evidence accepts complete sanitized proof', () => {
  const evidence = parseRealEmailAcceptanceEvidence(validEvidence(), releaseSha);
  assert.equal(evidence.releaseSha, releaseSha);
  assert.equal(evidence.mailbox.provider, 'gmail');
});

test('real email acceptance evidence rejects missing or mismatched proof', () => {
  assert.throws(
    () => parseRealEmailAcceptanceEvidence('', releaseSha),
    /real_email_acceptance_evidence_required/,
  );
  assert.throws(
    () => parseRealEmailAcceptanceEvidence(validEvidence(), 'b'.repeat(40)),
    /real_email_acceptance_release_sha_mismatch/,
  );
  const incomplete = JSON.parse(validEvidence());
  incomplete.passwordReset.replayRejected = false;
  assert.throws(
    () => parseRealEmailAcceptanceEvidence(JSON.stringify(incomplete), releaseSha),
    /real_email_acceptance_passwordReset_replayRejected_missing/,
  );
});

test('real email acceptance evidence rejects account identifiers, links, and unknown fields', () => {
  const withPii = JSON.parse(validEvidence());
  withPii.mailbox.note = 'unexpected';
  assert.throws(
    () => parseRealEmailAcceptanceEvidence(JSON.stringify(withPii), releaseSha),
    /real_email_acceptance_mailbox_unknown_field/,
  );

  const withEmail = JSON.parse(validEvidence());
  withEmail.mailbox.provider = 'gmail user@example.test';
  assert.throws(
    () => parseRealEmailAcceptanceEvidence(JSON.stringify(withEmail), releaseSha),
    /real_email_acceptance_mailbox_provider_invalid/,
  );

  const withLink = JSON.parse(validEvidence());
  withLink.mailbox.observedAt = 'https://example.test/reset';
  assert.throws(
    () => parseRealEmailAcceptanceEvidence(JSON.stringify(withLink), releaseSha),
    /real_email_acceptance_mailbox_timestamp_invalid/,
  );
});
