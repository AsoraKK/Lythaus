import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSchemaFingerprint,
  classifyRole,
  databaseExpectationsFromEnv,
  isDatabaseIdentityReady,
} from '../../packages/db/src/identity.ts';

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
