#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const target = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['audit', '--json'], {
  cwd: target,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`Unable to execute npm audit for ${target}: ${result.error.message}`);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(result.stdout || '{}');
} catch {
  console.error(`Unable to parse npm audit JSON for ${target}.`);
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(2);
}

const counts = report.metadata?.vulnerabilities;
if (!counts || typeof counts.high !== 'number' || typeof counts.critical !== 'number') {
  console.error(`npm audit did not return vulnerability counts for ${target}.`);
  if (report.error?.summary) console.error(report.error.summary);
  process.exit(2);
}

console.log(
  `${target}: low=${counts.low} moderate=${counts.moderate} high=${counts.high} critical=${counts.critical}`
);

if (counts.high > 0 || counts.critical > 0) {
  let lockPackages = {};
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(target, 'package-lock.json'), 'utf8'));
    lockPackages = lock.packages || {};
  } catch {
    // Audit details remain useful even when a lockfile cannot be read.
  }

  const blockers = Object.entries(report.vulnerabilities || {})
    .filter(([, finding]) => finding?.severity === 'high' || finding?.severity === 'critical')
    .sort(([left], [right]) => left.localeCompare(right));

  for (const [name, finding] of blockers) {
    const sources = Array.isArray(finding.via)
      ? finding.via
          .map((source) =>
            typeof source === 'string'
              ? source
              : [source.source, source.title, source.url].filter(Boolean).join(' | ')
          )
          .join('; ')
      : String(finding.via || 'unknown');
    const fix = finding.fixAvailable
      ? typeof finding.fixAvailable === 'object'
        ? `${finding.fixAvailable.name || name}@${finding.fixAvailable.version || 'unknown'}${
            finding.fixAvailable.isSemVerMajor ? ' (semver-major)' : ''
          }`
        : String(finding.fixAvailable)
      : 'none';
    const parents = Object.entries(lockPackages)
      .filter(([, pkg]) =>
        [pkg?.dependencies, pkg?.devDependencies, pkg?.optionalDependencies].some(
          (dependencies) => dependencies && Object.hasOwn(dependencies, name)
        )
      )
      .map(([packagePath, pkg]) => {
        const requested =
          pkg.dependencies?.[name] || pkg.devDependencies?.[name] || pkg.optionalDependencies?.[name];
        return `${packagePath || '<root>'} -> ${name}@${requested}`;
      });

    console.error(
      `- ${name}: severity=${finding.severity} range=${finding.range || 'unknown'} fix=${fix} via=${sources}`
    );
    if (finding.nodes?.length) console.error(`  nodes=${finding.nodes.join(', ')}`);
    if (parents.length) console.error(`  parents=${parents.join('; ')}`);
  }

  console.error(`Blocking dependency findings remain in ${target}.`);
  process.exit(1);
}
