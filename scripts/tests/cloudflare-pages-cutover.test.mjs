import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/cloudflare-lythaus-pages-cutover.yml', 'utf8');
const script = fs.readFileSync('scripts/cloudflare/execute-lythaus-pages-cutover.mjs', 'utf8');

test('Pages cutover is exact-SHA, protected, and in-place', () => {
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /Require exact reviewed current main SHA/);
  assert.match(workflow, /test "\$\(git rev-parse origin\/main\)" = "\$RELEASE_SHA"/);
  assert.match(workflow, /--project-name lythaus-control-panel/);
  assert.match(workflow, /--commit-hash "\$RELEASE_SHA"/);
  assert.doesNotMatch(workflow, /pages projects.*create|create.*pages project/i);
  assert.match(script, /const legacyProject = 'asora'/);
  assert.match(script, /const canonicalProject = 'lythaus-control-panel'/);
  assert.match(script, /PATCH.*pages\/projects/);
  assert.match(script, /name: canonicalProject/);
});

test('cutover fail-closes on Nite Owl and preserves rollback evidence', () => {
  assert.match(script, /nite-owl/);
  assert.match(script, /EXTERNAL \/ OUT OF SCOPE/);
  assert.match(script, /rollbackArtifactsProven/);
  assert.match(script, /Restore the captured source config/);
  assert.match(script, /admin.lythaus.co/);
  assert.match(script, /dnsRecordId/);
});

test('legacy retirement is narrowly scoped to the known Lythaus preview Access app', () => {
  assert.match(script, /6152f491-9f60-4c0b-8c0c-a3ddacdf9270/);
  assert.match(script, /\*\.asora-6bi\.pages\.dev/);
  assert.match(script, /DELETE.*access\/apps/);
  assert.match(script, /legacyAsoraActiveResources: 0/);
  assert.doesNotMatch(script, /nite-owl.*DELETE|DELETE.*nite-owl/i);
});
