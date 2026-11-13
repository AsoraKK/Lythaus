import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { assertAppArchiveDigest, validateAppArtifactMetadata } from '../release/app-only-artifact-evidence.mjs';

const REPO = 'AsoraKK/Lythaus';
const MAX_ARCHIVE = 200 * 1024 * 1024;

function gh(args, options = {}) {
  try {
    return execFileSync('gh', ['api', ...args], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000,
      maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024, ...options });
  } catch {
    // Never print a redirected signed artifact URL or provider response.
    throw new Error('authenticated GitHub artifact request failed');
  }
}

function completeArtifacts(pages) {
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > 10
    || pages.some(page => !Array.isArray(page?.artifacts) || !Number.isSafeInteger(page?.total_count)
      || page.total_count < 1 || page.total_count > 1000 || page.total_count !== pages[0].total_count)) {
    throw new Error('artifact metadata pagination invalid');
  }
  const artifacts = pages.flatMap(page => page.artifacts);
  if (artifacts.length !== pages[0].total_count) throw new Error('artifact metadata is incomplete');
  return artifacts;
}

/** Authenticated metadata and the bytes are fetched once, then the same bytes
 * are hashed and passed directly to the restrictive extractor. */
export function fetchVerifiedAppArtifact({ releaseSha, ciRunId, destination, executeGh = gh, execute = execFileSync } = {}) {
  if (!/^[0-9a-f]{40}$/.test(releaseSha ?? '') || !/^[1-9][0-9]*$/.test(String(ciRunId ?? ''))
    || !path.isAbsolute(destination ?? '')) throw new Error('app artifact inputs invalid');
  const base = `repos/${REPO}/actions`;
  let run, pages;
  try {
    run = JSON.parse(executeGh([`${base}/runs/${ciRunId}`], { encoding: 'utf8' }));
    pages = JSON.parse(executeGh([`${base}/runs/${ciRunId}/artifacts?per_page=100`, '--paginate', '--slurp'], { encoding: 'utf8' }));
  } catch {
    throw new Error('authenticated GitHub artifact metadata unavailable or invalid');
  }
  const artifacts = completeArtifacts(pages);
  const evidence = validateAppArtifactMetadata({ run, artifacts, releaseSha, ciRunId });
  const archive = executeGh([`${base}/artifacts/${evidence.artifactId}/zip`], { maxBuffer: MAX_ARCHIVE });
  assertAppArchiveDigest(archive, evidence.archiveDigest);
  try {
    execute('python3', ['scripts/ci/extract-app-artifact.py', destination], {
      input: archive, stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new Error('verified app artifact could not be safely extracted');
  }
  return evidence;
}

/** Fetch one exact prior successful canonical run and its integrity-checked
 * manifest. Provider-state comparison remains a separate mandatory gate. */
export function fetchVerifiedPriorReleaseManifest({ previousSha, previousRunId, executeGh = gh, execute = execFileSync } = {}) {
  if (!/^[0-9a-f]{40}$/.test(previousSha ?? '') || !/^[1-9][0-9]*$/.test(String(previousRunId ?? ''))
    || !Number.isSafeInteger(Number(previousRunId))) throw new Error('prior release inputs invalid');
  const base = `repos/${REPO}/actions`;
  let run, pages;
  try {
    run = JSON.parse(executeGh([`${base}/runs/${previousRunId}`], { encoding: 'utf8' }));
    pages = JSON.parse(executeGh([`${base}/runs/${previousRunId}/artifacts?per_page=100`, '--paginate', '--slurp'], { encoding: 'utf8' }));
  } catch { throw new Error('prior release metadata unavailable or invalid'); }
  if (run?.id !== Number(previousRunId) || run?.name !== 'Canonical production release'
    || run?.path !== '.github/workflows/production-release.yml' || run?.head_sha !== previousSha
    || run?.head_branch !== 'main' || run?.event !== 'workflow_dispatch' || run?.status !== 'completed'
    || run?.conclusion !== 'success' || run?.repository?.id !== 1010752912 || run?.head_repository?.id !== 1010752912) {
    throw new Error('prior canonical run identity invalid');
  }
  const matches = completeArtifacts(pages).filter(item => item?.name === `lythaus-release-manifest-${previousSha}`);
  if (matches.length !== 1) throw new Error('prior canonical manifest artifact missing or ambiguous');
  const artifact = matches[0], workflow = artifact.workflow_run;
  if (!Number.isSafeInteger(artifact.id) || artifact.id < 1 || artifact.expired !== false
    || !/^sha256:[0-9a-f]{64}$/.test(artifact.digest ?? '') || workflow?.id !== Number(previousRunId)
    || workflow?.head_sha !== previousSha || workflow?.head_branch !== 'main'
    || workflow?.repository_id !== 1010752912 || workflow?.head_repository_id !== 1010752912) {
    throw new Error('prior canonical manifest metadata invalid');
  }
  const archive = executeGh([`${base}/artifacts/${artifact.id}/zip`], { maxBuffer: 8 * 1024 * 1024 });
  assertAppArchiveDigest(archive, artifact.digest);
  let manifest;
  try {
    manifest = JSON.parse(execute('python3', ['scripts/ci/read-prior-release-manifest.py'], {
      input: archive, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    }));
  } catch { throw new Error('prior canonical manifest archive invalid'); }
  return Object.freeze({ manifest, artifactId: artifact.id, archiveDigest: artifact.digest, previousRunId: String(previousRunId) });
}

function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== REPO
    || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || !process.env.GH_TOKEN || !path.isAbsolute(process.env.RUNNER_TEMP ?? '')) {
    throw new Error('app artifact requires the exact protected main-dispatch Actions context');
  }
  const destination = path.join(process.env.RUNNER_TEMP, 'verified-app-only-artifact');
  const evidence = fetchVerifiedAppArtifact({ releaseSha: process.env.RELEASE_SHA,
    ciRunId: process.env.CI_RUN_ID, destination });
  console.log(JSON.stringify({ status: 'VERIFIED_EXACT_ARTIFACT', destination, ...evidence }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
