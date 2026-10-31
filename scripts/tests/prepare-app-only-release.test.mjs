import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

for (const script of ['scripts/ci/prepare-app-only-release.mjs', 'scripts/ci/app-only-browser-acceptance.mjs',
  'scripts/ci/recheck-app-only-release.mjs', 'scripts/ci/finalize-app-only-release.mjs']) {
  test(`${script} refuses local or unprotected contexts before provider or account operations`, () => {
    const result = spawnSync(process.execPath, [script], {
      env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires the exact main-dispatch Actions account context/);
    assert.equal(result.stdout, '');
  });
}
