import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const script = 'scripts/ci/resolve-worker-version-state.mjs';
const tag = 'b6f5fbc395a031c40686d1e6c27be2fb9b6f54b7';

const version = (id, created_on, releaseTag = tag) => ({
  id,
  created_on,
  annotations: { 'workers/tag': releaseTag },
});

const run = (versions) => {
  const directory = mkdtempSync(join(tmpdir(), 'lythaus-worker-version-'));
  const input = join(directory, 'versions.json');
  const githubEnv = join(directory, 'github.env');
  writeFileSync(input, JSON.stringify(versions));
  try {
    const output = execFileSync(process.execPath, [script, 'candidate', input, tag, 'PUBLIC'], {
      env: { ...process.env, GITHUB_ENV: githubEnv },
      encoding: 'utf8',
    });
    return { output, env: readFileSync(githubEnv, 'utf8') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const runUpload = (output) => {
  const directory = mkdtempSync(join(tmpdir(), 'lythaus-worker-upload-'));
  const input = join(directory, 'upload.log');
  const githubEnv = join(directory, 'github.env');
  writeFileSync(input, output);
  try {
    const result = execFileSync(process.execPath, [script, 'upload', input, tag, 'PUBLIC'], {
      env: { ...process.env, GITHUB_ENV: githubEnv },
      encoding: 'utf8',
    });
    return { output: result, env: readFileSync(githubEnv, 'utf8') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test('resolves the only exact-SHA candidate', () => {
  const result = run([version('11111111-1111-4111-8111-111111111111', '2026-08-25T10:00:00Z')]);
  assert.match(result.env, /PUBLIC_WORKER_VERSION_ID=11111111-1111-4111-8111-111111111111/);
  assert.match(result.output, /"matchingVersions":1/);
});

test('resolves the newest exact-SHA candidate after an interrupted retry', () => {
  const result = run([
    version('11111111-1111-4111-8111-111111111111', '2026-08-25T10:00:00Z'),
    version('22222222-2222-4222-8222-222222222222', '2026-08-25T10:01:00Z'),
  ]);
  assert.match(result.env, /PUBLIC_WORKER_VERSION_ID=22222222-2222-4222-8222-222222222222/);
  assert.match(result.output, /"matchingVersions":2/);
});

test('resolves the exact version returned by an upload', () => {
  const result = runUpload(`\nWorker Version ID: \n33333333-3333-4333-8333-333333333333\n`);
  assert.match(result.env, /PUBLIC_WORKER_VERSION_ID=33333333-3333-4333-8333-333333333333/);
  assert.match(result.output, /"source":"upload_output"/);
});

test('rejects an upload without exactly one version id', () => {
  assert.throws(() => runUpload('Worker upload completed without an id'), /did not return a version id/);
  assert.throws(
    () => runUpload('Worker Version ID: 33333333-3333-4333-8333-333333333333\nWorker Version ID: 44444444-4444-4444-8444-444444444444'),
    /multiple version ids/,
  );
});

test('fails closed when duplicate exact-SHA candidates are ambiguous', () => {
  assert.throws(
    () => run([
      version('11111111-1111-4111-8111-111111111111', '2026-08-25T10:00:00Z'),
      version('22222222-2222-4222-8222-222222222222', '2026-08-25T10:00:00Z'),
    ]),
    /ambiguous/,
  );
});

test('fails closed when a duplicate lacks a comparable creation timestamp', () => {
  assert.throws(
    () => run([
      version('11111111-1111-4111-8111-111111111111', '2026-08-25T10:00:00Z'),
      version('22222222-2222-4222-8222-222222222222', undefined),
    ]),
    /lack comparable creation timestamps/,
  );
});

test('rejects invalid candidate ids and missing exact-SHA candidates', () => {
  assert.throws(
    () => run([version('not-a-uuid', '2026-08-25T10:00:00Z')]),
    /invalid version id/,
  );
  assert.throws(
    () => run([version('11111111-1111-4111-8111-111111111111', '2026-08-25T10:00:00Z', '0'.repeat(40))]),
    /no candidate Worker version tagged/,
  );
});
