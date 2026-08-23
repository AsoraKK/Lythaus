import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/cloudflare-rotate-lythaus-access-credentials.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../cloudflare/rotate-lythaus-access-service-token.mjs', import.meta.url), 'utf8');

test('Access rotation is protected, Lythaus-scoped, and sanitized', () => {
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /actions\/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f/);
  assert.match(script, /access\/service_tokens/);
  assert.match(script, /Lythaus control-panel CI service token/);
  assert.match(script, /gh', \['secret', 'set'/);
  assert.match(script, /body-file/);
  assert.match(script, /credentialRotationCompleted: true/);
  assert.doesNotMatch(script, /console\.log\([^\n]*(client_secret|currentClientSecret)/);
});
