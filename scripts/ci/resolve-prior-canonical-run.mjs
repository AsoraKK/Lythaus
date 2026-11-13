import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = 'AsoraKK/Lythaus', REPO_ID = 1010752912;

/** Resolve the latest successful canonical workflow for an exact prior SHA.
 * Its authenticated manifest and live component bindings are checked later. */
export function resolvePriorCanonicalRun(previousSha, pages) {
  if (!/^[0-9a-f]{40}$/.test(previousSha ?? '') || !Array.isArray(pages) || pages.length < 1 || pages.length > 10
    || pages.some(page => !Number.isSafeInteger(page?.total_count) || page.total_count < 1 || page.total_count > 1000
      || page.total_count !== pages[0].total_count || !Array.isArray(page.workflow_runs))) throw new Error('prior canonical run listing invalid');
  const runs = pages.flatMap(page => page.workflow_runs);
  if (runs.length !== pages[0].total_count || new Set(runs.map(run => run.id)).size !== runs.length) throw new Error('prior canonical run listing incomplete');
  if (runs.some(run => !Number.isSafeInteger(run?.id) || run.id < 1 || run.name !== 'Canonical production release'
    || run.path !== '.github/workflows/production-release.yml' || run.head_sha !== previousSha || run.head_branch !== 'main'
    || run.event !== 'workflow_dispatch' || run.status !== 'completed' || run.conclusion !== 'success'
    || run.repository?.id !== REPO_ID || run.head_repository?.id !== REPO_ID || !Number.isFinite(Date.parse(run.created_at)))) {
    throw new Error('prior canonical run provenance invalid');
  }
  runs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  return String(runs[0].id);
}

function main() {
  const env = process.env;
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== REPO || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || !env.GH_TOKEN || !env.GITHUB_OUTPUT
    || !/^[0-9a-f]{40}$/.test(env.PREVIOUS_PRODUCTION_SHA ?? '')) throw new Error('prior canonical run resolution context invalid');
  const endpoint = `repos/${REPO}/actions/workflows/production-release.yml/runs?branch=main&event=workflow_dispatch&status=success&head_sha=${env.PREVIOUS_PRODUCTION_SHA}&per_page=100`;
  let pages;
  try { pages = JSON.parse(execFileSync('gh', ['api', endpoint, '--paginate', '--slurp'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 8 * 1024 * 1024 })); }
  catch { throw new Error('authenticated prior canonical run lookup failed'); }
  const runId = resolvePriorCanonicalRun(env.PREVIOUS_PRODUCTION_SHA, pages);
  appendFileSync(env.GITHUB_OUTPUT, `previous_production_run_id=${runId}\n`);
  console.log(JSON.stringify({ status: 'RESOLVED', previousSha: env.PREVIOUS_PRODUCTION_SHA, previousRunId: runId }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
