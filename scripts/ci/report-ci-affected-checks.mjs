import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/i;
const MAX_CHANGED_PATHS = 5000;
const MAX_DIFF_BYTES = 2 * 1024 * 1024;
const REQUIRED_CHECKS = [
  'Repository hygiene', 'Workflow lint', 'Native Workers and PlanetScale', 'OpenAPI contract',
  'Flutter analyze and test', 'Web frontends', 'Dependency audit', 'CodeQL JavaScript TypeScript',
  'dependency-review', 'scan',
];
const AUXILIARY_SUITES = ['Disabled activity pilot integration'];
const SELECTABLE_SUITES = [...REQUIRED_CHECKS, ...AUXILIARY_SUITES].sort();
const ALWAYS_SELECTED_FOR_PR = [
  'Repository hygiene', 'Dependency audit', 'CodeQL JavaScript TypeScript', 'dependency-review', 'scan',
];
const FRONTEND_ROOT = 'apps/marketing-site/';
const FULL_PATH_PREFIXES = [
  '.github/', 'api/', 'apps/', 'assets/', 'database/', 'docs/', 'integration_test/', 'lib/', 'ml/',
  'packages/', 'scripts/', 'test/', 'web/', 'android/', 'ios/', 'macos/', 'windows/', 'linux/',
];
const FULL_PATHS = new Set([
  '.fvmrc', '.npmrc', 'analysis_options.yaml', 'package.json', 'package-lock.json',
  'pubspec.yaml', 'pubspec.lock', 'README', 'CONTRIBUTING',
]);

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function validShaOrNull(value) {
  return value == null || SHA.test(value);
}

function makeReport({
  eventName = null,
  recommendation,
  baseSha = null,
  headSha = null,
  testedSha = null,
  selectedSuites,
  reasons,
  fallbackStatus,
  changedFileCount = 0,
  unknownPathCount = 0,
}) {
  return {
    schemaVersion: 1,
    classifierVersion: '0.2.0',
    mode: 'report-only',
    eventName,
    recommendation,
    baseSha,
    headSha,
    testedSha,
    selectedSuites: sortedUnique(selectedSuites),
    reasons: [...reasons],
    fallbackStatus,
    changedFileCount,
    unknownPathCount,
    workflowControlChanged: false,
  };
}

function fullReport(reason, details = {}, fallback = true) {
  return makeReport({
    eventName: details.eventName ?? null,
    recommendation: 'FULL',
    baseSha: SHA.test(details.baseSha ?? '') ? details.baseSha : null,
    headSha: SHA.test(details.headSha ?? '') ? details.headSha : null,
    testedSha: SHA.test(details.testedSha ?? '') ? details.testedSha : null,
    selectedSuites: SELECTABLE_SUITES,
    reasons: [reason],
    fallbackStatus: fallback ? 'fallback_full' : 'required_full',
    changedFileCount: Number.isSafeInteger(details.changedFileCount) && details.changedFileCount >= 0
      ? details.changedFileCount : 0,
    unknownPathCount: Number.isSafeInteger(details.unknownPathCount) && details.unknownPathCount >= 0
      ? details.unknownPathCount : 0,
  });
}

function isMarketingFrontendPath(path) {
  if (!path.startsWith(FRONTEND_ROOT)) return false;
  const relative = path.slice(FRONTEND_ROOT.length);
  return /^(src|tests|public)\//.test(relative)
    || relative === 'package.json'
    || relative === 'package-lock.json';
}

function requiresFullValidation(path) {
  if (FULL_PATHS.has(path) || /^(README|CONTRIBUTING)(\.[^/]*)?$/.test(path)) return true;
  return FULL_PATH_PREFIXES.some(prefix => path.startsWith(prefix));
}

export function validateMachineReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  if (report.schemaVersion !== 1 || report.classifierVersion !== '0.2.0' || report.mode !== 'report-only') return false;
  if (report.eventName !== null && typeof report.eventName !== 'string') return false;
  if (!['FULL', 'AFFECTED_ONLY_CANDIDATE'].includes(report.recommendation)) return false;
  if (!['fallback_full', 'required_full', 'none'].includes(report.fallbackStatus)) return false;
  if (!validShaOrNull(report.baseSha) || !validShaOrNull(report.headSha) || !validShaOrNull(report.testedSha)) return false;
  if (!Array.isArray(report.selectedSuites) || report.selectedSuites.length === 0) return false;
  if (new Set(report.selectedSuites).size !== report.selectedSuites.length) return false;
  if (report.selectedSuites.some(name => !SELECTABLE_SUITES.includes(name))) return false;
  if (!Array.isArray(report.reasons) || report.reasons.length === 0 || report.reasons.some(reason => typeof reason !== 'string' || reason.length === 0)) return false;
  if (!Number.isSafeInteger(report.changedFileCount) || report.changedFileCount < 0) return false;
  if (!Number.isSafeInteger(report.unknownPathCount) || report.unknownPathCount < 0) return false;
  if (typeof report.workflowControlChanged !== 'boolean') return false;
  if (report.recommendation === 'FULL' && (report.selectedSuites.join('\0') !== SELECTABLE_SUITES.join('\0')
    || !['fallback_full', 'required_full'].includes(report.fallbackStatus))) return false;
  if (report.recommendation === 'AFFECTED_ONLY_CANDIDATE'
    && (report.fallbackStatus !== 'none' || ALWAYS_SELECTED_FOR_PR.some(name => !report.selectedSuites.includes(name)))) return false;
  return true;
}

export function classifyChangedPaths(paths, comparison = {}) {
  const details = {
    eventName: comparison.eventName ?? null,
    baseSha: comparison.baseSha,
    headSha: comparison.headSha,
    testedSha: comparison.testedSha,
  };
  if (comparison.eventName && comparison.eventName !== 'pull_request') {
    return fullReport('only pull request changes can receive a candidate selection', details, false);
  }
  if (!Array.isArray(paths) || paths.length === 0) return fullReport('empty or invalid changed-file list', details);
  if (paths.length > MAX_CHANGED_PATHS) return fullReport('comparison exceeds the reviewed file-count limit', { ...details, changedFileCount: paths.length });
  if (!paths.every(path => typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..'))) {
    return fullReport('invalid changed-file path', { ...details, changedFileCount: paths.length });
  }

  const selectedSuites = new Set(ALWAYS_SELECTED_FOR_PR);
  let fullRequired = false;
  const unknownPaths = [];
  for (const path of paths) {
    if (isMarketingFrontendPath(path)) {
      selectedSuites.add('Web frontends');
    } else if (requiresFullValidation(path)) {
      fullRequired = true;
    } else {
      unknownPaths.push(path);
    }
  }

  if (unknownPaths.length > 0) {
    return fullReport('at least one path is outside the reviewed dependency map', {
      ...details,
      changedFileCount: paths.length,
      unknownPathCount: unknownPaths.length,
    });
  }
  if (fullRequired) {
    return fullReport('change includes a path whose consumers require full validation', {
      ...details,
      changedFileCount: paths.length,
    }, false);
  }

  const candidate = makeReport({
    ...details,
    recommendation: 'AFFECTED_ONLY_CANDIDATE',
    selectedSuites: [...selectedSuites],
    reasons: ['marketing-site source, tests, public assets, or locked dependencies'],
    fallbackStatus: 'none',
    changedFileCount: paths.length,
  });
  return validateMachineReport(candidate)
    ? candidate
    : fullReport('generated classifier report failed schema validation', { ...details, changedFileCount: paths.length });
}

export function resolveComparison(eventName, event, githubSha, checkedOutSha) {
  if (!SHA.test(githubSha ?? '') || githubSha !== checkedOutSha) return { error: 'GITHUB_SHA does not exactly match checked-out HEAD' };

  if (eventName === 'pull_request') {
    const baseSha = event?.pull_request?.base?.sha;
    const headSha = event?.pull_request?.head?.sha;
    const testedSha = event?.pull_request?.merge_commit_sha;
    if (!SHA.test(baseSha ?? '') || !SHA.test(headSha ?? '') || !SHA.test(testedSha ?? '')) {
      return { error: 'pull request base/head/tested SHA is missing or malformed' };
    }
    if (testedSha !== githubSha) return { error: 'pull request tested merge SHA does not match GITHUB_SHA' };
    return { eventName, baseSha, headSha, testedSha, diffBaseSha: baseSha, diffHeadSha: testedSha };
  }

  if (eventName === 'push') {
    const baseSha = event?.before;
    const headSha = event?.after;
    if (!SHA.test(baseSha ?? '') || baseSha === '0'.repeat(40) || !SHA.test(headSha ?? '') || headSha !== githubSha) {
      return { error: 'push before/after SHA is missing, malformed, or inconsistent' };
    }
    return { eventName, baseSha, headSha, testedSha: githubSha, fullRequired: true, reason: 'push events always require full validation' };
  }

  return {
    eventName: typeof eventName === 'string' && eventName.length > 0 ? eventName : 'unknown',
    baseSha: null,
    headSha: SHA.test(githubSha ?? '') ? githubSha : null,
    testedSha: SHA.test(githubSha ?? '') ? githubSha : null,
    fullRequired: true,
    reason: `${typeof eventName === 'string' && eventName.length > 0 ? eventName : 'unsupported'} events always require full validation`,
  };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: MAX_DIFF_BYTES + 1, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function reportForEvent(eventName, event, githubSha, checkedOutSha, gitRunner = git) {
  const comparison = resolveComparison(eventName, event, githubSha, checkedOutSha);
  if (comparison.error) return fullReport(comparison.error, { eventName, testedSha: githubSha });
  if (comparison.fullRequired) {
    return fullReport(comparison.reason, comparison, false);
  }

  try {
    for (const sha of [comparison.baseSha, comparison.headSha, comparison.testedSha]) {
      gitRunner(['cat-file', '-e', `${sha}^{commit}`]);
    }
    const parents = gitRunner(['rev-list', '--parents', '-n', '1', comparison.testedSha]).trim().split(/\s+/);
    if (parents.length !== 3 || parents[0] !== comparison.testedSha || parents[1] !== comparison.baseSha || parents[2] !== comparison.headSha) {
      return fullReport('tested tree is not the exact base-plus-head pull request merge', comparison);
    }

    const output = gitRunner(['diff', '--no-renames', '--name-only', '-z', comparison.diffBaseSha, comparison.diffHeadSha]);
    if (typeof output !== 'string' || output.length > MAX_DIFF_BYTES || (output.length > 0 && !output.endsWith('\0'))) {
      return fullReport('diff output is malformed, truncated, or exceeds the reviewed byte limit', comparison);
    }
    const changedFiles = output.length === 0 ? [] : output.slice(0, -1).split('\0');
    if (changedFiles.length > MAX_CHANGED_PATHS) {
      return fullReport('comparison exceeds the reviewed file-count limit', { ...comparison, changedFileCount: changedFiles.length });
    }
    return classifyChangedPaths(changedFiles, comparison);
  } catch {
    return fullReport('Git comparison failed or required objects are unavailable', comparison);
  }
}

export function reportFromEventJson(eventName, eventJson, githubSha, checkedOutSha, gitRunner = git) {
  if (typeof eventJson !== 'string') return fullReport('event payload is unavailable or not text', { eventName, testedSha: githubSha });
  try {
    return reportForEvent(eventName, JSON.parse(eventJson), githubSha, checkedOutSha, gitRunner);
  } catch {
    return fullReport('event payload is malformed JSON', { eventName, testedSha: githubSha });
  }
}

export function evaluateSelectedResults(selection, results) {
  if (!validateMachineReport(selection)) return { passed: false, reasons: ['selection report is invalid'] };
  if (selection.eventName !== 'pull_request'
    || ![selection.baseSha, selection.headSha, selection.testedSha].every(value => SHA.test(value ?? ''))) {
    return { passed: false, reasons: ['selection is not bound to exact pull request comparison SHAs'] };
  }
  if (!Array.isArray(results)) return { passed: false, reasons: ['result list is missing or invalid'] };

  const reasons = [];
  const names = results.map(result => result?.name);
  if (names.some(name => typeof name !== 'string' || !SELECTABLE_SUITES.includes(name))) reasons.push('result list contains an invalid or unselected suite');
  if (new Set(names).size !== names.length) reasons.push('result list contains duplicate suites');

  const selected = selection.selectedSuites;
  const observed = sortedUnique(names.filter(name => typeof name === 'string'));
  if (selected.join('\0') !== observed.join('\0')) reasons.push('result suite set does not exactly match the selection');
  for (const result of results) {
    if (!result || result.testedSha !== selection.testedSha) reasons.push('result tested SHA does not match the selection');
    if (result?.conclusion !== 'success') reasons.push(`selected suite did not explicitly succeed: ${String(result?.name ?? 'missing name')}`);
  }
  return { passed: reasons.length === 0, reasons: sortedUnique(reasons) };
}

export function render(report) {
  const safeReport = validateMachineReport(report)
    ? report
    : fullReport('report failed schema validation');
  const rows = [
    '### CI affected-check classifier (report only)', '',
    `- Recommendation: **${safeReport.recommendation}**`,
    `- Selected suites: ${safeReport.selectedSuites.join(', ')}`,
    `- Comparison: ${safeReport.baseSha ?? 'unknown'} → ${safeReport.headSha ?? 'unknown'}; tested tree ${safeReport.testedSha ?? 'unknown'}`,
    `- Changed paths: ${safeReport.changedFileCount}; unknown paths: ${safeReport.unknownPathCount}`,
    `- Fallback status: ${safeReport.fallbackStatus}`,
    `- Reason: ${safeReport.reasons.join('; ')}`,
    '- Advisory only: CI execution, triggers, required checks, coverage, and release decisions are unchanged.',
    '',
    '<details><summary>Versioned machine-readable report</summary>', '',
    '```json', JSON.stringify(safeReport, null, 2), '```', '',
    '</details>',
  ];
  return `${rows.join('\n')}\n`;
}

function main() {
  let report;
  try {
    if (!process.env.GITHUB_EVENT_PATH) throw new Error('event path unavailable');
    const eventJson = readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8');
    const checkedOutSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    report = reportFromEventJson(process.env.GITHUB_EVENT_NAME, eventJson, process.env.GITHUB_SHA, checkedOutSha);
  } catch {
    report = fullReport('event payload or checkout metadata is unavailable', {
      eventName: process.env.GITHUB_EVENT_NAME ?? null,
      testedSha: process.env.GITHUB_SHA,
    });
  }
  process.stdout.write(render(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
