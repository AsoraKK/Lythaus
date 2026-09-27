import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';

export function comparison(base, head) {
  if (![base, head].every(value => /^[a-f0-9]{40}$/.test(value ?? '') && !/^0+$/.test(value)) || base === head) throw new Error('EXPLICIT_DISTINCT_COMMIT_SHAS_REQUIRED');
  return { baseSha: base, reviewedHeadSha: head };
}

export function apiFailure(status, message = '') {
  if (status === 429 || status >= 500 || /rate limit/i.test(message)) return 'TRANSIENT_API_FAILURE';
  if (status === 401 || /resource not accessible|permission|credentials/i.test(message)) return 'TOKEN_PERMISSION_DENIED';
  if (/dependency graph.*(disabled|not enabled)|advanced security.*not enabled/i.test(message)) return 'CONFIGURATION_DISABLED';
  if (status === 404) return 'REF_OR_REPOSITORY_NOT_ACCESSIBLE';
  if (/ecosystem.*not supported/i.test(message)) return 'UNSUPPORTED_ECOSYSTEM';
  return 'API_FAILURE_UNCLASSIFIED';
}

export function resolvedDependencies(file, content) {
  if (!content) return [];
  if (file.endsWith('package-lock.json')) {
    const lock = JSON.parse(content);
    if (!lock.packages) throw new Error(`UNSUPPORTED_LOCK_SCHEMA:${file}`);
    return Object.entries(lock.packages).filter(([key, value]) => key && !value.link).map(([key, value]) => ({ ecosystem: 'npm', name: value.name ?? key.split('node_modules/').at(-1), version: value.version, relationship: 'resolved' }));
  }
  if (file.endsWith('pubspec.lock')) {
    const lock = parse(content);
    return Object.entries(lock.packages ?? {}).filter(([, value]) => value.source !== 'sdk').map(([name, value]) => {
      if (value.source !== 'hosted') throw new Error(`UNSUPPORTED_DEPENDENCY_SOURCE:${file}:${name}`);
      return { ecosystem: 'pub', name, version: value.version, relationship: value.dependency === 'transitive' ? 'transitive' : 'direct' };
    });
  }
  if (/requirements\.(txt|lock)$/.test(file)) {
    return content.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => {
      const pinned = line.match(/^([A-Za-z0-9_.-]+)==([^\s]+)\s+--hash=sha256:[a-f0-9]{64}$/);
      const wheel = line.match(/^([A-Za-z0-9_.-]+) @ https:\/\/download-r2\.pytorch\.org\/whl\/cpu\/[^/]+-([0-9.]+(?:%2Bcpu)?)-cp313-cp313-manylinux_2_28_x86_64\.whl --hash=sha256:[a-f0-9]{64}$/);
      if (!pinned && !wheel) throw new Error(`UNSUPPORTED_REQUIREMENT:${file}`);
      const [, name, version] = pinned ?? wheel;
      return { ecosystem: 'pip', name: name.toLowerCase().replace(/[-_.]+/g, '-'), version: decodeURIComponent(version), relationship: 'resolved' };
    });
  }
  throw new Error(`UNSUPPORTED_MANIFEST:${file}`);
}

const key = value => `${value.ecosystem.toLowerCase()}:${value.name.toLowerCase().replace(value.ecosystem.toLowerCase() === 'pip' ? /[-_.]+/g : /$^/, '-')}@${value.version}`;
export function missingCoverage(expected, changes) {
  const observed = new Set(changes.filter(value => value.change_type === 'added').map(value => `${value.manifest}:${key(value)}`));
  return expected.filter(value => !observed.has(`${value.manifest}:${key(value)}`));
}

const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function expectedChanges(base, head) {
  const filesAt = sha => git(['ls-tree', '-r', '--name-only', sha]).split(/\r?\n/);
  const beforeFiles = new Set(filesAt(base));
  const headFiles = filesAt(head);
  const changed = git(['diff', '--name-only', base, head]).split(/\r?\n/);
  const files = headFiles.filter(file => changed.includes(file) && /(^|\/)(package-lock\.json|pubspec\.lock|requirements\.(txt|lock))$/.test(file));
  const changes = [];
  for (const file of files) {
    const before = beforeFiles.has(file) ? resolvedDependencies(file, git(['show', `${base}:${file}`])) : [];
    const after = resolvedDependencies(file, git(['show', `${head}:${file}`]));
    const prior = new Set(before.map(key));
    changes.push(...after.filter(value => !prior.has(key(value))).map(value => ({ ...value, manifest: file })));
  }
  for (const file of changed) {
    if (/(^|\/)(Gemfile\.lock|Podfile\.lock|.*\.gradle(?:\.kts)?|Cargo\.lock|go\.sum|poetry\.lock|uv\.lock)$/.test(file)) throw new Error(`UNSUPPORTED_COVERAGE_VERIFIER:${file}`);
    if (file.endsWith('package.json')) {
      const before = beforeFiles.has(file) ? JSON.parse(git(['show', `${base}:${file}`])) : {};
      const after = headFiles.includes(file) ? JSON.parse(git(['show', `${head}:${file}`])) : {};
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'overrides']) {
        if (JSON.stringify(before[field]) !== JSON.stringify(after[field]) && !changed.includes(file.replace(/package\.json$/, 'package-lock.json'))) throw new Error(`CHANGED_MANIFEST_WITHOUT_LOCK:${file}`);
      }
    }
  }
  return changes;
}

export async function main() {
  const directory = '.artifacts/security-run-evidence';
  fs.mkdirSync(directory, { recursive: true });
  const receipt = { workflow: 'Dependency review', headSha: process.env.GITHUB_SHA, testMergeSha: process.env.GITHUB_EVENT_NAME === 'pull_request' ? process.env.GITHUB_SHA : null, releaseSha: null, conclusion: 'failure', mode: 'native', observedAt: new Date().toISOString() };
  try {
    Object.assign(receipt, comparison(process.env.BASE_SHA, process.env.HEAD_SHA));
    const expected = expectedChanges(receipt.baseSha, receipt.reviewedHeadSha);
    receipt.expected = expected;
    for (let attempt = 0; attempt < 5; attempt++) {
      const changes = [];
      let warnings = false;
      for (let page = 1; page <= 100; page++) {
        const endpoint = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/dependency-graph/compare/${receipt.baseSha}...${receipt.reviewedHeadSha}?per_page=100&page=${page}`;
        const response = await fetch(endpoint, { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'x-github-api-version': '2022-11-28' }, signal: AbortSignal.timeout(30000) });
        receipt.operation = { method: 'GET', endpoint, status: response.status, requestId: response.headers.get('x-github-request-id') };
        const body = await response.json();
        if (!response.ok) {
          receipt.apiMessage = String(body.message ?? '').slice(0, 1000);
          throw new Error(apiFailure(response.status, receipt.apiMessage));
        }
        if (!Array.isArray(body)) throw new Error('INVALID_API_RESPONSE');
        const encoded = response.headers.get('x-github-dependency-graph-snapshot-warnings');
        if (encoded && !['', '[]', '{}'].includes(Buffer.from(encoded, 'base64').toString('utf8').trim())) warnings = true;
        changes.push(...body);
        if (!response.headers.get('link')?.includes('rel="next"')) break;
        if (page === 100) throw new Error('DEPENDENCY_PAGE_LIMIT');
      }
      receipt.changes = changes;
      receipt.missing = missingCoverage(expected, changes);
      receipt.snapshotWarnings = warnings;
      if (!warnings && receipt.missing.length === 0) break;
      if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 10000 * (attempt + 1)));
    }
    receipt.coverage = receipt.snapshotWarnings || receipt.missing.length ? 'INCOMPLETE_INDEXING_OR_UNRECOGNIZED_MANIFEST' : 'COMPLETE';
    receipt.reason = 'NATIVE_API_AVAILABLE';
    fs.writeFileSync(`${directory}/comparison.json`, JSON.stringify(receipt, null, 2) + '\n');
  } catch (error) {
    receipt.reason = error.message;
    fs.writeFileSync(`${directory}/comparison.json`, JSON.stringify(receipt, null, 2) + '\n');
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
