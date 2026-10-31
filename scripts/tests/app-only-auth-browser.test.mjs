import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runAppOnlyAuthBrowser } from '../ci/app-only-auth-browser.mjs';

test('missing inputs do not launch a browser', async () => {
  let launches = 0;
  const chromium = { launch: async () => { launches++; } };
  await assert.rejects(() => runAppOnlyAuthBrowser({ chromium, artifactDir: 'relative', email: 'synthetic@example.invalid', password: 'fixture' }), /inputs are missing/);
  await assert.rejects(() => runAppOnlyAuthBrowser({ chromium, artifactDir: '/tmp', email: '', password: 'fixture' }), /inputs are missing/);
  assert.equal(launches, 0);
});

test('browser failures do not expose entered values or provider diagnostics', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'app-only-auth-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'index.html'), '<title>Fixture</title>');
  const chromium = { launch: async () => { throw new Error('fixture-sensitive-detail'); } };
  await assert.rejects(() => runAppOnlyAuthBrowser({ chromium, artifactDir: directory,
    email: 'synthetic@example.invalid', password: 'fixture-password' }), error => {
    assert.match(error.message, /failed during setup/);
    assert.doesNotMatch(error.message, /fixture-sensitive-detail|fixture-password|synthetic@example/);
    return true;
  });
});

test('a symlinked artifact root is rejected before browser launch', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'app-only-auth-link-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const link = path.join(directory, 'artifact-link');
  await symlink(directory, link);
  let launches = 0;
  await assert.rejects(() => runAppOnlyAuthBrowser({ chromium: { launch: async () => { launches++; } }, artifactDir: link,
    email: 'synthetic@example.invalid', password: 'fixture-password' }), /failed during setup/);
  assert.equal(launches, 0);
});
