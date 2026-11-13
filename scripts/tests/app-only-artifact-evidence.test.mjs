import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { assertAppArchiveDigest, validateAppArtifactMetadata } from '../release/app-only-artifact-evidence.mjs';

const sha = 'a'.repeat(40), ciRunId = '1234', bytes = Buffer.from('synthetic archive bytes');
const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const evidence = () => ({ releaseSha: sha, ciRunId, run: { id: 1234, name: 'CI', path: '.github/workflows/ci.yml', head_sha: sha,
  head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', repository: { id: 1010752912 },
  head_repository: { id: 1010752912 } }, artifacts: [{ id: 4567, name: 'flutter-web-release', expired: false,
    size_in_bytes: bytes.length, digest, workflow_run: { id: 1234, head_sha: sha, head_branch: 'main', repository_id: 1010752912,
      head_repository_id: 1010752912 } }] });

test('exact successful CI artifact metadata and archive digest bind together', () => {
  const receipt = validateAppArtifactMetadata(evidence());
  assert.equal(receipt.archiveDigest, digest);
  assert.equal(assertAppArchiveDigest(bytes, receipt.archiveDigest), digest);
  assert.throws(() => assertAppArchiveDigest(Buffer.from('changed'), receipt.archiveDigest), /does not match/);
});

test('stale, unsuccessful, foreign, expired or ambiguous evidence fails closed', () => {
  for (const mutate of [
    value => { value.run.head_sha = 'b'.repeat(40); },
    value => { value.run.conclusion = 'failure'; },
    value => { value.run.status = 'in_progress'; },
    value => { value.run.repository.id = 1; },
    value => { value.run.head_repository.id = 1; },
    value => { value.run.head_branch = 'feature'; },
    value => { value.run.path = '.github/workflows/other.yml'; },
    value => { value.run.event = 'pull_request'; },
    value => { value.artifacts[0].workflow_run.head_sha = 'b'.repeat(40); },
    value => { value.artifacts[0].workflow_run.id = 999; },
    value => { value.artifacts[0].workflow_run.head_repository_id = 1; },
    value => { value.artifacts[0].expired = true; },
    value => { value.artifacts[0].digest = 'unknown'; },
    value => { value.artifacts.push(structuredClone(value.artifacts[0])); },
    value => { value.artifacts = []; },
  ]) {
    const input = evidence(); mutate(input);
    assert.throws(() => validateAppArtifactMetadata(input), /CI evidence|CI artifact/);
  }
});
