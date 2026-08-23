import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/cloudflare-rotate-lythaus-access-credentials.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../cloudflare/rotate-lythaus-access-service-token.mjs', import.meta.url), 'utf8');

test('Access rotation is protected, Lythaus-scoped, and sanitized', () => {
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /LYTHAUS_GITHUB_ADMIN_TOKEN/);
  assert.doesNotMatch(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /actions\/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f/);
  assert.match(script, /access\/service_tokens\/\$\{tokenId\}\/rotate/);
  assert.match(script, /previous_client_secret_expires_at/);
  assert.match(script, /service_token: \{ token_id: tokenId \}/);
  assert.match(script, /policyPayloadForServiceToken/);
  assert.match(script, /probeAdminWithRetry/);
  assert.match(script, /status: 'failed'/);
  assert.match(script, /replacedLegacyName/);
  assert.match(script, /LYTHAUS_LEGACY_PREVIEW_ACCESS_APP_ID/);
  assert.match(script, /6152f491-9f60-4c0b-8c0c-a3ddacdf9270/);
  assert.match(script, /access\/groups/);
  assert.match(script, /updatedGroups/);
  assert.match(script, /access\/apps\/\$\{appId\}/);
  assert.match(script, /findClientIdReferences/);
  assert.match(script, /legacyScimApps/);
  assert.match(script, /updatedScimApps/);
  assert.match(script, /precedence: 0/);
  assert.match(script, /Lythaus control-panel CI service token/);
  assert.match(script, /gh', \['secret', 'set'/);
  assert.doesNotMatch(script, /body-file/);
  assert.match(script, /credentialRotationCompleted: true/);
  assert.doesNotMatch(script, /console\.log\([^\n]*(client_secret|currentClientSecret)/);
});
