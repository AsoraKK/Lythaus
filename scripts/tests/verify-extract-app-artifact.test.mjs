import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fetchVerifiedAppArtifact, fetchVerifiedPriorReleaseManifest } from '../ci/verify-extract-app-artifact.mjs';

const sha = 'a'.repeat(40), ciRunId = '1234';
const makeArchive = entries => execFileSync('python3', ['-c', `
import io,json,sys,zipfile
out=io.BytesIO()
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for e in json.loads(sys.argv[1]):
  info=zipfile.ZipInfo(e['path'])
  if e.get('link'): info.create_system=3; info.external_attr=(0o120777 << 16)
  z.writestr(info,e.get('content','x'))
sys.stdout.buffer.write(out.getvalue())
`, JSON.stringify(entries)], { stdio: ['ignore', 'pipe', 'ignore'] });
const normal = [{ path: 'index.html', content: 'synthetic web' }, { path: '_headers' }, { path: '_redirects' },
  { path: 'assets/main.js', content: 'synthetic code' }];

function metadata(bytes) {
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  return { run: { id: 1234, name: 'CI', path: '.github/workflows/ci.yml', head_sha: sha, head_branch: 'main',
    event: 'push', status: 'completed', conclusion: 'success', repository: { id: 1010752912 }, head_repository: { id: 1010752912 } },
  artifacts: [{ id: 4567, name: 'flutter-web-release', expired: false, size_in_bytes: bytes.length, digest,
    workflow_run: { id: 1234, head_sha: sha, head_branch: 'main', repository_id: 1010752912, head_repository_id: 1010752912 } }] };
}
function inputs(t, bytes, mutate = () => {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'app-artifact-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const data = metadata(bytes); mutate(data);
  const calls = [];
  const executeGh = (args) => {
    calls.push(args);
    if (args[0].endsWith('/runs/1234')) return JSON.stringify(data.run);
    if (args[0].includes('/runs/1234/artifacts?')) return JSON.stringify([{ total_count: data.artifacts.length, artifacts: data.artifacts }]);
    if (args[0].endsWith('/artifacts/4567/zip')) return bytes;
    throw new Error('unexpected request');
  };
  return { destination: path.join(directory, 'web'), executeGh, calls };
}

test('verified CI metadata and archive bytes extract a real web tree', t => {
  const bytes = makeArchive(normal), v = inputs(t, bytes);
  const receipt = fetchVerifiedAppArtifact({ releaseSha: sha, ciRunId, ...v });
  assert.equal(receipt.artifactId, 4567);
  assert.equal(readFileSync(path.join(v.destination, 'index.html'), 'utf8'), 'synthetic web');
  assert.equal(readFileSync(path.join(v.destination, 'assets/main.js'), 'utf8'), 'synthetic code');
  assert.equal(v.calls.length, 3);
});

test('metadata ambiguity and archive tampering fail before extraction', t => {
  for (const mutate of [
    data => { data.artifacts.push(structuredClone(data.artifacts[0])); },
    data => { data.run.conclusion = 'failure'; },
    data => { data.artifacts[0].digest = `sha256:${'f'.repeat(64)}`; },
  ]) {
    const bytes = makeArchive(normal), v = inputs(t, bytes, mutate);
    assert.throws(() => fetchVerifiedAppArtifact({ releaseSha: sha, ciRunId, ...v }));
    assert.equal(existsSync(v.destination), false);
  }
});

test('the extractor rejects traversal, links, duplicate paths, and missing required files', t => {
  for (const entries of [
    [...normal, { path: '../escape' }],
    [...normal, { path: '/absolute' }],
    [...normal, { path: 'assets/link', link: true }],
    [...normal, { path: 'INDEX.HTML' }],
    normal.filter(entry => entry.path !== '_headers'),
  ]) {
    const bytes = makeArchive(entries), v = inputs(t, bytes);
    assert.throws(() => fetchVerifiedAppArtifact({ releaseSha: sha, ciRunId, ...v }), /safely extracted/);
    assert.equal(existsSync(path.join(path.dirname(v.destination), 'escape')), false);
  }
});

test('incomplete paginated metadata fails before downloading bytes', t => {
  const bytes = makeArchive(normal), v = inputs(t, bytes);
  const executeGh = (args) => args[0].includes('/artifacts?')
    ? JSON.stringify([{ total_count: 2, artifacts: metadata(bytes).artifacts }]) : v.executeGh(args);
  assert.throws(() => fetchVerifiedAppArtifact({ releaseSha: sha, ciRunId, destination: v.destination, executeGh }), /incomplete/);
  assert.equal(v.calls.length, 1);
});

test('prior production reuse requires a unique exact successful run and integrity-checked manifest', () => {
  const raw = JSON.stringify({ schemaVersion: 'lythaus-release-manifest-v2', releaseSha: sha, productionStatus: 'GO' }) + '\n';
  const hash = createHash('sha256').update(raw).digest('hex');
  const bytes = makeArchive([{ path: 'release-manifest.json', content: raw },
    { path: 'release-manifest.sha256', content: `${hash}  .artifacts/release/release-manifest.json\n` }]);
  const data = metadata(bytes);
  data.run.name = 'Canonical production release'; data.run.path = '.github/workflows/production-release.yml'; data.run.event = 'workflow_dispatch';
  data.artifacts[0].name = `lythaus-release-manifest-${sha}`;
  const executeGh = args => args[0].endsWith('/runs/1234') ? JSON.stringify(data.run)
    : args[0].includes('/artifacts?') ? JSON.stringify([{ total_count: data.artifacts.length, artifacts: data.artifacts }]) : bytes;
  const result = fetchVerifiedPriorReleaseManifest({ previousSha: sha, previousRunId: ciRunId, executeGh });
  assert.equal(result.manifest.productionStatus, 'GO');
  data.run.conclusion = 'failure';
  assert.throws(() => fetchVerifiedPriorReleaseManifest({ previousSha: sha, previousRunId: ciRunId, executeGh }), /run identity invalid/);
});

test('prior manifest archive digest and internal manifest digest must both match', () => {
  const bytes = makeArchive([{ path: 'release-manifest.json', content: '{}' },
    { path: 'release-manifest.sha256', content: `${'f'.repeat(64)}  release-manifest.json\n` }]);
  const data = metadata(bytes);
  data.run.name = 'Canonical production release'; data.run.path = '.github/workflows/production-release.yml'; data.run.event = 'workflow_dispatch';
  data.artifacts[0].name = `lythaus-release-manifest-${sha}`;
  const executeGh = args => args[0].endsWith('/runs/1234') ? JSON.stringify(data.run)
    : args[0].includes('/artifacts?') ? JSON.stringify([{ total_count: 1, artifacts: data.artifacts }]) : bytes;
  assert.throws(() => fetchVerifiedPriorReleaseManifest({ previousSha: sha, previousRunId: ciRunId, executeGh }), /archive invalid/);
});
