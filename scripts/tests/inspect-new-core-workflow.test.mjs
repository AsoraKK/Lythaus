import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowPath = new URL('../../.github/workflows/lythaus-new-core-hyperdrive-inspector.yml', import.meta.url);
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('workflow is branch-only, pinned, read-only, and context-gated before provider secrets', () => {
  assert.match(workflow, /branches:\s*\n\s*- codex\/new-core-hyperdrive-inspector/);
  assert.doesNotMatch(workflow, /workflow_dispatch|pull_request|environment:\s*production|upload-artifact/);
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /NODE_OPTIONS:\s*''/);
  assert.match(workflow, /NODE_DEBUG:\s*''/);
  assert.match(workflow, /GITHUB_REPOSITORY_ID/);
  assert.match(workflow, /GITHUB_REF/);
  assert.match(workflow, /GITHUB_WORKFLOW_REF/);
  assert.match(workflow, /GITHUB_SHA.*git rev-parse HEAD/);
  assert.ok(workflow.indexOf('Verify exact repository, branch, workflow and source')
    < workflow.indexOf('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}'));
  assert.ok(workflow.indexOf('Verify exact repository, branch, workflow and source')
    < workflow.indexOf('PLANETSCALE_API_TOKEN: ${{ secrets.PLANETSCALE_API_TOKEN }}'));
  assert.match(workflow, /if:\s*always\(\)\s*&&\s*steps\.context\.outputs\.verified == 'true'/);
});
