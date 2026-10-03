import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import spectralGlob from '../../tools/openapi/spectral-glob/index.cjs';

test('Spectral discovers exact, multiple, brace, hidden and excluded file patterns without micromatch', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lythaus-spectral-glob-'));
  try {
    await mkdir(path.join(directory, 'nested'));
    for (const file of ['first.yaml', 'second.json', '.hidden.yaml', 'nested/third.yaml']) await writeFile(path.join(directory, file), '{}');
    const options = { cwd: directory, absolute: true, dot: true };
    assert.deepEqual(await spectralGlob('first.yaml', options), [path.join(directory, 'first.yaml')]);
    assert.deepEqual((await spectralGlob(['*.{yaml,json}', 'nested/**/*.yaml', '!second.json'], options)).sort(),
      ['.hidden.yaml', 'first.yaml', 'nested/third.yaml'].map(file => path.join(directory, file)).sort());
    assert.deepEqual(await spectralGlob('missing*.yaml', options), []);
    assert.deepEqual((await spectralGlob('!(second).{yaml,json}', options)).sort(),
      ['.hidden.yaml', 'first.yaml'].map(file => path.join(directory, file)).sort());
    assert.deepEqual(await spectralGlob([], options), []);
    await assert.rejects(spectralGlob([42], options), TypeError);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Spectral CLI still enforces rules and unmatched patterns through its overridden discovery module', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lythaus-spectral-cli-'));
  try {
    const rules = path.join(directory, 'rules.yaml');
    await writeFile(rules, 'rules:\n  title-required:\n    severity: error\n    given: $.info\n    then:\n      field: title\n      function: truthy\n');
    await writeFile(path.join(directory, 'valid.yaml'), 'info:\n  title: Synthetic validation\n');
    await writeFile(path.join(directory, 'invalid.yaml'), 'info:\n  description: Missing title\n');
    const cli = path.resolve('node_modules/@stoplight/spectral-cli/dist/index.js');
    const output = path.join(directory, 'results.json');
    const run = pattern => spawnSync(process.execPath, [cli, 'lint', pattern, '--ruleset', rules, '--fail-severity', 'error',
      '--fail-on-unmatched-globs', '--format', 'json', '--output', output],
      { cwd: directory, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
    const valid = run('valid.yaml'); assert.equal(valid.status, 0, valid.stdout + valid.stderr);
    const invalid = run('invalid.yaml'); assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
    assert.equal(JSON.parse(await readFile(output, 'utf8'))[0].code, 'title-required');
    assert.equal(run('missing-*.yaml').status, 2);
    const multiple = run('{valid,invalid}.yaml'); assert.equal(multiple.status, 1, multiple.stdout + multiple.stderr);
    assert.equal(JSON.parse(await readFile(output, 'utf8'))[0].code, 'title-required');
    const negated = run('!(valid|rules).yaml'); assert.equal(negated.status, 1, negated.stdout + negated.stderr);
    assert.equal(JSON.parse(await readFile(output, 'utf8'))[0].code, 'title-required');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
