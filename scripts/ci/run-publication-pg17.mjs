import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export function publicationControlTarget(value) {
  const target = new URL(value);
  assert.equal(target.protocol, 'postgresql:');
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'publication tests require loopback PostgreSQL');
  assert.equal(target.pathname, '/lythaus_auth_test_post_control', 'publication tests require their disposable control database');
  assert.equal(target.search, '', 'connection options cannot override the loopback target');
  assert.equal(target.hash, '');
  return target;
}

const suites = [
  ['moderation', 'apps/lythaus-jobs/tests/post-moderation.workerd.mjs'],
  ['rereview', 'apps/lythaus-admin-api/tests/moderation-rereview.postgres.mjs', 240000],
  ['admission', 'apps/lythaus-public-api/tests/publication-admission.workerd.mjs', 240000],
  ['safety', 'apps/lythaus-jobs/tests/post-safety-evidence.workerd.mjs'],
  ['tx', 'packages/db/tests/transaction-client.postgres.mjs'],
  ['attach', 'packages/db/tests/post-attachment-preparation.postgres.mjs'],
];

const membershipRewardSuites = [
  ['rewards', 'apps/lythaus-public-api/tests/rewards-acceptance.postgres.mjs'],
  ['membership', 'apps/lythaus-public-api/tests/membership-entitlements.postgres.mjs'],
  ['membership_admin', 'apps/lythaus-admin-api/tests/membership-entitlements.postgres.mjs'],
];

const commentSuites = [
  ['comment_propagation', 'apps/lythaus-public-api/tests/comment-propagation.postgres.mjs', 240000],
  ['comment_workerd', 'apps/lythaus-public-api/tests/comment-propagation.workerd.mjs', 240000],
  ['feed_post_read_native', 'apps/lythaus-public-api/tests/feed-post-read-native.postgres.mjs', 240000],
];

export function publicationFailureAnnotation(stage) {
  assert.match(stage, /^(control|(?:moderation|rereview|admission|safety|tx|attach|rewards|membership|membership_admin|comment_propagation|comment_workerd|feed_post_read_native)\.(?:create|baseline|suite|drop))$/);
  return `::error title=Publication fixture failure::${stage} failed; inspect this stage's child output.`;
}

export async function runPublicationSuites(value, group = 'publication') {
  assert.ok(['publication', 'membership-rewards', 'comments'].includes(group), 'unsupported isolated suite group');
  const selectedSuites = group === 'membership-rewards' ? membershipRewardSuites : group === 'comments' ? commentSuites : suites;
  const target = publicationControlTarget(value);
  const control = new pg.Client({ connectionString: target.toString(), ssl: false, connectionTimeoutMillis: 5000 });
  const owned = new Set();
  let child, interrupted, stage = 'control';
  const stop = signal => { interrupted = signal; child?.kill(signal); };
  const onInt = () => stop('SIGINT'), onTerm = () => stop('SIGTERM');
  process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
  const run = async (args, connectionString) => {
    if (interrupted) throw new Error('publication_test_interrupted');
    const status = await new Promise((resolve, reject) => {
      child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env,
        PLANETSCALE_PG17_TEST_DATABASE_URL: connectionString } });
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    child = undefined;
    if (status.code !== 0 || status.signal || interrupted) throw new Error('publication_test_failed_or_interrupted');
  };
  try {
    await control.connect();
    await control.query("SET statement_timeout='10s'");
    assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    for (const [label, suite, testTimeout = 120000] of selectedSuites) {
      if (interrupted) throw new Error('publication_test_interrupted');
      const name = `lythaus_auth_test_post_${label}_${randomUUID().replaceAll('-', '')}`;
      stage = `${label}.create`;
      await control.query(`CREATE DATABASE ${name}`);
      owned.add(name);
      const local = new URL(target); local.pathname = '/' + name;
      process.stdout.write(`Publication ${label}: fresh owned PG17 database\n`);
      stage = `${label}.baseline`;
      await run(['scripts/ci/validate-planetscale-postgres17.mjs'], local.toString());
      stage = `${label}.suite`;
      await run(['--experimental-strip-types', '--experimental-test-module-mocks', '--test', '--test-concurrency=1', `--test-timeout=${testTimeout}`, suite], local.toString());
      stage = `${label}.drop`;
      await control.query(`DROP DATABASE ${name} WITH (FORCE)`);
      owned.delete(name);
    }
  } catch (error) {
    if (!interrupted && process.env.GITHUB_ACTIONS === 'true') console.error(publicationFailureAnnotation(stage));
    throw error;
  } finally {
    try {
      for (const name of owned) await control.query(`DROP DATABASE ${name} WITH (FORCE)`);
    } finally {
      await control.end();
      process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
      if (interrupted) process.exitCode = interrupted === 'SIGINT' ? 130 : 143;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const group = args.length === 0 ? 'publication'
    : args.length === 1 && args[0] === '--membership-rewards' ? 'membership-rewards'
      : args.length === 1 && args[0] === '--comments' ? 'comments' : 'unsupported';
  await runPublicationSuites(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '', group).catch(() => {
    console.error('Publication PG17 suites failed; inspect the preceding baseline/test output.');
    process.exitCode ||= 1;
  });
}
