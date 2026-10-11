import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { publicationControlTarget, requireCompleteProposedTests, runPublicationSuites } from '../ci/run-publication-pg17.mjs';

test('publication runner accepts only its disposable loopback control database without override options', () => {
  for (const host of ['127.0.0.1', 'localhost']) {
    assert.equal(publicationControlTarget(`postgresql://postgres@${host}:5432/lythaus_auth_test_post_control`).hostname, host);
  }
  for (const target of ['postgresql://postgres@remote.invalid/lythaus_auth_test_post_control',
    'postgresql://postgres@127.0.0.1/postgres', 'postgresql://postgres@127.0.0.1/lythaus_auth_test_post_existing',
    'postgresql://postgres@127.0.0.1/lythaus_auth_test_post_control?host=remote.invalid',
    'postgresql://postgres@127.0.0.1/lythaus_auth_test_post_control#override',
    'https://localhost/lythaus_auth_test_post_control', '']) assert.throws(() => publicationControlTarget(target));
});

test('required native CI runs each publication and direct-client suite once through fresh canonical baselines', () => {
  const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const runner = readFileSync(new URL('../ci/run-publication-pg17.mjs', import.meta.url), 'utf8');
  const native = ci.slice(ci.indexOf('  native_runtime:'), ci.indexOf('  activity_pilot:'));
  assert.match(native, /image: postgres:17/);
  assert.match(native, /POSTGRES_DB: lythaus_auth_test_post_control/);
  assert.match(native, /npm run test:publication:pg17/);
  assert.match(native, /npm run test:publication:pg17 -- --proposed/);
  assert.match(native, /--test apps\/lythaus-jobs\/tests\/post-publishing\.test\.mjs/);
  assert.doesNotMatch(native, /continue-on-error:/);
  for (const suite of ['post-moderation.workerd.mjs', 'publication-admission.workerd.mjs', 'post-safety-evidence.workerd.mjs', 'transaction-client.postgres.mjs']) {
    assert.equal(runner.split(suite).length - 1, 1);
  }
  assert.match(runner, /CREATE DATABASE/);
  assert.match(runner, /validate-planetscale-postgres17\.mjs/);
  assert.match(runner, /DROP DATABASE/);
  for (const suite of ['post-publishing.workerd.mjs', 'post-publishing-review.workerd.mjs']) assert.equal(runner.split(suite).length - 1, 1);
});

test('proposed acceptance refuses skipped, failed, incomplete and empty execution summaries', () => {
  const complete = '# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  requireCompleteProposedTests(complete);
  for (const output of ['', complete.replace('# tests 2', '# tests 0'), complete.replace('# pass 2', '# pass 1'),
    complete.replace('# skipped 0', '# skipped 1'), complete.replace('# fail 0', '# fail 1'),
    complete.replace('# cancelled 0', '# cancelled 1'), complete.replace('# todo 0', '# todo 1')]) {
    assert.throws(() => requireCompleteProposedTests(output));
  }
});

test('focused runner rejects unsafe targets and unregistered suites before connecting', async () => {
  for (const target of ['https://localhost/lythaus_auth_test_post_control',
    'postgresql://postgres@127.0.0.1:1/postgres',
    'postgresql://postgres@127.0.0.1:1/lythaus_auth_test_post_control?host=remote.invalid',
    'postgresql://postgres@127.0.0.1:1/lythaus_auth_test_post_control#override']) {
    const result = spawnSync(process.execPath, ['apps/lythaus-jobs/tests/run-post-publishing-pg17.mjs'], {
      env: { ...process.env, PLANETSCALE_PG17_TEST_DATABASE_URL: target }, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AssertionError/);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED|connect ECONN/);
  }
  await assert.rejects(runPublicationSuites('postgresql://postgres@127.0.0.1:1/lythaus_auth_test_post_control', {
    postReview: true, proposed: true, suitePaths: ['scripts/unregistered.mjs'],
  }), /only registered acceptance suites/);
});
