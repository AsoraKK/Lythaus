import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { RestoreFailure, requireThat } from './planetscale-native-restore-contract.mjs';
import { readTrackedEvidence, sha256, decimal } from './planetscale-native-restore-evidence.mjs';
import { assertDownloadedQualification, assertUploadedArtifact, pendingReceipt, pendingName,
  provePendingUpload, deleteReviewedTarget, reconcileReviewedTarget } from './planetscale-native-restore-cleanup.mjs';
import { CLEANUP_PROTOTYPE_STATUS, proveUnmergedCleanupContext } from './planetscale-native-restore-unmerged-cleanup-prototype.mjs';

export const CLEANUP_COMMAND_PROTOTYPE_ACTIVE = false;
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const maxArchiveBytes = 1048576, maxDataBytes = 262144;
const stages = ['prepare', 'download', 'stage', 'upload', 'delete', 'reconcile'];

function privateDirectory(directory) {
  requireThat(path.isAbsolute(directory ?? ''), 'prototype_private_directory_required');
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { mode: 0o700 });
  const stat = fs.lstatSync(directory);
  requireThat(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0
    && stat.uid === process.getuid() && fs.realpathSync(directory) === path.resolve(directory), 'prototype_private_directory_unsafe');
}

function writeOnce(directory, name, bytes) {
  try { fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx', mode: 0o600 }); }
  catch { throw new RestoreFailure('prototype_stage_file_already_present_or_unsafe'); }
}

function readPrivate(directory, name, maximum = maxArchiveBytes) {
  const file = path.join(directory, name), stat = fs.lstatSync(file);
  requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid()
    && (stat.mode & 0o077) === 0 && stat.size > 0 && stat.size <= maximum, 'prototype_stage_file_unsafe');
  return fs.readFileSync(file);
}

function checkoutHead(root) {
  requireThat(path.isAbsolute(root ?? '') && fs.realpathSync(root) === path.resolve(root), 'prototype_git_checkout_required');
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  requireThat(git(['status', '--porcelain', '--untracked-files=no']) === '', 'prototype_git_checkout_modified');
  return git(['rev-parse', 'HEAD']);
}

function archiveData(bytes, filename, directory) {
  requireThat(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= maxArchiveBytes, 'prototype_artifact_archive_invalid');
  const scratch = fs.mkdtempSync(path.join(directory, 'archive-'));
  try {
    writeOnce(scratch, 'artifact.zip', bytes);
    const file = path.join(scratch, 'artifact.zip');
    const entries = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8', maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'] });
    requireThat(entries.trimEnd() === filename && entries.split('\n').filter(Boolean).length === 1,
      'prototype_artifact_archive_entries_invalid');
    const data = execFileSync('unzip', ['-p', file, filename], { maxBuffer: maxDataBytes, stdio: ['ignore', 'pipe', 'pipe'] });
    requireThat(data.length > 0 && data.length <= maxDataBytes, 'prototype_artifact_data_invalid');
    return data;
  } catch (error) {
    if (error instanceof RestoreFailure) throw error;
    throw new RestoreFailure('prototype_artifact_archive_invalid');
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}

function binding(env, evidence) {
  return { mode: env.CLEANUP_MODE, cleanupSha: env.RELEASE_SHA, cleanupRunId: env.GITHUB_RUN_ID,
    evidenceSha: env.EVIDENCE_SHA, qualificationRunId: evidence.report.runId,
    recordSha256: evidence.record.recordSha256, qualificationSha256: evidence.record.evidenceSha256,
    targetId: evidence.report.createdTargetId, artifactId: String(evidence.record.nativeRestoreCleanup.artifactId),
    archiveSha256: evidence.record.nativeRestoreCleanup.artifactArchiveSha256 };
}

function qualificationDownload(directory, evidence) {
  const archive = readPrivate(directory, 'qualification.zip');
  requireThat(sha256(archive) === evidence.record.nativeRestoreCleanup.artifactArchiveSha256, 'prototype_qualification_archive_hash_mismatch');
  const data = archiveData(archive, 'qualification.json', directory);
  assertDownloadedQualification(evidence, data);
  requireThat(readPrivate(directory, 'qualification.json', maxDataBytes).equals(data), 'prototype_qualification_download_changed');
  return data;
}

function readOnlyApi(api) {
  return { request: (target, options = {}) => {
    requireThat((options.method ?? 'GET') === 'GET' && options.body === undefined, 'prototype_reconciliation_get_only');
    return api.request(target, options);
  }, list: (...args) => api.list(...args) };
}

export async function dispatchUnmergedCleanupStage({ stage, argv = [], env, transports, now = Date.now }) {
  const selected = stage ?? argv[0];
  requireThat(stages.includes(selected) && argv.length <= 1 && (!stage || argv.length === 0 || argv[0] === stage)
    && ['cleanup', 'reconcile'].includes(env?.CLEANUP_MODE)
    && (!['stage', 'upload', 'delete'].includes(selected) || env.CLEANUP_MODE === 'cleanup')
    && (selected !== 'reconcile' || env.CLEANUP_MODE === 'reconcile'), 'prototype_stage_context_invalid');
  requireThat(typeof transports?.read === 'function' && typeof transports.assertMain === 'function'
    && typeof transports.downloadArtifact === 'function' && transports.api, 'prototype_injected_transports_required');
  requireThat(env.GITHUB_SHA === env.RELEASE_SHA && env.GITHUB_REF === 'refs/heads/main'
    && env.REF_PROTECTED === 'true' && env.GITHUB_REPOSITORY_ID === '1010752912', 'prototype_protected_execution_context_invalid');
  const assertMain = async () => {
    requireThat(checkoutHead(env.GITHUB_WORKSPACE) === env.RELEASE_SHA, 'prototype_executable_checkout_sha_mismatch');
    await transports.assertMain(env);
    requireThat(checkoutHead(env.GITHUB_WORKSPACE) === env.RELEASE_SHA, 'prototype_executable_checkout_sha_mismatch');
  };
  const evidenceHead = checkoutHead(env.EVIDENCE_CHECKOUT);
  const evidence = readTrackedEvidence(env.EVIDENCE_CHECKOUT, env.QUALIFICATION_RUN_ID);
  const reconcile = env.CLEANUP_MODE === 'reconcile';
  const context = await proveUnmergedCleanupContext({ env, evidence, evidenceHead, now: now(),
    read: transports.read, assertMain, reconcile });
  const directory = env.EVIDENCE_DIR;
  privateDirectory(directory);
  const expected = binding(env, evidence);
  if (selected === 'prepare') {
    writeOnce(directory, 'prepared.json', encode(expected));
    return { status: CLEANUP_PROTOTYPE_STATUS, ...expected, pendingName: reconcile ? null : pendingName(context.report, context.intent) };
  }
  requireThat(readPrivate(directory, 'prepared.json').equals(encode(expected)), 'prototype_prepared_binding_changed');
  if (selected === 'download') {
    const archive = await transports.downloadArtifact({ artifactId: expected.artifactId, runId: context.report.runId });
    requireThat(Buffer.isBuffer(archive) && sha256(archive) === expected.archiveSha256, 'prototype_qualification_archive_hash_mismatch');
    const data = archiveData(archive, 'qualification.json', directory);
    assertDownloadedQualification(evidence, data);
    writeOnce(directory, 'qualification.zip', archive); writeOnce(directory, 'qualification.json', data);
    return { status: 'QUALIFICATION_DOWNLOAD_VERIFIED', sha256: sha256(data) };
  }
  const downloadedQualification = qualificationDownload(directory, evidence);
  if (selected === 'stage') {
    writeOnce(directory, 'pending.json', encode(pendingReceipt(context, env)));
    return { status: 'DELETE_PENDING_STAGED', providerMutations: false };
  }
  if (selected === 'reconcile') {
    const receipt = await reconcileReviewedTarget({ env, evidence, evidenceHead, downloadedQualification,
      read: transports.read, assertMain, api: readOnlyApi(transports.api), now, proveContext: proveUnmergedCleanupContext });
    writeOnce(directory, 'reconciliation.json', encode(receipt)); return receipt;
  }
  const pendingBytes = readPrivate(directory, 'pending.json');
  requireThat(pendingBytes.equals(encode(pendingReceipt(context, env))), 'pending_attempt_bytes_mismatch');
  if (selected === 'upload') {
    requireThat(typeof transports.uploadArtifact === 'function', 'prototype_pending_upload_transport_required');
    writeOnce(directory, 'pending-upload-attempt.json', encode(expected));
    const uploaded = await transports.uploadArtifact({ name: pendingName(context.report, context.intent),
      runId: env.GITHUB_RUN_ID, filename: 'pending.json', bytes: pendingBytes });
    requireThat(decimal(uploaded?.artifactId) && typeof uploaded.archiveSha256 === 'string'
      && /^[a-f0-9]{64}$/.test(uploaded.archiveSha256), 'prototype_pending_upload_unproven');
    const pendingEnv = { ...env, PENDING_ARTIFACT_ID: uploaded.artifactId, PENDING_ARTIFACT_DIGEST: uploaded.archiveSha256 };
    assertUploadedArtifact(await transports.read(`/actions/artifacts/${uploaded.artifactId}`), {
      id: uploaded.artifactId, runId: env.GITHUB_RUN_ID, name: pendingName(context.report, context.intent), archiveSha256: uploaded.archiveSha256 });
    writeOnce(directory, 'pending-upload.json', encode({ binding: expected,
      artifactId: uploaded.artifactId, archiveSha256: uploaded.archiveSha256 }));
    const downloaded = await transports.downloadArtifact({ artifactId: uploaded.artifactId, runId: env.GITHUB_RUN_ID });
    requireThat(Buffer.isBuffer(downloaded) && sha256(downloaded) === uploaded.archiveSha256, 'prototype_pending_archive_hash_mismatch');
    const data = archiveData(downloaded, 'pending.json', directory);
    await provePendingUpload({ env: pendingEnv, context, pendingBytes, downloadedBytes: data, read: transports.read });
    writeOnce(directory, 'pending-download.zip', downloaded); writeOnce(directory, 'pending-download.json', data);
    return { status: 'DELETE_PENDING_UPLOAD_VERIFIED', artifactId: uploaded.artifactId, archiveSha256: uploaded.archiveSha256 };
  }
  const uploaded = JSON.parse(readPrivate(directory, 'pending-upload.json'));
  requireThat(encode(uploaded.binding).equals(encode(expected))
    && decimal(uploaded.artifactId) && /^[a-f0-9]{64}$/.test(uploaded.archiveSha256), 'prototype_pending_binding_changed');
  const pendingArchive = readPrivate(directory, 'pending-download.zip');
  requireThat(sha256(pendingArchive) === uploaded.archiveSha256, 'prototype_pending_archive_hash_mismatch');
  const downloadedPending = archiveData(pendingArchive, 'pending.json', directory);
  requireThat(downloadedPending.equals(readPrivate(directory, 'pending-download.json')), 'pending_attempt_bytes_mismatch');
  const pendingEnv = { ...env, PENDING_ARTIFACT_ID: uploaded.artifactId, PENDING_ARTIFACT_DIGEST: uploaded.archiveSha256 };
  writeOnce(directory, 'delete-attempt.json', encode(expected));
  let checkpoint = 0;
  const receipt = await deleteReviewedTarget({ env: pendingEnv, evidence, evidenceHead, downloadedQualification,
    pendingBytes, downloadedPending, read: transports.read, assertMain, api: transports.api, now,
    sleep: transports.sleep, proveContext: proveUnmergedCleanupContext,
    checkpoint: value => writeOnce(directory, `cleanup-checkpoint-${++checkpoint}.json`, encode(value)) });
  writeOnce(directory, 'cleanup.json', encode(receipt)); return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify({ status: CLEANUP_PROTOTYPE_STATUS, active: CLEANUP_COMMAND_PROTOTYPE_ACTIVE }) + '\n');
  process.exitCode = 1;
}
