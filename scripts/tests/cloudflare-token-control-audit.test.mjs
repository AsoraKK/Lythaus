import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync(new URL('../cloudflare/audit-lythaus-token-control.mjs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/cloudflare-lythaus-token-control-audit.yml', import.meta.url), 'utf8');

test('Cloudflare token-control audit is read-only and sanitized', () => {
  assert.match(script, /\/user\/tokens\/verify/);
  assert.match(script, /\/accounts\/\$\{accountId\}\/tokens\/verify/);
  assert.match(script, /mutationPerformed: false/);
  assert.match(script, /filter\(\(key\) => !\/token\|secret\|value\|credential\/i/);
  assert.doesNotMatch(script, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /githubSecretWriteAttempted == false/);
});
