import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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

const moderationSuite = 'apps/lythaus-jobs/tests/post-moderation.workerd.mjs';
const safetySuite = 'apps/lythaus-jobs/tests/post-safety-evidence.workerd.mjs';
const suites = [
  ['moderation', moderationSuite],
  ['admission', 'apps/lythaus-public-api/tests/publication-admission.workerd.mjs'],
  ['safety', safetySuite],
  ['tx', 'packages/db/tests/transaction-client.postgres.mjs'],
];
const reviewSuites = [
  ['publishing', 'apps/lythaus-jobs/tests/post-publishing.workerd.mjs'],
  ['publishing', 'apps/lythaus-jobs/tests/post-publishing-review.workerd.mjs'],
  ['publishing', moderationSuite],
  ['publishing', safetySuite],
];

export function requireCompleteProposedTests(output) {
  const tests = output.match(/^# tests ([1-9][0-9]*)$/m)?.[1];
  assert.ok(tests, 'proposed acceptance must execute tests');
  assert.match(output, new RegExp(`^# pass ${tests}$`, 'm'), 'every proposed acceptance test must pass');
  assert.match(output, /^# fail 0$/m, 'proposed acceptance must pass');
  assert.match(output, /^# skipped 0$/m, 'baseline capability skips cannot substitute for proposed acceptance');
  assert.match(output, /^# cancelled 0$/m);
  assert.match(output, /^# todo 0$/m);
}

export async function runPublicationSuites(value, { postReview = false, proposed = false, suitePaths } = {}) {
  const target = publicationControlTarget(value);
  assert.ok(!proposed || postReview);
  assert.ok(suitePaths === undefined || postReview);
  const selected = postReview ? reviewSuites : suites;
  if (suitePaths !== undefined) {
    assert.ok(suitePaths.length > 0 && new Set(suitePaths).size === suitePaths.length);
    assert.ok(suitePaths.every(path => selected.some(([, suite]) => suite === path)), 'only registered acceptance suites can run');
  }
  const control = new pg.Client({ connectionString: target.toString(), ssl: false, connectionTimeoutMillis: 5000 });
  const owned = new Set();
  let child, interrupted;
  const stop = signal => { interrupted = signal; child?.kill(signal); };
  const onInt = () => stop('SIGINT'), onTerm = () => stop('SIGTERM');
  process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
  const run = async (args, connectionString, completeTests = false) => {
    if (interrupted) throw new Error('publication_test_interrupted');
    let output = '';
    const status = await new Promise((resolve, reject) => {
      child = spawn(process.execPath, args, { stdio: completeTests ? ['inherit', 'pipe', 'inherit'] : 'inherit', env: { ...process.env,
        LYTHAUS_TEST_POST_REVIEW_CAPABILITY: proposed ? 'proposed' : 'canonical',
        PLANETSCALE_PG17_TEST_DATABASE_URL: connectionString } });
      if (completeTests) child.stdout.on('data', data => { output += data; process.stdout.write(data); });
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    child = undefined;
    if (status.code !== 0 || status.signal || interrupted) throw new Error('publication_test_failed_or_interrupted');
    if (completeTests) requireCompleteProposedTests(output);
  };
  try {
    await control.connect();
    await control.query("SET statement_timeout='10s'");
    assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    for (const [label, suite] of selected) {
      if (suitePaths !== undefined && !suitePaths.includes(suite)) continue;
      if (interrupted) throw new Error('publication_test_interrupted');
      const suffix = postReview ? randomBytes(8).toString('hex') : randomUUID().replaceAll('-', '');
      const name = `lythaus_auth_test_post_${label}_${suffix}`;
      await control.query(`CREATE DATABASE ${name}`);
      owned.add(name);
      const local = new URL(target); local.pathname = '/' + name;
      process.stdout.write(`Publication ${label}: fresh owned PG17 database\n`);
      await run(['scripts/ci/validate-planetscale-postgres17.mjs'], local.toString());
      await run(['--experimental-strip-types', '--test', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=120000', suite], local.toString(), proposed);
      await control.query(`DROP DATABASE ${name} WITH (FORCE)`);
      owned.delete(name);
    }
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
  assert.ok(args.length === 0 || args.length === 1 && args[0] === '--proposed');
  await runPublicationSuites(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '', {
    postReview: args.length === 1, proposed: args.length === 1,
  }).catch(() => {
    console.error('Publication PG17 suites failed; inspect the preceding baseline/test output.');
    process.exitCode ||= 1;
  });
}
