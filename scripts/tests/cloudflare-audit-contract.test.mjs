import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync('scripts/cloudflare/audit-account.mjs', 'utf8');

test('Cloudflare audit remains read-only and covers scoped integrations and current Builds evidence', () => {
  for (const forbidden of ['method: \'POST\'', 'method: \'PUT\'', 'method: \'PATCH\'', 'method: \'DELETE\'']) {
    if (source.includes(forbidden)) throw new Error(`mutating request found: ${forbidden}`);
  }
  for (const required of ['sourceIntegration', 'triggerType', '/builds/workers/', 'deployHookInventory', 'const integrations', 'resources: resourceCollections', 'classificationPolicy', 'legacyProviderExceptions', 'EXTERNAL / OUT OF SCOPE', 'NITE_OWL_MARKERS']) {
    if (!source.includes(required)) throw new Error(`missing Cloudflare inventory contract: ${required}`);
  }
  for (const forbidden of ['hook.url', 'hook.secret', 'publicAccessValues', 'gh issue create', 'issues: write']) {
    if (source.includes(forbidden)) throw new Error(`sensitive or mutating Cloudflare audit contract found: ${forbidden}`);
  }
});

test('Nite Owl resources are explicitly ignored without per-resource probing', () => {
  if (!source.includes('Ignored after account-level enumeration')) throw new Error('Nite Owl handling is not documented');
  if (!source.includes("classification !== 'EXTERNAL / OUT OF SCOPE'")) throw new Error('external resource filter is missing');
  if (source.includes('/builds/workers/${encodeURIComponent(name)}/deploy_hooks')) throw new Error('obsolete name-based deploy-hook probing remains');
});

test('custom-domain inventory reads the Admin mapping without mutation or unrelated domain values', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-admin-domain-audit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const fixture = path.join(directory, 'fetch.mjs');
  const output = path.join(directory, 'audit.json');
  fs.writeFileSync(fixture, `
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (callback, delay, ...args) => originalSetTimeout(callback, 0, ...args);
    globalThis.fetch = async (url, init = {}) => {
      if ((init.method ?? 'GET') !== 'GET') throw new Error('Audit attempted a mutation');
      if (new URL(url).hostname !== 'api.cloudflare.com') throw new Error('Unexpected destination');
      const domains = [
        { hostname: 'admin-api.lythaus.co', service: process.env.DOMAIN_FIXTURE_SERVICE, environment: 'production', secret: 'fixture-secret-never-record' },
        { hostname: 'unrelated.example.invalid', service: 'unrelated', environment: 'production' },
      ];
      return new Response(JSON.stringify({ success: true, result: String(url).endsWith('/workers/domains') ? domains : [] }), { status: 200 });
    };
  `);
  for (const service of ['lythaus-admin-api-development', 'unexpected-worker']) {
    const result = spawnSync(process.execPath, ['--import', fixture, 'scripts/cloudflare/audit-account.mjs'], {
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'e5b7ae46e04698f507b7e4b3d4ef1af0', CLOUDFLARE_API_TOKEN: 'fixture-token', CLOUDFLARE_AUDIT_OUTPUT: output, DOMAIN_FIXTURE_SERVICE: service },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const text = fs.readFileSync(output, 'utf8');
    assert.ok(!text.includes('fixture-secret-never-record'));
    assert.ok(!text.includes('unrelated.example.invalid'));
    const report = JSON.parse(text);
    assert.deepEqual(report.adminCustomDomain.mappings, [{ hostname: 'admin-api.lythaus.co', service, environment: 'production' }]);
    assert.equal(report.adminCustomDomain.mappingVerified, service === 'lythaus-admin-api-development');
    assert.equal(report.endpointState.workerDomains.ok, true);
  }
});
