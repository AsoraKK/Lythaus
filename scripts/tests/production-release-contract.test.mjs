import test from 'node:test';
import { spawnSync } from 'node:child_process';

test('canonical production release contract remains complete', () => {
  const result = spawnSync(process.execPath, ['scripts/validate-production-release-contract.mjs'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`);
  }
});
