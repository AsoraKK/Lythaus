import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { containerArguments } from '../ci/canonical-sdk-isolation.mjs';

test('real disposable container denies candidate access to gates, commandfiles, credentials and host processes', { skip: process.env.LYTHAUS_RUN_ISOLATION_TEST !== '1' }, () => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-sdk-isolation-test-'));
  try {
    for (const path of ['recipe/node_modules', 'inputs', 'work/sdk', 'cache/hosted', 'cache/hosted-hashes', 'fixtures']) fs.mkdirSync(join(directory, path), { recursive: true });
    fs.writeFileSync(join(directory, 'recipe', 'fixed.txt'), 'synthetic trusted fixture');
    fs.writeFileSync(join(directory, 'inputs', 'data.txt'), 'synthetic candidate data');
    fs.writeFileSync(join(directory, 'fixtures', 'fixed.txt'), 'synthetic trusted fixture');
    const command = `
      const fs = require('node:fs');
      const assert = require('node:assert/strict');
      assert.notEqual(process.getuid(), 0);
      for (const name of ['GITHUB_TOKEN', 'GITHUB_ENV', 'GITHUB_OUTPUT', 'GITHUB_PATH', 'SSH_AUTH_SOCK', 'AWS_ACCESS_KEY_ID']) assert.equal(process.env[name], undefined);
      for (const file of ['/recipe/fixed.txt', '/inputs/data.txt', '/work/test/fixed.txt']) assert.throws(() => fs.writeFileSync(file, 'synthetic tamper'), { code: 'EROFS' });
      for (const file of ['/var/run/docker.sock', '/recipe/.git', '/recipe/scripts/ci/canonical-sdk-contract.mjs', '/recipe/scripts/ci/canonical-sdk-bootstrap.mjs']) assert.equal(fs.existsSync(file), false);
      assert.deepEqual(fs.readdirSync('/sys/class/net'), ['lo']);
      assert.ok(fs.readFileSync('/proc/1/cmdline', 'utf8').includes('/tools/node/bin/node'));
      assert.equal(fs.existsSync('/proc/${process.pid}/cmdline'), false);
      fs.writeFileSync('/pub-cache/active_roots', 'synthetic disposable metadata');
      fs.writeFileSync('/work/output.txt', 'synthetic bounded output');
      process.stdout.write('ISOLATION_BOUNDARIES_VERIFIED');
    `;
    const args = containerArguments({ tools: { node: resolve(dirname(process.execPath), '..'), flutter: '/workspace/.lythaus-tools/flutter-sdk/flutter', java: '/workspace/.lythaus-tools/java17', generator: '/workspace/.lythaus-tools/openapi-generator-cli-7.7.0.jar' }, inputs: join(directory, 'inputs'), recipe: join(directory, 'recipe'), work: join(directory, 'work'), cache: join(directory, 'cache'), fixtureDirectory: join(directory, 'fixtures'), user: `${process.getuid()}:${process.getgid()}`, name: `lythaus-boundary-test-${process.pid}`, command: ['-e', command] });
    const result = spawnSync('docker', args, { env: { PATH: '/usr/local/bin:/usr/bin:/bin', GITHUB_TOKEN: 'synthetic-host-only', GITHUB_ENV: '/tmp/synthetic-commandfile', AWS_ACCESS_KEY_ID: 'synthetic-host-only' }, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'ISOLATION_BOUNDARIES_VERIFIED');
    assert.equal(fs.readFileSync(join(directory, 'fixtures', 'fixed.txt'), 'utf8'), 'synthetic trusted fixture');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
