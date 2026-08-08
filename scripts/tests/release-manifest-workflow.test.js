const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { resolve } = require('node:path');

const workflowPath = resolve(__dirname, '../../.github/workflows/native-workers-deploy.yml');
const workflow = readFileSync(workflowPath, 'utf8');
const retiredCloudHost = ['az', 'ure', 'websites'].join('');
const retiredLoginAction = ['az', 'ure', '\\/login@'].join('');
const retiredCliTargets = ['az\\s+(?:function', 'app|webapp)'].join('');

test('native release requires the exact current main SHA', () => {
  assert.match(workflow, /release_sha must be a full 40-character commit SHA/);
  assert.match(workflow, /RELEASE_SHA.*checked_out_sha/s);
  assert.match(workflow, /checked_out_sha.*remote_main_sha/s);
});

test('native release verifies schema read-only and deploys only existing Workers', () => {
  assert.match(workflow, /Verify production schema read-only/);
  assert.match(workflow, /PLANETSCALE_SCHEMA_READ_DATABASE_URL/);
  assert.match(workflow, /apps\/lythaus-public-api\/wrangler\.jsonc/);
  assert.match(workflow, /apps\/lythaus-admin-api\/wrangler\.jsonc/);
  assert.match(workflow, /apps\/lythaus-jobs\/wrangler\.jsonc/);
  assert.doesNotMatch(workflow, new RegExp(`${retiredCloudHost}\\.net|${retiredLoginAction}|${retiredCliTargets}`, 'i'));
});
