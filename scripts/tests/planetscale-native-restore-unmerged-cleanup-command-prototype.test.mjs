import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { RestoreFailure } from '../ci/planetscale-native-restore-contract.mjs';
import { RECORD_PATH, artifactPath, sha256 } from '../ci/planetscale-native-restore-evidence.mjs';
import { dispatchUnmergedCleanupStage } from '../ci/planetscale-native-restore-unmerged-cleanup-command-prototype.mjs';
import { fixture, start } from './planetscale-native-restore-unmerged-cleanup-fixture.mjs';

function rehearsal(t, outcome = 'PASSED', { artifactKind = 'valid' } = {}) {
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
const deletes = f => f.calls.filter(call => call.startsWith('DELETE ')).length;

for (const outcome of ['PASSED', 'FAILED']) test(`same command dispatcher executes every cleanup stage for ${outcome} qualification`, async t => {
  const f = rehearsal(t, outcome), upload = f.transports.uploadArtifact;
  f.transports.uploadArtifact = async args => ({ ...await upload(args), binding: { substituted: true }, privateProviderBody: 'omitted' });
  const result = await f.through('delete');
  assert.equal(result.deletionVerified, true); assert.equal(result.recoveryCertified, false); assert.equal(deletes(f), 1);
  assert.equal(f.calls.filter(call => call.startsWith('UPLOAD ')).length, 1);
  assert.ok(f.calls.includes('DOWNLOAD 51 12345')); assert.ok(f.calls.includes('DOWNLOAD 52 23456'));
  const ack = JSON.parse(fs.readFileSync(path.join(f.env.EVIDENCE_DIR, 'pending-upload.json')));
  assert.equal(ack.binding.artifactId, '51'); assert.equal(ack.artifactId, '52');
  assert.deepEqual(Object.keys(ack).sort(), ['archiveSha256', 'artifactId', 'binding']);
  assert.equal(ack.binding.archiveSha256, sha256(f.archives.get('51'))); assert.equal(ack.archiveSha256, sha256(f.archives.get('52')));
  for (const file of fs.readdirSync(f.env.EVIDENCE_DIR)) {
    const stat = fs.statSync(path.join(f.env.EVIDENCE_DIR, file)); assert.equal(stat.mode & 0o077, 0);
  }
  await assert.rejects(() => f.run('delete'), /prototype_stage_file_already_present_or_unsafe/);
  assert.equal(deletes(f), 1);
});

test('stage and upload attempts are exclusive and cannot silently retry', async t => {
  const f = rehearsal(t); await f.through('stage');
  await assert.rejects(() => f.run('stage'), /prototype_stage_file_already_present_or_unsafe/);
  await f.run('upload'); await assert.rejects(() => f.run('upload'), /prototype_stage_file_already_present_or_unsafe/);
  assert.equal(deletes(f), 0); assert.equal(f.calls.filter(call => call.startsWith('UPLOAD ')).length, 1);
});

for (const label of ['wrong archive digest', 'malformed ZIP', 'wrong entry', 'wrong bytes', 'missing pending', 'changed pending download', 'modified code checkout', 'wrong executable SHA']) {
  test(`real staged command blocks ${label} before DELETE`, async t => {
    const f = rehearsal(t, 'PASSED', { artifactKind: label });
    if (['wrong archive digest', 'malformed ZIP', 'wrong entry', 'wrong bytes'].includes(label)) {
      await f.run('prepare');
      if (label === 'wrong archive digest') f.transports.downloadArtifact = async () => Buffer.from('wrong archive');
      const codes = { 'wrong archive digest': 'prototype_qualification_archive_hash_mismatch',
        'malformed ZIP': 'prototype_artifact_archive_invalid', 'wrong entry': 'prototype_artifact_archive_entries_invalid',
        'wrong bytes': 'downloaded_qualification_artifact_mismatch' };
      await assert.rejects(() => f.run('download'), { code: codes[label] });
    } else {
      await f.through(label === 'missing pending' ? 'download' : 'upload');
      if (label === 'changed pending download') fs.writeFileSync(path.join(f.env.EVIDENCE_DIR, 'pending-download.zip'), 'tampered');
      if (label === 'modified code checkout') fs.writeFileSync(path.join(f.code, 'baseline'), 'modified');
      if (label === 'wrong executable SHA') f.env.RELEASE_SHA = 'f'.repeat(40);
      await assert.rejects(() => f.run('delete'));
    }
    assert.equal(deletes(f), 0);
  });
}

test('missing pending upload acknowledgement and failed upload cannot authorize deletion or retry', async t => {
  const f = rehearsal(t); await f.through('stage');
  let uploads = 0; f.transports.uploadArtifact = async () => { uploads++; throw new Error('synthetic unknown upload outcome'); };
  await assert.rejects(() => f.run('upload'));
  await assert.rejects(() => f.run('upload'), /prototype_stage_file_already_present_or_unsafe/);
  await assert.rejects(() => f.run('delete'));
  assert.equal(uploads, 1); assert.equal(deletes(f), 0);
});

test('uncertain in-run DELETE is later observed by GET-only prepare/download/reconcile under main drift', async t => {
  const f = rehearsal(t), request = f.transports.api.request;
  f.transports.api.request = async (p, o = {}) => {
    if (o.method === 'DELETE') { f.calls.push(`DELETE ${p}`); throw new RestoreFailure('provider_transport_failed', 'UNKNOWN_MUTATION_OUTCOME'); }
    return request(p, o);
  };
  const uncertain = await f.through('delete');
  assert.equal(uncertain.state, 'DELETE_OUTCOME_UNCERTAIN_READ_ONLY_RECONCILIATION_REQUIRED'); assert.equal(deletes(f), 1);
  fs.writeFileSync(path.join(f.code, 'later'), 'later protected main\n'); f.git(f.code, ['add', 'later']); f.commit(f.code, 'Later main');
  const currentSha = f.git(f.code, ['rev-parse', 'HEAD']).trim();
  f.overrides.set('/pulls/999', row => ({ ...row, changed_files: 3, base: { ...row.base, sha: currentSha } }));
  Object.assign(f.env, { RELEASE_SHA: currentSha, GITHUB_SHA: currentSha, GITHUB_RUN_ID: '23457', GITHUB_RUN_NUMBER: '3',
    CLEANUP_MODE: 'reconcile', EVIDENCE_DIR: path.join(f.root, 'late-reconciliation') });
  delete f.env.CLEANUP_APPROVAL_JSON; f.setClock(start + 180 * 60000); f.setDeleted(true);
  const boundary = f.calls.length;
  await f.run('prepare'); await f.run('download'); const result = await f.run('reconcile');
  assert.equal(result.state, 'ABSENCE_OBSERVED_READ_ONLY'); assert.equal(result.providerMutations, false);
  assert.equal(result.deletionVerified, false); assert.equal(deletes(f), 1);
  assert.equal(f.calls.slice(boundary).some(call => /^(DELETE|POST|PATCH|UPLOAD|AUTHORITY)/.test(call)), false);
  assert.equal(fs.readdirSync(f.env.EVIDENCE_DIR).some(file => file.includes('pending') || file.includes('delete-attempt')), false);
});

test('late read-only reconciliation works with expired consent and unchanged qualified main', async t => {
  const f = rehearsal(t); Object.assign(f.env, { CLEANUP_MODE: 'reconcile', GITHUB_RUN_ID: '23457', GITHUB_RUN_NUMBER: '3' });
  f.setClock(start + 180 * 60000);
  await f.run('prepare'); await f.run('download'); const result = await f.run('reconcile');
  assert.equal(result.state, 'TARGET_PRESENT_READ_ONLY'); assert.equal(deletes(f), 0);
  assert.equal(f.calls.includes('AUTHORITY'), false);
});

test('standalone command stays disabled and active workflow routes remain unchanged', () => {
  const module = new URL('../ci/planetscale-native-restore-unmerged-cleanup-command-prototype.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [module.pathname, 'delete'], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.deepEqual(JSON.parse(result.stdout), { status: 'OWNER_APPROVAL_REQUIRED', active: false });
  for (const file of ['planetscale-native-restore-check.yml', 'planetscale-native-restore-cleanup.yml']) {
    const text = fs.readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /command-prototype|dispatchUnmergedCleanupStage/);
  }
});
