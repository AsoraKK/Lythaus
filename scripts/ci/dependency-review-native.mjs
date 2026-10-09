import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
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

function repositoryFile(file, revision) {
  const segments = file.split('/');
  for (let index = 1; index <= segments.length; index++) {
    const prefix = segments.slice(0, index).join('/');
    if (revision) {
      const entry = git(['ls-tree', revision, '--', prefix]);
      if (entry && !entry.startsWith(index === segments.length ? '100644 blob ' : '040000 tree ')) throw new Error(`NON_CANONICAL_LOCAL_PACKAGE_FILE:${prefix}`);
    } else {
      const entry = fs.lstatSync(join(process.cwd(), prefix), { throwIfNoEntry: false });
      if (entry && (entry.isSymbolicLink() || !(index === segments.length ? entry.isFile() : entry.isDirectory()))) throw new Error(`NON_CANONICAL_LOCAL_PACKAGE_FILE:${prefix}`);
    }
  }
  if (revision) return git(['ls-tree', revision, '--', file]) ? git(['show', `${revision}:${file}`]) : undefined;
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : undefined;
}

function canonicalLocalPackage(file, name, value, packages, revision) {
  if (file !== 'pubspec.lock' || name !== 'lythaus_api_client' || value.source !== 'path' || value.dependency !== 'direct main' || value.description?.path !== 'build/api_client' || value.description?.relative !== true || Object.keys(value.description).sort().join(',') !== 'path,relative') throw new Error(`UNSUPPORTED_DEPENDENCY_SOURCE:${file}:${name}`);
  const rootContent = repositoryFile('pubspec.yaml', revision);
  const sourceContent = repositoryFile('lib/generated/api_client/pubspec.yaml', revision);
  if (!rootContent || !sourceContent) throw new Error(`CANONICAL_LOCAL_PACKAGE_SOURCE_REQUIRED:${name}`);
  const root = parse(rootContent);
  const source = parse(sourceContent);
  const declaration = root.dependencies?.[name];
  if (declaration?.path !== 'build/api_client' || Object.keys(declaration).join(',') !== 'path' || root.dev_dependencies?.[name] || root.dependency_overrides?.[name] || source.name !== name || source.version !== value.version || typeof source.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/.test(source.version)) throw new Error(`CANONICAL_LOCAL_PACKAGE_IDENTITY_MISMATCH:${name}`);
  if (Object.keys(source.dependency_overrides ?? {}).length || Object.entries(source.dependencies ?? {}).some(([dependency, constraint]) => typeof constraint !== 'string' || packages[dependency]?.source !== 'hosted')) throw new Error(`CANONICAL_LOCAL_PACKAGE_UNLOCKED_DEPENDENCY:${name}`);
  const preparedContent = repositoryFile('build/api_client/pubspec.yaml', revision);
  if (preparedContent !== undefined && preparedContent !== sourceContent) throw new Error(`CANONICAL_LOCAL_PACKAGE_PREPARATION_MISMATCH:${name}`);
  return { ecosystem: 'pub', name, version: value.version, relationship: 'direct', source: 'path', localPath: 'build/api_client', canonicalManifest: 'lib/generated/api_client/pubspec.yaml' };
}

export function resolvedDependencies(file, content, { revision } = {}) {
  if (revision && !/^[a-f0-9]{40}$/.test(revision)) throw new Error('EXACT_LOCAL_PACKAGE_REVISION_REQUIRED');
  if (!content) return [];
  if (file.endsWith('package-lock.json')) {
    const lock = JSON.parse(content);
    if (!lock.packages) throw new Error(`UNSUPPORTED_LOCK_SCHEMA:${file}`);
    const localTargets = new Set(Object.values(lock.packages).filter(value => value.link && typeof value.resolved === 'string').map(value => value.resolved));
    return Object.entries(lock.packages).filter(([key, value]) => key && !value.link).map(([key, value]) => ({
      ecosystem: 'npm', name: localTargets.has(key) && !key.includes('node_modules/') ? key : value.name ?? key.split('node_modules/').at(-1),
      version: value.version, relationship: 'resolved',
    }));
  }
  if (file.endsWith('pubspec.lock')) {
    if (revision) repositoryFile(file, revision);
    const lock = parse(content);
    if (!lock?.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) throw new Error(`UNSUPPORTED_LOCK_SCHEMA:${file}`);
    const local = lock.packages.lythaus_api_client;
    const declaredLocal = file === 'pubspec.lock' && revision && parse(repositoryFile('pubspec.yaml', revision) ?? '')?.dependencies?.lythaus_api_client;
    if ((local || declaredLocal) && local?.source !== 'path') throw new Error(`UNSUPPORTED_DEPENDENCY_SOURCE:${file}:lythaus_api_client`);
    return Object.entries(lock.packages ?? {}).filter(([, value]) => value.source !== 'sdk').map(([name, value]) => {
      if (value.source === 'path') return canonicalLocalPackage(file, name, value, lock.packages, revision);
      if (value.source !== 'hosted') throw new Error(`UNSUPPORTED_DEPENDENCY_SOURCE:${file}:${name}`);
      return { ecosystem: 'pub', name, version: value.version, integrity: value.description?.sha256, relationship: value.dependency === 'transitive' ? 'transitive' : 'direct' };
    });
  }
  if (/requirements\.(txt|lock)$/.test(file)) {
    return content.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#') && !/^--find-links https:\/\/download-r2\.pytorch\.org\/whl\/cpu\/(torch|torchvision)-[0-9.]+%2Bcpu-cp313-cp313-manylinux_2_28_x86_64\.whl$/.test(line)).map(line => {
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
export function expectedChanges(base, head) {
  comparison(base, head);
  const filesAt = sha => git(['ls-tree', '-r', '--name-only', sha]).split(/\r?\n/);
  const beforeFiles = new Set(filesAt(base));
  const headFiles = filesAt(head);
  const changed = git(['diff', '--name-only', base, head]).split(/\r?\n/);
  const files = headFiles.filter(file => changed.includes(file) && /(^|\/)(package-lock\.json|pubspec\.lock|requirements\.(txt|lock))$/.test(file));
  if (headFiles.includes('pubspec.lock') && changed.some(file => file === 'pubspec.yaml' || file.startsWith('lib/generated/api_client/') || file === 'build' || file.startsWith('build/'))) resolvedDependencies('pubspec.lock', git(['show', `${head}:pubspec.lock`]), { revision: head });
  const changes = [];
  for (const file of files) {
    const before = beforeFiles.has(file) ? resolvedDependencies(file, git(['show', `${base}:${file}`]), { revision: base }) : [];
    const after = resolvedDependencies(file, git(['show', `${head}:${file}`]), { revision: head });
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
    if (file === 'pubspec.yaml') {
      const before = beforeFiles.has(file) ? parse(git(['show', `${base}:${file}`])) : {};
      const after = headFiles.includes(file) ? parse(git(['show', `${head}:${file}`])) : {};
      for (const field of ['dependencies', 'dev_dependencies', 'dependency_overrides']) {
        if (JSON.stringify(before[field]) !== JSON.stringify(after[field]) && !changed.includes('pubspec.lock')) throw new Error(`CHANGED_MANIFEST_WITHOUT_LOCK:${file}`);
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
