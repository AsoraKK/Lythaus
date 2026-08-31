import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { canonicalPost0014SchemaContract } from '../ci/product-integrity-schema-contract.mjs';

test('canonical production schema fingerprint includes the storage-ledgers view', () => {
  const canonical = canonicalPost0014SchemaContract();
  assert.ok(canonical.relations.some((row) => row.table_type === 'VIEW'
    && row.table_schema === 'media' && row.table_name === 'storage_ledgers'));
});

test('dedicated schema verifier receives metadata-only visibility for views', async () => {
  const source = await fs.readFile('scripts/ci/reconcile-planetscale-schema-verifier.mjs', 'utf8');
  assert.match(source, /relation\.relkind IN \('r', 'p', 'v'\)/);
  assert.doesNotMatch(source, /relation\.relkind IN \([^)]*'f'/);
  assert.match(source, /has_table_privilege\(current_user, 'media\.storage_ledgers', 'REFERENCES'\)/);
  assert.match(source, /table_name = 'storage_ledgers' AND table_type = 'VIEW'/);
  assert.match(source, /GRANT REFERENCES ON TABLE/);
  assert.doesNotMatch(source, /GRANT SELECT ON TABLE media\.storage_ledgers/);
});

test('production schema verification is sequential and emits safe relation drift diagnostics', async () => {
  const source = await fs.readFile('scripts/ci/verify-planetscale-production-schema.mjs', 'utf8');
  const postgres17 = await fs.readFile('scripts/ci/validate-planetscale-postgres17.mjs', 'utf8');
  assert.doesNotMatch(source, /Promise\.all\(/);
  assert.match(source, /function fingerprintMismatch/);
  assert.match(source, /missing=\$\{JSON\.stringify\(missing\)\}/);
  assert.match(source, /extra=\$\{JSON\.stringify\(extra\)\}/);
  assert.match(source, /relations: relations\.rows/);
  assert.match(postgres17, /relation_count\) \+ 2 !== 99/);
  assert.match(postgres17, /production_auth_acceptance_runs/);
  assert.match(postgres17, /production_auth_acceptance_events/);
});

test('runtime rate-limit access requires system schema usage and is verified in production', async () => {
  const grants = await fs.readFile('database/planetscale/grants/roles.sql', 'utf8');
  const verifier = await fs.readFile('scripts/ci/verify-planetscale-production-schema.mjs', 'utf8');

  assert.match(grants, /GRANT USAGE ON SCHEMA identity, content, social, feed, moderation, trust, media, system TO lythaus_runtime;/);
  assert.match(grants, /GRANT SELECT, INSERT, UPDATE ON system\.rate_limit_windows TO lythaus_runtime;/);

  assert.match(verifier, /has_schema_privilege\(\$1, 'system', 'USAGE'\) AS runtime_system_usage/);
  assert.match(verifier, /has_table_privilege\(\$1, 'system\.rate_limit_windows', 'SELECT'\) AS runtime_rate_select/);
  assert.match(verifier, /has_table_privilege\(\$1, 'system\.rate_limit_windows', 'INSERT'\) AS runtime_rate_insert/);
  assert.match(verifier, /has_table_privilege\(\$1, 'system\.rate_limit_windows', 'UPDATE'\) AS runtime_rate_update/);
  assert.match(verifier, /!row\?\.runtime_system_usage/);
});

test('runtime identity and acceptance reads are least-privilege and verified in production', async () => {
  const grants = await fs.readFile('database/planetscale/grants/roles.sql', 'utf8');
  const verifier = await fs.readFile('scripts/ci/verify-planetscale-production-schema.mjs', 'utf8');

  assert.match(grants, /GRANT SELECT ON identity\.admin_memberships, identity\.user_entitlements TO lythaus_runtime;/);
  assert.match(verifier, /runtime_admin_memberships_select/);
  assert.match(verifier, /runtime_admin_memberships_insert/);
  assert.match(verifier, /runtime_user_entitlements_select/);
  assert.match(verifier, /runtime_user_entitlements_insert/);
  assert.match(verifier, /runtime_privacy_requests_insert/);
  assert.match(verifier, /runtime_activity_insert/);
});
