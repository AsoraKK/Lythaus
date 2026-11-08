import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseDocument } from 'yaml';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const workflow = parseDocument(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'), { uniqueKeys: true }).toJS();
const openapiJob = workflow.jobs.openapi;
const installStep = openapiJob.steps.find(step => step.name === 'Install pinned oasdiff');
assert.ok(installStep, 'OpenAPI contract must keep its pinned oasdiff installer');

function readOptional(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function buildHarness(t, { curlExit = 0, checksumExit = 0 } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'lythaus-oasdiff-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const bin = path.join(root, 'bin');
  const runnerTemp = path.join(root, 'runner-temp');
  mkdirSync(bin);
  mkdirSync(runnerTemp);

  const traceFile = path.join(root, 'trace');
  const curlArgsFile = path.join(root, 'curl-args');
  const checksumArgsFile = path.join(root, 'checksum-args');
  const checksumInputFile = path.join(root, 'checksum-input');
  const githubPathFile = path.join(root, 'github-path');

  const stubs = {
    curl: [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'echo curl >> "$TRACE_FILE"',
      'echo "$@" > "$CURL_ARGS_FILE"',
      'if [[ "$CURL_EXIT" != "0" ]]; then exit "$CURL_EXIT"; fi',
      'while (($#)); do',
      '  if [[ "$1" == "--output" ]]; then',
      '    shift',
      '    echo archive > "$1"',
      '    break',
      '  fi',
      '  shift',
      'done',
    ].join('\n'),
    sha256sum: [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'echo sha256sum >> "$TRACE_FILE"',
      'echo "$@" > "$CHECKSUM_ARGS_FILE"',
      'read -r checksum_line || true',
      'printf "%s" "$checksum_line" > "$CHECKSUM_INPUT_FILE"',
      'exit "$CHECKSUM_EXIT"',
    ].join('\n'),
    tar: ['#!/usr/bin/env bash', 'echo tar >> "$TRACE_FILE"'].join('\n'),
    chmod: ['#!/usr/bin/env bash', 'echo chmod >> "$TRACE_FILE"'].join('\n'),
  };

  for (const [name, contents] of Object.entries(stubs)) {
    const stubPath = path.join(bin, name);
    writeFileSync(stubPath, contents, { mode: 0o755 });
    chmodSync(stubPath, 0o755);
  }

  const result = spawnSync('bash', ['-c', installStep.run], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: bin + path.delimiter + process.env.PATH,
      RUNNER_TEMP: runnerTemp,
      GITHUB_PATH: githubPathFile,
      OASDIFF_VERSION: installStep.env.OASDIFF_VERSION,
      OASDIFF_SHA256: installStep.env.OASDIFF_SHA256,
      TRACE_FILE: traceFile,
      CURL_ARGS_FILE: curlArgsFile,
      CHECKSUM_ARGS_FILE: checksumArgsFile,
      CHECKSUM_INPUT_FILE: checksumInputFile,
      CURL_EXIT: String(curlExit),
      CHECKSUM_EXIT: String(checksumExit),
    },
  });

  return {
    result,
    runnerTemp,
    archive: path.join(runnerTemp, 'oasdiff.tar.gz'),
    events: (readOptional(traceFile) || '').trim().split('\n').filter(Boolean),
    curlArgs: (readOptional(curlArgsFile) || '').trim().split(/\s+/).filter(Boolean),
    checksumArgs: readOptional(checksumArgsFile),
    checksumInput: readOptional(checksumInputFile),
    githubPath: readOptional(githubPathFile),
    githubPathExists: existsSync(githubPathFile),
  };
}

test('OpenAPI installer pins the official asset and retries transient failures without weakening validation', () => {
  const workflowLint = workflow.jobs.workflow_lint;
  const workflowLintTest = workflowLint.steps.find(step => step.name === 'Verify Flutter SDK cache isolation and fallback');
  assert.ok(workflowLintTest.run.includes('scripts/tests/oasdiff-install.test.mjs'));
  assert.equal(openapiJob['continue-on-error'], undefined);
  assert.equal(openapiJob.if, undefined);
  assert.equal(installStep['continue-on-error'], undefined);
  assert.equal(installStep.if, undefined);
  assert.equal(installStep.env.OASDIFF_VERSION, '1.23.0');
  assert.equal(installStep.env.OASDIFF_SHA256, '972b10535c3db4366b9dc3ebc11ca021279af3095267c3cffdca854a3a3c4f89');

  const versionExpression = '$' + '{OASDIFF_VERSION}';
  const expectedUrl = 'https://github.com/oasdiff/oasdiff/releases/download/v' + versionExpression + '/oasdiff_' + versionExpression + '_linux_amd64.tar.gz';
  assert.ok(installStep.run.includes(expectedUrl));
  assert.match(installStep.run, /--fail/);
  assert.match(installStep.run, /--location/);
  assert.match(installStep.run, /--retry 4/);
  assert.match(installStep.run, /--retry-max-time 60/);
  assert.match(installStep.run, /--connect-timeout 15/);
  assert.match(installStep.run, /--max-time 45/);
  assert.equal(installStep.run.includes('--retry-all-errors'), false);

  const checksumIndex = installStep.run.indexOf('sha256sum --check --strict');
  const extractionIndex = installStep.run.indexOf('tar -xzf');
  assert.ok(checksumIndex >= 0 && extractionIndex > checksumIndex, 'checksum verification must happen before extraction');

  const stepNames = new Set(openapiJob.steps.map(step => step.name).filter(Boolean));
  for (const requiredStep of ['Prepare base OpenAPI contract', 'Report OpenAPI diff', 'Enforce semver when breaking']) {
    assert.ok(stepNames.has(requiredStep), 'missing required OpenAPI check: ' + requiredStep);
  }
});

test('successful oasdiff installation uses the pinned URL and publishes PATH only after checksum', t => {
  const outcome = buildHarness(t);
  assert.equal(outcome.result.status, 0, outcome.result.stderr);
  assert.deepEqual(outcome.events, ['curl', 'sha256sum', 'tar', 'chmod']);
  const version = installStep.env.OASDIFF_VERSION;
  const expectedUrl = 'https://github.com/oasdiff/oasdiff/releases/download/v' + version + '/oasdiff_' + version + '_linux_amd64.tar.gz';
  assert.ok(outcome.curlArgs.includes(expectedUrl));
  for (const flag of ['--fail', '--location', '--retry', '4', '--retry-max-time', '60', '--connect-timeout', '15', '--max-time', '45']) {
    assert.ok(outcome.curlArgs.includes(flag), 'missing curl option or value: ' + flag);
  }
  assert.ok(!outcome.curlArgs.includes('--retry-all-errors'));
  assert.deepEqual(outcome.checksumArgs.trim().split(/\s+/), ['--check', '--strict']);
  assert.equal(outcome.checksumInput.trimEnd(), installStep.env.OASDIFF_SHA256 + '  ' + outcome.archive);
  assert.equal(outcome.githubPath, outcome.runnerTemp + '\n');
});

test('download failure stops before checksum, extraction and PATH publication', t => {
  const outcome = buildHarness(t, { curlExit: 22 });
  assert.notEqual(outcome.result.status, 0);
  assert.deepEqual(outcome.events, ['curl']);
  assert.equal(outcome.githubPathExists, false);
});

test('checksum failure stops before extraction and PATH publication', t => {
  const outcome = buildHarness(t, { checksumExit: 1 });
  assert.notEqual(outcome.result.status, 0);
  assert.deepEqual(outcome.events, ['curl', 'sha256sum']);
  assert.equal(outcome.githubPathExists, false);
});
