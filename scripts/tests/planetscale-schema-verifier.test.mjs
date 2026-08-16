import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const reconciler = fs.readFileSync('scripts/ci/reconcile-planetscale-schema-verifier.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/planetscale-production-migrations.yml', 'utf8');

test('schema verifier reconciliation is metadata-only and fail closed', () => {
  assert.match(reconciler, /PSCALE_BRANCH_NAME=main/);
  assert.match(reconciler, /PLANETSCALE_ADMIN_DATABASE_URL/);
  assert.match(reconciler, /PLANETSCALE_VERIFIER_DATABASE_URL/);
  assert.match(reconciler, /GRANT USAGE ON SCHEMA/);
  assert.match(reconciler, /GRANT REFERENCES ON TABLE/);
  assert.match(reconciler, /GRANT SELECT ON TABLE system\.schema_migrations/);
  assert.match(reconciler, /REVOKE CREATE ON DATABASE postgres/);
  assert.match(reconciler, /REVOKE CREATE ON SCHEMA/);
  assert.match(reconciler, /SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY/);
  assert.doesNotMatch(reconciler, /GRANT SELECT ON TABLE marketing\.waitlist_signups/);
  assert.doesNotMatch(reconciler, /GRANT (?:INSERT|UPDATE|DELETE|TRUNCATE|TRIGGER) ON TABLE/);
});

test('production migration workflow repairs and then proves the dedicated verifier', () => {
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
