import assert from 'node:assert/strict';
import test from 'node:test';
import { requireLocalContentFixtureTarget } from '../ci/acceptance-content-target.mjs';

test('content fixture target rejects direct production API URLs', () => {
  for (const target of ['http://127.0.0.1:8787/api', 'http://localhost/api', 'http://[::1]:8787/api']) {
    assert.doesNotThrow(() => requireLocalContentFixtureTarget(target));
  }
  for (const target of ['https://api.lythaus.co/api', 'https://lythaus-public-api-development.workers.dev/api',
    'https://localhost.example/api', 'https://localhost@api.lythaus.co/api', 'file:///api']) {
    assert.throws(() => requireLocalContentFixtureTarget(target), /disposable_local_target/);
  }
});
