import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repo = process.env.GITHUB_REPOSITORY ?? '';
const token = process.env.GH_TOKEN ?? '';
const issueNumber = Number.parseInt(process.env.HISTORICAL_EVIDENCE_ISSUE ?? '598', 10);
const outputDir = process.env.HISTORICAL_RECONCILIATION_OUTPUT ?? '.artifacts/historical-branch-reconciliation';

if (!/^[^/]+\/[^/]+$/.test(repo)) throw new Error('GITHUB_REPOSITORY is required');
if (!token) throw new Error('GH_TOKEN is required');
if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error('valid historical evidence issue number is required');

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
};

async function github(pathname, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repo}${pathname}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) throw new Error(`GitHub ${options.method ?? 'GET'} ${pathname} failed with HTTP ${response.status}`);
  return body;
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr ?? '').trim()}`);
  }
  return result;
}

function gitText(args, options) {
  return (git(args, options).stdout ?? '').trim();
}

function branchPr(prs, branch) {
  return prs
    .filter((pr) => pr?.head?.repo?.full_name === repo && pr?.head?.ref === branch)
    .sort((left, right) => String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? '')))[0] ?? null;
}

fs.mkdirSync(outputDir, { recursive: true });
git(['fetch', '--no-tags', '--prune', 'origin', 'main']);

const issue = await github(`/issues/${issueNumber}`);
const recorded = String(issue?.body ?? '')
  .split(/\r?\n/)
  .map((line) => line.split('\t'))
  .filter((parts) => parts.length >= 3 && /^[0-9a-f]{40}$/.test(parts[1] ?? '') && parts[2] === 'closed-historical-pattern')
  .map(([branch, sha]) => ({ branch, sha }));

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
  const prState = !pr ? 'none' : pr.merged_at ? 'merged' : pr.state;

  if (!objectAvailable) {
    branches.push({
      branch,
      sha,
      pr: pr?.number ?? null,
      prState,
      objectAvailable: false,
      mergeBase: null,
      uniqueCommits: null,
      patchUniqueCommits: null,
      lastUpdated: null,
      changedFiles: [],
      reachableFromMain: null,
      disposition: 'object-unavailable-review-required',
    });
    continue;
  }

  const mergeBase = gitText(['merge-base', 'origin/main', sha], { allowFailure: true }) || null;
  const uniqueCommits = Number.parseInt(gitText(['rev-list', '--count', `origin/main..${sha}`]) || '0', 10);
  const reachableFromMain = git(['merge-base', '--is-ancestor', sha, 'origin/main'], { allowFailure: true }).status === 0;
  const cherry = gitText(['cherry', 'origin/main', sha], { allowFailure: true });
  const patchUniqueCommits = cherry ? cherry.split(/\r?\n/).filter((line) => line.startsWith('+ ')).length : 0;
  const changedFiles = mergeBase
    ? gitText(['diff', '--name-only', `${mergeBase}...${sha}`], { allowFailure: true }).split(/\r?\n/).filter(Boolean).sort()
    : [];
  const lastUpdated = gitText(['show', '-s', '--format=%cI', sha]) || null;

  let disposition;
  if (reachableFromMain) disposition = 'verified-reachable-from-main';
  else if (uniqueCommits === 0) disposition = 'verified-zero-unique-commits';
  else if (patchUniqueCommits === 0) disposition = 'verified-patch-equivalent';
  else disposition = 'unique-work-review-required';

  branches.push({
    branch,
    sha,
    pr: pr?.number ?? null,
    prState,
    objectAvailable: true,
    mergeBase,
    uniqueCommits,
    patchUniqueCommits,
    lastUpdated,
    changedFiles,
    reachableFromMain,
    disposition,
  });
}

const count = (disposition) => branches.filter((branch) => branch.disposition === disposition).length;
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  mainSha: gitText(['rev-parse', 'origin/main']),
  sourceIssue: issueNumber,
  branches,
  summary: {
    total: branches.length,
    reachable: count('verified-reachable-from-main'),
    zeroUnique: count('verified-zero-unique-commits'),
    patchEquivalent: count('verified-patch-equivalent'),
    uniqueWorkReview: count('unique-work-review-required'),
    objectUnavailable: count('object-unavailable-review-required'),
  },
};

fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(
  path.join(outputDir, 'report.tsv'),
  `${branches.map((branch) => [
    branch.branch,
    branch.sha,
    branch.pr ?? '',
    branch.prState,
    branch.objectAvailable,
    branch.mergeBase ?? '',
    branch.uniqueCommits ?? '',
    branch.patchUniqueCommits ?? '',
    branch.lastUpdated ?? '',
    branch.reachableFromMain ?? '',
    branch.disposition,
    branch.changedFiles.join(','),
  ].join('\t')).join('\n')}\n`,
  'utf8',
);

const runId = process.env.GITHUB_RUN_ID ?? 'unknown';
const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
const sha = process.env.GITHUB_SHA ?? report.mainSha;
const comment = [
  'Historical deletion reconciliation against current `main` completed.',
  '',
  `Run ID: ${runId}`,
  `Run URL: ${server}/${repo}/actions/runs/${runId}`,
  `Main SHA: ${report.mainSha}`,
  `Recorded deleted refs: ${report.summary.total}`,
  `Reachable from main: ${report.summary.reachable}`,
  `Zero unique commits: ${report.summary.zeroUnique}`,
  `Patch-equivalent: ${report.summary.patchEquivalent}`,
  `Unique work requiring review: ${report.summary.uniqueWorkReview}`,
  `Objects unavailable: ${report.summary.objectUnavailable}`,
  '',
  `Actions artifact: historical-branch-reconciliation-${sha}`,
].join('\n');

await github(`/issues/${issueNumber}/comments`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ body: comment }),
});

const unresolved = report.summary.uniqueWorkReview + report.summary.objectUnavailable;
if (unresolved !== 0) {
  console.error(`${unresolved} historical branch objects require explicit reconciliation; no GO decision is permitted.`);
  process.exitCode = 1;
} else {
  console.log(`Reconciled ${report.summary.total} historical deleted refs with no unresolved unique work.`);
}
