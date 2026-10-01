import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const coordinatorCoverageArgs = Object.freeze([
  '--experimental-strip-types', '--experimental-test-module-mocks',
  '--experimental-test-coverage',
  '--test-coverage-include=**/lythaus-auth-acceptance-coordinator/src/index.ts',
  '--test-coverage-lines=80', '--test-coverage-branches=80',
  '--test', '--test-name-pattern=real coordinator', '--test-timeout=180000',
  'apps/lythaus-public-api/tests/auth-journey.postgres.mjs',
]);

// Only fixed locations, counters and numbers leave the TAP stream as annotations.
// Assertion messages, expected/actual strings, tokens and database messages do not.
export function coordinatorCoverageDiagnostic(tap) {
  const counters = Object.fromEntries([...tap.matchAll(/^# (tests|pass|fail|cancelled|skipped) (\d+)$/gm)]
    .map(([, key, count]) => [key, Number(count)]));
  const coverage = tap.match(/^# all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/m);
  const locations = [...new Set([...tap.matchAll(/auth-journey\.postgres\.mjs:(\d+):(\d+)/g)]
    .map(([, line, column]) => `auth-journey.postgres.mjs:${line}:${column}`))].slice(0, 8);
  const numericAssertions = [...tap.matchAll(/^\s+(expected|actual): (\d+|true|false|null)\s*$/gm)]
    .slice(0, 8).map(([, kind, value]) => ({ kind, value }));
  return {
    counters, locations, numericAssertions,
    ...(coverage ? { coverage: { lines: Number(coverage[1]), branches: Number(coverage[2]), functions: Number(coverage[3]) } } : {}),
  };
}

export function runCoordinatorCoverage() {
  const child = spawn(process.execPath, coordinatorCoverageArgs, { stdio: ['inherit', 'pipe', 'pipe'] });
  let output = '';
  const capture = (destination, chunk) => {
    destination.write(chunk);
    output = (output + chunk.toString()).slice(-128 * 1024);
  };
  child.stdout.on('data', chunk => capture(process.stdout, chunk));
  child.stderr.on('data', chunk => capture(process.stderr, chunk));
  child.on('error', () => {
    console.error('::error title=Coordinator PostgreSQL coverage::SPAWN_FAILED');
    process.exitCode = 1;
  });
  child.on('close', code => {
    process.exitCode = code ?? 1;
    if (process.exitCode !== 0) {
      const diagnostic = JSON.stringify({ node: process.version, exitCode: process.exitCode, ...coordinatorCoverageDiagnostic(output) })
        .replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
      console.error(`::error title=Coordinator PostgreSQL coverage::${diagnostic}`);
    }
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => child.kill(signal));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCoordinatorCoverage();
