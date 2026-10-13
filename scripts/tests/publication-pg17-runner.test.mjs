import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { publicationControlTarget } from '../ci/run-publication-pg17.mjs';

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
  for (const suite of ['post-moderation.workerd.mjs', 'publication-admission.workerd.mjs', 'post-safety-evidence.workerd.mjs',
    'transaction-client.postgres.mjs', 'post-attachment-preparation.postgres.mjs']) {
    assert.equal(runner.split(suite).length - 1, 1);
  }
  assert.match(runner, /CREATE DATABASE/);
  assert.match(runner, /validate-planetscale-postgres17\.mjs/);
  assert.match(runner, /DROP DATABASE/);
});
