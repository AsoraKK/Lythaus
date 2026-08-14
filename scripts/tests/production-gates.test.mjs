import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const releaseSha = 'a'.repeat(40);

function runFinal(overrides = {}) {
  return spawnSync(process.execPath, ['scripts/validate-production-gates.mjs', '--phase', 'final'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      RELEASE_SHA: releaseSha,
      HYPERDRIVE_VERIFIED_MAIN: 'true',
      DATABASE_IDENTITY_VERIFIED: 'true',
      BUDGET_ENFORCEMENT_VERIFIED: 'true',
      AUTHENTICATED_ACCEPTANCE_PROVEN: 'true',
      ...overrides,
    },
  });
}

test('final production gates use exact-run evidence for runtime-required gates', () => {
  const result = runFinal();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Validated production gate manifest for final/);
});

test('final production gates fail closed when exact-run evidence is absent', () => {
  const result = runFinal({ DATABASE_IDENTITY_VERIFIED: 'false' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DATABASE_IDENTITY_VERIFIED=true is required from this exact deployment run/);
});
