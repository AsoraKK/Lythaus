import { execFileSync } from 'node:child_process';
import { githubArtifactDownloader } from './planetscale-native-restore-cleanup-artifact-transport.mjs';
import { githubRead, sha256 } from './planetscale-native-restore-evidence.mjs';
import { PINS, REPOSITORY, verifyOwnerReview } from './lythaus-new-core-schema-install-control.mjs';

export const firstFullStage = Object.freeze({
  operation:'stage-first-full-admin',
  workflow:'.github/workflows/new-core-full-admin-stage.yml',
  baselineRun:'45758911466',
});

function check(condition) {
  if (!condition) throw new Error('acknowledged first full Admin stage receipt is unverified');
}

// The archive contains one bounded JSON record. Never extract provider-controlled filenames.
function readRecord(bytes) {
  const program = `import io, sys, zipfile
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:
    files = z.infolist()
    if len(files) != 1 or files[0].filename != "first-full-admin.json" or not 0 < files[0].file_size <= 4096:
        raise ValueError()
    sys.stdout.buffer.write(z.read(files[0]))`;
  try {
    return JSON.parse(execFileSync('python3',['-I','-c',program],{input:bytes,maxBuffer:4096,
      timeout:5000,stdio:['pipe','pipe','ignore']}));
  } catch { throw new Error('first full Admin stage receipt archive is invalid'); }
}

export async function loadFirstFullAdminReceipt(env, read = path => githubRead(env,path), download = githubArtifactDownloader(env)) {
  const sha = env.RELEASE_SHA;
  check(env.GITHUB_REPOSITORY === REPOSITORY && env.GITHUB_REPOSITORY_ID === '1010752912' && /^[a-f0-9]{40}$/.test(sha));
  const workflowName = firstFullStage.workflow.split('/').at(-1);
  const history = await read('/actions/workflows/' + workflowName + '/runs?event=workflow_dispatch&branch=main&head_sha=' + sha + '&per_page=100');
  check(Array.isArray(history.workflow_runs) && history.total_count === history.workflow_runs.length &&
    history.workflow_runs.every(row => row.head_sha === sha && row.head_branch === 'main' &&
      typeof row.display_title === 'string' && row.display_title.length > 0));
  const candidates = history.workflow_runs.filter(run => run.display_title?.startsWith(firstFullStage.operation + ' '));
  if (!candidates.length) return null;
  check(candidates.length === 1 && Number.isSafeInteger(candidates[0].id) && candidates[0].id > 0);
  const runId = String(candidates[0].id);
  const path = '/actions/runs/' + runId;
  const run = await read(path);
  check(run.id === candidates[0].id && run.path === firstFullStage.workflow && run.event === 'workflow_dispatch'
    && run.head_sha === sha && run.head_branch === 'main' && run.repository?.id === 1010752912
    && run.run_attempt === 1 && run.actor?.id === PINS.ownerId && run.triggering_actor?.id === PINS.ownerId
    && run.status === 'completed' && run.conclusion === 'success'
    && run.display_title === firstFullStage.operation + ' at ' + sha);
  verifyOwnerReview(await read(path + '/approvals'));
  const jobs = await read(path + '/attempts/1/jobs?per_page=100');
  check(Array.isArray(jobs.jobs) && jobs.total_count === jobs.jobs.length);
  const protectedJobs = jobs.jobs.filter(job => job.name === 'Stage full Admin without traffic');
  check(protectedJobs.length === 1 && protectedJobs[0].conclusion === 'success' &&
    ['Upload the full Admin version without assigning traffic','Retain the protected first full Admin upload receipt']
      .every(name => protectedJobs[0].steps?.some(step => step.name === name && step.conclusion === 'success')));
  const list = await read(path + '/artifacts?per_page=100');
  check(Array.isArray(list.artifacts) && list.total_count === list.artifacts.length);
  const matches = list.artifacts.filter(item => item.name === 'first-full-admin-' + sha);
  const artifact = matches[0];
  check(matches.length === 1 && artifact.expired === false && Number.isSafeInteger(artifact.id) && artifact.id > 0
    && /^sha256:[a-f0-9]{64}$/.test(artifact.digest) && (!artifact.workflow_run || artifact.workflow_run.id === run.id));
  const bytes = await download({artifactId:String(artifact.id),runId});
  check('sha256:' + sha256(bytes) === artifact.digest);
  const record = readRecord(bytes);
  check(record?.schema === 'lythaus-first-full-admin-stage-v1' && record.runId === runId && record.runAttempt === 1
    && record.operation === firstFullStage.operation && record.baselineRun === firstFullStage.baselineRun
    && record.sourceSha === sha && record.status === 'REPLACEMENT_ADMIN_NON_SERVING' && record.servingTrafficPercent === 100);
  check(Object.keys(record).sort().join() === [
    'schema','runId','runAttempt','operation','baselineRun','sourceSha','status','workerId','versionId',
    'servingVersionId','previousDeploymentId','subjectKeySourceVersionId','servingTrafficPercent','moduleSha256','assetsSha256',
  ].sort().join());
  return record;
}
