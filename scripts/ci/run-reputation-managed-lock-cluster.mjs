import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Manual synthetic test runner. Not imported by any workflow or installer.
assert.deepEqual(process.argv.slice(2), ['--synthetic-managed-cluster', '--execute-local-sql'],
  'explicit owned-cluster SQL test opt-in is required');
const root = fileURLToPath(new URL('../../', import.meta.url));
const name = 'lythaus-managed-lock-fixture-' + randomUUID();
const bootstrap = 'lythaus_managed_fixture_control';
let created = false, control, child, interrupted;
const stop = signal => { interrupted = signal; child?.kill(signal); };
const onInt = () => stop('SIGINT'), onTerm = () => stop('SIGTERM');
process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
async function run(args, target) {
  if (interrupted) throw new Error('synthetic_fixture_interrupted');
  const status = await new Promise((resolve, reject) => {
    child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: {
      PATH: dirname(process.execPath) + ':' + (process.env.PATH ?? ''),
      HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      PLANETSCALE_PG17_TEST_DATABASE_URL: target.href,
    } });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  child = undefined;
  assert.ok(status.code === 0 && !status.signal && !interrupted, 'synthetic fixture child failed');
}
try {
  // No credentials read/generated, no shared container inspected, no image pull.
  // Trust authentication exists only in this disposable loopback-bound cluster.
  execFileSync('docker', ['run', '--detach', '--pull=never', '--name', name,
    '--label', 'com.lythaus.fixture=reputation-managed-owner-v2',
    '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust',
    '--env', 'POSTGRES_USER=' + bootstrap, '--env', 'POSTGRES_DB=lythaus_auth_test_post_control',
    'postgres:17'], { stdio: 'ignore' });
  created = true;
  const info = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }))[0];
  assert.equal(info.Config.Labels['com.lythaus.fixture'], 'reputation-managed-owner-v2');
  const bindings = info.NetworkSettings.Ports['5432/tcp'];
  assert.equal(bindings.length, 1); assert.equal(bindings[0].HostIp, '127.0.0.1');
  const target = new URL('postgresql://127.0.0.1:' + bindings[0].HostPort + '/lythaus_auth_test_post_control');
  target.username = bootstrap;
  for (let attempt = 0; attempt < 40 && !interrupted; attempt++) {
    const probe = new pg.Client({ connectionString: target.href, ssl: false, connectionTimeoutMillis: 500 });
    try { await probe.connect(); control = probe; break; }
    catch { await probe.end(); await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.ok(control && !interrupted, 'owned fixture did not start');
  assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  await control.query(`CREATE ROLE pscale_superuser NOLOGIN NOSUPERUSER;
    CREATE ROLE postgres NOLOGIN NOSUPERUSER BYPASSRLS CREATEROLE CREATEDB INHERIT;
    GRANT pscale_superuser TO postgres;
    CREATE ROLE pscale_api_9jfbtij9y4b2 NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS`);
  for (const role of ['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy', 'lythaus_migrations']) {
    await control.query('CREATE ROLE ' + role + ' NOLOGIN NOSUPERUSER');
  }
  await run(['scripts/ci/run-reputation-lock-proposal-pg17.mjs', '--synthetic-proposal'], target);
  await run(['--experimental-strip-types', '--test', '--test-concurrency=1',
    'scripts/tests/reputation-lock-proposal-runner.test.mjs',
    'packages/db/tests/reputation-lock-candidate.test.mjs',
    'packages/db/tests/reputation-persistence.test.mjs'], target);
} catch {
  console.error('Owned synthetic reputation fixture failed; no production target is supported.');
  process.exitCode = interrupted === 'SIGINT' ? 130 : interrupted === 'SIGTERM' ? 143 : 1;
} finally {
  try { await control?.end(); }
  finally {
    if (created) execFileSync('docker', ['rm', '--force', name], { stdio: 'ignore' });
    process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
  }
}
