import { createHash, timingSafeEqual } from 'node:crypto';

const REPOSITORY_ID = 1010752912;

/** Validate provider-supplied exact-run metadata; authentication is the caller's responsibility. */
export function validateAppArtifactMetadata({ run, artifacts, releaseSha, ciRunId } = {}) {
  if (!/^[0-9a-f]{40}$/.test(releaseSha ?? '') || !/^[1-9][0-9]*$/.test(String(ciRunId ?? ''))
    || !Number.isSafeInteger(Number(ciRunId))
    || run?.id !== Number(ciRunId) || run?.name !== 'CI' || run?.path !== '.github/workflows/ci.yml'
    || run?.head_sha !== releaseSha || run?.head_branch !== 'main' || !['push', 'workflow_dispatch'].includes(run?.event)
    || run?.status !== 'completed' || run?.conclusion !== 'success' || run?.repository?.id !== REPOSITORY_ID
    || run?.head_repository?.id !== REPOSITORY_ID
    || !Array.isArray(artifacts)) throw new Error('exact app CI evidence is invalid');
  const matches = artifacts.filter(artifact => artifact?.name === 'flutter-web-release');
  if (matches.length !== 1) throw new Error('exact app CI artifact is missing or ambiguous');
  const artifact = matches[0];
  if (!Number.isSafeInteger(artifact.id) || artifact.id <= 0 || artifact.expired !== false
    || !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes <= 0
    || !/^sha256:[0-9a-f]{64}$/.test(artifact.digest ?? '')
    || artifact.workflow_run?.id !== Number(ciRunId) || artifact.workflow_run?.head_sha !== releaseSha
    || artifact.workflow_run?.head_branch !== 'main' || artifact.workflow_run?.repository_id !== REPOSITORY_ID
    || artifact.workflow_run?.head_repository_id !== REPOSITORY_ID) throw new Error('exact app CI artifact metadata is invalid');
  return Object.freeze({ artifactId: artifact.id, ciRunId: String(ciRunId), releaseSha, archiveDigest: artifact.digest });
}

/** Hash the downloaded archive bytes before extracting and deploying those same bytes. */
export function assertAppArchiveDigest(bytes, archiveDigest) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || !/^sha256:[0-9a-f]{64}$/.test(archiveDigest ?? '')) {
    throw new Error('app archive or digest is invalid');
  }
  const expected = Buffer.from(archiveDigest.slice(7), 'hex');
  const actual = createHash('sha256').update(bytes).digest();
  if (!timingSafeEqual(actual, expected)) throw new Error('app archive digest does not match CI evidence');
  return archiveDigest;
}
