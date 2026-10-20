import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assess0021RestoreEvidence,
  hash0021RestoreEvidenceArtifact,
  hash0021RestoreEvidenceRecord,
  REQUIRED_0021_RESTORE_SCOPE,
  RESTORE_EVIDENCE_SCHEMA,
} from '../ci/planetscale-0021-only-contract.mjs';
import { read0021RestoreEvidenceRecord } from '../ci/planetscale-0021-restore-evidence-loader.mjs';

const RECORD_DIRECTORY = 'docs/evidence/production-cutover/0021-restore-evidence';
const ARTIFACT_DIRECTORY = `${RECORD_DIRECTORY}/artifacts`;
const BACKUP_ID = 'fixture-backup';
const DEFAULT_ARTIFACT_PATH = `${ARTIFACT_DIRECTORY}/evidence.bin`;
const FIXTURE_BYTES = Buffer.from('temporary Git fixture evidence\n', 'utf8');
const SOURCE_BRANCH = { id: 'source-branch-fixture', name: 'main' };
const BACKUP = {
  id: BACKUP_ID,
  completed_at: '2026-10-18T10:00:00.000Z',
  expires_at: '2026-11-18T10:00:00.000Z',
};
const NOW = Date.parse('2026-10-20T00:00:00.000Z');

function runGit(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function makeRecord(artifactPath, artifactBytes = FIXTURE_BYTES) {
  const record = {
    schemaVersion: RESTORE_EVIDENCE_SCHEMA,
    sourceBranch: SOURCE_BRANCH,
    selectedBackupId: BACKUP_ID,
    restoredBranch: {
      id: 'restored-branch-fixture',
      state: 'deleted',
      createdAt: '2026-10-18T10:30:00.000Z',
    },
    verifiedAt: '2026-10-18T11:00:00.000Z',
    artifactPath,
    evidenceSha256: hash0021RestoreEvidenceArtifact(artifactBytes),
    verifiedScope: [...REQUIRED_0021_RESTORE_SCOPE],
    unresolvedGates: [],
    review: {
      reviewedAt: '2026-10-18T11:10:00.000Z',
      reviewedBy: 'loader test reviewer',
      reference: 'temporary fixture review',
    },
  };
  return { ...record, recordSha256: hash0021RestoreEvidenceRecord(record) };
}

function createFixture(t, {
  artifactPath = DEFAULT_ARTIFACT_PATH,
  artifactKind = 'file',
  artifactBytes = FIXTURE_BYTES,
  artifactTargetPath = `${ARTIFACT_DIRECTORY}/target.bin`,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-0021-loader-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  runGit(root, ['init', '--quiet']);
  runGit(root, ['config', 'user.name', 'Lythaus Loader Test']);
  runGit(root, ['config', 'user.email', 'loader-test@example.test']);
  runGit(root, ['config', 'commit.gpgsign', 'false']);

  const record = makeRecord(artifactPath);
  const recordFile = path.join(root, RECORD_DIRECTORY, `${BACKUP_ID}.json`);
  fs.mkdirSync(path.dirname(recordFile), { recursive: true });
  fs.writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);

  if (artifactKind === 'file') {
    const artifactFile = path.resolve(root, artifactPath);
    fs.mkdirSync(path.dirname(artifactFile), { recursive: true });
    fs.writeFileSync(artifactFile, artifactBytes);
  } else if (artifactKind === 'symlink') {
    const artifactFile = path.resolve(root, artifactPath);
    const targetFile = path.resolve(root, artifactTargetPath);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, artifactBytes);
    fs.mkdirSync(path.dirname(artifactFile), { recursive: true });
    fs.symlinkSync(path.relative(path.dirname(artifactFile), targetFile), artifactFile);
  } else if (artifactKind !== 'missing') {
    throw new Error(`unsupported fixture artifact kind: ${artifactKind}`);
  }

  runGit(root, ['add', '--all']);
  runGit(root, ['commit', '--quiet', '-m', 'temporary restore evidence fixture']);
  return { root, record, artifactPath };
}

function assessLoaded(result) {
  return assess0021RestoreEvidence({
    record: result.record,
    recordPath: result.recordPath,
    evidenceArtifact: result.evidenceArtifact,
    sourceBranch: SOURCE_BRANCH,
    backup: BACKUP,
    selectedBackupId: BACKUP_ID,
    now: NOW,
  });
}

test('loads a valid tracked restore artifact from a temporary Git repository', t => {
  const fixture = createFixture(t);
  assert.equal(runGit(fixture.root, ['ls-files', '--error-unmatch', '--', DEFAULT_ARTIFACT_PATH]), DEFAULT_ARTIFACT_PATH);
  const result = read0021RestoreEvidenceRecord(BACKUP_ID, fixture.root);

  assert.deepEqual(result.record, fixture.record);
  assert.equal(result.recordPath, path.join(RECORD_DIRECTORY, `${BACKUP_ID}.json`));
  assert.equal(result.evidenceArtifact.path, DEFAULT_ARTIFACT_PATH);
  assert.deepEqual(result.evidenceArtifact.bytes, FIXTURE_BYTES);
  assert.equal(result.evidenceArtifact.sha256, createHash('sha256').update(FIXTURE_BYTES).digest('hex'));
  assert.equal(assessLoaded(result).ok, true);
});

test('blocks a tracked record whose artifact file is missing', t => {
  const fixture = createFixture(t, { artifactKind: 'missing' });
  const result = read0021RestoreEvidenceRecord(BACKUP_ID, fixture.root);

  assert.deepEqual(result.record, fixture.record);
  assert.equal(result.evidenceArtifact.bytes, null);
  assert.ok(assessLoaded(result).blockers.includes('restore_evidence_artifact_unavailable_or_empty'));
});

test('blocks an existing artifact that is untracked by Git', t => {
  const fixture = createFixture(t, { artifactKind: 'missing' });
  const artifactFile = path.join(fixture.root, DEFAULT_ARTIFACT_PATH);
  fs.mkdirSync(path.dirname(artifactFile), { recursive: true });
  fs.writeFileSync(artifactFile, FIXTURE_BYTES);
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', DEFAULT_ARTIFACT_PATH], {
    cwd: fixture.root, encoding: 'utf8', timeout: 10_000,
  });
  assert.notEqual(tracked.status, 0);

  const result = read0021RestoreEvidenceRecord(BACKUP_ID, fixture.root);

  assert.equal(result.evidenceArtifact.bytes, null);
  assert.ok(assessLoaded(result).blockers.includes('restore_evidence_artifact_unavailable_or_empty'));
});

test('detects tampered bytes in a tracked restore artifact', t => {
  const fixture = createFixture(t);
  const artifactFile = path.join(fixture.root, DEFAULT_ARTIFACT_PATH);
  const tamperedBytes = Buffer.from('tampered temporary Git fixture evidence\n', 'utf8');
  fs.writeFileSync(artifactFile, tamperedBytes);

  const result = read0021RestoreEvidenceRecord(BACKUP_ID, fixture.root);

  assert.deepEqual(result.evidenceArtifact.bytes, tamperedBytes);
  assert.notEqual(result.evidenceArtifact.sha256, fixture.record.evidenceSha256);
  assert.ok(assessLoaded(result).blockers.includes('restore_evidence_artifact_hash_mismatch'));
});

test('rejects artifact path traversal outside the allowlisted directory', t => {
  const traversalPath = `${ARTIFACT_DIRECTORY}/../outside.bin`;
  const fixture = createFixture(t, { artifactPath: traversalPath, artifactKind: 'missing' });
  const outsideFile = path.resolve(fixture.root, traversalPath);
  fs.mkdirSync(path.dirname(outsideFile), { recursive: true });
  fs.writeFileSync(outsideFile, FIXTURE_BYTES);
  runGit(fixture.root, ['add', '--all']);
  runGit(fixture.root, ['commit', '--quiet', '-m', 'track traversal target']);

  const result = read0021RestoreEvidenceRecord(BACKUP_ID, fixture.root);

  assert.equal(result.evidenceArtifact.path, traversalPath);
  assert.equal(result.evidenceArtifact.bytes, null);
  assert.ok(assessLoaded(result).blockers.includes('restore_evidence_artifact_path_missing_or_not_allowlisted'));
});

test('rejects a tracked final-component symlink artifact', t => {
  const fixture = createFixture(t, {
    artifactPath: `${ARTIFACT_DIRECTORY}/evidence-link.bin`,
    artifactKind: 'symlink',
  });
  assert.equal(runGit(fixture.root, ['ls-files', '--error-unmatch', '--', fixture.artifactPath]), fixture.artifactPath);

  const result = read0021RestoreEvidenceRecord(BACKUP_ID, fixture.root);

  assert.equal(result.evidenceArtifact.bytes, null);
  assert.ok(assessLoaded(result).blockers.includes('restore_evidence_artifact_unavailable_or_empty'));
});

test('rejects a tracked artifact reached through a symlinked parent directory', t => {
  const nestedArtifactPath = `${ARTIFACT_DIRECTORY}/nested/evidence.bin`;
  const fixture = createFixture(t, { artifactPath: nestedArtifactPath });
  const nestedDirectory = path.join(fixture.root, ARTIFACT_DIRECTORY, 'nested');
  const externalDirectory = path.join(fixture.root, 'outside-artifacts');
  fs.mkdirSync(externalDirectory, { recursive: true });
  fs.writeFileSync(path.join(externalDirectory, 'evidence.bin'), FIXTURE_BYTES);
  fs.rmSync(nestedDirectory, { recursive: true, force: true });
  fs.symlinkSync(externalDirectory, nestedDirectory, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(runGit(fixture.root, ['ls-files', '--error-unmatch', '--', nestedArtifactPath]), nestedArtifactPath);
  assert.equal(fs.lstatSync(path.join(fixture.root, nestedArtifactPath)).isSymbolicLink(), false);

  const result = read0021RestoreEvidenceRecord(BACKUP_ID, fixture.root);

  assert.equal(result.evidenceArtifact.bytes, null);
  assert.ok(assessLoaded(result).blockers.includes('restore_evidence_artifact_unavailable_or_empty'));
});
