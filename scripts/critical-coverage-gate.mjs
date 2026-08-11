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

if (manifest.schemaVersion !== 'lythaus-critical-production-coverage-v2') fail('unsupported manifest schema');
if (!manifest.minimums || !Array.isArray(manifest.modules) || manifest.modules.length === 0) fail('manifest must define minimums and modules');
if (!Array.isArray(manifest.requiredRuntimeSeams) || manifest.requiredRuntimeSeams.length === 0) {
  fail('manifest must name every required invoked runtime seam');
}
if (!Array.isArray(manifest.requiredDomainCategories) || manifest.requiredDomainCategories.length === 0) {
  fail('manifest must name every required critical domain category');
}
if (!manifest.domainCategoryOwners || typeof manifest.domainCategoryOwners !== 'object') {
  fail('manifest must map critical domain categories to covered modules');
}

for (const metric of ['lines', 'branches']) {
  const minimum = manifest.minimums[metric];
  if (!Number.isInteger(minimum) || minimum < 80 || minimum > 100) fail(`${metric} minimum must be an integer from 80 to 100`);
}

const sourceOwners = new Set();
const moduleIds = new Set();
const runtimeSeams = new Set();
for (const entry of manifest.modules) {
  if (!entry || typeof entry.id !== 'string' || !entry.id) fail('each module needs an id');
  if (moduleIds.has(entry.id)) fail(`duplicate module id: ${entry.id}`);
  moduleIds.add(entry.id);
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
    if (entry.runtimeSeam && !source.startsWith('apps/')) {
      fail(`${entry.id} runtime seam source must be an invoked application Worker policy: ${source}`);
    }
  }
  if (entry.runtimeSeam) runtimeSeams.add(entry.id);
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

for (const id of manifest.requiredRuntimeSeams) {
  if (typeof id !== 'string' || !id) fail('requiredRuntimeSeams contains an invalid id');
  if (!runtimeSeams.has(id)) fail(`required runtime seam is absent or not marked runtimeSeam: ${id}`);
}

const requiredDomainCategories = new Set(manifest.requiredDomainCategories);
for (const category of requiredDomainCategories) {
  if (typeof category !== 'string' || !category) fail('requiredDomainCategories contains an invalid category');
  const owners = manifest.domainCategoryOwners[category];
  if (!Array.isArray(owners) || owners.length === 0) fail(`critical domain category has no coverage owner: ${category}`);
  for (const owner of owners) {
    if (!moduleIds.has(owner)) fail(`critical domain category ${category} names an unknown module: ${owner}`);
  }
}
for (const category of Object.keys(manifest.domainCategoryOwners)) {
  if (!requiredDomainCategories.has(category)) fail(`domainCategoryOwners contains an undeclared category: ${category}`);
}

console.log(`Covered ${requiredDomainCategories.size} required critical domain categories across ${moduleIds.size} production modules.`);
console.log('Critical production coverage gate passed.');
