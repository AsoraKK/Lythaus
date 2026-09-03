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

test('native release publishes, verifies, and restores the same-origin admin API route', () => {
  assert.match(workflow, /Capture predeployment same-origin admin API route/);
  assert.match(workflow, /wrangler@4\.123\.0 triggers deploy --config apps\/lythaus-admin-api\/wrangler\.jsonc --name lythaus-admin-api-development/);
  assert.match(workflow, /Publish and verify same-origin admin API route/);
  assert.match(workflow, /manage-cloudflare-worker-route\.mjs verify/);
  assert.match(workflow, /ADMIN_ROUTE_TRIGGER_ATTEMPTED=true/);
  assert.match(workflow, /manage-cloudflare-worker-route\.mjs restore/);
  const rollbackWorkflow = workflow.slice(workflow.indexOf('Roll back partial Worker deployment on failure'));
  assert.match(rollbackWorkflow, /CLOUDFLARE_ZONE_ID: 7bc572c8b7cd3c00be9c655176c29382/);
  assert.ok(
    workflow.indexOf('Activate exact candidate Worker versions')
      < workflow.indexOf('Publish and verify same-origin admin API route'),
    'route triggers must be published only after immutable versions activate',
  );
});

test('native release declares and verifies the direct admin API route used by candidate probes', () => {
  assert.match(workflow, /admin-api\.lythaus\.co\/\*/);
  assert.match(workflow, /admin-direct-api-route-before\.json/);
  assert.match(workflow, /admin-direct-api-route-after\.json/);
  assert.match(workflow, /manage-cloudflare-worker-route\.mjs ensure/);
  assert.match(workflow, /ADMIN_DIRECT_API_ROUTE_CREATED=true/);
});
