import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const manifestPath = fileURLToPath(new URL('./runner-consumption-sample.json', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const repository = process.env.GITHUB_REPOSITORY
  ?? execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { encoding: 'utf8' }).trim();
const jobsByName = new Map([
  ['Repository hygiene', 'repository_hygiene'], ['Workflow lint', 'workflow_lint'],
  ['Native Workers and PlanetScale', 'native_runtime'], ['OpenAPI contract', 'openapi'],
  ['Flutter analyze and test', 'flutter'], ['Web frontends', 'frontends'], ['Dependency audit', 'dependency_audit'],
]);
const headers = [
  'run_id', 'attempt', 'stratum', 'category', 'created_at', 'event', 'run_conclusion', 'head_sha', 'head_branch',
  'run_wall_minutes', 'run_created_to_start_minutes', 'repository_hygiene_minutes', 'workflow_lint_minutes',
  'native_runtime_minutes', 'openapi_minutes', 'flutter_minutes', 'frontends_minutes', 'dependency_audit_minutes',
  'other_job_minutes', 'success_job_minutes', 'failure_job_minutes', 'cancelled_job_minutes', 'skipped_job_count',
  'cache_state', 'billing_minutes', 'workflow_url', 'job_observations_json',
];

function ghJson(endpoint) {
  return JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

function minutes(start, end) {
  if (!start || !end) return null;
  const duration = (Date.parse(end) - Date.parse(start)) / 60_000;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function csvMinutes(value) {
  return value === null ? 'unknown' : value.toFixed(2);
}

function csvTotal(total) {
  if (!total.observed || total.unknown) return 'unknown';
  return total.minutes.toFixed(2);
}

function jobsForAttempt(runId, attempt) {
  const jobs = [];
  let totalCount = null;
  for (let pageNumber = 1; pageNumber <= 100; pageNumber += 1) {
    const page = ghJson(`repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100&page=${pageNumber}`);
    if (!Number.isSafeInteger(page.total_count) || !Array.isArray(page.jobs)) {
      throw new Error(`Run ${runId} attempt ${attempt} returned malformed job pagination`);
    }
    if (totalCount === null) totalCount = page.total_count;
    if (page.total_count !== totalCount) throw new Error(`Run ${runId} attempt ${attempt} job count changed during pagination`);
    jobs.push(...page.jobs);
    if (jobs.length === totalCount) return jobs;
    if (jobs.length > totalCount || page.jobs.length === 0) {
      throw new Error(`Run ${runId} attempt ${attempt} returned an incomplete job page`);
    }
  }
  throw new Error(`Run ${runId} attempt ${attempt} exceeded the reviewed job-page limit`);
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const output = [headers.join(',')];
for (const sample of manifest.runs) {
  const run = ghJson(`repos/${repository}/actions/runs/${sample.id}`);
  if (run.status !== 'completed') throw new Error(`Run ${sample.id} is not complete`);
  const attempt = Number(run.run_attempt);
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error(`Run ${sample.id} has an invalid attempt number`);
  const jobs = jobsForAttempt(run.id, attempt);
  if (jobs.length === 0) throw new Error(`Run ${sample.id} has no job records`);

  const totals = Object.fromEntries([...new Set([...jobsByName.values(), 'other_job_minutes', 'success_job_minutes', 'failure_job_minutes', 'cancelled_job_minutes'])]
    .map(key => [key, { minutes: 0, observed: false, unknown: false }]));
  for (const key of ['success_job_minutes', 'failure_job_minutes', 'cancelled_job_minutes']) totals[key].observed = true;
  const addTotal = (key, elapsed) => {
    const total = totals[key];
    total.observed = true;
    if (elapsed === null) total.unknown = true;
    else total.minutes += elapsed;
  };
  let skipped = 0;
  const jobObservations = [];
  for (const job of jobs) {
    const elapsed = minutes(job.started_at, job.completed_at);
    jobObservations.push({
      job_id: job.id ?? null,
      name: job.name ?? null,
      runner_labels: Array.isArray(job.labels) ? job.labels : null,
      started_at: job.started_at ?? null,
      completed_at: job.completed_at ?? null,
      conclusion: job.conclusion ?? null,
      elapsed_minutes: job.conclusion === 'skipped' || elapsed === null ? null : Number(elapsed.toFixed(2)),
      timing_status: job.conclusion === 'skipped' ? 'skipped_not_run' : elapsed === null ? 'unknown_missing_timestamp' : 'observed',
    });
    const group = jobsByName.get(job.name) ?? 'other_job_minutes';
    if (job.conclusion === 'skipped') {
      skipped += 1;
      addTotal(group, 0);
      continue;
    }
    addTotal(group, elapsed);
    if (job.conclusion === 'success') addTotal('success_job_minutes', elapsed);
    if (job.conclusion === 'failure') addTotal('failure_job_minutes', elapsed);
    if (job.conclusion === 'cancelled') addTotal('cancelled_job_minutes', elapsed);
  }
  const row = [
    run.id, attempt, sample.stratum, sample.category, run.created_at, run.event, run.conclusion, run.head_sha, run.head_branch,
    csvMinutes(minutes(run.run_started_at, run.updated_at)), csvMinutes(minutes(run.created_at, run.run_started_at)),
    ...[...jobsByName.values()].map(key => csvTotal(totals[key])), csvTotal(totals.other_job_minutes),
    csvTotal(totals.success_job_minutes), csvTotal(totals.failure_job_minutes), csvTotal(totals.cancelled_job_minutes),
    skipped, 'unknown_not_exposed_by_jobs_api', 'not_observed', `https://github.com/${repository}/actions/runs/${run.id}`,
    JSON.stringify(jobObservations),
  ];
  output.push(row.map(csvCell).join(','));
}

process.stdout.write(`${output.join('\n')}\n`);
