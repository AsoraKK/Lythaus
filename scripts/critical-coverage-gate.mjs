import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(repositoryRoot, 'scripts', 'critical-coverage-manifest.json');

function fail(message) {
  console.error(`critical coverage gate: ${message}`);
  process.exit(1);
}

function isSafeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !path.isAbsolute(value)
    && !value.includes('\\')
    && !value.split('/').includes('..');
}

function requireFile(relativePath, kind) {
  if (!isSafeRelativePath(relativePath)) fail(`invalid ${kind} path: ${relativePath}`);
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  if (path.relative(repositoryRoot, absolutePath).startsWith('..')) fail(`${kind} escapes the repository: ${relativePath}`);
  try {
    if (!statSync(absolutePath).isFile()) fail(`${kind} is not a file: ${relativePath}`);
  } catch {
    fail(`${kind} is missing: ${relativePath}`);
  }
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`cannot read manifest: ${error instanceof Error ? error.message : String(error)}`);
}

if (manifest.schemaVersion !== 'lythaus-critical-production-coverage-v1') fail('unsupported manifest schema');
if (!manifest.minimums || !Array.isArray(manifest.modules) || manifest.modules.length === 0) fail('manifest must define minimums and modules');

for (const metric of ['lines', 'branches']) {
  const minimum = manifest.minimums[metric];
  if (!Number.isInteger(minimum) || minimum < 80 || minimum > 100) fail(`${metric} minimum must be an integer from 80 to 100`);
}

const sourceOwners = new Set();
for (const entry of manifest.modules) {
  if (!entry || typeof entry.id !== 'string' || !entry.id) fail('each module needs an id');
  if (entry.priority !== 'P1' && entry.priority !== 'P2') fail(`${entry.id} must declare a P1 or P2 priority`);
  if (!Array.isArray(entry.sources) || entry.sources.length === 0) fail(`${entry.id} has no sources`);
  if (!Array.isArray(entry.tests) || entry.tests.length === 0) fail(`${entry.id} has no tests`);

  for (const source of entry.sources) {
    requireFile(source, `${entry.id} source`);
    if (!source.includes('/src/') || source.includes('/tests/') || source.includes('/p1_modules/')) {
      fail(`${entry.id} source must be a production src file, not an artificial coverage target: ${source}`);
    }
    if (sourceOwners.has(source)) fail(`source appears in more than one module: ${source}`);
    sourceOwners.add(source);
  }
  for (const testFile of entry.tests) requireFile(testFile, `${entry.id} test`);

  const args = [
    '--experimental-strip-types',
    '--experimental-test-coverage',
    `--test-coverage-lines=${manifest.minimums.lines}`,
    `--test-coverage-branches=${manifest.minimums.branches}`,
    ...entry.sources.map((source) => `--test-coverage-include=${source}`),
    ...entry.sources.map((source) => `--import=./${source}`),
    '--test',
    ...entry.tests,
  ];
  console.log(`Running ${entry.id} with ${manifest.minimums.lines}% line and ${manifest.minimums.branches}% branch coverage minimums.`);
  const result = spawnSync(process.execPath, args, { cwd: repositoryRoot, stdio: 'inherit' });
  if (result.error) fail(`${entry.id} could not start: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('Critical production coverage gate passed.');
