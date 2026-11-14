import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { githubRead } from './planetscale-native-restore-evidence.mjs';
import { githubArtifactDownloader } from './planetscale-native-restore-cleanup-artifact-transport.mjs';
import { WORKFLOW, check, hash, object, allTrue, PUBLIC_KEYS, AUTHORITY_KEYS } from './planetscale-migration-role-audit.mjs';

const consumers = new Set(['planetscale-production-migrations.yml', 'native-admin-bootstrap-activation.yml',
  'planetscale-verifier-stats.yml', 'planetscale-cutover-identity-preflight.yml', 'planetscale-schema-verifier-grants.yml',
  'product-privilege-grants.yml', 'production-release.yml'].map(file => `.github/workflows/${file}`));

export async function completeRuns(read, suffix) {
  const rows = [], seen = new Set(); let total;
  for (let page = 1; page <= 10; page++) {
    const value = await read(`${suffix}${suffix.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    check(Number.isSafeInteger(value.total_count) && value.total_count >= 0 && value.total_count <= 1000
      && Array.isArray(value.workflow_runs) && value.workflow_runs.length <= 100, 'workflow_history_incomplete');
    total ??= value.total_count; check(value.total_count === total, 'workflow_history_changed');
    for (const run of value.workflow_runs) {
      check(Number.isSafeInteger(run.id) && run.id > 0 && !seen.has(run.id), 'workflow_history_invalid');
      seen.add(run.id); rows.push(run);
    }
    if (rows.length === total) return rows;
    check(value.workflow_runs.length === 100, 'workflow_history_incomplete');
  }
  check(false, 'workflow_history_incomplete');
}

export async function quietConsumers(env, read = suffix => githubRead(env, suffix)) {
  for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) {
    const runs = await completeRuns(read, `/actions/runs?status=${status}`);
    check(!runs.some(run => String(run.id) !== env.GITHUB_RUN_ID && consumers.has(run.path)), 'protected_consumer_busy');
    check(runs.every(run => typeof run.path === 'string' && run.path.startsWith('.github/workflows/')), 'consumer_identity_unknown');
  }
}

export async function proveOneUseRun(env, consent, read = suffix => githubRead(env, suffix)) {
  const runs = await completeRuns(read, `/actions/workflows/${path.posix.basename(WORKFLOW)}/runs`);
  const numbers = runs.map(run => run.run_number).sort((a, b) => a - b);
  check(numbers.length === Number(env.GITHUB_RUN_NUMBER) && numbers.every((value, i) => value === i + 1),
    'one_use_history_gap_or_later_run');
  const current = runs.find(run => String(run.id) === env.GITHUB_RUN_ID);
  check(current?.run_number === consent.expectedRunNumber && current.run_attempt === 1
    && current.head_sha === env.RELEASE_SHA && current.head_branch === 'main' && current.event === 'workflow_dispatch'
    && current.actor?.id === 211295889 && current.actor.login === env.GITHUB_ACTOR && current.path === WORKFLOW,
  'one_use_current_run_unbound');
  for (const run of runs) {
    if (run.id === current.id) continue;
    check(Number.isInteger(run.run_attempt) && run.run_attempt >= 1 && run.run_attempt <= 10, 'prior_attempts_unknown');
    for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
      const jobs = await read(`/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100`);
      check(Array.isArray(jobs.jobs) && jobs.total_count === jobs.jobs.length && jobs.jobs.length > 0 && jobs.jobs.length < 100,
        'prior_jobs_incomplete');
      check(jobs.jobs.every(job => job.run_id === run.id && typeof job.name === 'string'), 'prior_job_identity_unknown');
      check(!jobs.jobs.some(job => job.name === 'Separate short-lived migration probe'
        && job.conclusion !== 'skipped'), 'prior_probe_requires_manual_reconciliation');
    }
  }
}

export function extractAudit(archive) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-role-audit-'));
  try {
    const file = path.join(directory, 'audit.zip'); fs.writeFileSync(file, archive, { mode: 0o600 });
    const options = { timeout: 5000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'] };
    check(execFileSync('unzip', ['-Z1', file], options).toString() === 'migration-role-audit.json\n', 'audit_archive_entries_invalid');
    execFileSync('unzip', ['-tqq', file], options);
    return execFileSync('unzip', ['-p', file, 'migration-role-audit.json'], options);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

export async function proveAudit(env, consent, { read = suffix => githubRead(env, suffix),
  download = githubArtifactDownloader(env), now = Date.now() } = {}) {
  const run = await read(`/actions/runs/${consent.auditRunId}/attempts/1`);
  check(String(run.id) === consent.auditRunId && run.run_attempt === 1 && run.head_sha === env.RELEASE_SHA
    && run.head_branch === 'main' && run.path === WORKFLOW && run.event === 'workflow_dispatch'
    && run.status === 'completed' && run.conclusion === 'success' && run.actor?.id === 211295889
    && run.actor.login === env.GITHUB_ACTOR && run.repository?.id === 1010752912, 'audit_run_provenance_unverified');
  const jobs = await read(`/actions/runs/${consent.auditRunId}/attempts/1/jobs?per_page=100`);
  check(Array.isArray(jobs.jobs) && jobs.total_count === jobs.jobs.length && jobs.jobs.length < 100
    && jobs.jobs.filter(job => job.name === 'Audit intended migration role without issuing credentials'
      && job.run_id === Number(consent.auditRunId) && job.status === 'completed' && job.conclusion === 'success').length === 1,
  'audit_job_unverified');
  const metadata = await read(`/actions/artifacts/${consent.auditArtifactId}`);
  check(String(metadata.id) === consent.auditArtifactId && metadata.workflow_run?.id === Number(consent.auditRunId)
    && metadata.name === `migration-role-audit-${env.RELEASE_SHA}-${consent.auditRunId}` && metadata.expired === false
    && metadata.digest === `sha256:${consent.auditArchiveSha256}`, 'audit_artifact_unbound');
  const archive = await download({ artifactId: consent.auditArtifactId, runId: consent.auditRunId });
  check(hash(archive) === consent.auditArchiveSha256, 'audit_archive_hash_mismatch');
  const bytes = extractAudit(archive); check(hash(bytes) === consent.auditReportSha256, 'audit_report_hash_mismatch');
  let report; try { report = JSON.parse(bytes); } catch { check(false, 'audit_report_invalid'); }
  check(object(report) && report.schemaVersion === 'lythaus-migration-role-audit-v1'
    && report.sourceMainSha === env.RELEASE_SHA && report.runId === consent.auditRunId && report.runAttempt === 1
    && report.status === 'AUDIT_READY_NOT_INSTALL_AUTHORITY' && report.targetVerified === true
    && report.canonicalIdentitiesVerified === true && report.authorityReady === true && report.probeProfileReady === true
    && allTrue(report.authority, AUTHORITY_KEYS) && allTrue(report.publicProfile, PUBLIC_KEYS)
    && ['ABSENT', 'VERIFIED_DISABLED'].includes(report.functionState)
    && report.providerMutations === false && report.credentialsCreated === false && report.databaseWrites === false
    && report.installerQualified === false && report.loginVerified === false
    && now >= Date.parse(report.generatedAt) && now - Date.parse(report.generatedAt) <= 3600000,
  'audit_not_fresh_or_qualified');
  return report;
}
