import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repo = process.env.GITHUB_REPOSITORY ?? '';
const token = process.env.GH_TOKEN ?? '';
const issueNumber = Number.parseInt(process.env.HISTORICAL_EVIDENCE_ISSUE ?? '598', 10);
const outputDir = process.env.HISTORICAL_RECONCILIATION_OUTPUT ?? '.artifacts/historical-branch-reconciliation';
const reviewPath = process.env.HISTORICAL_BRANCH_REVIEW_FILE
  ?? 'docs/evidence/repository/2026-08-22-historical-branch-review.json';

if (!/^[^/]+\/[^/]+$/.test(repo)) throw new Error('GITHUB_REPOSITORY is required');
if (!token) throw new Error('GH_TOKEN is required');
if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error('valid historical evidence issue number is required');

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
};

function safeText(value, max = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
}

function safeBranch(value) {
  const branch = safeText(value, 200);
  return /^[A-Za-z0-9._/-]+$/.test(branch) ? branch : null;
}

function safeSha(value) {
  const sha = safeText(value, 40).toLowerCase();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

async function github(pathname, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repo}${pathname}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = null; }
  }
  if (!response.ok) throw new Error(`GitHub ${options.method ?? 'GET'} request failed with HTTP ${response.status}`);
  return body;
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0 && !allowFailure) throw new Error(`git ${args.join(' ')} failed`);
  return result;
}

function gitText(args, options) {
  return safeText(git(args, options).stdout ?? '', 1000).trim();
}

function branchPr(prs, branch) {
  return prs
    .filter((pr) => pr?.head?.repo?.full_name === repo && safeBranch(pr?.head?.ref) === branch)
    .sort((left, right) => safeText(right.updated_at).localeCompare(safeText(left.updated_at)))[0] ?? null;
}

const acceptedReviewDispositions = new Set([
  'integrated-by-main',
  'salvaged-to-main',
  'superseded-by-main',
  'obsolete-operational-evidence',
]);

function loadReviewDecisions() {
  if (!fs.existsSync(reviewPath)) return new Map();
  const document = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
  if (document?.schemaVersion !== 1 || !Array.isArray(document.decisions)) {
    throw new Error(`historical branch review file has an unsupported shape: ${reviewPath}`);
  }
  const decisions = new Map();
  for (const decision of document.decisions) {
    const branch = safeBranch(decision?.branch);
    const sha = safeSha(decision?.sha);
    const disposition = safeText(decision?.disposition, 64);
    const rationale = safeText(decision?.rationale, 500);
    if (!branch || !sha || !acceptedReviewDispositions.has(disposition) || !rationale) {
      throw new Error(`invalid historical branch review decision in ${reviewPath}`);
    }
    decisions.set(`${branch}:${sha}`, { disposition, rationale });
  }
  return decisions;
}

fs.mkdirSync(outputDir, { recursive: true });
git(['fetch', '--no-tags', '--prune', 'origin', 'main']);

const issue = await github(`/issues/${issueNumber}`);
const reviewDecisions = loadReviewDecisions();
const issueBody = typeof issue?.body === 'string' ? issue.body.slice(0, 500000) : '';
const recorded = issueBody
  .split(/\r?\n/)
  .map((line) => line.split('\t'))
  .map(([branch, sha, marker]) => ({
    branch: safeBranch(branch),
    sha: safeSha(sha),
    marker: safeText(marker, 64),
  }))
  .filter(({ branch, sha, marker }) => branch && sha && marker === 'closed-historical-pattern');

if (recorded.length === 0) throw new Error(`issue #${issueNumber} contains no recorded historical deletion evidence`);

const prs = [];
for (let page = 1; ; page += 1) {
  const batch = await github(`/pulls?state=all&per_page=100&sort=updated&direction=desc&page=${page}`);
  if (!Array.isArray(batch)) throw new Error('GitHub pull request inventory returned an unexpected payload');
  prs.push(...batch);
  if (batch.length < 100) break;
}

const branches = [];
for (const { branch, sha } of recorded) {
  let objectAvailable = git(['cat-file', '-e', `${sha}^{commit}`], { allowFailure: true }).status === 0;
  if (!objectAvailable) {
    objectAvailable = git(['fetch', '--no-tags', 'origin', sha], { allowFailure: true }).status === 0
      && git(['cat-file', '-e', `${sha}^{commit}`], { allowFailure: true }).status === 0;
  }

  const pr = branchPr(prs, branch);
  const prState = !pr ? 'none' : pr.merged_at ? 'merged' : pr.state === 'open' ? 'open' : 'closed';
  if (!objectAvailable) {
    branches.push({ branch, sha, pr: Number.isInteger(pr?.number) ? pr.number : null, prState, objectAvailable: false,
      mergeBase: null, uniqueCommits: null, patchUniqueCommits: null, lastUpdated: null, changedFiles: [],
      reachableFromMain: null, disposition: 'object-unavailable-review-required' });
    continue;
  }

  const mergeBase = safeSha(gitText(['merge-base', 'origin/main', sha], { allowFailure: true })) || null;
  const uniqueCommits = Number.parseInt(gitText(['rev-list', '--count', `origin/main..${sha}`]) || '0', 10);
  const reachableFromMain = git(['merge-base', '--is-ancestor', sha, 'origin/main'], { allowFailure: true }).status === 0;
  const cherry = gitText(['cherry', 'origin/main', sha], { allowFailure: true });
  const patchUniqueCommits = cherry ? cherry.split(/\r?\n/).filter((line) => line.startsWith('+ ')).length : 0;
  const changedFiles = mergeBase
    ? gitText(['diff', '--name-only', `${mergeBase}...${sha}`], { allowFailure: true }).split(/\r?\n/).filter(Boolean).map((file) => safeText(file, 240)).sort()
    : [];
  const lastUpdated = safeText(gitText(['show', '-s', '--format=%cI', sha]), 40) || null;
  const automatedDisposition = reachableFromMain ? 'verified-reachable-from-main'
    : uniqueCommits === 0 ? 'verified-zero-unique-commits'
      : patchUniqueCommits === 0 ? 'verified-patch-equivalent' : 'unique-work-review-required';
  const review = reviewDecisions.get(`${branch}:${sha}`);
  const disposition = review && automatedDisposition === 'unique-work-review-required'
    ? review.disposition : automatedDisposition;

  branches.push({ branch, sha, pr: Number.isInteger(pr?.number) ? pr.number : null, prState, objectAvailable: true,
    mergeBase, uniqueCommits, patchUniqueCommits, lastUpdated, changedFiles, reachableFromMain,
    automatedDisposition, disposition, reviewRationale: review?.rationale ?? null });
}

const count = (disposition) => branches.filter((branch) => branch.disposition === disposition).length;
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  mainSha: safeSha(gitText(['rev-parse', 'origin/main'])),
  sourceIssue: issueNumber,
  branches,
  summary: {
    total: branches.length,
    reachable: count('verified-reachable-from-main'),
    zeroUnique: count('verified-zero-unique-commits'),
    patchEquivalent: count('verified-patch-equivalent'),
    uniqueWorkReview: count('unique-work-review-required'),
    objectUnavailable: count('object-unavailable-review-required'),
    reviewedUnique: branches.filter((branch) => branch.automatedDisposition === 'unique-work-review-required'
      && branch.disposition !== 'unique-work-review-required').length,
  },
};

fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(outputDir, 'report.tsv'), `${branches.map((branch) => [
  branch.branch, branch.sha, branch.pr ?? '', branch.prState, branch.objectAvailable, branch.mergeBase ?? '',
  branch.uniqueCommits ?? '', branch.patchUniqueCommits ?? '', branch.lastUpdated ?? '', branch.reachableFromMain ?? '',
  branch.disposition, branch.changedFiles.join(','),
].join('\t')).join('\n')}\n`, 'utf8');

const runId = safeText(process.env.GITHUB_RUN_ID ?? 'unknown', 64);
const server = safeText(process.env.GITHUB_SERVER_URL ?? 'https://github.com', 120).replace(/[^A-Za-z0-9:/._-]/g, '');
const sha = safeSha(process.env.GITHUB_SHA) ?? report.mainSha;
const comment = [
  'Historical deletion reconciliation against current `main` completed.', '', `Run ID: ${runId}`,
  `Run URL: ${server}/${repo}/actions/runs/${runId}`, `Main SHA: ${report.mainSha}`,
  `Recorded deleted refs: ${report.summary.total}`, `Reachable from main: ${report.summary.reachable}`,
  `Zero unique commits: ${report.summary.zeroUnique}`, `Patch-equivalent: ${report.summary.patchEquivalent}`,
  `Unique work requiring review: ${report.summary.uniqueWorkReview}`, `Objects unavailable: ${report.summary.objectUnavailable}`,
  '', `Actions artifact: historical-branch-reconciliation-${sha}`,
].join('\n');

await github(`/issues/${issueNumber}/comments`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: comment }),
});

const unresolved = report.summary.uniqueWorkReview + report.summary.objectUnavailable;
if (unresolved !== 0) {
  console.error(`${unresolved} historical branch objects require explicit reconciliation; no GO decision is permitted.`);
  process.exitCode = 1;
} else {
  console.log(`Reconciled ${report.summary.total} historical deleted refs with no unresolved unique work.`);
}
