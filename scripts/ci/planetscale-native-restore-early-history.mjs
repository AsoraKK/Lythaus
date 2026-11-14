import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { object, requireThat } from './planetscale-native-restore-contract.mjs';

const repository = new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1, -1);
const operator = repository.split('/')[0];
const workflowPath = '.github/workflows/planetscale-native-restore-check.yml';
const workflowId = 394786946;
export const EARLY_RUNS = Object.freeze({
  run8: Object.freeze({ runId: '40193991312', runNumber: 8, jobId: 121170799629,
    headSha: '96ff66fa5c28c9780ce72ee23a40cd846372d6bd', artifactId: 12599287272,
    archiveSha256Text: '16d38d9bb99249074c62cb19a95baf6f6cd1d35f5feb98da054ca7afc07d03ac',
    strictStatus: 'PINNED_PRECREATE_FAILURE_RECONCILED' }),
  run9: Object.freeze({ runId: '40212030891', runNumber: 9, jobId: 121225106539,
    headSha: '9447561658c139f1e9e48cedad66b2f035661fb9', artifactId: 12606067757,
    archiveSha256Text: '50b3e7d7a2354c0d5d190872a5d77cec7d2fd7f3d2ea1cec404d731cb0655e7a',
    strictStatus: 'PINNED_MANUALLY_DELETED_FAILURE_RECONCILED' }),
});
const stepNames = [
  'Set up job', 'Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'Require exact protected main before loading dependencies or credentials',
  'Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'Run npm ci --ignore-scripts --no-audit',
  'Run fixed-target runner using only existing protected access',
  'Finalize immutable qualification evidence without provider access', 'Summarize retained target and review deadlines',
  'Upload immutable qualification evidence', 'Post Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'Complete job',
];
const stepNumbers = [1,2,3,4,5,6,7,8,9,17,18,19];
const stepConclusions = ['success','success','success','success','success','failure','success','success','success','skipped','success','success'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const evidenceRoot = new URL('../../docs/evidence/production-cutover/', import.meta.url);
// This pins the new observation, not the unavailable original qualification payload.
const run8ObservationSha256 = 'b95279e8697375809886ada0d89817538da6d604b6e94310c0145e77aa2172a8';

function bytes(relative) {
  const file = new URL(relative, evidenceRoot);
  try {
    const stat = fs.lstatSync(file);
    requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 1048576
      && fs.realpathSync(file) === file.pathname, 'early_history_file_invalid');
    return fs.readFileSync(file);
  } catch { throw new Error('early_history_file_unavailable'); }
}

export function readRun8Observation() {
  return bytes('historical-cleanup/run8/log-observation.json');
}

export function assertRun8Observation(raw) {
  requireThat(ArrayBuffer.isView(raw) && sha256(raw) === run8ObservationSha256,
    'early_history_log_observation_mismatch');
  const record = JSON.parse(Buffer.from(raw).toString('utf8'));
  requireThat(record.schemaVersion === 'lythaus-historical-log-observation-v1'
    && record.runId === EARLY_RUNS.run8.runId && record.jobId === EARLY_RUNS.run8.jobId
    && record.sourceMainSha === EARLY_RUNS.run8.headSha
    && record.reportedSummary?.status === 'BLOCKED' && record.reportedSummary.createdTargetId === null
    && record.reportedSummary.cleanup === 'NOT_NEEDED'
    && JSON.stringify(record.reportedSummary.blockers) === '["copied_role_metadata_invalid"]'
    && record.originalQualificationPayloadSha256 === null
    && record.originalQualificationPayloadBytesVerified === false
    && record.originalQualificationArchiveBytesVerified === false && record.recoveryCertified === false,
  'early_history_log_observation_mismatch');
  return { logObservationSha256: run8ObservationSha256, sourceRoleFailureBeforeCreateAttested: true };
}

function assertRun(run, pin, env) {
  const title = `Native restore execute ${pin.headSha}`;
  requireThat(object(run) && String(run.id) === pin.runId && run.run_number === pin.runNumber
    && run.run_attempt === 1 && run.workflow_id === workflowId && run.path === workflowPath
    && run.head_sha === pin.headSha && run.head_branch === 'main' && run.event === 'workflow_dispatch'
    && run.status === 'completed' && run.conclusion === 'failure'
    && run.name === title && run.display_title === title
    && run.repository?.id === 1010752912 && run.repository.full_name === env.GITHUB_REPOSITORY
    && run.head_repository?.id === 1010752912 && run.head_repository.full_name === env.GITHUB_REPOSITORY
    && Array.isArray(run.pull_requests) && run.pull_requests.length === 0,
  'early_history_run_provenance_mismatch');
}

function assertInventory(value) {
  requireThat(object(value) && Number.isSafeInteger(value.total_count) && value.total_count >= 0
    && value.total_count <= 100 && Array.isArray(value.artifacts) && value.artifacts.length === value.total_count,
  'early_history_archive_inventory_invalid');
}

async function historicalMetadata(pin, read, env) {
  const jobs = await read(`/actions/runs/${pin.runId}/jobs?per_page=100`), job = jobs?.jobs?.[0];
  requireThat(object(jobs) && jobs.total_count === 1 && Array.isArray(jobs.jobs) && jobs.jobs.length === 1
    && object(job) && job.id === pin.jobId && String(job.run_id) === pin.runId && job.run_attempt === 1
    && job.head_sha === pin.headSha && job.name === 'Qualify isolated native restore without cleanup'
    && job.status === 'completed' && job.conclusion === 'failure'
    && Number.isSafeInteger(job.runner_id) && job.runner_id > 0
    && typeof job.runner_name === 'string' && job.runner_name.length > 0 && Number.isSafeInteger(job.runner_group_id)
    && Array.isArray(job.steps) && job.steps.length === stepNames.length
    && stepNames.every((name, index) => job.steps[index]?.name === name
      && job.steps[index].number === stepNumbers[index] && job.steps[index].status === 'completed'
      && job.steps[index].conclusion === stepConclusions[index]), 'early_history_job_mismatch');
  const approvals = await read(`/actions/runs/${pin.runId}/approvals`);
  requireThat(Array.isArray(approvals) && approvals.length === 1 && approvals[0].state === 'approved'
    && approvals[0].user?.type === 'User' && approvals[0].user.id === 211295889
    && approvals[0].user.login === operator && approvals[0].environments?.some(row => row.name === 'production'),
  'early_history_human_approval_mismatch');
  const inventory = await read(`/actions/runs/${pin.runId}/artifacts?per_page=100`);
  assertInventory(inventory);
  requireThat(inventory.total_count === 0, 'early_history_archive_availability_changed');
}

async function availableArchive(run, pin, read, env, strictVerifier) {
  assertRun(run, pin, env);
  requireThat(typeof strictVerifier === 'function', 'early_history_strict_verifier_required');
  const inventory = await read(`/actions/runs/${pin.runId}/artifacts?per_page=100`);
  assertInventory(inventory);
  if (inventory.total_count === 0) return null;
  const proof = await strictVerifier(run, read, env);
  requireThat(object(proof) && proof.runId === pin.runId && proof.status === pin.strictStatus,
    'early_history_strict_result_mismatch');
  return proof;
}

export async function verifyRun8History(run, read, env, { strictVerifier, observationBytes } = {}) {
  const pin = EARLY_RUNS.run8;
  const strict = await availableArchive(run, pin, read, env, strictVerifier);
  if (strict !== null) return strict;
  const proof = assertRun8Observation(observationBytes ?? readRun8Observation());
  await historicalMetadata(pin, read, env);
  return { status: 'PINNED_PRECREATE_LOG_OBSERVATION_RECONCILED', workflowPath, workflowId,
    runId: pin.runId, runNumber: pin.runNumber, runAttempt: 1, headSha: pin.headSha,
    jobId: pin.jobId, qualificationOutcome: 'FAILED', recoveryAcceptance: 'NOT_CERTIFIED', recoveryCertified: false,
    cleanupOutcome: 'NOT_NEEDED_LOG_ATTESTED', targetCreatedAccordingToLogAndSource: false,
    originalQualificationPayloadBytesVerified: false, originalQualificationArchiveBytesVerified: false,
    originalQualificationPayloadSha256: null, originalArchiveSha256Text: pin.archiveSha256Text,
    artifactProviderMutationCount: null, artifactCredentialActionCount: null, artifactCount: 0, ...proof,
    evidenceLimitations: ['Only the retained log summary and immutable source control flow attest this pre-create failure.',
      'The original qualification JSON and ZIP remain unavailable; no original payload hash or missing bytes were manufactured.'],
  };
}

export async function verifyRun9History(run, read, env, { strictVerifier, assertManualPayloads } = {}) {
  const pin = EARLY_RUNS.run9;
  const strict = await availableArchive(run, pin, read, env, strictVerifier);
  if (strict !== null) return strict;
  requireThat(typeof assertManualPayloads === 'function', 'early_history_manual_verifier_required');
  const proof = assertManualPayloads(bytes('0021-restore-evidence/artifacts/qualification-40212030891.json'),
    bytes('0021-restore-evidence/manual-cleanup-40212030891.json'));
  requireThat(proof.manualOperator === operator && proof.recoveryAcceptance === 'NOT_CERTIFIED',
    'early_history_manual_proof_mismatch');
  await historicalMetadata(pin, read, env);
  return { status: 'PINNED_MANUAL_CLEANUP_WITH_UNAVAILABLE_ARCHIVE', workflowPath, workflowId,
    runId: pin.runId, runNumber: pin.runNumber, runAttempt: 1, headSha: pin.headSha, jobId: pin.jobId,
    qualificationOutcome: 'FAILED', ...proof, recoveryCertified: false, currentTargetAbsenceVerified: false,
    qualificationPayloadBytesVerified: true, manualReceiptPayloadBytesVerified: true,
    originalQualificationArchiveBytesVerified: false, originalArchiveSha256Text: pin.archiveSha256Text,
    artifactCount: 0, evidenceLimitations: ['Original qualification and manual receipt Git payloads are pinned and verified.',
      'The original qualification ZIP is unavailable; its logged digest is not byte verification or proof of ZIP membership.'],
  };
}
