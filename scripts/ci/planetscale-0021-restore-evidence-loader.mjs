import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export function read0021RestoreEvidenceRecord(backupId, root) {
  if (typeof backupId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(backupId)) return { record: null, recordPath: null };
  const relativePath = path.join('docs/evidence/production-cutover/0021-restore-evidence', `${backupId}.json`);
  try {
    const recordPath = path.join(root, relativePath);
    const trackedRecord = spawnSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
      cwd: root, encoding: 'utf8', timeout: 5_000, maxBuffer: 10_000,
    });
    if (trackedRecord.status !== 0 || trackedRecord.stdout.trim() !== relativePath) return { record: null, recordPath: relativePath };
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    return {
      record,
      recordPath: relativePath,
      evidenceArtifact: read0021RestoreEvidenceArtifact(record, root),
    };
  } catch {
    return { record: null, recordPath: relativePath };
  }
}

function read0021RestoreEvidenceArtifact(record, root) {
  const relativePath = record?.artifactPath;
  const allowedPrefix = 'docs/evidence/production-cutover/0021-restore-evidence/artifacts/';
  if (typeof relativePath !== 'string' || !relativePath.startsWith(allowedPrefix)
    || path.posix.normalize(relativePath) !== relativePath || relativePath.includes('\\')) {
    return { path: typeof relativePath === 'string' ? relativePath : null, bytes: null };
  }
  const allowedRoot = path.resolve(root, 'docs/evidence/production-cutover/0021-restore-evidence/artifacts');
  const artifactPath = path.resolve(root, relativePath);
  if (!artifactPath.startsWith(`${allowedRoot}${path.sep}`)) return { path: relativePath, bytes: null };
  try {
    const trackedArtifact = spawnSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
      cwd: root, encoding: 'utf8', timeout: 5_000, maxBuffer: 10_000,
    });
    if (trackedArtifact.status !== 0 || trackedArtifact.stdout.trim() !== relativePath) return { path: relativePath, bytes: null };
    const fileStat = fs.lstatSync(artifactPath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) return { path: relativePath, bytes: null };
    const resolvedPath = fs.realpathSync(artifactPath);
    if (!resolvedPath.startsWith(`${allowedRoot}${path.sep}`)) return { path: relativePath, bytes: null };
    const bytes = fs.readFileSync(resolvedPath);
    return { path: relativePath, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch {
    return { path: relativePath, bytes: null };
  }
}
