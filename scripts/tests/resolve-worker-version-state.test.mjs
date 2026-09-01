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

const rollbackVersion = (version_id, percentage) => ({ version_id, percentage });

const runRollback = (versions) => {
  const directory = mkdtempSync(join(tmpdir(), 'lythaus-worker-rollback-'));
  const input = join(directory, 'deployment.json');
  const githubEnv = join(directory, 'github.env');
  writeFileSync(input, JSON.stringify({ versions }));
  try {
    const output = execFileSync(process.execPath, [script, 'rollback', input, 'unused', 'PUBLIC'], {
      env: { ...process.env, GITHUB_ENV: githubEnv },
      encoding: 'utf8',
    });
    return { output, env: readFileSync(githubEnv, 'utf8') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test('resolves the only exact-SHA candidate', () => {
  const result = run([version('11111111-1111-4111-8111-111111111111', '2026-08-25T10:00:00Z')]);
  assert.match(result.env, /PUBLIC_WORKER_VERSION_ID=11111111-1111-4111-8111-111111111111/);
  assert.match(result.env, /PUBLIC_WORKER_CREATED_AT=2026-08-25T10:00:00.000Z/);
  assert.match(result.output, /"matchingVersions":1/);
});

test('resolves Cloudflare version-list metadata timestamps', () => {
  const result = run([{
    id: '11111111-1111-4111-8111-111111111111',
    metadata: { created_on: '2026-08-30T14:11:48.458905Z' },
    annotations: { 'workers/tag': tag },
  }]);
  assert.match(result.env, /PUBLIC_WORKER_CREATED_AT=2026-08-30T14:11:48.458Z/);
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

test('fails closed when a candidate lacks a comparable creation timestamp', () => {
  assert.throws(
    () => run([
      version('11111111-1111-4111-8111-111111111111', '2026-08-25T10:00:00Z'),
      version('22222222-2222-4222-8222-222222222222', undefined),
    ]),
    /lack valid creation timestamps/,
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

test('rollback captures a single traffic-serving version at 100 percent', () => {
  const result = runRollback([
    rollbackVersion('11111111-1111-4111-8111-111111111111', 100),
  ]);
  assert.match(result.env, /PUBLIC_ROLLBACK_SPECS=11111111-1111-4111-8111-111111111111@100/);
  assert.doesNotMatch(result.env, /@0/);
  assert.match(result.output, /"activeVersionIds":\["11111111-1111-4111-8111-111111111111"\]/);
  assert.match(result.output, /"zeroTrafficVersionCount":0/);
});

test('rollback ignores zero-traffic staged candidates and retains the active snapshot', () => {
  const result = runRollback([
    rollbackVersion('11111111-1111-4111-8111-111111111111', 100),
    rollbackVersion('22222222-2222-4222-8222-222222222222', 0),
  ]);
  assert.equal(result.env.trim(), 'PUBLIC_ROLLBACK_SPECS=11111111-1111-4111-8111-111111111111@100');
  assert.doesNotMatch(result.env, /22222222-2222-4222-8222-222222222222|@0/);
  assert.match(result.output, /"zeroTrafficVersionIds":\["22222222-2222-4222-8222-222222222222"\]/);
});

test('rollback preserves split serving traffic and excludes staged candidates', () => {
  const result = runRollback([
    rollbackVersion('11111111-1111-4111-8111-111111111111', 80),
    rollbackVersion('22222222-2222-4222-8222-222222222222', 20),
    rollbackVersion('33333333-3333-4333-8333-333333333333', 0),
  ]);
  assert.equal(
    result.env.trim(),
    'PUBLIC_ROLLBACK_SPECS=11111111-1111-4111-8111-111111111111@80 22222222-2222-4222-8222-222222222222@20',
  );
  assert.doesNotMatch(result.env, /33333333-3333-4333-8333-333333333333|@0/);
  assert.match(result.output, /"trafficTotal":100/);
});

test('rollback excludes multiple zero-traffic candidates', () => {
  const result = runRollback([
    rollbackVersion('11111111-1111-4111-8111-111111111111', 100),
    rollbackVersion('22222222-2222-4222-8222-222222222222', 0),
    rollbackVersion('33333333-3333-4333-8333-333333333333', 0),
  ]);
  assert.equal(result.env.trim(), 'PUBLIC_ROLLBACK_SPECS=11111111-1111-4111-8111-111111111111@100');
  assert.match(result.output, /"zeroTrafficVersionCount":2/);
});

test('rollback accepts floating serving percentages within the existing tolerance', () => {
  const result = runRollback([
    rollbackVersion('11111111-1111-4111-8111-111111111111', 40.0004),
    rollbackVersion('22222222-2222-4222-8222-222222222222', 59.9994),
    rollbackVersion('33333333-3333-4333-8333-333333333333', 0),
  ]);
  assert.match(result.env, /@40\.0004/);
  assert.match(result.env, /@59\.9994/);
  assert.doesNotMatch(result.env, /@0/);
});

test('rollback fails closed when all versions are zero traffic', () => {
  assert.throws(
    () => runRollback([
      rollbackVersion('11111111-1111-4111-8111-111111111111', 0),
      rollbackVersion('22222222-2222-4222-8222-222222222222', 0),
    ]),
    /no active rollback versions/,
  );
});

test('rollback fails closed when active traffic does not total 100', () => {
  assert.throws(
    () => runRollback([rollbackVersion('11111111-1111-4111-8111-111111111111', 99)]),
    /rollback traffic totals 99, not 100/,
  );
  assert.throws(
    () => runRollback([rollbackVersion('11111111-1111-4111-8111-111111111111', 101)]),
    /invalid rollback version/,
  );
});

test('rollback fails closed on invalid percentages, including malformed staged entries', () => {
  for (const percentage of [-1, 'not-a-number', null, '', true]) {
    assert.throws(
      () => runRollback([
        rollbackVersion('11111111-1111-4111-8111-111111111111', 100),
        rollbackVersion('22222222-2222-4222-8222-222222222222', percentage),
      ]),
      /invalid rollback version/,
    );
  }
});

test('rollback validates zero-traffic IDs and rejects duplicate IDs', () => {
  assert.throws(
    () => runRollback([
      rollbackVersion('11111111-1111-4111-8111-111111111111', 100),
      rollbackVersion('not-a-uuid', 0),
    ]),
    /invalid rollback version/,
  );
  assert.throws(
    () => runRollback([
      rollbackVersion('11111111-1111-4111-8111-111111111111', 100),
      rollbackVersion('11111111-1111-4111-8111-111111111111', 0),
    ]),
    /duplicate rollback version IDs/,
  );
});

test('rollback rejects missing and empty version lists', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lythaus-worker-rollback-invalid-'));
  const input = join(directory, 'deployment.json');
  const githubEnv = join(directory, 'github.env');
  try {
    for (const payload of [{}, { versions: [] }]) {
      writeFileSync(input, JSON.stringify(payload));
      assert.throws(
        () => execFileSync(process.execPath, [script, 'rollback', input, 'unused', 'PUBLIC'], {
          env: { ...process.env, GITHUB_ENV: githubEnv },
          encoding: 'utf8',
        }),
        /no rollback versions/,
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('predeployment rollback snapshot restores only serving traffic at 100 percent', () => {
  const result = runRollback([
    rollbackVersion('11111111-1111-4111-8111-111111111111', 100),
    rollbackVersion('22222222-2222-4222-8222-222222222222', 0),
    rollbackVersion('33333333-3333-4333-8333-333333333333', 0),
  ]);
  const specs = result.env
    .match(/PUBLIC_ROLLBACK_SPECS=(.*)/)?.[1]
    .trim()
    .split(/\s+/)
    .filter(Boolean) ?? [];
  assert.deepEqual(specs, ['11111111-1111-4111-8111-111111111111@100']);
  assert.equal(specs.reduce((sum, spec) => sum + Number(spec.split('@')[1]), 0), 100);
  assert.doesNotMatch(result.env, /@0/);
});
