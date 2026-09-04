import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { dependencyGraphChanged, shouldRunLocalAudit } from './dependency-review-policy.mjs';

const baseSha = process.env.BASE_SHA?.trim();
const headSha = process.env.HEAD_SHA?.trim() || 'HEAD';
if (!baseSha) throw new Error('BASE_SHA is required for local dependency review');

const changedFiles = execFileSync('git', ['diff', '--name-only', `${baseSha}...${headSha}`], { encoding: 'utf8' })
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter(Boolean);

const packageRoots = ['', 'apps/control-panel', 'apps/marketing-site'];
const npmManifests = new Set(packageRoots.map((root) => path.posix.join(root, 'package.json').replace(/^\//, '')));
const npmLocks = new Set(packageRoots.map((root) => path.posix.join(root, 'package-lock.json').replace(/^\//, '')));
const otherDependencyFiles = new Set([
  'pubspec.yaml',
  'pubspec.lock',
  'android/app/build.gradle',
  'ios/Podfile.lock',
]);

const changedNpmManifests = changedFiles.filter((file) => npmManifests.has(file));
const changedNpmLocks = changedFiles.filter((file) => npmLocks.has(file));
const changedOtherDependencies = changedFiles.filter((file) => otherDependencyFiles.has(file));

function manifestAt(sha, manifest) {
  try {
    return JSON.parse(execFileSync('git', ['show', `${sha}:${manifest}`], { encoding: 'utf8' }));
  } catch {
    return null;
  }
}

const changedNpmDependencyManifests = changedNpmManifests.filter((manifest) => dependencyGraphChanged(
  manifestAt(baseSha, manifest),
  manifestAt(headSha, manifest),
));

if (changedOtherDependencies.length > 0) {
  throw new Error(
    `GitHub dependency graph is unavailable; refusing unreviewed non-npm dependency changes: ${changedOtherDependencies.join(', ')}`,
  );
}

for (const manifest of changedNpmDependencyManifests) {
  const lock = manifest.replace(/package\.json$/, 'package-lock.json');
  if (!changedNpmLocks.includes(lock)) {
    throw new Error(`Dependency manifest changed without its lockfile: ${manifest}`);
  }
}

const auditedPackageRoots = shouldRunLocalAudit({ changedNpmDependencyManifests, changedNpmLocks })
  ? packageRoots
  : [];
for (const root of auditedPackageRoots) {
  const lockfile = path.resolve(root || '.', 'package-lock.json');
  if (!fs.existsSync(lockfile)) continue;
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmCommand, ['audit', '--audit-level=high', '--package-lock-only', '--ignore-scripts'], {
    cwd: path.resolve(root || '.'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

console.log(JSON.stringify({
  status: 'pass',
  mode: 'local-fallback',
  changedNpmManifests,
  changedNpmDependencyManifests,
  changedNpmLocks,
  auditedPackageRoots,
}));
