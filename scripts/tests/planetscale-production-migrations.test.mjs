import assert from 'node:assert/strict';
import test from 'node:test';
import { APPROVED_MIGRATIONS, EXPECTED_MIGRATION_BYTES, EXPECTED_MIGRATION_SET_SHA256, loadApprovedMigrations } from '../ci/planetscale-migration-manifest.mjs';
import { assertCompleteMigrationPostconditions, assertMigrationDataPreconditions, classifyArtifacts, classifyMigrationState, exactRegistryPrefix, incrementalMigrationNames, incrementalRegistryHead, migrationPostconditions } from '../ci/planetscale-migration-reconciliation.mjs';

test('loads the immutable canonical migration payload and checksum set', () => {
  const manifest = loadApprovedMigrations();
  assert.equal(manifest.migrations.length, 14);
  assert.equal(manifest.bytes, EXPECTED_MIGRATION_BYTES);
  assert.equal(manifest.checksum, EXPECTED_MIGRATION_SET_SHA256);
  assert.equal(manifest.migrations.at(-1)?.name, '0013_marketing_waitlist.sql');
});

test('classifies catalog evidence without treating vacuous data invariants as applied structure', () => {
  assert.equal(classifyArtifacts([{ kind: 'schema_artifact', present: false }, { kind: 'schema_artifact', present: false }]), 'NOT_APPLIED');
  assert.equal(classifyArtifacts([{ kind: 'schema_artifact', present: true }, { kind: 'data_invariant', present: true }]), 'FULLY_APPLIED');
  assert.equal(classifyArtifacts([{ kind: 'schema_artifact', present: true }, { kind: 'schema_artifact', present: false }]), 'PARTIALLY_APPLIED');
  assert.equal(classifyArtifacts([{ kind: 'schema_artifact', present: false }, { kind: 'data_invariant', present: true }]), 'NOT_APPLIED');
  assert.equal(classifyArtifacts([]), 'NOT_APPLIED');
});

test('requires complete canonical relation, function and data postconditions before recording 0009 through 0012', async () => {
  const requiredKinds = ['relation_contract', 'function_contract', 'data_invariant'];
  for (const name of ['0009_cost_budget_enforcement.sql', '0010_native_runtime_parity.sql', '0011_email_guest_auth_only.sql', '0012_product_integrity_v2.sql']) {
    const checks = migrationPostconditions[name];
    assert.ok(checks.length > 0, `${name} must have postconditions`);
    assert.ok(checks.some(({ kind }) => kind === 'relation_contract'), `${name} must verify complete relation contracts`);
  }
  for (const kind of requiredKinds) {
    assert.ok(migrationPostconditions['0012_product_integrity_v2.sql'].some((check) => check.kind === kind), `0012 must verify ${kind}`);
  }

  const partialFixtures = [
    ['0009_cost_budget_enforcement.sql', 'relation:system.cost_budget_reservations'],
    ['0010_native_runtime_parity.sql', 'column:feed.notifications.dismissed_at'],
    ['0011_email_guest_auth_only.sql', 'data:legacy_auth_flags_removed'],
    ['0012_product_integrity_v2.sql', 'relation:trust.reputation_events'],
    ['0012_product_integrity_v2.sql', 'function:privacy.reconcile_subject_data_locations(p_subject_id uuid)'],
    ['0012_product_integrity_v2.sql', 'data:reactions_deduplicated'],
  ];

  for (const [name, missingArtifact] of partialFixtures) {
    const client = {
      async query(sql) {
        return { rows: [{ present: !sql.includes(`migration-artifact:${missingArtifact}`) }] };
      },
    };
    const [state] = await classifyMigrationState(client, [name]);
    assert.equal(state.state, 'PARTIALLY_APPLIED', `${name} must reject missing ${missingArtifact}`);
    assert.equal(state.artifacts.find(({ artifact }) => artifact === missingArtifact)?.present, false);
    assert.throws(() => assertCompleteMigrationPostconditions(state), new RegExp(missingArtifact.replace(/[().]/g, '\\$&')));
  }
});

test('function postconditions verify canonical PL/pgSQL semantics without pg_get_functiondef', async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      return { rows: [{ present: true }] };
    },
  };
  const [state] = await classifyMigrationState(client, ['0012_product_integrity_v2.sql']);
  assert.equal(state.state, 'FULLY_APPLIED');
  const functionQueries = queries.filter((sql) => sql.includes('migration-artifact:function:privacy.'));
  assert.equal(functionQueries.length, 2);
  for (const sql of functionQueries) {
    assert.ok(sql.includes("replace(procedure_entry.prosrc, E'\\r\\n', E'\\n')"));
    assert.match(sql, /procedure_entry\.prosecdef IS TRUE/);
    assert.match(sql, /pg_get_function_result\(procedure_entry\.oid\)/);
    assert.match(sql, /cardinality\(procedure_entry\.proconfig\) = 1/);
    assert.doesNotMatch(sql, /pg_get_functiondef/);
  }
});

test('pre-migration waitlist absence stays NOT_APPLIED when no-plaintext invariant is vacuously true', async () => {
  const client = {
    async query(sql) {
      return { rows: [{ present: sql.includes("column_name IN ('email', 'plain_email', 'raw_ip', 'ip_address', 'user_agent', 'turnstile_token')") }] };
    },
  };
  const [state] = await classifyMigrationState(client, ['0013_marketing_waitlist.sql']);
  assert.equal(state.state, 'NOT_APPLIED');
  assert.equal(state.artifacts.find(({ artifact }) => artifact === 'waitlist_no_plaintext_columns')?.present, true);
  assert.ok(state.artifacts.filter(({ kind }) => kind !== 'data_invariant').every(({ present }) => present === false));
});

test('treats missing pre-migration tables or columns as absent postconditions and still fails unexpected query errors', async () => {
  for (const code of ['42P01', '42703']) {
    const client = {
      async query() {
        const error = new Error('schema artifact is not present yet');
        error.code = code;
        throw error;
      },
    };
    const [state] = await classifyMigrationState(client, ['0012_product_integrity_v2.sql']);
    assert.equal(state.state, 'NOT_APPLIED');
    assert.ok(state.artifacts.length > 0);
    assert.ok(state.artifacts.every(({ present }) => present === false));
  }

  const unexpectedClient = {
    async query() {
      const error = new Error('permission denied');
      error.code = '42501';
      throw error;
    },
  };
  await assert.rejects(
    classifyMigrationState(unexpectedClient, ['0012_product_integrity_v2.sql']),
    /postcondition query failed for 0012_product_integrity_v2\.sql\//,
  );
});

test('production catalog reconciliation keeps read-only safety without one poisonable transaction', async () => {
  const source = await (await import('node:fs/promises')).readFile('scripts/ci/reconcile-planetscale-migration-state.mjs', 'utf8');
  assert.match(source, /SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY/);
  assert.match(source, /SHOW transaction_read_only/);
  assert.doesNotMatch(source, /BEGIN READ ONLY/);
  assert.doesNotMatch(source, /client\.query\('ROLLBACK'\)/);
});

test('permits incremental release and resume only from an exact canonical prefix', () => {
  const prefix = APPROVED_MIGRATIONS.slice(0, 9).map(({ name, appliedSha256 }) => ({ version: name, checksum: appliedSha256 }));
  assert.equal(exactRegistryPrefix(prefix, '0008_legacy_relink_status.sql'), true);
  assert.equal(incrementalRegistryHead(prefix), '0008_legacy_relink_status.sql');
  assert.equal(exactRegistryPrefix([...prefix, { version: '0013_marketing_waitlist.sql', checksum: 'unexpected' }], '0008_legacy_relink_status.sql'), false);
  assert.deepEqual(incrementalMigrationNames(), APPROVED_MIGRATIONS.slice(9).map(({ name }) => name));
  for (let length = 10; length <= APPROVED_MIGRATIONS.length; length += 1) {
    const resumable = APPROVED_MIGRATIONS.slice(0, length).map(({ name, appliedSha256 }) => ({ version: name, checksum: appliedSha256 }));
    assert.equal(incrementalRegistryHead(resumable), APPROVED_MIGRATIONS[length - 1].name);
    assert.deepEqual(incrementalMigrationNames(resumable.at(-1).version), APPROVED_MIGRATIONS.slice(length).map(({ name }) => name));
  }
  assert.equal(incrementalRegistryHead([...prefix, { version: '0009_cost_budget_enforcement.sql', checksum: 'unexpected' }]), null);
});

test('waitlist migration commits retention and legal-hold safeguards', async () => {
  const source = (await import('node:fs/promises')).readFile('database/planetscale/migrations/0013_marketing_waitlist.sql', 'utf8');
  const sql = await source;
  for (const required of ['purge_after', 'retention_hold', 'retention_hold_at', 'retention_hold_released_at', 'waitlist_signups_due_purge_idx']) {
    assert.match(sql, new RegExp(required));
  }
  assert.doesNotMatch(sql, /plain(?:text)?_?email/i);
});

test('production runner preserves immutable registry history', async () => {
  const source = await (await import('node:fs/promises')).readFile('scripts/ci/apply-planetscale-production-migrations.mjs', 'utf8');
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /ON CONFLICT \(version\) DO NOTHING/);
  assert.doesNotMatch(source, /DO UPDATE SET checksum/);
  assert.match(source, /incrementalRegistryHead\(registry\)/);
  assert.match(source, /classifyMigrationState/);
  assert.match(source, /recordFullyAppliedMigration/);
  assert.match(source, /assertCompleteMigrationPostconditions/);
  assert.match(source, /verifyWaitlistPrivileges/);
  assert.match(source, /statement_timeout = '15min'/);
});

test('migration data preconditions reject unresolved open-appeal conflicts only', () => {
  assert.doesNotThrow(() => assertMigrationDataPreconditions({ duplicate_open_appeal_keys: 0 }));
  assert.throws(() => assertMigrationDataPreconditions({ duplicate_open_appeal_keys: 1 }), /open-appeal reconciliation/);
});

test('dedicated schema verifier grants are metadata-only and fail closed', async () => {
  const source = await (await import('node:fs/promises')).readFile('scripts/ci/reconcile-planetscale-schema-verifier.mjs', 'utf8');
  assert.match(source, /PLANETSCALE_VERIFIER_DATABASE_URL/);
  assert.match(source, /GRANT USAGE ON SCHEMA/);
  assert.match(source, /GRANT REFERENCES ON TABLE/);
  assert.match(source, /GRANT SELECT ON TABLE system\.schema_migrations/);
  assert.match(source, /REVOKE CREATE ON DATABASE postgres/);
  assert.match(source, /REVOKE CREATE ON SCHEMA/);
  assert.match(source, /SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY/);
  assert.doesNotMatch(source, /GRANT SELECT ON TABLE marketing\.waitlist_signups/);
  assert.doesNotMatch(source, /GRANT (?:INSERT|UPDATE|DELETE|TRUNCATE|TRIGGER) ON TABLE/);
});

test('production migration workflow repairs and proves the real schema verifier', async () => {
  const workflow = await (await import('node:fs/promises')).readFile('.github/workflows/planetscale-production-migrations.yml', 'utf8');
  assert.match(workflow, /PLANETSCALE_VERIFIER_DATABASE_URL: \$\{\{ secrets\.PLANETSCALE_SCHEMA_READ_DATABASE_URL \}\}/);
  assert.match(workflow, /Reconcile dedicated schema verifier metadata grants/);
  assert.match(workflow, /reconcile-planetscale-schema-verifier\.mjs/);
  const verifyStart = workflow.indexOf('- name: Verify final production schema with dedicated verifier');
  const cleanupStart = workflow.indexOf('- name: Remove ephemeral PlanetScale migration role');
  assert.ok(verifyStart >= 0 && cleanupStart > verifyStart, 'dedicated verifier proof step must remain explicit');
  const verifyStep = workflow.slice(verifyStart, cleanupStart);
  assert.match(verifyStep, /PLANETSCALE_SCHEMA_READ_DATABASE_URL: \$\{\{ secrets\.PLANETSCALE_SCHEMA_READ_DATABASE_URL \}\}/);
  assert.match(verifyStep, /verify-planetscale-production-schema\.mjs/);
});
