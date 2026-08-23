import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = fs.readFileSync('scripts/cloudflare/execute-lythaus-web-source-hygiene.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/cloudflare-lythaus-web-source-hygiene.yml', 'utf8');

test('web source hygiene is exact-SHA, allowlisted, and fail-closed', () => {
  for (const required of [
    "projectName !== 'lythaus-web'",
    "canonicalDomain !== 'app.lythaus.co'",
    "legacyDomain !== 'app.lythaus.asora.co.za'",
    'CONFIRM_CLEANUP=true',
    'source:',
    'production_deployments_enabled: false',
    "preview_deployment_setting: 'none'",
    'DELETE',
    'canonicalDomain',
    'rollback',
  ]) {
    assert(source.includes(required), `missing hygiene guard: ${required}`);
  }
  assert(source.includes('nite-owl') && source.includes('EXTERNAL / OUT OF SCOPE'), 'Nite Owl boundary is missing');
  assert(source.includes("method === 'GET'") && source.includes('attempt <= (readOnly ? 5 : 1)'), 'mutation retry boundary is missing');
});

test('web source hygiene workflow is protected and exact-SHA gated', () => {
  for (const required of [
    'environment: production',
    'ref: ${{ inputs.release_sha }}',
    'git rev-parse origin/main',
    'test "$CONFIRM_CLEANUP" = true',
    'CLOUDFLARE_API_TOKEN',
    'lythaus-web-source-hygiene-${{ inputs.release_sha }}',
  ]) {
    assert(workflow.includes(required), `missing workflow gate: ${required}`);
  }
});
