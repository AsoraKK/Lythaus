import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { RestoreFailure } from '../ci/planetscale-native-restore-contract.mjs';
import { sha256 } from '../ci/planetscale-native-restore-evidence.mjs';
import { start } from './planetscale-native-restore-unmerged-cleanup-fixture.mjs';

import { rehearsal } from './planetscale-native-restore-cleanup-command-fixture.mjs';

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
