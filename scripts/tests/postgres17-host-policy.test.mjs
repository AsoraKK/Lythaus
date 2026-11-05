import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedLocalPostgres17Host } from '../ci/postgres17-host-policy.mjs';

test('loopback PostgreSQL hosts remain available for local and disposable database tests', () => {
  for (const host of ['localhost', '127.0.0.1', '::1']) assert.equal(isAllowedLocalPostgres17Host(host, {}), true);
});

test('the activity pilot may use only its declared Actions postgres service alias', () => {
  assert.equal(isAllowedLocalPostgres17Host('postgres', { GITHUB_ACTIONS: 'true', GITHUB_JOB: 'activity_pilot' }), true);
});

test('the postgres alias is rejected outside the exact Actions job', () => {
  assert.equal(isAllowedLocalPostgres17Host('postgres', {}), false);
  assert.equal(isAllowedLocalPostgres17Host('postgres', { GITHUB_ACTIONS: 'false', GITHUB_JOB: 'activity_pilot' }), false);
  assert.equal(isAllowedLocalPostgres17Host('postgres', { GITHUB_ACTIONS: 'true', GITHUB_JOB: 'native_runtime' }), false);
});

test('all other network database hosts remain rejected', () => {
  for (const host of ['db.example.invalid', '127.0.0.2', 'localhost.evil']) assert.equal(isAllowedLocalPostgres17Host(host), false);
});
