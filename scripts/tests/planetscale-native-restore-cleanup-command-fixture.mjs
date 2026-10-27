import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RECORD_PATH, artifactPath, sha256 } from '../ci/planetscale-native-restore-evidence.mjs';
import { dispatchUnmergedCleanupStage } from '../ci/planetscale-native-restore-unmerged-cleanup-command-prototype.mjs';
import { fixture } from './planetscale-native-restore-unmerged-cleanup-fixture.mjs';

export function rehearsal(t, outcome = 'PASSED', { artifactKind = 'valid' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-cleanup-command-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const code = path.join(root, 'code'), evidence = path.join(root, 'evidence'), artifacts = path.join(root, 'artifacts');
  fs.mkdirSync(code, { mode: 0o700 }); fs.mkdirSync(artifacts, { mode: 0o700 });
  const git = (cwd, args, binary = false) => execFileSync('git', ['-C', cwd, ...args], {
    encoding: binary ? undefined : 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const commit = (cwd, message) => git(cwd, ['-c', 'user.name=Local Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', message]);
  git(code, ['init', '--initial-branch=main']); fs.writeFileSync(path.join(code, 'baseline'), 'synthetic qualified code\n');
  git(code, ['add', 'baseline']); commit(code, 'Synthetic qualified main');
  const qualifiedSha = git(code, ['rev-parse', 'HEAD']).trim();
  const f = fixture(outcome, { qualifiedSha });
  const qualificationName = artifactKind === 'wrong entry' ? 'other.json' : 'qualification.json';
  fs.writeFileSync(path.join(artifacts, qualificationName), artifactKind === 'wrong bytes' ? '{}' : f.evidence.bytes, { mode: 0o600 });
  const qualificationZip = path.join(artifacts, 'qualification.zip');
  if (artifactKind === 'malformed ZIP') fs.writeFileSync(qualificationZip, 'synthetic invalid ZIP');
  else execFileSync('zip', ['-q', '-X', '-j', qualificationZip, path.join(artifacts, qualificationName)]);
  const archives = new Map([['51', fs.readFileSync(qualificationZip)]]), uploadedMetadata = new Map();
  f.record.nativeRestoreCleanup.artifactArchiveSha256 = sha256(archives.get('51')); f.refresh();
  git(root, ['clone', '--shared', '--quiet', code, evidence]); git(evidence, ['switch', '-c', 'evidence']);
  for (const [relative, bytes] of [[RECORD_PATH, f.evidence.recordBytes], [artifactPath(f.report.runId), f.evidence.bytes]]) {
    const file = path.join(evidence, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes, { mode: 0o600 });
  }
  git(evidence, ['add', 'docs']); commit(evidence, 'Synthetic exact evidence data');
  const reviewedSha = git(evidence, ['rev-parse', 'HEAD']).trim(); f.setEvidenceSha(reviewedSha);
  Object.assign(f.env, { GITHUB_WORKSPACE: code, GITHUB_SHA: qualifiedSha, GITHUB_REF: 'refs/heads/main',
    REF_PROTECTED: 'true', GITHUB_REPOSITORY_ID: '1010752912', EVIDENCE_CHECKOUT: evidence,
    EVIDENCE_DIR: path.join(root, 'cleanup-state'), CLEANUP_MODE: 'cleanup' });
  const read = f.options.read;
  const transports = { api: f.options.api, sleep: f.options.sleep,
    assertMain: async env => { f.calls.push('MAIN'); assert.equal(git(code, ['rev-parse', 'HEAD']).trim(), env.RELEASE_SHA); },
    read: async suffix => {
      if (suffix.startsWith('/git/')) {
        f.calls.push(`GITHUB ${suffix}`); const sha = suffix.split('/').at(-1);
        if (suffix.startsWith('/git/commits/')) {
          const tree = git(evidence, ['show', '-s', '--format=%T', sha]).trim(); return { sha, tree: { sha: tree } };
        }
        if (suffix.startsWith('/git/trees/')) return { sha, truncated: false,
          tree: git(evidence, ['ls-tree', '-z', sha]).split('\0').filter(Boolean).map(entry => {
            const match = /^(\d{6}) (tree|blob) ([a-f0-9]{40})\t(.+)$/.exec(entry);
            assert.ok(match); return { mode: match[1], type: match[2], sha: match[3], path: match[4] };
          }) };
        const bytes = git(evidence, ['cat-file', 'blob', sha], true);
        return { sha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') };
      }
      if (suffix.startsWith('/compare/')) {
        f.calls.push(`GITHUB ${suffix}`); const [base, head] = suffix.slice('/compare/'.length).split('...');
        const checkout = head === reviewedSha ? evidence : code;
        return { merge_base_commit: { sha: git(checkout, ['merge-base', base, head]).trim() }, status: 'ahead', ahead_by: 1,
          files: git(checkout, ['diff', '--name-only', base, head]).trim().split('\n').filter(Boolean).map(filename => ({
            filename, status: 'added', sha: git(checkout, ['rev-parse', `${head}:${filename}`]).trim() })) };
      }
      if (suffix === '/actions/artifacts/51') {
        const metadata = await read(suffix);
        return { ...metadata, size_in_bytes: archives.get('51').length, digest: `sha256:${sha256(archives.get('51'))}` };
      }
      if (uploadedMetadata.has(suffix)) { f.calls.push(`GITHUB ${suffix}`); return structuredClone(uploadedMetadata.get(suffix)); }
      const metadata = await read(suffix);
      if (suffix === `/actions/runs/${f.env.GITHUB_RUN_ID}`) return { ...metadata,
        head_sha: f.env.RELEASE_SHA, run_number: Number(f.env.GITHUB_RUN_NUMBER) };
      return metadata;
    },
    downloadArtifact: async ({ artifactId, runId }) => {
      f.calls.push(`DOWNLOAD ${artifactId} ${runId}`); const archive = archives.get(artifactId);
      assert.ok(archive); return Buffer.from(archive);
    },
    uploadArtifact: async ({ name, runId, filename, bytes }) => {
      f.calls.push(`UPLOAD 52 ${runId}`); assert.equal(archives.has('52'), false);
      assert.equal(filename, 'pending.json'); fs.writeFileSync(path.join(artifacts, filename), bytes, { mode: 0o600 });
      const archive = path.join(artifacts, 'pending-service.zip');
      execFileSync('zip', ['-q', '-X', '-j', archive, path.join(artifacts, filename)]);
      archives.set('52', fs.readFileSync(archive)); const digest = sha256(archives.get('52'));
      uploadedMetadata.set('/actions/artifacts/52', { id: 52, name, expired: false, size_in_bytes: archives.get('52').length,
        workflow_run: { id: Number(runId) }, digest: `sha256:${digest}` });
      return { artifactId: '52', archiveSha256: digest };
    } };
  const run = stage => dispatchUnmergedCleanupStage({ argv: [stage], env: f.env, transports, now: f.options.now });
  const through = async last => {
    for (const stage of ['prepare', 'download', 'stage', 'upload', 'delete']) { const result = await run(stage); if (stage === last) return result; }
  };
  return { ...f, root, code, evidenceCheckout: evidence, qualifiedSha, reviewedSha, git, commit,
    archives, uploadedMetadata, transports, run, through };
}
