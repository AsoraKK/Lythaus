import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
assert.ok(connectionString, 'An explicitly local disposable PostgreSQL 17 URL is required');
const target = new URL(connectionString);
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const admin = new pg.Client({ connectionString, ssl: false });
await admin.connect();
async function run(args, url) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit',
      env: { ...process.env, PLANETSCALE_PG17_TEST_DATABASE_URL: url } });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Validation exited ' + code)));
  });
}
try {
  const version = Number((await admin.query("SELECT current_setting('server_version_num') AS version")).rows[0].version);
  assert.ok(version >= 170000 && version < 180000);
  const suites = process.argv.slice(2);
  assert.ok(suites.length);
  for (const suite of suites) {
    assert.match(suite, /^apps\/lythaus-jobs\/tests\/post-[a-z-]+\.workerd\.mjs$/);
    const name = 'lythaus_auth_test_post_publishing_' + randomBytes(8).toString('hex');
    const local = new URL(target); local.pathname = '/' + name;
    await admin.query('CREATE DATABASE ' + name);
    try {
      await run(['scripts/ci/validate-planetscale-postgres17.mjs'], local.href);
      await run(['--experimental-strip-types', '--test', '--test-concurrency=1', '--test-timeout=60000', suite], local.href);
    } finally { await admin.query('DROP DATABASE ' + name + ' WITH (FORCE)'); }
  }
} finally { await admin.end(); }
