import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { publicationControlTarget, publicationFailureAnnotation } from '../ci/run-publication-pg17.mjs';

test('publication failure annotations identify only fixed runner stages without caller data', () => {
  for (const stage of ['control', 'moderation.create', 'moderation.baseline', 'rereview.suite', 'admission.suite', 'safety.suite', 'tx.drop', 'attach.suite']) {
    assert.equal(publicationFailureAnnotation(stage), `::error title=Publication fixture failure::${stage} failed; inspect this stage's child output.`);
  }
  for (const stage of ['unknown', 'admission.suite\n::error::injected', 'postgresql://user:secret@remote.invalid/private', 'rereview.suite?token=secret']) {
    assert.throws(() => publicationFailureAnnotation(stage));
  }
});

test('actual failed control connection remains a failure and emits only the stage in Actions mode', () => {
  for (const actions of ['false', 'true']) {
    const result = spawnSync(process.execPath, ['scripts/ci/run-publication-pg17.mjs'], {
      env: { ...process.env, GITHUB_ACTIONS: actions,
        PLANETSCALE_PG17_TEST_DATABASE_URL: 'postgresql://127.0.0.1:1/lythaus_auth_test_post_control' },
      encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1);
    assert.match(result.stderr, /Publication PG17 suites failed/);
    assert.doesNotMatch(result.stderr, /postgresql:|127\.0\.0\.1|ECONNREFUSED/);
    if (actions === 'true') assert.ok(result.stderr.includes(publicationFailureAnnotation('control')));
    else assert.doesNotMatch(result.stderr, /::error/);
  }
});

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
  for (const suite of ['post-moderation.workerd.mjs', 'moderation-rereview.postgres.mjs', 'publication-admission.workerd.mjs', 'post-safety-evidence.workerd.mjs',
    'transaction-client.postgres.mjs', 'post-attachment-preparation.postgres.mjs']) {
    assert.equal(runner.split(suite).length - 1, 1);
  }
  assert.match(runner, /CREATE DATABASE/);
  assert.match(runner, /validate-planetscale-postgres17\.mjs/);
  assert.match(runner, /DROP DATABASE/);
});
