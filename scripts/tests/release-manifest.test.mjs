import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const releaseSha = '0123456789abcdef0123456789abcdef01234567';

test('release manifest records partial provider evidence without inventing live state', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-release-manifest-'));
  const output = path.join(directory, 'release-manifest.json');
  execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], {
    cwd: root,
    env: { ...process.env, RELEASE_SHA: releaseSha },
    stdio: 'pipe',
  });
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(manifest.schemaVersion, 'lythaus-release-manifest-v2');
  assert.equal(manifest.status, 'blocked');
  assert.equal(manifest.repository.releaseSha, releaseSha);
  assert.equal(manifest.cloudflare.inventoryStatus, 'UNKNOWN/BLOCKED');
  assert.equal(manifest.planetscale.inventoryStatus, 'UNKNOWN/BLOCKED');
  assert.equal(manifest.planetscale.latestMigration, '0013_marketing_waitlist.sql');
  assert.match(manifest.planetscale.migrationSetSha256, /^[a-f0-9]{64}$/);
});
