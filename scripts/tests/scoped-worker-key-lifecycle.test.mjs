import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCEPTANCE_STATE_KEY, TRANSACTIONAL_EMAIL_KEY, assertBootstrapLedgerPreconditions, classifyScopedKeyBindings } from '../ci/prepare-scoped-worker-secrets.mjs';
import { verifyScopedWorkerSecretBindings } from '../ci/verify-scoped-worker-secret-bindings.mjs';
import fs from 'node:fs';

const empty = () => new Set();

test('initial scoped-key bootstrap requires empty relevant ledgers', () => {
  const lifecycle = classifyScopedKeyBindings({ publicNames: empty(), jobsNames: empty(), coordinatorNames: empty() });
  assert.equal(lifecycle.transactionalEmail.action, 'bootstrap');
  assert.equal(lifecycle.acceptanceState.action, 'bootstrap');
  assert.doesNotThrow(() => assertBootstrapLedgerPreconditions({ transactionalEmailOutboxRows: 0, acceptanceRunRows: 0 }, lifecycle));
  assert.throws(() => assertBootstrapLedgerPreconditions({ transactionalEmailOutboxRows: 1, acceptanceRunRows: 0 }, lifecycle), /empty transactional email outbox/);
  assert.throws(() => assertBootstrapLedgerPreconditions({ transactionalEmailOutboxRows: 0, acceptanceRunRows: 1 }, lifecycle), /zero acceptance runs/);
});

test('ordinary releases preserve existing scoped keys and still require compatibility proof', () => {
  const lifecycle = classifyScopedKeyBindings({
    publicNames: new Set([TRANSACTIONAL_EMAIL_KEY]),
    jobsNames: new Set([TRANSACTIONAL_EMAIL_KEY]),
    coordinatorNames: new Set([ACCEPTANCE_STATE_KEY]),
  });
  assert.equal(lifecycle.transactionalEmail.action, 'preserve');
  assert.equal(lifecycle.transactionalEmail.compatibilityProbeRequired, true);
  assert.equal(lifecycle.acceptanceState.action, 'preserve');
});

test('one-sided transactional scoped-key state fails closed', () => {
  assert.throws(() => classifyScopedKeyBindings({
    publicNames: new Set([TRANSACTIONAL_EMAIL_KEY]),
    jobsNames: empty(),
    coordinatorNames: empty(),
  }), /state divergence/);
});

test('ordinary deployment path has no implicit scoped-key rotation mode', () => {
  const source = fs.readFileSync('scripts/ci/prepare-scoped-worker-secrets.mjs', 'utf8');
  assert.match(source, /SCOPED_KEY_ROTATION_REQUESTED/);
  assert.match(source, /dedicated reviewed rotation workflow/);
});

test('post-upload inventory proves least-privilege worker secret boundaries by name only', () => {
  const publicNames = new Set(['AUTH_PASSWORD_PEPPER_V1', 'JWT_PRIVATE_KEY', 'JWT_KEY_ID', 'JWT_PUBLIC_JWKS', 'PII_ENCRYPTION_KEY_V1', 'PII_HMAC_KEY_V1', TRANSACTIONAL_EMAIL_KEY]);
  const adminNames = new Set(['ACCESS_SUBJECT_HMAC_KEY']);
  const jobsNames = new Set([TRANSACTIONAL_EMAIL_KEY]);
  const coordinatorNames = new Set([ACCEPTANCE_STATE_KEY]);
  assert.doesNotThrow(() => verifyScopedWorkerSecretBindings({ publicNames, adminNames, jobsNames, coordinatorNames }));
  assert.throws(() => verifyScopedWorkerSecretBindings({ publicNames, adminNames, jobsNames: new Set(['PII_ENCRYPTION_KEY_V1', TRANSACTIONAL_EMAIL_KEY]), coordinatorNames }), /Jobs must not/);
  assert.throws(() => verifyScopedWorkerSecretBindings({ publicNames, adminNames, jobsNames, coordinatorNames: new Set([ACCEPTANCE_STATE_KEY, 'ACCESS_SUBJECT_HMAC_KEY']) }), /acceptance coordinator must not/);
});
