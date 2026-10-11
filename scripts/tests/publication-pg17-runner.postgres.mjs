import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { publicationControlTarget } from '../ci/run-publication-pg17.mjs';

const target = publicationControlTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '');
for (const [entry, args, proposed] of [
  ['canonical', ['scripts/ci/run-publication-pg17.mjs'], false],
  ['proposed', ['scripts/ci/run-publication-pg17.mjs', '--proposed'], true],
  ['focused', ['apps/lythaus-jobs/tests/run-post-publishing-pg17.mjs'], true],
]) {
for (const [signal, status] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  test(`${entry}: ${signal} interrupts a real baseline child, cleans owned databases and retains another owner's sentinel`, { timeout: 30000 }, async () => {
    const control = new pg.Client({ connectionString: target.toString(), ssl: false, connectionTimeoutMillis: 5000 });
    const sentinel = 'lythaus_auth_test_post_sentinel_' + randomUUID().replaceAll('-', '');
    const databases = async () => (await control.query("SELECT datname FROM pg_database WHERE datname LIKE 'lythaus_auth_test_post_%' ORDER BY datname")).rows;
    let child, created = false;
    try {
      await control.connect();
      assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
      await control.query(`CREATE DATABASE ${sentinel}`); created = true;
      const before = await databases();
      let sent = false, output = '';
      const exit = await new Promise((resolve, reject) => {
        child = spawn(process.execPath, args, {
          env: { ...process.env, LYTHAUS_TEST_POST_REVIEW_CAPABILITY: proposed ? 'proposed' : 'canonical',
            PLANETSCALE_PG17_TEST_DATABASE_URL: target.toString() }, stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.stdout.on('data', data => {
          output += data;
          if (!sent && output.includes('Applying 0002_core_tables.sql')) { sent = true; child.kill(signal); }
        });
        child.stderr.on('data', data => { output += data; });
        child.once('error', reject);
        child.once('exit', (code, exitSignal) => resolve({ code, signal: exitSignal }));
      });
      assert.equal(sent, true, output);
      assert.deepEqual(exit, { code: status, signal: null }, output);
      assert.deepEqual(await databases(), before, 'only runner-owned databases were removed');
    } finally {
      if (child?.exitCode === null) child.kill('SIGKILL');
      if (created) await control.query(`DROP DATABASE ${sentinel} WITH (FORCE)`);
      await control.end();
    }
  });
}
}
