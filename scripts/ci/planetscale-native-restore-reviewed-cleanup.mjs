import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { RestoreFailure, requireThat, failureCode, RestoreCleanupApi } from './planetscale-native-restore-contract.mjs';
import { readTrackedEvidence, sha256, decimal, githubRead } from './planetscale-native-restore-evidence.mjs';
import { assertDownloadedQualification, assertUploadedArtifact, pendingReceipt, pendingName,
  provePendingUpload, deleteReviewedTarget, reconcileReviewedTarget } from './planetscale-native-restore-cleanup.mjs';
import { REVIEWED_CLEANUP_POLICY_STATUS, proveReviewedCleanupContext } from './planetscale-native-restore-reviewed-cleanup-evidence.mjs';
import { githubReadiness } from './planetscale-native-restore-check.mjs';
import { githubArtifactDownloader } from './planetscale-native-restore-cleanup-artifact-transport.mjs';

const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const maxArchiveBytes = 1048576, maxDataBytes = 262144;
const stages = ['prepare', 'download', 'stage', 'verify-pending', 'delete', 'reconcile'];

function privateDirectory(directory) {
  requireThat(path.isAbsolute(directory ?? ''), 'reviewed_private_directory_required');
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { mode: 0o700 });
  const stat = fs.lstatSync(directory);
  requireThat(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0
    && stat.uid === process.getuid() && fs.realpathSync(directory) === path.resolve(directory), 'reviewed_private_directory_unsafe');
}

function writeOnce(directory, name, bytes) {
  try { fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx', mode: 0o600 }); }
  catch { throw new RestoreFailure('reviewed_stage_file_already_present_or_unsafe'); }
}

function readPrivate(directory, name, maximum = maxArchiveBytes) {
  const file = path.join(directory, name), stat = fs.lstatSync(file);
  requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid()
    && (stat.mode & 0o077) === 0 && stat.size > 0 && stat.size <= maximum, 'reviewed_stage_file_unsafe');
  return fs.readFileSync(file);
}

function checkoutHead(root) {
  requireThat(path.isAbsolute(root ?? '') && fs.realpathSync(root) === path.resolve(root), 'reviewed_git_checkout_required');
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  requireThat(git(['status', '--porcelain', '--untracked-files=no']) === '', 'reviewed_git_checkout_modified');
  return git(['rev-parse', 'HEAD']);
}

function archiveData(bytes, filename, directory) {
  requireThat(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= maxArchiveBytes, 'reviewed_artifact_archive_invalid');
  const scratch = fs.mkdtempSync(path.join(directory, 'archive-'));
  try {
    writeOnce(scratch, 'artifact.zip', bytes);
    const file = path.join(scratch, 'artifact.zip');
    const entries = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8', maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'] });
    requireThat(entries.trimEnd() === filename && entries.split('\n').filter(Boolean).length === 1,
      'reviewed_artifact_archive_entries_invalid');
    const data = execFileSync('unzip', ['-p', file, filename], { maxBuffer: maxDataBytes, stdio: ['ignore', 'pipe', 'pipe'] });
    requireThat(data.length > 0 && data.length <= maxDataBytes, 'reviewed_artifact_data_invalid');
    return data;
  } catch (error) {
    if (error instanceof RestoreFailure) throw error;
    throw new RestoreFailure('reviewed_artifact_archive_invalid');
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
  requireThat(sha256(archive) === evidence.record.nativeRestoreCleanup.artifactArchiveSha256, 'reviewed_qualification_archive_hash_mismatch');
  const data = archiveData(archive, 'qualification.json', directory);
  assertDownloadedQualification(evidence, data);
  requireThat(readPrivate(directory, 'qualification.json', maxDataBytes).equals(data), 'reviewed_qualification_download_changed');
  return data;
}

function readOnlyApi(api) {
  return { request: (target, options = {}) => {
    requireThat((options.method ?? 'GET') === 'GET' && options.body === undefined, 'reviewed_reconciliation_get_only');
    return api.request(target, options);
  }, list: (...args) => api.list(...args) };
}

export async function dispatchReviewedCleanupStage({ stage, argv = [], env, transports, now = Date.now }) {
  const selected = stage ?? argv[0];
  requireThat(stages.includes(selected) && argv.length <= 1 && (!stage || argv.length === 0 || argv[0] === stage)
    && ['cleanup', 'reconcile'].includes(env?.CLEANUP_MODE)
    && (!['stage', 'verify-pending', 'delete'].includes(selected) || env.CLEANUP_MODE === 'cleanup')
    && (selected !== 'reconcile' || env.CLEANUP_MODE === 'reconcile'), 'reviewed_stage_context_invalid');
  requireThat(typeof transports?.read === 'function' && typeof transports.assertMain === 'function'
    && typeof transports.downloadArtifact === 'function' && transports.api, 'reviewed_injected_transports_required');
  requireThat(env.GITHUB_SHA === env.RELEASE_SHA && env.GITHUB_REF === 'refs/heads/main'
    && env.REF_PROTECTED === 'true' && env.GITHUB_REPOSITORY_ID === '1010752912', 'reviewed_protected_execution_context_invalid');
  const assertMain = async () => {
    requireThat(checkoutHead(env.GITHUB_WORKSPACE) === env.RELEASE_SHA, 'reviewed_executable_checkout_sha_mismatch');
    await transports.assertMain(env);
    requireThat(checkoutHead(env.GITHUB_WORKSPACE) === env.RELEASE_SHA, 'reviewed_executable_checkout_sha_mismatch');
  };
  const evidenceHead = checkoutHead(env.EVIDENCE_CHECKOUT);
  const evidence = readTrackedEvidence(env.EVIDENCE_CHECKOUT, env.QUALIFICATION_RUN_ID);
  const reconcile = env.CLEANUP_MODE === 'reconcile';
  const context = await proveReviewedCleanupContext({ env, evidence, evidenceHead, now: now(),
    read: transports.read, assertMain, reconcile });
  const directory = env.EVIDENCE_DIR;
  privateDirectory(directory);
  const expected = binding(env, evidence);
  if (selected === 'prepare') {
    writeOnce(directory, 'prepared.json', encode(expected));
    return { status: REVIEWED_CLEANUP_POLICY_STATUS, ...expected, pendingName: reconcile ? null : pendingName(context.report, context.intent) };
  }
  requireThat(readPrivate(directory, 'prepared.json').equals(encode(expected)), 'reviewed_prepared_binding_changed');
  if (selected === 'download') {
    const archive = await transports.downloadArtifact({ artifactId: expected.artifactId, runId: context.report.runId });
    requireThat(Buffer.isBuffer(archive) && sha256(archive) === expected.archiveSha256, 'reviewed_qualification_archive_hash_mismatch');
    const data = archiveData(archive, 'qualification.json', directory);
    assertDownloadedQualification(evidence, data);
    writeOnce(directory, 'qualification.zip', archive); writeOnce(directory, 'qualification.json', data);
    return { status: 'QUALIFICATION_DOWNLOAD_VERIFIED', sha256: sha256(data) };
  }
  const downloadedQualification = qualificationDownload(directory, evidence);
  if (selected === 'stage') {
    writeOnce(directory, 'pending.json', encode(pendingReceipt(context, env)));
    writeOnce(directory, 'pending-upload-attempt.json', encode(expected));
    return { status: 'DELETE_PENDING_STAGED', providerMutations: false };
  }
  if (selected === 'reconcile') {
    const receipt = await reconcileReviewedTarget({ env, evidence, evidenceHead, downloadedQualification,
      read: transports.read, assertMain, api: readOnlyApi(transports.api), now, proveContext: proveReviewedCleanupContext });
    writeOnce(directory, 'reconciliation.json', encode(receipt)); return receipt;
  }
  const pendingBytes = readPrivate(directory, 'pending.json');
  requireThat(pendingBytes.equals(encode(pendingReceipt(context, env))), 'pending_attempt_bytes_mismatch');
  if (selected === 'verify-pending') {
    requireThat(readPrivate(directory, 'pending-upload-attempt.json').equals(encode(expected)),
      'reviewed_pending_upload_intent_changed');
    const uploaded = { artifactId: env.PENDING_ARTIFACT_ID, archiveSha256: env.PENDING_ARTIFACT_DIGEST };
    requireThat(decimal(uploaded?.artifactId) && typeof uploaded.archiveSha256 === 'string'
      && /^[a-f0-9]{64}$/.test(uploaded.archiveSha256), 'reviewed_pending_upload_unproven');
    const pendingEnv = Object.assign(Object.create(env), {
      PENDING_ARTIFACT_ID: uploaded.artifactId, PENDING_ARTIFACT_DIGEST: uploaded.archiveSha256 });
    assertUploadedArtifact(await transports.read(`/actions/artifacts/${uploaded.artifactId}`), {
      id: uploaded.artifactId, runId: env.GITHUB_RUN_ID, name: pendingName(context.report, context.intent), archiveSha256: uploaded.archiveSha256 });
    writeOnce(directory, 'pending-upload.json', encode({ binding: expected,
      artifactId: uploaded.artifactId, archiveSha256: uploaded.archiveSha256 }));
    const downloaded = await transports.downloadArtifact({ artifactId: uploaded.artifactId, runId: env.GITHUB_RUN_ID });
    requireThat(Buffer.isBuffer(downloaded) && sha256(downloaded) === uploaded.archiveSha256, 'reviewed_pending_archive_hash_mismatch');
    const data = archiveData(downloaded, 'pending.json', directory);
    await provePendingUpload({ env: pendingEnv, context, pendingBytes, downloadedBytes: data, read: transports.read });
    writeOnce(directory, 'pending-download.zip', downloaded); writeOnce(directory, 'pending-download.json', data);
    return { status: 'DELETE_PENDING_UPLOAD_VERIFIED', artifactId: uploaded.artifactId, archiveSha256: uploaded.archiveSha256 };
  }
  const uploaded = JSON.parse(readPrivate(directory, 'pending-upload.json'));
  requireThat(encode(uploaded.binding).equals(encode(expected))
    && decimal(uploaded.artifactId) && /^[a-f0-9]{64}$/.test(uploaded.archiveSha256), 'reviewed_pending_binding_changed');
  const pendingArchive = readPrivate(directory, 'pending-download.zip');
  requireThat(sha256(pendingArchive) === uploaded.archiveSha256, 'reviewed_pending_archive_hash_mismatch');
  const downloadedPending = archiveData(pendingArchive, 'pending.json', directory);
  requireThat(downloadedPending.equals(readPrivate(directory, 'pending-download.json')), 'pending_attempt_bytes_mismatch');
  const pendingEnv = Object.assign(Object.create(env), {
    PENDING_ARTIFACT_ID: uploaded.artifactId, PENDING_ARTIFACT_DIGEST: uploaded.archiveSha256 });
  writeOnce(directory, 'delete-attempt.json', encode(expected));
  let checkpoint = 0;
  const receipt = await deleteReviewedTarget({ env: pendingEnv, evidence, evidenceHead, downloadedQualification,
    pendingBytes, downloadedPending, read: transports.read, assertMain, api: transports.api, now,
    sleep: transports.sleep, proveContext: proveReviewedCleanupContext,
    checkpoint: value => writeOnce(directory, `cleanup-checkpoint-${++checkpoint}.json`, encode(value)) });
  writeOnce(directory, 'cleanup.json', encode(receipt)); return receipt;
}

export function reviewedCleanupTransports(env, stage, fetchImpl = fetch) {
  let provider;
  const api = () => {
    requireThat(['delete', 'reconcile'].includes(stage), 'reviewed_provider_access_not_permitted_in_stage');
    provider ??= new RestoreCleanupApi(env.PLANETSCALE_RESTORE_API_TOKEN, fetchImpl);
    return provider;
  };
  return { read: suffix => githubRead(env, suffix, fetchImpl), assertMain: () => githubReadiness(env, fetchImpl),
    downloadArtifact: githubArtifactDownloader(env, fetchImpl),
    api: { request: (...args) => api().request(...args), list: (...args) => api().list(...args),
      authority: (...args) => api().authority(...args) } };
}

export async function runReviewedCleanupCli({ argv = process.argv.slice(2), env = process.env,
  fetchImpl = fetch, now = Date.now, stdout = value => process.stdout.write(value) } = {}) {
  const selected = argv.length === 1 && stages.includes(argv[0]) ? argv[0] : 'invalid';
  try {
    if (selected === 'prepare') requireThat(path.isAbsolute(env.GITHUB_OUTPUT ?? ''), 'github_output_required');
    const result = await dispatchReviewedCleanupStage({ argv, env, now,
      transports: reviewedCleanupTransports(env, selected, fetchImpl) });
    if (selected === 'prepare') fs.appendFileSync(env.GITHUB_OUTPUT,
      `qualification_artifact_id=${result.artifactId}\nqualification_run_id=${result.qualificationRunId}\npending_name=${result.pendingName ?? ''}\n`);
    stdout(JSON.stringify({ status: result.status ?? result.state, deletionVerified: result.deletionVerified === true,
      recoveryCertified: false, blockers: result.blockers ?? [] }) + '\n');
    const failed = (selected === 'delete' && !result.deletionVerified)
      || (selected === 'reconcile' && !['TARGET_PRESENT_READ_ONLY', 'ABSENCE_OBSERVED_READ_ONLY'].includes(result.state));
    return { exitCode: failed ? 1 : 0, result };
  } catch (error) {
    const receipt = { schemaVersion: 'native-restore-cleanup-receipt-v1', phase: 'reviewed-cleanup-cli', stage: selected,
      state: selected === 'delete' ? 'OUTCOME_UNPROVEN_READ_ONLY_RECONCILIATION_REQUIRED' : 'BLOCKED_WITHOUT_DELETE',
      providerMutations: selected === 'delete' ? 'UNPROVEN' : false,
      deletionVerified: false, recoveryCertified: false, blockers: [failureCode(error)] };
    let receiptPersisted = false;
    try {
      privateDirectory(env.EVIDENCE_DIR);
      writeOnce(env.EVIDENCE_DIR, `stage-error-${selected}.json`, encode(receipt));
      if (!fs.existsSync(path.join(env.EVIDENCE_DIR, 'cleanup.json'))) writeOnce(env.EVIDENCE_DIR, 'cleanup.json', encode(receipt));
      receiptPersisted = true;
    } catch {}
    stdout(JSON.stringify({ status: receipt.state, deletionVerified: false, recoveryCertified: false,
      blockers: receipt.blockers, receiptPersisted }) + '\n');
    return { exitCode: 1, result: receipt };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = (await runReviewedCleanupCli()).exitCode;
}
