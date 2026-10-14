import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('managed fixture requires explicit SQL opt-in before any Docker operation', () => {
  const result = spawnSync(process.execPath, [new URL('../ci/run-reputation-managed-lock-cluster.mjs', import.meta.url).pathname,
    '--synthetic-managed-cluster'], { encoding: 'utf8', timeout: 3000 });
  assert.equal(result.error, undefined); assert.notEqual(result.status, 0);
  assert.match(result.stderr, /explicit owned-cluster SQL test opt-in/);
  assert.equal(result.stdout, '');
});

const runner = new URL('../ci/run-reputation-lock-proposal-pg17.mjs', import.meta.url).pathname;
const cases = [
  ['missing explicit proposal mode', [], 'postgresql://127.0.0.1/lythaus_auth_test_post_control', /explicit isolated proposal evaluation/],
  ['unrecognized arguments', ['--synthetic-proposal', '--apply'], 'postgresql://127.0.0.1/lythaus_auth_test_post_control', /explicit isolated proposal evaluation/],
  ['non-loopback host', ['--synthetic-proposal'], 'postgresql://example.invalid/lythaus_auth_test_post_control', /require loopback PostgreSQL/],
  ['shared default database', ['--synthetic-proposal'], 'postgresql://127.0.0.1/postgres', /require their disposable control database/],
  ['connection options', ['--synthetic-proposal'], 'postgresql://127.0.0.1/lythaus_auth_test_post_control?options=-crole%3Dother', /cannot override the loopback target/],
  ['non-Postgres protocol', ['--synthetic-proposal'], 'https://127.0.0.1/lythaus_auth_test_post_control', /postgresql:/],
];
for (const [name, args, target, message] of cases) {
  test('proposal runner refuses ' + name + ' before any database connection', () => {
    const result = spawnSync(process.execPath, [runner, ...args], {
      env: { ...process.env, PLANETSCALE_PG17_TEST_DATABASE_URL: target }, encoding: 'utf8', timeout: 3000,
    });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.notEqual(result.status, 0);
    assert.match(result.stderr, message); assert.equal(result.stdout, '');
  });
}
