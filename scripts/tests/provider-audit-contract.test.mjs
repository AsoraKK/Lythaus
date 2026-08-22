import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const cloudflareAudit = read('scripts/cloudflare/audit-account.mjs');
const cloudflareWorkflow = read('.github/workflows/cloudflare-domain-audit.yml');
const planetscaleContractAudit = read('scripts/planetscale/audit-production-contract.mjs');
const planetscaleWorkflow = read('.github/workflows/planetscale-account-audit.yml');

test('Cloudflare inventory prefers canonical deployment token and throttles account reads', () => {
  assert.match(cloudflareAudit, /CLOUDFLARE_API_TOKEN \|\| process\.env\.CLOUDFLARE_AUDIT_API_TOKEN/);
  assert.match(cloudflareAudit, /response\.status === 429/);
  assert.match(cloudflareAudit, /for \(const \[name, url\] of Object\.entries\(endpoints\)\)/);
  assert.match(cloudflareAudit, /await sleep\(300\)/);
  assert.doesNotMatch(cloudflareAudit, /Promise\.all\(Object\.entries\(endpoints\)/);
});

test('Cloudflare inventory cannot pass as empty when provider evidence is incomplete', () => {
  assert.match(cloudflareAudit, /complete: failedEndpoints\.length === 0/);
  assert.match(cloudflareAudit, /failedEndpoints/);
  assert.match(cloudflareWorkflow, /Require complete provider evidence/);
  assert.match(cloudflareWorkflow, /\.complete == true/);
  assert.match(cloudflareWorkflow, /adminWorkerSettings\.state\.ok == true/);
  assert.match(cloudflareWorkflow, /provider state remains UNKNOWN\/BLOCKED/);
});

test('PlanetScale contract audit is read-only and delegates exact post-0013 verification', () => {
  assert.match(planetscaleContractAudit, /verify-planetscale-production-schema\.mjs/);
  assert.match(planetscaleContractAudit, /REQUIRE_PRODUCT_INTEGRITY_MIGRATION: 'true'/);
  assert.match(planetscaleContractAudit, /BEGIN READ ONLY/);
  assert.match(planetscaleContractAudit, /SHOW server_version/);
  assert.match(planetscaleContractAudit, /FROM pg_extension/);
  assert.match(planetscaleContractAudit, /FROM system\.schema_migrations/);
  assert.match(planetscaleContractAudit, /information_schema\.role_table_grants/);
  assert.doesNotMatch(
    planetscaleContractAudit,
    /client\.query\(\s*['"`]\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i,
  );
});

test('PlanetScale account audit supplies verifier evidence without mutation or DDL', () => {
  assert.match(planetscaleWorkflow, /PLANETSCALE_SCHEMA_READ_DATABASE_URL/);
  assert.match(planetscaleWorkflow, /PSCALE_ROLE_IDENTIFIERS/);
  assert.match(planetscaleWorkflow, /PRODUCT_INTEGRITY_DATABASE_SCHEMA_FINGERPRINT/);
  assert.match(planetscaleWorkflow, /PRODUCT_INTEGRITY_DATABASE_RELATION_COUNT/);
  assert.match(planetscaleWorkflow, /audit-production-contract\.mjs/);
  assert.match(planetscaleWorkflow, /No provider mutation or DDL is performed/);
  assert.doesNotMatch(planetscaleWorkflow, /--request\s+(?:POST|PUT|PATCH|DELETE)/i);
});
