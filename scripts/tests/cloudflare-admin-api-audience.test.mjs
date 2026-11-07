import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { requireAdminApiAudienceSnapshot } from '../ci/cloudflare-admin-api-audience.mjs';

const expectedAudience = 'fixture-admin-api-audience-0123456789';

test('Admin API AUD snapshot requires an exact nonempty value and never reports it', () => {
  assert.equal(requireAdminApiAudienceSnapshot({ aud: expectedAudience }, expectedAudience), true);
  for (const application of [{}, { aud: '' }, { aud: `${expectedAudience}-other` }]) {
    assert.throws(() => requireAdminApiAudienceSnapshot(application, expectedAudience), /admin_api_audience_snapshot_mismatch/);
  }
  for (const invalid of ['', 'contains whitespace', 'x'.repeat(65), 'bad\nvalue']) {
    assert.throws(() => requireAdminApiAudienceSnapshot({ aud: expectedAudience }, invalid), /admin_api_audience_expectation_invalid/);
  }
});

test('read-only verifier checks a fresh API AUD and keeps response sanitized', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-admin-api-aud-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const mock = path.join(dir, 'mock-fetch.mjs');
  fs.writeFileSync(mock, `
    globalThis.fetch = async (input, init = {}) => {
      if ((init.method ?? 'GET') !== 'GET') throw new Error('unexpected mutation');
      const url = new URL(input);
      if (url.hostname !== 'api.cloudflare.com') throw new Error('unexpected host');
      let result;
      if (url.pathname.endsWith('/access/apps')) result = [
        { id: 'ui-app', name: 'Lythaus Admin UI', domain: 'admin.lythaus.co' },
        { id: 'api-app', name: 'Lythaus Admin API', domain: 'admin-api.lythaus.co', aud: process.env.MOCK_ADMIN_API_AUD },
      ];
      else if (url.pathname.endsWith('/ui-app/policies')) result = [
        { decision: 'allow', include: [{ email: { email: 'operator@example.invalid' } }], exclude: [], require: [] },
        { decision: 'deny', include: [{ everyone: {} }] },
      ];
      else if (url.pathname.endsWith('/api-app/policies')) result = [
        { decision: 'allow', include: [{ email: { email: 'operator@example.invalid' } }], exclude: [], require: [] },
        { decision: 'deny', include: [{ everyone: {} }] },
      ];
      else throw new Error('unexpected path');
      return new Response(JSON.stringify({ success: true, result }), { status: 200 });
    };
  `);
  const run = (actualAudience) => spawnSync(process.execPath, ['--import', mock, 'scripts/ci/verify-cloudflare-admin-access.mjs'], {
    cwd: process.cwd(), encoding: 'utf8', env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
      CLOUDFLARE_API_TOKEN: 'synthetic-read-only-token',
      EXPECTED_ADMIN_API_AUDIENCE_SNAPSHOT: expectedAudience,
      MOCK_ADMIN_API_AUD: actualAudience,
    },
  });

  const success = run(expectedAudience);
  assert.equal(success.status, 0, success.stderr);
  const report = JSON.parse(success.stdout);
  assert.equal(report.adminApiAudienceMatchesSnapshot, true);
  assert.ok(!success.stdout.includes(expectedAudience));
  assert.ok(!success.stdout.includes('operator@example.invalid'));

  const mismatch = run(`${expectedAudience}-changed`);
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /admin_api_audience_snapshot_mismatch/);
  assert.ok(!mismatch.stderr.includes(expectedAudience));
});

test('read-only Access workflow pins the historical expectation and reuses its existing token', () => {
  const workflow = fs.readFileSync('.github/workflows/cloudflare-admin-access-readonly.yml', 'utf8');
  const verifier = fs.readFileSync('scripts/ci/verify-cloudflare-admin-access.mjs', 'utf8');
  assert.match(workflow, /EXPECTED_ADMIN_API_AUDIENCE_SNAPSHOT: cee241b59a461d2c0199404312504688a92949276b74b1a2364464bf8554810c/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_AUDIT_API_TOKEN/);
  assert.match(verifier, /process\.env\.CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(verifier, /process\.env\.CLOUDFLARE_AUDIT_API_TOKEN/);
});
