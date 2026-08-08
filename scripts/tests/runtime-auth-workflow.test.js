const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-lythaus-function-dev.yml'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'scripts/release/runtime-authenticated-command.mjs'), 'utf8');

test('canonical deployment obtains fresh runtime tokens without static access-token secrets', () => {
  assert.doesNotMatch(workflow, /STAGING_SMOKE_TOKEN|MVP_SMOKE_TOKEN|ALPHA_RELEASE_ADMIN_TOKEN/);
  assert.match(workflow, /MVP_SMOKE_EMAIL/);
  assert.match(workflow, /MVP_SMOKE_PASSWORD/);
  assert.match(workflow, /MVP_PRIVACY_ADMIN_EMAIL/);
  assert.match(workflow, /MVP_PRIVACY_ADMIN_PASSWORD/);
  assert.match(workflow, /runtime-authenticated-command\.mjs/);
});

test('runtime authentication masks tokens and revokes sessions without writing token artifacts', () => {
  assert.match(runner, /::add-mask::\$\{accessToken\}/);
  assert.match(runner, /::add-mask::\$\{refreshToken\}/);
  assert.match(runner, /auth\/sessions\/revoke/);
  assert.doesNotMatch(runner, /writeFile|appendFile|GITHUB_ENV|GITHUB_OUTPUT/);
});

test('workflow always clears job-scoped authentication variables', () => {
  assert.match(workflow, /name: Clear runtime authentication state[\s\S]*if: always\(\)/);
  assert.match(workflow, /unset LYTHAUS_RUNTIME_ACCESS_TOKEN LYTHAUS_RUNTIME_ADMIN_TOKEN DSR_DRILL_BEARER_TOKEN/);
});
