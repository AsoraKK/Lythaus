import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { publicationControlTarget } from './run-publication-pg17.mjs';

assert.deepEqual(process.argv.slice(2), ['--synthetic-proposal'], 'explicit isolated proposal evaluation is required');
const target = publicationControlTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '');
const control = new pg.Client({ connectionString: target.href, ssl: false, connectionTimeoutMillis: 5000 });
const name = 'lythaus_auth_test_rep_lock_' + randomUUID().replaceAll('-', '');
let owned = false, child, interrupted;
const stop = signal => { interrupted = signal; child?.kill(signal); };
const onInt = () => stop('SIGINT'), onTerm = () => stop('SIGTERM');
process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
async function run(args, connectionString) {
  if (interrupted) throw new Error('reputation_lock_proposal_interrupted');
  const status = await new Promise((resolve, reject) => {
    child = spawn(process.execPath, args, { stdio: 'inherit', env: {
      ...process.env, PLANETSCALE_PG17_TEST_DATABASE_URL: connectionString,
    } });
    child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  child = undefined;
  if (status.code !== 0 || status.signal || interrupted) throw new Error('reputation_lock_proposal_failed');
}
try {
  await control.connect();
  await control.query("SET statement_timeout='10s'");
  assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  const owner = (await control.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit FROM pg_catalog.pg_roles WHERE rolname='postgres'")).rows[0];
  assert.deepEqual(owner, { rolsuper: false, rolbypassrls: true, rolcreaterole: true, rolcreatedb: true, rolinherit: true }, 'managed-owner fixture required');
  await control.query(`CREATE DATABASE ${name} OWNER postgres`); owned = true;
  const local = new URL(target); local.pathname = '/' + name;
  process.env.PGOPTIONS = '-c role=postgres';
  await run(['scripts/ci/validate-planetscale-postgres17.mjs'], local.href);
  delete process.env.PGOPTIONS;
  await run(['scripts/ci/prepare-reputation-managed-lock-fixture.mjs'], local.href);
  await run(['--experimental-strip-types', '--test', '--test-concurrency=1', '--test-timeout=60000',
    'packages/db/tests/reputation-lock-proposal.postgres.mjs'], local.href);
  await run(['--experimental-strip-types', '--test', '--test-concurrency=1', '--test-timeout=180000',
    'apps/lythaus-jobs/tests/reputation-lifecycle.postgres.mjs'], local.href);
} catch {
  console.error('Reputation lock proposal failed; inspect the preceding baseline/test output.');
  process.exitCode = interrupted === 'SIGINT' ? 130 : interrupted === 'SIGTERM' ? 143 : 1;
} finally {
  try { if (owned) await control.query(`DROP DATABASE ${name} WITH (FORCE)`); }
  finally { await control.end(); process.off('SIGINT', onInt); process.off('SIGTERM', onTerm); }
}
