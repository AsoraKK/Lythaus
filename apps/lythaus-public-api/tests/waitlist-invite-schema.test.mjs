import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const schema = fs.readFileSync(new URL('../../../database/planetscale/proposals/2026-11-02-alpha-waitlist-invites.sql', import.meta.url), 'utf8');
const dispatch = fs.readFileSync(new URL('../src/email-envelope-entrypoint.ts', import.meta.url), 'utf8');
const jobsRuntime = fs.readFileSync(new URL('../../lythaus-jobs/src/transactional-email-runtime.ts', import.meta.url), 'utf8');
const grants = fs.readFileSync(new URL('../../../database/planetscale/grants/roles.sql', import.meta.url), 'utf8');
const authJourney = fs.readFileSync(new URL('./auth-journey.postgres.mjs', import.meta.url), 'utf8');
const pgRunner = fs.readFileSync(new URL('../../../scripts/ci/run-alpha-waitlist-invite-proposal-pg17.mjs', import.meta.url), 'utf8');
const cleanupRegression = fs.readFileSync(new URL('../../../scripts/tests/alpha-waitlist-invite-cleanup.postgres.mjs', import.meta.url), 'utf8');
const nativeWorkflow = fs.readFileSync(new URL('../../../.github/workflows/native-planetscale-ci.yml', import.meta.url), 'utf8');

test('native PostgreSQL CI runs the invite proposal fixture for every relevant source change', () => {
  const pathsStart = nativeWorkflow.indexOf('  pull_request:\n    paths:\n');
  const pathsEnd = nativeWorkflow.indexOf('\n\npermissions:', pathsStart);
  assert.notEqual(pathsStart, -1, 'native PostgreSQL CI has a pull_request path filter');
  assert.ok(pathsEnd > pathsStart, 'the pull_request path filter is bounded before job configuration');
  const pathFilter = nativeWorkflow.slice(pathsStart, pathsEnd);
  for (const path of [
    'database/planetscale/**',
    'apps/lythaus-public-api/tests/auth-journey.postgres.mjs',
    'apps/lythaus-public-api/tests/waitlist-invite-schema.test.mjs',
    'scripts/ci/run-alpha-waitlist-invite-proposal-pg17.mjs',
    'scripts/tests/alpha-waitlist-invite-proposal.postgres.mjs',
    'scripts/tests/alpha-waitlist-invite-cleanup.postgres.mjs',
  ]) {
    assert.ok(pathFilter.includes(`- '${path}'`), `native PostgreSQL CI path filter includes ${path}`);
  }

  const sourceContractStep = nativeWorkflow.slice(
    nativeWorkflow.indexOf('- name: Enforce alpha waitlist invite CI source contract'),
    nativeWorkflow.indexOf('- name:', nativeWorkflow.indexOf('- name: Enforce alpha waitlist invite CI source contract') + 1),
  );
  assert.ok(sourceContractStep.includes('node --test apps/lythaus-public-api/tests/waitlist-invite-schema.test.mjs'));
  assert.ok(nativeWorkflow.indexOf('- name: Validate repository contracts') < nativeWorkflow.indexOf('- name: Enforce alpha waitlist invite CI source contract'));

  const proposalStepStart = nativeWorkflow.indexOf('- name: Exercise alpha waitlist invite proposal on isolated PostgreSQL 17');
  const proposalStepEnd = nativeWorkflow.indexOf('- name:', proposalStepStart + 1);
  assert.ok(proposalStepStart >= 0, 'native PostgreSQL CI runs the invite proposal fixture');
  const proposalStep = nativeWorkflow.slice(proposalStepStart, proposalStepEnd);
  assert.ok(proposalStep.includes('PLANETSCALE_PG17_TEST_DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/postgres'));
  assert.doesNotMatch(proposalStep, /postgresql:\/\/postgres:postgres@127\.0\.0\.1:5432\/postgres\?/);
  assert.equal(
    proposalStep.match(/^\s*run: (.+)$/m)?.[1],
    'node --experimental-strip-types --experimental-test-module-mocks scripts/ci/run-alpha-waitlist-invite-proposal-pg17.mjs --http-only',
  );
  assert.ok(pgRunner.includes("const baselineOnly = args[0] === '--baseline-only';"));
  assert.ok(pgRunner.includes("if (!baselineOnly) {"), 'the invite proposal suite runs in the CI runner mode');
  assert.ok(pgRunner.includes('scripts/tests/alpha-waitlist-invite-proposal.postgres.mjs'));
  assert.match(pgRunner, /if \(!baselineOnly\) \{\s*await run\(\[[\s\S]*?'scripts\/tests\/alpha-waitlist-invite-proposal\.postgres\.mjs'\], localUrl\);\s*\}/);
  assert.ok(pgRunner.includes("if (args[0] === '--http-only') authArgs.push('--test-name-pattern=disposable PostgreSQL plus the actual HTTP verification handler');"));

  const baselineStepStart = nativeWorkflow.indexOf('- name: Apply and verify complete PostgreSQL 17 baseline');
  assert.ok(baselineStepStart > proposalStepStart, 'the isolated invite fixture runs before the shared baseline check');
});

test('accepted invitation remains eligible for its email-bound verification', () => {
  const verifier = schema.match(/CREATE OR REPLACE FUNCTION marketing\.lock_waitlist_invite_for_verification\([\s\S]*?\n\$\$;/)?.[0];
  const accepted = schema.match(/CREATE OR REPLACE FUNCTION marketing\.sync_waitlist_invite_outbox_state\(\)[\s\S]*?\n\$\$;/)?.[0];
  assert.ok(verifier, 'verification lock function is present');
  assert.ok(accepted, 'accepted-delivery trigger function is present');
  assert.match(accepted, /SET status = 'invited'/);
  assert.match(verifier, /w\.status IN \('waiting', 'invited'\)/);
  assert.doesNotMatch(verifier, /w\.status\s*=\s*'waiting'/);
});

test('waitlist invite identifiers are generated by the application as UUIDv7', () => {
  const binder = schema.match(/CREATE OR REPLACE FUNCTION marketing\.bind_waitlist_invite\([\s\S]*?\n\$\$;/)?.[0];
  assert.ok(binder, 'invite binding function is present');
  assert.match(binder, /p_invite_id uuid/);
  assert.match(binder, /VALUES \(p_invite_id,/);
  assert.doesNotMatch(binder, /gen_random_uuid\(\)|uuid_generate_v7\(/);
  assert.match(schema, /FUNCTION marketing\.bind_waitlist_invite\(uuid, uuid, uuid, uuid, bytea, uuid, uuid\)/);
  assert.match(dispatch, /bind_waitlist_invite\(\$1, \$2, \$3, \$4, decode\(\$5, 'base64'\), \$6, \$7\)/);
  assert.match(dispatch, /input\.actorId,\s*uuidv7\(\)\]\)/);
});

test('migration role has only the primary-key references needed for the invite schema', () => {
  assert.match(grants, /GRANT REFERENCES \(id\) ON TABLE marketing\.waitlist_signups,\s*identity\.users,\s*identity\.email_verification_tokens,\s*system\.transactional_email_outbox\s+TO lythaus_migrations;/);
  assert.doesNotMatch(grants, /GRANT REFERENCES ON TABLE marketing\.waitlist_signups TO lythaus_migrations/);
  assert.match(grants, /GRANT TRIGGER ON TABLE marketing\.waitlist_signups,\s*identity\.users,\s*system\.transactional_email_outbox\s+TO lythaus_migrations;/);
  assert.doesNotMatch(grants, /GRANT (?:SELECT|INSERT|UPDATE|DELETE) ON TABLE identity\.users TO lythaus_migrations/);
  assert.match(schema, /CREATE ROLE|Provision lythaus_waitlist_invite_function_owner/);
  assert.match(schema, /requires staged CREATE on marketing/);
  assert.match(schema, /GRANT SELECT \(waitlist_id, created_at, revoked_at, redeemed_at\)[\s\S]*?TO lythaus_admin/);
  assert.doesNotMatch(schema, /GRANT SELECT ON marketing\.waitlist_invites TO lythaus_admin/);
  assert.match(schema, /REVOKE ALL ON FUNCTION[\s\S]*?marketing\.revoke_waitlist_invites\(uuid\)[\s\S]*?FROM PUBLIC/);
  assert.match(schema, /ALTER FUNCTION marketing\.waitlist_invite_eligible\(uuid, bytea\) OWNER TO lythaus_waitlist_invite_function_owner/);
  assert.match(grants, /GRANT SELECT \(id, status\), UPDATE \(id\) ON identity\.users TO lythaus_waitlist_invite_function_owner/);
});

test('the disposable PostgreSQL auth journey exercises the actual invite verification HTTP route', () => {
  assert.match(authJourney, /handleEmailEnvelope\(new Request\('https:\/\/api\.lythaus\.test\/keeper-email'/);
  assert.match(authJourney, /request\('email\/verify', \{ token, email, password \}\)/);
  assert.match(authJourney, /wrongEmail = await request\('email\/verify'/);
  assert.match(authJourney, /invite_redeemed/);
});

test('the disposable invite runner restores control-database grants and distinguishes test from cleanup results', () => {
  assert.match(pgRunner, /cleanupErrors\.push\('database'\)/);
  assert.match(grants, /GRANT CONNECT ON DATABASE postgres TO lythaus_runtime, lythaus_admin, lythaus_jobs, lythaus_privacy, lythaus_migrations/);
  assert.match(pgRunner, /async function databaseAclSnapshot\(client\)/);
  assert.match(pgRunner, /acl_entry\.privilege_type IN \('CONNECT', 'CREATE'\)/);
  assert.match(pgRunner, /async function restoreDatabaseAcl\(client, before\)/);
  assert.match(pgRunner, /WITH GRANT OPTION/);
  assert.match(pgRunner, /databaseAclBefore = await databaseAclSnapshot\(control\)/);
  assert.match(pgRunner, /await restoreDatabaseAcl\(control, databaseAclBefore\)/);
  assert.match(pgRunner, /ownerMembershipGranted && rolesAfter\.has\(owner\)/);
  assert.match(pgRunner, /ownerMembershipGranted = true/);
  assert.doesNotMatch(pgRunner, /if \(rolesAfter\.has\(owner\) && rolesAfter\.has\('lythaus_migrations'\)\)/);
  assert.match(pgRunner, /if \(rolesBefore\.has\(role\)\) continue;[\s\S]*?rolesCreatedByFixture\.add\(role\)/);
  assert.match(pgRunner, /rolesCreatedByFixture\.add\(owner\)/);
  assert.doesNotMatch(pgRunner, /for \(const role of rolesAfter\)[\s\S]*?rolesCreatedByFixture\.add\(role\)/);
  assert.match(pgRunner, /LYTHAUS_INVITE_PG17_TEST_FAIL_AFTER/);
  assert.match(cleanupRegression, /WITH GRANT OPTION/);
  assert.match(cleanupRegression, /early owner-collision abort/);
  assert.match(cleanupRegression, /failure after ACL-mutating validator/);
  assert.match(cleanupRegression, /failure after fixture-owned role and membership creation/);
  assert.match(pgRunner, /tests=\$\{testResult\} cleanup=passed/);
  assert.match(pgRunner, /invite_proposal_pg17_cleanup_failed:tests_passed/);

  const cleanupStepStart = nativeWorkflow.indexOf('- name: Verify invite fixture preserves PostgreSQL roles and ACLs');
  const cleanupStepEnd = nativeWorkflow.indexOf('- name:', cleanupStepStart + 1);
  const cleanupStep = nativeWorkflow.slice(cleanupStepStart, cleanupStepEnd);
  assert.ok(cleanupStepStart > 0, 'native PostgreSQL CI runs the exact-state cleanup regression');
  assert.ok(cleanupStep.includes('PLANETSCALE_PG17_TEST_DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/postgres'));
  assert.ok(cleanupStep.includes('node scripts/tests/alpha-waitlist-invite-cleanup.postgres.mjs'));
});

test('hard deletion revokes the invitation and preserves a non-identifying denial tombstone', () => {
  assert.match(schema, /waitlist_id uuid REFERENCES marketing\.waitlist_signups\(id\) ON DELETE SET NULL/);
  assert.match(schema, /email_lookup_hmac bytea,/);
  assert.doesNotMatch(schema, /waitlist_id uuid NOT NULL REFERENCES marketing\.waitlist_signups\(id\) ON DELETE CASCADE/);
  const deletion = schema.match(/CREATE OR REPLACE FUNCTION marketing\.cancel_waitlist_invite_before_delete\(\)[\s\S]*?\n\$\$;/)?.[0];
  assert.ok(deletion, 'waitlist deletion trigger function is present');
  assert.ok(deletion.indexOf('PERFORM marketing.revoke_waitlist_invites(OLD.id)') < deletion.indexOf('SET email_lookup_hmac = NULL'));
  assert.match(deletion, /WHERE waitlist_id = OLD\.id/);
  const verifier = schema.match(/CREATE OR REPLACE FUNCTION marketing\.lock_waitlist_invite_for_verification\([\s\S]*?\n\$\$;/)?.[0];
  assert.ok(verifier);
  assert.ok(verifier.indexOf('SELECT i.waitlist_id') < verifier.indexOf('SELECT u.status'));
  assert.ok(verifier.indexOf('SELECT u.status') < verifier.indexOf('PERFORM 1 FROM marketing.waitlist_signups'));
  assert.match(verifier, /IF NOT FOUND THEN RETURN QUERY SELECT false, false/);
  assert.match(verifier, /RETURN QUERY SELECT true, COALESCE\(v_valid, false\)/);
});

test('reissue eligibility covers expiry, known-transient failure, and safe recovery of a superseded invite', () => {
  const eligible = schema.match(/CREATE OR REPLACE FUNCTION marketing\.waitlist_invite_eligible\([\s\S]*?\n\$\$;/)?.[0];
  const binder = schema.match(/CREATE OR REPLACE FUNCTION marketing\.bind_waitlist_invite\([\s\S]*?\n\$\$;/)?.[0];
  const reissueUser = schema.match(/CREATE OR REPLACE FUNCTION marketing\.waitlist_invite_reissue_user\([\s\S]*?\n\$\$;/)?.[0];
  assert.ok(eligible && binder && reissueUser);
  assert.match(eligible, /v_status NOT IN \('waiting', 'invited'\)/);
  assert.match(eligible, /FOR UPDATE/);
  assert.ok(eligible.indexOf('SELECT i.user_id INTO v_existing_user_id') < eligible.indexOf('SELECT u.status'));
  assert.ok(eligible.indexOf('SELECT u.status') < eligible.indexOf('SELECT w.status'));
  assert.match(eligible, /outbox_state NOT IN \('bounced', 'complained', 'rejected'\)/);
  assert.match(eligible, /outbox_state = 'failed' AND v_existing\.provider_error_category = 'transient'/);
  assert.match(reissueUser, /o\.state = 'failed' AND o\.provider_error_category = 'transient'/);
  assert.match(binder, /v_existing\.outbox_state = 'failed' AND v_existing\.provider_error_category = 'transient'/);
  assert.doesNotMatch(eligible, /OR v_existing\.outbox_state = 'failed'\s*\)/);
  assert.doesNotMatch(reissueUser, /OR o\.state = 'failed'\s*\)/);
  assert.match(eligible, /revoked_at IS NULL AND v_existing\.redeemed_at IS NULL/);
  assert.match(binder, /v_existing\.user_id <> p_user_id/);
  assert.match(binder, /UPDATE identity\.email_verification_tokens SET superseded_at/);
  assert.match(binder, /UPDATE marketing\.waitlist_invites[\s\S]*?challenge_id = p_challenge_id, outbox_id = p_outbox_id/);
  assert.doesNotMatch(binder, /ON CONFLICT \(waitlist_id\) DO UPDATE/);
  assert.match(reissueUser, /v_user_status <> 'relink_required'/);
  assert.match(reissueUser, /c\.email_lookup_hmac = p_email_lookup_hmac/);
  assert.ok(reissueUser.indexOf('SELECT i.user_id INTO v_user_id') < reissueUser.indexOf('SELECT u.status'));
  assert.ok(reissueUser.indexOf('SELECT u.status') < reissueUser.indexOf('PERFORM 1 FROM marketing.waitlist_signups'));
  const deliveryLock = schema.match(/CREATE OR REPLACE FUNCTION marketing\.lock_waitlist_invite_delivery\([\s\S]*?\n\$\$;/)?.[0];
  assert.ok(deliveryLock);
  assert.match(deliveryLock, /p_purpose = 'verification' AND p_user_id IS NOT NULL/);
  assert.match(deliveryLock, /WHERE i\.user_id = p_user_id/);
  assert.ok(deliveryLock.indexOf('SELECT i.waitlist_id INTO v_waitlist_id')
    < deliveryLock.indexOf('PERFORM 1 FROM identity.users u WHERE u.id = p_user_id FOR UPDATE'),
  'noninvite verification does not acquire an account lock before checking invite linkage');
  assert.ok(deliveryLock.indexOf('PERFORM 1 FROM identity.users u WHERE u.id = p_user_id FOR UPDATE')
    < deliveryLock.indexOf('PERFORM 1 FROM marketing.waitlist_signups w WHERE w.id = v_waitlist_id FOR UPDATE'),
  'invite-linked generic delivery uses the user-to-waitlist lock order');
  assert.match(eligible, /v_existing\.superseded_at IS NOT NULL AND v_existing\.outbox_state <> 'failed'/,
    'a nonconsumed superseded invite can be replaced by a new admin-issued challenge');
  assert.match(reissueUser, /t\.superseded_at IS NOT NULL AND o\.state <> 'failed'/);
  assert.match(binder, /v_existing\.superseded_at IS NOT NULL AND v_existing\.outbox_state <> 'failed'/);
  assert.match(binder, /v_existing\.revoked_at IS NOT NULL OR v_existing\.redeemed_at IS NOT NULL/);
  assert.match(binder, /v_existing\.consumed_at IS NOT NULL/);
  assert.match(deliveryLock, /w\.status IN \('waiting', 'invited'\)/);
  assert.match(deliveryLock, /i\.revoked_at IS NULL AND i\.redeemed_at IS NULL/);
  assert.match(deliveryLock, /t\.expires_at > clock_timestamp\(\) AND t\.consumed_at IS NULL AND t\.superseded_at IS NULL/);
  assert.match(schema, /GRANT EXECUTE ON FUNCTION marketing\.waitlist_invite_reissue_user\(uuid, bytea\) TO lythaus_runtime/);
  assert.match(schema, /GRANT EXECUTE ON FUNCTION marketing\.lock_waitlist_invite_delivery\(uuid, uuid, text\) TO lythaus_jobs/);
  assert.doesNotMatch(schema, /GRANT SELECT ON marketing\.waitlist_invites TO lythaus_jobs/);
  assert.match(dispatch, /marketing\.waitlist_invite_reissue_user\(\$1, decode\(\$2, 'base64'\)\)/);
  assert.doesNotMatch(dispatch, /FROM marketing\.waitlist_invites/);
  assert.match(jobsRuntime, /marketing\.lock_waitlist_invite_delivery\(\$1, \$2, \$3\)/);
  assert.match(jobsRuntime, /to_regprocedure\('marketing\.lock_waitlist_invite_delivery\(uuid,uuid,text\)'\)/);
  assert.doesNotMatch(jobsRuntime, /FROM marketing\.waitlist_invites|NOT EXISTS\s*\(SELECT[^)]*marketing\.waitlist_invites/s);
  assert.doesNotMatch(schema, /REVOKE UPDATE \(status, invited_at, converted_at\) ON marketing\.waitlist_signups FROM lythaus_admin/);
});
