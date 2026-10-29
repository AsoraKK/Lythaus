import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';

const target = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '');
assert.equal(target.protocol, 'postgresql:');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.equal(target.pathname, '/postgres');
assert.equal(target.search, '');
assert.equal(target.hash, '');
const database = `lythaus_auth_test_feedback_${randomUUID().replaceAll('-', '')}`;
const control = new pg.Client({ connectionString: target.toString(), ssl: false, connectionTimeoutMillis: 5000 });
let created = false;

async function run(args, connectionString) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env,
      PLANETSCALE_PG17_TEST_DATABASE_URL: connectionString } });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0 || result.signal) throw new Error('feedback_fixture_failed');
}

try {
  await control.connect();
  assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  await control.query(`CREATE DATABASE ${database}`);
  created = true;
  const isolated = new URL(target);
  isolated.pathname = '/' + database;
  await run(['scripts/ci/validate-planetscale-postgres17.mjs'], isolated.toString());
  await run(['--experimental-strip-types', '--experimental-test-module-mocks', '--test', '--test-concurrency=1',
    '--test-timeout=120000', 'apps/lythaus-public-api/tests/contribution-feedback.postgres.mjs'], isolated.toString());
} finally {
  if (created) await control.query(`DROP DATABASE ${database} WITH (FORCE)`);
  await control.end();
}
