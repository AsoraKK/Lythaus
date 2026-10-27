import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';
import { artifactTransportFixture, verifyArtifactTransportFixture } from '../ci/validate-native-restore-artifact-transport.mjs';
import { sha256 } from '../ci/planetscale-native-restore-evidence.mjs';

function fixture(t, { entry = 'transport.json', bytes } = {}) {
  const env = { GITHUB_REPOSITORY: 'SyntheticOwner/Lythaus', GITHUB_REPOSITORY_ID: '1010752912',
    GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1', GH_TOKEN: 'synthetic-github-token',
    REHEARSAL_ARTIFACT_ID: '51' };
  const expected = artifactTransportFixture(env), root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-rehearsal-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, entry), bytes ?? expected.bytes);
  const zip = path.join(root, 'service-generated.zip');
  execFileSync('zip', ['-q', '-X', '-j', zip, path.join(root, entry)]);
  const archive = fs.readFileSync(zip);
  env.REHEARSAL_ARTIFACT_DIGEST = sha256(archive);
  const metadata = { id: 51, name: expected.name, expired: false, workflow_run: { id: 12345 },
    size_in_bytes: archive.length, digest: `sha256:${env.REHEARSAL_ARTIFACT_DIGEST}` };
  const calls = [], fetchImpl = async (url, options) => {
    calls.push({ url, options }); assert.equal(options.method, 'GET');
    if (url.endsWith('/actions/artifacts/51')) return Response.json(metadata);
    if (url.endsWith('/actions/artifacts/51/zip')) return new Response(null, { status: 302,
      headers: { location: 'https://synthetic.blob.core.windows.net/fixture.zip?sig=synthetic' } });
    assert.equal(url, 'https://synthetic.blob.core.windows.net/fixture.zip?sig=synthetic');
    assert.deepEqual(options.headers, { accept: 'application/octet-stream' });
    return new Response(archive);
  };
  return { env, metadata, archive, expected, calls, fetchImpl };
}

test('ordinary CI rehearsal validates actual ZIP bytes, extracted fixture and sanitized receipt through production downloader', async t => {
  const f = fixture(t), receipt = await verifyArtifactTransportFixture(f.env, f.fetchImpl);
  assert.equal(receipt.state, 'ARTIFACT_TRANSPORT_VERIFIED');
  assert.equal(receipt.archiveSha256, sha256(f.archive));
  assert.equal(receipt.payloadSha256, sha256(f.expected.bytes));
  assert.notEqual(receipt.archiveSha256, receipt.payloadSha256);
  assert.equal(receipt.providerMutations, false); assert.equal(receipt.recoveryCertified, false);
  assert.equal(f.calls.length, 4); assert.ok(f.calls.every(call => call.options.method === 'GET'));
  assert.doesNotMatch(JSON.stringify(receipt), /synthetic-github-token|blob\.core|\?sig=/);
});

for (const [label, change, code] of [
  ['artifact name', f => { f.metadata.name = 'another-run'; }, 'artifact_rehearsal_upload_binding_invalid'],
  ['upload digest', f => { f.env.REHEARSAL_ARTIFACT_DIGEST = 'f'.repeat(64); }, 'artifact_rehearsal_upload_binding_invalid'],
  ['artifact ID', f => { f.metadata.id = 52; }, 'github_artifact_run_binding_invalid'],
  ['artifact run', f => { f.metadata.workflow_run.id = 7; }, 'github_artifact_run_binding_invalid'],
  ['expired artifact', f => { f.metadata.expired = true; }, 'github_artifact_run_binding_invalid'],
]) test(`ordinary CI rehearsal blocks ${label} mismatch before signed archive fetch`, async t => {
  const f = fixture(t); change(f);
  await assert.rejects(() => verifyArtifactTransportFixture(f.env, f.fetchImpl), { code });
  assert.ok(f.calls.every(call => !call.url.includes('.blob.core.windows.net')));
});

test('valid archive hash cannot hide a different extracted payload', async t => {
  const f = fixture(t, { bytes: Buffer.from('changed synthetic bytes\n') });
  await assert.rejects(() => verifyArtifactTransportFixture(f.env, f.fetchImpl), { code: 'artifact_rehearsal_extracted_bytes_mismatch' });
});

test('valid archive hash cannot hide an unexpected entry', async t => {
  const f = fixture(t, { entry: 'other.json' });
  await assert.rejects(() => verifyArtifactTransportFixture(f.env, f.fetchImpl), { code: 'artifact_rehearsal_archive_entries_invalid' });
});

test('ordinary CI rehearsal refuses provider credentials without issuing requests', async t => {
  const f = fixture(t); f.env.PLANETSCALE_RESTORE_API_TOKEN = 'synthetic:forbidden';
  await assert.rejects(() => verifyArtifactTransportFixture(f.env, f.fetchImpl), { code: 'artifact_rehearsal_provider_access_forbidden' });
  assert.equal(f.calls.length, 0);
});

test('real transport rehearsal uses existing CodeQL read authority and a separate synthetic artifact', () => {
  const workflow = YAML.parse(fs.readFileSync('.github/workflows/codeql.yml', 'utf8'));
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(workflow.jobs.analyze.permissions, { actions: 'read', contents: 'read', 'security-events': 'write' });
  const steps = workflow.jobs.analyze.steps;
  const prepare = steps.findIndex(step => step.run === 'node scripts/ci/validate-native-restore-artifact-transport.mjs prepare');
  const upload = steps.findIndex(step => step.id === 'artifact_roundtrip');
  const verify = steps.findIndex(step => step.run === 'node scripts/ci/validate-native-restore-artifact-transport.mjs verify');
  assert.ok(prepare > steps.findIndex(step => step.uses?.startsWith('github/codeql-action/analyze@')));
  assert.ok(prepare < upload && upload < verify);
  assert.equal(steps[upload].uses, 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
  assert.equal(steps[upload].with.overwrite, false); assert.equal(steps[upload].with['retention-days'], 1);
  assert.deepEqual(steps[verify].env, { GH_TOKEN: '${{ github.token }}',
    REHEARSAL_ARTIFACT_ID: '${{ steps.artifact_roundtrip.outputs.artifact-id }}',
    REHEARSAL_ARTIFACT_DIGEST: '${{ steps.artifact_roundtrip.outputs.artifact-digest }}' });
  for (const step of steps) assert.notEqual(step['continue-on-error'], true);
  assert.doesNotMatch(JSON.stringify(workflow), /PLANETSCALE_RESTORE_API_TOKEN|cleanup\.mjs|gh workflow run/);
  assert.match(fs.readFileSync('.github/workflows/ci.yml', 'utf8'), /native-restore-artifact-transport-rehearsal\.test\.mjs/);
});
