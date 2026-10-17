import assert from 'node:assert/strict';
import test from 'node:test';
import { APPROVED_MIGRATIONS, EXPECTED_MIGRATION_BYTES, EXPECTED_MIGRATION_SET_SHA256, loadApprovedMigrations } from '../ci/planetscale-migration-manifest.mjs';
import { assertCompleteMigrationPostconditions, assertMigrationDataPreconditions, classifyArtifacts, classifyMigrationState, exactRegistryPrefix, incrementalMigrationNames, incrementalRegistryHead, migrationPostconditions } from '../ci/planetscale-migration-reconciliation.mjs';
import { applyMediaQuarantineMigration, inspectMediaQuarantineMigration } from '../ci/planetscale-media-quarantine-migration.mjs';
import { MEDIA_QUARANTINE_MIGRATION_NAME, splitMediaQuarantineMigration } from '../ci/planetscale-media-quarantine-contract.mjs';

function stagedCatalogState(state) {
  const column = {
    table_exists: true,
    table_is_regular: true,
    marker_exists: true,
    marker_type_matches: true,
    marker_nullable: true,
    marker_has_no_generation_or_default: true,
  };
  const index = {
    index_object_exists: true,
    index_is_regular: true,
    index_targets_table: true,
    index_uses_btree: true,
    index_has_exact_key_count: true,
    index_is_nonunique: true,
    index_definition_matches: true,
    index_predicate_matches: true,
    index_is_not_constraint_backed: true,
    index_is_valid: true,
    index_is_ready: true,
    index_build_is_active: false,
    index_progress_visibility_complete: true,
  };
  if (state === 'NOT_APPLIED') return { table_exists: true, table_is_regular: true, marker_exists: false, index_object_exists: false };
  if (state === 'COLUMN_ONLY') return { ...column, index_object_exists: false };
  if (state === 'INVALID_INDEX_RETRYABLE') return { ...column, ...index, index_is_valid: false, index_is_ready: false };
  if (state === 'INVALID_INDEX_ACTIVE') return { ...column, ...index, index_is_valid: false, index_is_ready: false, index_build_is_active: true };
  if (state === 'INVALID_INDEX_REVIEW_REQUIRED') return { ...column, ...index, index_is_valid: false, index_is_ready: false, index_progress_visibility_complete: false };
  if (state === 'DRIFT') return { ...column, ...index, index_predicate_matches: false };
  return { ...column, ...index };
}

function createStagedMigrationClient(states, { failConcurrentCreate = false, lockAcquired = true } = {}) {
  const calls = [];
  let transactionOpen = false;
  return {
    calls,
    async query(sql) {
      calls.push(sql);
      if (sql.includes('migration-artifact:media_quarantine_staged_state')) {
        return { rows: [stagedCatalogState(states.shift() ?? 'FULLY_APPLIED')] };
      }
      if (sql.includes('SELECT pg_try_advisory_lock')) return { rows: [{ locked: lockAcquired }] };
      if (sql === 'BEGIN') transactionOpen = true;
      if (sql === 'COMMIT' || sql === 'ROLLBACK') transactionOpen = false;
      if (sql.includes('CREATE INDEX CONCURRENTLY') || sql.includes('DROP INDEX CONCURRENTLY')) {
        assert.equal(transactionOpen, false, 'concurrent index DDL must run outside a transaction');
        if (failConcurrentCreate && sql.includes('CREATE INDEX CONCURRENTLY')) throw new Error('synthetic concurrent build failure');
      }
      if (/migration-artifact:/.test(sql) && !sql.includes('media_quarantine_staged_state')) return { rows: [{ present: true }] };
      return { rows: [{}], rowCount: 1 };
    },
  };
}

test('loads the immutable canonical migration payload and checksum set', () => {
  const manifest = loadApprovedMigrations();
  assert.equal(manifest.migrations.length, APPROVED_MIGRATIONS.length);
  assert.equal(manifest.bytes, EXPECTED_MIGRATION_BYTES);
  assert.equal(manifest.checksum, EXPECTED_MIGRATION_SET_SHA256);
  assert.equal(manifest.migrations.at(-1)?.name, '0021_media_quarantine_cleanup.sql');
});

test('keeps 0021 bytes pinned while staging its exact index concurrently', () => {
  const migration = loadApprovedMigrations().migrations.at(-1);
  const staged = splitMediaQuarantineMigration(migration.contents.toString('utf8'));
  assert.equal(migration.name, MEDIA_QUARANTINE_MIGRATION_NAME);
  assert.match(staged.columnSql, /^ALTER TABLE media\.upload_sessions/);
  assert.match(staged.concurrentIndexSql, /^CREATE INDEX CONCURRENTLY media_upload_quarantine_cleanup_idx/);
  assert.match(staged.indexPredicate, /status = ANY \(ARRAY\['pending'::text/);
  assert.throws(() => splitMediaQuarantineMigration(`${migration.contents.toString('utf8')}-- drift\n`), /do not match the staged migration contract/);
});

test('staged 0021 commits the nullable column before concurrent index build', async () => {
  const migration = loadApprovedMigrations().migrations.at(-1);
  const client = createStagedMigrationClient(['NOT_APPLIED', 'COLUMN_ONLY', 'FULLY_APPLIED']);
  await applyMediaQuarantineMigration(client, migration, {
    afterVerified: async () => {
      await client.query('BEGIN');
      await client.query('INSERT INTO system.schema_migrations (version, checksum) VALUES ($1, $2)');
      await client.query('COMMIT');
    },
  });
  const alterIndex = client.calls.findIndex((sql) => sql.startsWith('ALTER TABLE media.upload_sessions'));
  const commitIndex = client.calls.findIndex((sql, index) => index > alterIndex && sql === 'COMMIT');
  const concurrentIndex = client.calls.findIndex((sql) => sql.startsWith('CREATE INDEX CONCURRENTLY'));
  const registryInsert = client.calls.findIndex((sql) => sql.startsWith('INSERT INTO system.schema_migrations'));
  const unlock = client.calls.findIndex((sql) => sql.includes('pg_advisory_unlock'));
  assert.ok(alterIndex >= 0 && commitIndex > alterIndex && concurrentIndex > commitIndex);
  assert.ok(registryInsert > concurrentIndex && unlock > registryInsert);
  assert.ok(client.calls.some((sql) => sql.includes('media_upload_quarantine_cleanup_index')));
});

test('staged 0021 drops only an exact inactive invalid index before retrying', async () => {
  const migration = loadApprovedMigrations().migrations.at(-1);
  const client = createStagedMigrationClient(['INVALID_INDEX_RETRYABLE', 'COLUMN_ONLY', 'FULLY_APPLIED']);
  await applyMediaQuarantineMigration(client, migration);
  const dropIndex = client.calls.findIndex((sql) => sql.startsWith('DROP INDEX CONCURRENTLY'));
  const createIndex = client.calls.findIndex((sql) => sql.startsWith('CREATE INDEX CONCURRENTLY'));
  assert.ok(dropIndex >= 0 && createIndex > dropIndex);
});

test('staged 0021 preserves failed builds for safe retry and refuses active or drifted indexes', async () => {
  const migration = loadApprovedMigrations().migrations.at(-1);
  const failedBuild = createStagedMigrationClient(['COLUMN_ONLY'], { failConcurrentCreate: true });
  let recordedAfterFailure = false;
  await assert.rejects(applyMediaQuarantineMigration(failedBuild, migration, { afterVerified: async () => { recordedAfterFailure = true; } }), /synthetic concurrent build failure/);
  assert.equal(recordedAfterFailure, false);
  assert.ok(!failedBuild.calls.some((sql) => sql.startsWith('INSERT INTO system.schema_migrations')));

  for (const state of ['INVALID_INDEX_ACTIVE', 'INVALID_INDEX_REVIEW_REQUIRED', 'DRIFT']) {
    const client = createStagedMigrationClient([state]);
    const inspected = await inspectMediaQuarantineMigration({
      async query(sql) {
        assert.ok(sql.includes('media_quarantine_staged_state'));
        return { rows: [stagedCatalogState(state)] };
      },
    });
    assert.notEqual(inspected.state, 'INVALID_INDEX_RETRYABLE');
    await assert.rejects(applyMediaQuarantineMigration(client, migration), /0021 staged migration stopped/);
    assert.ok(!client.calls.some((sql) => sql.startsWith('DROP INDEX CONCURRENTLY') || sql.startsWith('CREATE INDEX CONCURRENTLY')));
  }

  const contended = createStagedMigrationClient([], { lockAcquired: false });
  await assert.rejects(applyMediaQuarantineMigration(contended, migration), /another schema migration is active/);
  assert.ok(!contended.calls.some((sql) => sql.startsWith('ALTER TABLE') || sql.startsWith('CREATE INDEX')));
});

test('requires the nullable quarantine cleanup marker and bounded partial index in 0021', async () => {
  const checks = migrationPostconditions['0021_media_quarantine_cleanup.sql'];
  assert.deepEqual(checks.map(({ artifact, kind }) => ({ artifact, kind })), [
    { artifact: 'column:media.upload_sessions.quarantine_deleted_at', kind: 'column_contract' },
    { artifact: 'media_quarantine_deleted_at_is_nullable', kind: 'schema_artifact' },
    { artifact: 'media_upload_quarantine_cleanup_index', kind: 'schema_artifact' },
  ]);
  const missingIndex = {
    async query(sql) { return { rows: [{ present: !sql.includes('media_upload_quarantine_cleanup_index') }] }; },
  };
  const [state] = await classifyMigrationState(missingIndex, ['0021_media_quarantine_cleanup.sql']);
  assert.equal(state.state, 'PARTIALLY_APPLIED');
  assert.throws(() => assertCompleteMigrationPostconditions(state), /media_upload_quarantine_cleanup_index/);
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

test('requires both 0016 envelope columns and its key-version constraint', async () => {
  const checks = migrationPostconditions['0016_transactional_email_envelope_boundary.sql'];
  assert.equal(checks.length, 3);
  assert.deepEqual(checks.map(({ artifact, kind }) => ({ artifact, kind })), [
    { artifact: 'column:system.transactional_email_outbox.delivery_envelope_ciphertext', kind: 'column_contract' },
    { artifact: 'column:system.transactional_email_outbox.delivery_envelope_encryption_key_version', kind: 'column_contract' },
    { artifact: 'transactional_email_outbox_delivery_envelope_key_check', kind: 'schema_artifact' },
  ]);

  const missingConstraintClient = {
    async query(sql) {
      return { rows: [{ present: !sql.includes('transactional_email_outbox_delivery_envelope_key_check') }] };
    },
  };
  const [state] = await classifyMigrationState(missingConstraintClient, ['0016_transactional_email_envelope_boundary.sql']);
  assert.equal(state.state, 'PARTIALLY_APPLIED');
  assert.throws(() => assertCompleteMigrationPostconditions(state), /transactional_email_outbox_delivery_envelope_key_check/);
});

test('keeps 0017 upload-session postconditions valid after 0018 evolves the relation', async () => {
  const checks = migrationPostconditions['0017_authenticity_beta.sql'];
  assert.ok(!checks.some(({ artifact }) => artifact === 'relation:media.upload_sessions'));
  assert.ok(checks.some(({ artifact }) => artifact === 'beta_upload_session_purpose_not_null'));
  assert.ok(checks.some(({ artifact }) => artifact === 'beta_upload_session_purpose_check'));

  const queries = [];
  const completeClient = {
    async query(sql) {
      queries.push(sql);
      return { rows: [{ present: true }] };
    },
  };
  const [complete] = await classifyMigrationState(completeClient, ['0017_authenticity_beta.sql']);
  assert.equal(complete.state, 'FULLY_APPLIED');
  assert.ok(queries.some((sql) => sql.includes("format_type(attribute.atttypid, attribute.atttypmod) = 'text'") && sql.includes('attribute.attnotnull')));
  assert.ok(queries.some((sql) => sql.includes("pg_get_constraintdef(constraint_entry.oid) ILIKE '%authenticity_beta%'")));

  const missingCheckClient = {
    async query(sql) {
      return { rows: [{ present: !sql.includes("constraint_entry.conname = 'upload_sessions_purpose_check'") }] };
    },
  };
  const [missingCheck] = await classifyMigrationState(missingCheckClient, ['0017_authenticity_beta.sql']);
  assert.equal(missingCheck.state, 'PARTIALLY_APPLIED');
  assert.throws(() => assertCompleteMigrationPostconditions(missingCheck), /beta_upload_session_purpose_check/);
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
  assert.match(source, /applyMediaQuarantineMigration/);
  assert.match(source, /inspectMediaQuarantineMigration/);
  assert.match(source, /MEDIA_QUARANTINE_MIGRATION_NAME/);
  assert.match(source, /assertCompleteMigrationPostconditions/);
  assert.match(source, /verifyWaitlistPrivileges/);
  assert.match(source, /verifyRuntimeRateLimitPrivileges/);
  assert.match(source, /has_schema_privilege\(\$1, 'system', 'USAGE'\)/);
  assert.match(source, /has_table_privilege\(\$1, 'system\.rate_limit_windows', 'SELECT'\)/);
  assert.match(source, /has_table_privilege\(\$1, 'system\.rate_limit_windows', 'INSERT'\)/);
  assert.match(source, /has_table_privilege\(\$1, 'system\.rate_limit_windows', 'UPDATE'\)/);
  assert.match(source, /statement_timeout = '15min'/);
});

test('runtime grant template includes system schema access for rate limiting', async () => {
  const grants = await (await import('node:fs/promises')).readFile('database/planetscale/grants/roles.sql', 'utf8');
  assert.match(grants, /GRANT USAGE ON SCHEMA identity, content, social, feed, moderation, trust, media, system TO lythaus_runtime;/);
  assert.match(grants, /GRANT SELECT ON system\.schema_migrations TO lythaus_runtime, lythaus_admin, lythaus_jobs, lythaus_privacy;/);
  assert.match(grants, /GRANT SELECT ON feed\.discovery_candidates TO lythaus_runtime;/);
  assert.match(grants, /GRANT SELECT, INSERT, UPDATE ON system\.rate_limit_windows TO lythaus_runtime;/);
});

test('production Hyperdrive gate requires the canonical runtime identity without exposing it', async () => {
  const source = await (await import('node:fs/promises')).readFile('scripts/ci/verify-cloudflare-hyperdrive-targets.mjs', 'utf8');
  assert.match(source, /PSCALE_ROLE_IDENTIFIERS/);
  assert.match(source, /expectedRuntimeRole/);
  assert.match(source, /origin\.user === expectedRuntimeRole/);
  assert.match(source, /runtimeRoleMatches/);
  assert.doesNotMatch(source, /originUser:/);

  const workflow = await (await import('node:fs/promises')).readFile('.github/workflows/deploy-public-waitlist.yml', 'utf8');
  const proofStart = workflow.indexOf('- name: Prove Hyperdrive targets PlanetScale main');
  const nextStep = workflow.indexOf('- name: Verify production schema and waitlist grants read-only');
  assert.ok(proofStart >= 0 && nextStep > proofStart, 'Hyperdrive proof step must remain explicit');
  const proofStep = workflow.slice(proofStart, nextStep);
  assert.match(proofStep, /PSCALE_ROLE_IDENTIFIERS: \$\{\{ secrets\.PSCALE_ROLE_IDENTIFIERS \}\}/);
  assert.match(proofStep, /verify-cloudflare-hyperdrive-targets\.mjs/);
});

test('migration data preconditions reject unresolved open-appeal conflicts only', () => {
  assert.doesNotThrow(() => assertMigrationDataPreconditions({ duplicate_open_appeal_keys: 0 }));
  assert.throws(() => assertMigrationDataPreconditions({ duplicate_open_appeal_keys: 1 }), /open-appeal reconciliation/);
});

test('dedicated schema verifier grants metadata and aggregate-safe evidence columns only', async () => {
  const source = await (await import('node:fs/promises')).readFile('scripts/ci/reconcile-planetscale-schema-verifier.mjs', 'utf8');
  const { incidentAggregateColumns } = await import('../ci/auth-incident-database-contract.mjs');
  assert.match(source, /PLANETSCALE_VERIFIER_DATABASE_URL/);
  assert.match(source, /GRANT USAGE ON SCHEMA/);
  assert.match(source, /GRANT REFERENCES ON TABLE/);
  assert.match(source, /GRANT SELECT ON TABLE system\.schema_migrations/);
  assert.deepEqual(incidentAggregateColumns, [
    { schema: 'identity', table: 'users', columns: ['status'] },
    { schema: 'identity', table: 'email_credentials', columns: ['verified_at'] },
    { schema: 'identity', table: 'email_verification_tokens', columns: ['created_at', 'consumed_at', 'expires_at'] },
    { schema: 'identity', table: 'account_events', columns: ['event_type', 'created_at'] },
    { schema: 'system', table: 'transactional_email_outbox', columns: ['purpose', 'created_at', 'state', 'provider_error_category', 'updated_at'] },
    { schema: 'system', table: 'audit_events', columns: ['action', 'created_at', 'reason_code'] },
    { schema: 'system', table: 'production_auth_acceptance_runs', columns: ['created_at', 'expires_at', 'status'] },
  ]);
  assert.match(source, /for \(const aggregate of incidentAggregateColumns\)/);
  assert.match(source, /captureIncidentDatabaseEvidence\(proof\)/);
  assert.match(source, /verifyIncidentAggregatePrivileges\(proof\)/);
  assert.match(source, /bootstrap_outbox_purpose_read/);
  assert.match(source, /bootstrap_outbox_created_at_read/);
  assert.match(source, /bootstrap_acceptance_created_at_read/);
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
