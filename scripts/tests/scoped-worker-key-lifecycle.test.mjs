import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCEPTANCE_STATE_KEY, BOOTSTRAP_LEDGER_COUNT_SQL, TRANSACTIONAL_EMAIL_KEY, assertBootstrapLedgerPreconditions, buildScopedSecretPayloads, classifyScopedKeyBindings } from '../ci/prepare-scoped-worker-secrets.mjs';
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

test('Admin-only release validation leaves stable acceptance keys untouched', () => {
  const lifecycle = classifyScopedKeyBindings({
    publicNames: new Set([TRANSACTIONAL_EMAIL_KEY]),
    jobsNames: new Set([TRANSACTIONAL_EMAIL_KEY]),
    coordinatorManaged: false,
  });
  assert.equal(lifecycle.transactionalEmail.action, 'preserve');
  assert.equal(lifecycle.acceptanceState.action, 'reuse_not_touched');
  assert.doesNotThrow(() => verifyScopedWorkerSecretBindings({
    publicNames: new Set(['AUTH_PASSWORD_PEPPER_V1', 'JWT_PRIVATE_KEY', 'JWT_KEY_ID', 'JWT_PUBLIC_JWKS', 'PII_ENCRYPTION_KEY_V1', 'PII_HMAC_KEY_V1', TRANSACTIONAL_EMAIL_KEY]),
    adminNames: new Set(['ACCESS_SUBJECT_HMAC_KEY']),
    jobsNames: new Set([TRANSACTIONAL_EMAIL_KEY]),
    coordinatorManaged: false,
  }));
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

test('bootstrap ledger query uses only non-null aggregate-safe columns', () => {
  assert.match(BOOTSTRAP_LEDGER_COUNT_SQL, /count\(purpose\)/);
  assert.match(BOOTSTRAP_LEDGER_COUNT_SQL, /count\(created_at\)/);
  assert.doesNotMatch(BOOTSTRAP_LEDGER_COUNT_SQL, /count\(\*\)/);
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

test('lifecycle observer credentials are coordinator-only and optional for runtime Workers', () => {
  const base = { DATABASE_READINESS_TOKEN: 'readiness', CLOUDFLARE_ACCOUNT_ID: 'account' };
  const standard = buildScopedSecretPayloads({ base, turnstile: { TURNSTILE_SECRET_KEY: 'turnstile' }, coordinatorManaged: false });
  assert.equal(standard.publicSecrets.CLOUDFLARE_EMAIL_LIFECYCLE_READ_TOKEN, undefined);
  assert.equal(standard.jobsSecrets.CLOUDFLARE_EMAIL_LIFECYCLE_READ_TOKEN, undefined);
  assert.equal(standard.coordinatorSecrets.CLOUDFLARE_EMAIL_LIFECYCLE_READ_TOKEN, undefined);
  assert.throws(() => buildScopedSecretPayloads({ base: { ...base, CLOUDFLARE_EMAIL_LIFECYCLE_READ_TOKEN: 'observer-token' }, coordinatorManaged: false }), /must not be included in base runtime secret payload/);
  assert.throws(() => buildScopedSecretPayloads({ base, coordinatorManaged: true, acceptanceEmailBase: 'test@example.com' }), /CLOUDFLARE_EMAIL_LIFECYCLE_READ_TOKEN/);
  const critical = buildScopedSecretPayloads({
    base,
    coordinatorManaged: true,
    lifecycleReadToken: 'observer-token',
    acceptanceEmailBase: 'test@example.com',
  });
  assert.equal(critical.publicSecrets.CLOUDFLARE_EMAIL_LIFECYCLE_READ_TOKEN, undefined);
  assert.equal(critical.jobsSecrets.CLOUDFLARE_EMAIL_LIFECYCLE_READ_TOKEN, undefined);
  assert.equal(critical.coordinatorSecrets.CLOUDFLARE_EMAIL_LIFECYCLE_READ_TOKEN, 'observer-token');
  const workflow = fs.readFileSync('.github/workflows/native-workers-deploy.yml', 'utf8');
  assert.match(workflow, /AUTH_ACCEPTANCE_EMAIL_BASE: \$\{\{ contains\(steps\.release_plan\.outputs\.changed_components_json, '\"coordinator\"'\) && secrets\.CODEX_TEST_EMAIL/);
  assert.match(workflow, /CLOUDFLARE_EMAIL_LIFECYCLE_READ_TOKEN: \$\{\{ contains\(steps\.release_plan\.outputs\.changed_components_json, '\"coordinator\"'\) && secrets\.CLOUDFLARE_API_TOKEN/);
});

test('acceptance resume evidence requires preserved scoped keys and excludes values', () => {
  const source = fs.readFileSync('scripts/ci/write-scoped-worker-secret-evidence.mjs', 'utf8');
  assert.match(source, /acceptance resume requires the existing transactional email key to be preserved/);
  assert.match(source, /acceptance resume requires the existing acceptance state key to be preserved/);
  assert.match(source, /source: 'cloudflare_secret_binding_names_resume_reverification'/);
  assert.match(source, /secretValuesIncluded: false/);
});
