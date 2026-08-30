import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSchemaFingerprint,
  classifyDatabaseIdentityError,
  classifyRole,
  databaseExpectationsFromEnv,
  isDatabaseIdentityReady,
} from '../../packages/db/src/identity.ts';
import { approvedPost0014Expectation, canonicalPost0014SchemaContract } from '../ci/product-integrity-schema-contract.mjs';

test('database identity classification rejects privileged or non-login roles', () => {
  assert.equal(classifyRole({ rolsuper: false, rolcanlogin: true, rolbypassrls: false }), 'login_non_superuser');
  assert.equal(classifyRole({ rolsuper: true, rolcanlogin: true, rolbypassrls: false }), 'superuser');
  assert.equal(classifyRole({ rolsuper: false, rolcanlogin: false, rolbypassrls: false }), 'no_login');
  assert.equal(classifyRole({ rolsuper: false, rolcanlogin: true, rolbypassrls: true }), 'bypass_rls');
});

test('database identity fingerprint is deterministic and includes migrations', async () => {
  const fingerprint = await buildSchemaFingerprint(
    [
      { table_type: 'VIEW', table_schema: 'media', table_name: 'storage_ledgers' },
      { table_type: 'BASE TABLE', table_schema: 'identity', table_name: 'users' },
    ],
    [{ version: '0008_legacy_relink_status.sql', checksum: 'checksum' }],
  );
  const repeat = await buildSchemaFingerprint(
    [
      { table_type: 'BASE TABLE', table_schema: 'identity', table_name: 'users' },
      { table_type: 'VIEW', table_schema: 'media', table_name: 'storage_ledgers' },
    ],
    [{ version: '0008_legacy_relink_status.sql', checksum: 'checksum' }],
  );
  assert.equal(fingerprint, repeat);
  assert.notEqual(fingerprint, await buildSchemaFingerprint(
    [
      { table_type: 'BASE TABLE', table_schema: 'identity', table_name: 'users' },
      { table_type: 'VIEW', table_schema: 'media', table_name: 'storage_ledgers' },
    ],
    [],
  ));
});

test('canonical post-0014 identity matches the Worker runtime fingerprint algorithm', async () => {
  const canonical = canonicalPost0014SchemaContract();
  assert.equal(canonical.relationCount, 95);
  assert.equal(canonical.fingerprint, '84918a165b50257d5d5399eb87ed0c999b475dfe15134e81dcdb8d3170950986');
  assert.equal(await buildSchemaFingerprint(canonical.relations, canonical.migrations), canonical.fingerprint);
  assert.deepEqual(approvedPost0014Expectation('', ''), {
    fingerprint: canonical.fingerprint,
    relationCount: canonical.relationCount,
    canonical,
  });
  assert.throws(
    () => approvedPost0014Expectation('86ff272e09dbd195f18d262c354449ececdb907663615786c90a0d630b8f8625', '95'),
    /does not match the canonical migration contract/,
  );
});

test('database identity readiness requires every structural gate', () => {
  const expected = databaseExpectationsFromEnv({
    EXPECTED_DATABASE_TARGET: 'main',
    EXPECTED_DATABASE_SCHEMA_FINGERPRINT: 'fingerprint',
    EXPECTED_DATABASE_RELATION_COUNT: '82',
    EXPECTED_DATABASE_SCHEMA_VERSION: '0009_cost_budget_enforcement.sql',
    EXPECTED_DATABASE_ROLE_CLASS: 'login_non_superuser',
    EXPECTED_DATABASE_BUDGET_LEDGER_APPLIED: 'true',
  });
  assert.equal(isDatabaseIdentityReady({
    databaseEnvironment: 'main',
    branchFingerprint: 'unknown',
    schemaFingerprint: 'fingerprint',
    relationCount: 82,
    identityContactEmails: true,
    budgetLedgerApplied: true,
    schemaVersion: '0009_cost_budget_enforcement.sql',
    roleClass: 'login_non_superuser',
    transactionSucceeded: true,
  }, expected), true);
  assert.equal(isDatabaseIdentityReady({
    databaseEnvironment: 'unknown',
    branchFingerprint: 'unknown',
    schemaFingerprint: 'fingerprint',
    relationCount: 82,
    identityContactEmails: true,
    budgetLedgerApplied: true,
    schemaVersion: '0009_cost_budget_enforcement.sql',
    roleClass: 'login_non_superuser',
    transactionSucceeded: true,
  }, expected), false);
});

test('database identity errors expose only an allowlisted diagnostic code', () => {
  assert.equal(classifyDatabaseIdentityError({ code: '42501' }), 'insufficient_privilege');
  assert.equal(classifyDatabaseIdentityError({ code: '42P01' }), 'undefined_table');
  assert.equal(classifyDatabaseIdentityError({ code: '08006' }), 'connection_failure');
  assert.equal(classifyDatabaseIdentityError(new Error('secret database detail')), 'database_identity_query_failed');
});

test('database identity relation inventory is not privilege-filtered', async () => {
  const source = await (await import('node:fs/promises')).readFile('packages/db/src/identity.ts', 'utf8');
  assert.match(source, /FROM pg_catalog\.pg_class c/);
  assert.match(source, /JOIN pg_catalog\.pg_namespace n/);
  assert.match(source, /c\.relkind IN \('r', 'p', 'v'\)/);
  assert.match(source, /n\.nspname IN \('identity', 'content', 'social', 'feed', 'moderation', 'privacy'/);
  assert.doesNotMatch(source, /FROM information_schema\.tables/);
});
