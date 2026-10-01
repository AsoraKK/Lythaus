import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { coordinatorCoverageArgs, coordinatorCoverageDiagnostic } from '../ci/run-coordinator-coverage.mjs';

test('coverage annotation exposes numeric results and fixed source locations without assertion contents', () => {
  const tap = `not ok 1 - email owner@example.invalid token=private-token
  error: 'provider error containing private-token and owner@example.invalid'
  expected: 'private-token'
  actual: 'owner@example.invalid'
  expected: 200
  actual: 502
  stack: TestContext.<anonymous> (/sensitive/path/auth-journey.postgres.mjs:454:5)
# tests 1
# pass 0
# fail 1
# all files | 99.52 | 79.00 | 97.26 |
::error title=untrusted::private-token`;
  const result = coordinatorCoverageDiagnostic(tap);
  assert.deepEqual(result, {
    counters: { tests: 1, pass: 0, fail: 1 },
    locations: ['auth-journey.postgres.mjs:454:5'],
    numericAssertions: [{ kind: 'expected', value: '200' }, { kind: 'actual', value: '502' }],
    coverage: { lines: 99.52, branches: 79, functions: 97.26 },
  });
  for (const forbidden of ['private-token', 'owner@', '/sensitive', 'untrusted', 'provider error']) {
    assert.ok(!JSON.stringify(result).includes(forbidden));
  }
});

test('coverage annotation handles missing TAP output without inventing results', () => {
  assert.deepEqual(coordinatorCoverageDiagnostic('unavailable'), { counters: {}, locations: [], numericAssertions: [] });
});

test('coverage annotation bounds repeated stack and assertion diagnostics', () => {
  const tap = Array.from({ length: 50 }, (_, index) => `auth-journey.postgres.mjs:${index + 1}:5\n  actual: ${index}`).join('\n');
  const result = coordinatorCoverageDiagnostic(tap);
  assert.equal(result.locations.length, 8);
  assert.equal(result.numericAssertions.length, 8);
});

test('runner keeps executable coordinator scope, timeout and both coverage thresholds', () => {
  assert.ok(coordinatorCoverageArgs.includes('--test-coverage-lines=80'));
  assert.ok(coordinatorCoverageArgs.includes('--test-coverage-branches=80'));
  assert.ok(coordinatorCoverageArgs.includes('--test-name-pattern=real coordinator'));
  assert.ok(coordinatorCoverageArgs.includes('--test-timeout=180000'));
  assert.equal(coordinatorCoverageArgs.at(-1), 'apps/lythaus-public-api/tests/auth-journey.postgres.mjs');
});

test('runner preserves a real failing child exit without permitting a database connection', () => {
  const environment = { ...process.env };
  delete environment.PLANETSCALE_PG17_TEST_DATABASE_URL;
  // Start an independent runner rather than inheriting node:test's child protocol.
  delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['scripts/ci/run-coordinator-coverage.mjs'], {
    env: environment, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  const annotation = result.stderr.split('\n').find(line => line.startsWith('::error title=Coordinator PostgreSQL coverage::'));
  assert.ok(annotation);
  const diagnostic = JSON.parse(annotation.split('::').at(-1));
  assert.equal(diagnostic.exitCode, 1);
  assert.equal(diagnostic.node, process.version);
  assert.ok(diagnostic.locations.includes('auth-journey.postgres.mjs:14:9'));
});
