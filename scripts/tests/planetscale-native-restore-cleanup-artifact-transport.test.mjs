import assert from 'node:assert/strict';
import test from 'node:test';
import { githubArtifactDownloader } from '../ci/planetscale-native-restore-cleanup-artifact-transport.mjs';
import { sha256 } from '../ci/planetscale-native-restore-evidence.mjs';

const archive = Buffer.from('synthetic archive bytes'), secret = 'synthetic-github-access';
const env = { GITHUB_REPOSITORY: 'SyntheticOwner/Lythaus', GH_TOKEN: secret,
  PLANETSCALE_RESTORE_API_TOKEN: 'synthetic-provider:never-forward' };
const signed = 'https://example.blob.core.windows.net/artifact.zip?sig=synthetic-signed-secret';
const metadata = () => ({ id: 51, workflow_run: { id: 12345 }, expired: false,
  size_in_bytes: archive.length, digest: `sha256:${sha256(archive)}` });

function setup({ record = metadata(), location = signed, redirectStatus = 302, stored, redirect } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return Response.json(record);
    if (calls.length === 2) return redirect ?? new Response(null, { status: redirectStatus, headers: { location } });
    return stored ? stored(options) : new Response(archive);
  };
  return { calls, download: githubArtifactDownloader(env, fetchImpl) };
}

test('documented artifact redirect uses isolated credentials and returns exact digest-verified archive bytes', async () => {
  const f = setup(); assert.deepEqual(await f.download({ artifactId: '51', runId: '12345' }), archive);
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls[1].url, 'https://api.github.com/repos/SyntheticOwner/Lythaus/actions/artifacts/51/zip');
  assert.equal(f.calls[1].options.redirect, 'manual'); assert.equal(f.calls[1].options.headers.authorization, `Bearer ${secret}`);
  assert.equal(f.calls[2].url, signed); assert.equal(f.calls[2].options.redirect, 'error');
  assert.equal(f.calls[2].options.credentials, 'omit');
  assert.deepEqual(f.calls[2].options.headers, { accept: 'application/octet-stream' });
  assert.doesNotMatch(JSON.stringify(f.calls[2].options), /synthetic-github-access|synthetic-provider|authorization|cookie/i);
  assert.ok(f.calls.every(call => call.options.signal instanceof AbortSignal));
});

test('documented Actions artifact host is also accepted', async () => {
  const f = setup({ location: 'https://results-receiver.actions.githubusercontent.com/archive?sig=synthetic' });
  assert.deepEqual(await f.download({ artifactId: '51', runId: '12345' }), archive);
});

for (const [label, change] of [
  ['ID', row => { row.id = 52; }], ['run', row => { row.workflow_run.id = 7; }],
  ['expiry', row => { row.expired = true; }], ['size', row => { row.size_in_bytes = 1048577; }],
  ['digest', row => { row.digest = 'unbound'; }],
]) test(`artifact ${label} mismatch blocks before a signed download request`, async () => {
  const record = metadata(); change(record); const f = setup({ record });
  await assert.rejects(() => f.download({ artifactId: '51', runId: '12345' }), /github_artifact_run_binding_invalid/);
  assert.equal(f.calls.length, 1);
});

for (const location of ['http://example.blob.core.windows.net/a', 'https://blob.core.windows.net/a',
  'https://evilblob.core.windows.net/a', 'https://example.blob.core.windows.net.evil.invalid/a',
  'https://user:password@example.blob.core.windows.net/a', 'https://example.blob.core.windows.net:444/a',
  'https://example.blob.core.windows.net/a#fragment', 'https://127.0.0.1/a', '/relative', 'data:secret']) {
  test(`unsupported signed destination is rejected without following it: ${location}`, async () => {
    const f = setup({ location });
    await assert.rejects(() => f.download({ artifactId: '51', runId: '12345' }), /github_artifact_location_invalid/);
    assert.equal(f.calls.length, 2);
  });
}

for (const status of [200, 301, 303, 307, 401, 403, 410, 500]) test(`initial artifact status ${status} is not retried or followed`, async () => {
  const f = setup({ redirectStatus: status });
  await assert.rejects(() => f.download({ artifactId: '51', runId: '12345' }),
    status === 410 ? /github_artifact_unavailable/ : /github_artifact_redirect_unproven/);
  assert.equal(f.calls.length, 2);
});

for (const [label, stored, code] of [
  ['second redirect', () => new Response(null, { status: 302, headers: { location: signed } }), 'github_artifact_archive_response_invalid'],
  ['oversized length', () => new Response('small', { headers: { 'content-length': '1048577' } }), 'github_artifact_archive_size_invalid'],
  ['wrong length', () => new Response(archive, { headers: { 'content-length': String(archive.length + 1) } }), 'github_artifact_archive_size_invalid'],
  ['empty archive', () => new Response(''), 'github_artifact_archive_size_invalid'],
  ['oversized stream', () => new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.alloc(1048577)); controller.close(); } })), 'github_artifact_archive_size_invalid'],
  ['wrong archive digest', () => new Response('different archive'), 'github_artifact_archive_digest_mismatch'],
]) test(`storage ${label} fails closed with bounded reads`, async () => {
  const f = setup({ stored });
  await assert.rejects(() => f.download({ artifactId: '51', runId: '12345' }), { code }); assert.equal(f.calls.length, 3);
});

test('a hanging archive read is cancelled when its download signal aborts', async () => {
  let cancelled = false;
  const f = setup({ stored: options => {
    setTimeout(() => options.signal.dispatchEvent(new Event('abort')), 5);
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  } });
  await assert.rejects(() => f.download({ artifactId: '51', runId: '12345' }), /github_artifact_download_timeout/);
  assert.equal(cancelled, true);
});

test('transport exceptions never expose signed URLs, credentials, or response bodies', async () => {
  const f = setup({ stored: () => { throw Error(`${signed} ${secret} private-provider-response`); } });
  await assert.rejects(() => f.download({ artifactId: '51', runId: '12345' }), error => {
    assert.equal(error.code, 'github_artifact_download_transport_failed');
    assert.doesNotMatch(String(error), /synthetic-signed-secret|synthetic-github-access|private-provider-response/); return true;
  });
});
