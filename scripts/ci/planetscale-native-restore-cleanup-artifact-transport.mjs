import { RestoreFailure, requireThat } from './planetscale-native-restore-contract.mjs';
import { decimal, githubRead, sha256 } from './planetscale-native-restore-evidence.mjs';

const maxArchiveBytes = 1048576;

function artifactDestination(raw) {
  requireThat(typeof raw === 'string' && raw.length <= 8192, 'github_artifact_location_invalid');
  let url;
  try { url = new URL(raw); } catch { throw new RestoreFailure('github_artifact_location_invalid'); }
  requireThat(url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
    && url.hostname.length <= 253
    && ['.blob.core.windows.net', '.actions.githubusercontent.com'].some(suffix => url.hostname.endsWith(suffix)),
  'github_artifact_location_invalid');
  return url.href;
}

async function archiveBytes(response, signal) {
  const length = response.headers.get('content-length');
  requireThat(length === null || (/^\d+$/.test(length) && Number(length) > 0 && Number(length) <= maxArchiveBytes),
    'github_artifact_archive_size_invalid');
  requireThat(response.body?.getReader, 'github_artifact_archive_body_missing');
  const reader = response.body.getReader(), chunks = []; let size = 0, abort;
  const aborted = new Promise((resolve, reject) => {
    abort = () => reject(new RestoreFailure('github_artifact_download_timeout'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    for (;;) {
      const result = await Promise.race([reader.read(), aborted]);
      if (result.done) break;
      size += result.value.byteLength;
      requireThat(size <= maxArchiveBytes, 'github_artifact_archive_size_invalid');
      chunks.push(Buffer.from(result.value));
    }
    requireThat(size > 0 && (length === null || Number(length) === size), 'github_artifact_archive_size_invalid');
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => {});
  }
}

export function githubArtifactDownloader(env, fetchImpl = fetch) {
  return async ({ artifactId, runId }) => {
    requireThat(decimal(artifactId) && decimal(runId)
      && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/Lythaus$/.test(env.GITHUB_REPOSITORY ?? '')
      && typeof env.GH_TOKEN === 'string' && env.GH_TOKEN.length > 0 && env.GH_TOKEN.length <= 4096
      && !/[\s\x00-\x1f\x7f]/.test(env.GH_TOKEN), 'github_artifact_download_context_invalid');
    const endpoint = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/artifacts/${artifactId}/zip`;
    try {
      const metadata = await githubRead(env, `/actions/artifacts/${artifactId}`, fetchImpl);
      requireThat(metadata.id === Number(artifactId) && metadata.workflow_run?.id === Number(runId)
        && metadata.expired === false && Number.isSafeInteger(metadata.size_in_bytes)
        && metadata.size_in_bytes > 0 && metadata.size_in_bytes <= maxArchiveBytes
        && /^sha256:[a-f0-9]{64}$/.test(metadata.digest ?? ''), 'github_artifact_run_binding_invalid');
      const redirect = await fetchImpl(endpoint, { method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
        headers: { authorization: `Bearer ${env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        signal: AbortSignal.timeout(15000) });
      requireThat(redirect.redirected !== true && (!redirect.url || redirect.url === endpoint), 'github_artifact_redirect_unproven');
      requireThat(redirect.status === 302, redirect.status === 410 ? 'github_artifact_unavailable' : 'github_artifact_redirect_unproven');
      const destination = artifactDestination(redirect.headers.get('location'));
      void redirect.body?.cancel().catch(() => {});
      const signal = AbortSignal.timeout(15000);
      const archive = await fetchImpl(destination, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
        referrerPolicy: 'no-referrer', headers: { accept: 'application/octet-stream' }, signal });
      requireThat(archive.status === 200 && archive.redirected !== true && (!archive.url || archive.url === destination),
        'github_artifact_archive_response_invalid');
      const bytes = await archiveBytes(archive, signal);
      requireThat(`sha256:${sha256(bytes)}` === metadata.digest, 'github_artifact_archive_digest_mismatch');
      return bytes;
    } catch (error) {
      if (error instanceof RestoreFailure) throw error;
      throw new RestoreFailure('github_artifact_download_transport_failed');
    }
  };
}
