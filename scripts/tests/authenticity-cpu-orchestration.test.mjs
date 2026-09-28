import assert from 'node:assert/strict';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const root = process.cwd();
const python = process.platform === 'win32' ? 'python' : 'python3';
const script = name => path.join(root, 'scripts', 'authenticity', name);
const run = (file, args, options = {}) => spawnSync(file, args, { cwd: root, encoding: 'utf8', ...options });
const runAsync = promisify(execFile);
const sha = value => createHash('sha256').update(value).digest('hex');

test('workflow uses root build context, hash-pinned client, preflight and external measurement order', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/authenticity-cpu-evaluation.yml'), 'utf8');
  assert.ok(workflow.includes('docker build --target evaluation --file apps/lythaus-authenticity-runtime/container/Dockerfile'));
  assert.ok(workflow.includes('--tag "lythaus-safe-evaluation:${RELEASE_SHA}" .'));
  assert.match(workflow, /--require-hashes .* -r scripts\/authenticity\/evaluation-client-requirements\.txt/);
  assert.match(workflow, /actions\/setup-python@[0-9a-f]{40}[\s\S]*python-version: '3\.13\.5'/);
  assert.match(workflow, /--preflight-only/);
  assert.match(workflow, /consume-evaluation-authorization\.mjs/);
  assert.match(workflow, /--user 65532:65532/);
  assert.match(workflow, /--mount "type=volume,src=\$MODEL_VOLUME,dst=\/opt\/safe,readonly"/);
  assert.match(workflow, /measure-container-memory\.py --pid/);
  assert.match(workflow, /Verify durable authorization marker before runtime build/);
  assert.doesNotMatch(workflow, /--volume "\$RUNNER_TEMP\/authenticity-evaluation:\/opt\/safe:ro"/);
  const dockerIgnore = fs.readFileSync(path.join(root, 'apps/lythaus-authenticity-runtime/container/Dockerfile.dockerignore'), 'utf8');
  assert.match(dockerIgnore, /^\*\*/);
  assert.doesNotMatch(dockerIgnore, /!.*(?:checkpoint\.pth|fixtures|private)/);
  assert.ok(workflow.indexOf('--preflight-only') < workflow.indexOf('docker build --target evaluation'));
  assert.ok(workflow.indexOf('consume-evaluation-authorization.mjs') < workflow.indexOf('docker build --target evaluation'));
  assert.ok(workflow.indexOf('Persist consumed authorization marker') < workflow.indexOf('Verify durable authorization marker before runtime build'));
  assert.ok(workflow.indexOf('Verify durable authorization marker before runtime build') < workflow.indexOf('docker build --target evaluation'));
});

test('authorization ledger is atomic across reruns', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-authz-'));
  try {
    const approval = path.join(directory, 'approval.json');
    const ledger = path.join(directory, 'consumed.json');
    fs.writeFileSync(approval, JSON.stringify({ sourceSha: 'a'.repeat(40), authorizationId: 'protocol-run-1', checkpointSha256: 'b'.repeat(64), expiresAtEpochSeconds: 4_102_444_800 }));
    const first = run(process.execPath, [script('consume-evaluation-authorization.mjs'), '--approval', approval, '--source-sha', 'a'.repeat(40), '--ledger', ledger]);
    assert.equal(first.status, 0, first.stderr);
    const second = run(process.execPath, [script('consume-evaluation-authorization.mjs'), '--approval', approval, '--source-sha', 'a'.repeat(40), '--ledger', ledger]);
    assert.notEqual(second.status, 0);
    assert.match(second.stdout, /AUTHORIZATION_ALREADY_CONSUMED/);
    assert.equal(JSON.parse(fs.readFileSync(ledger, 'utf8')).sourceSha, 'a'.repeat(40));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('GitHub artifact ledger verifies the current run and rejects prior claims', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-github-authz-'));
  const sourceSha = 'a'.repeat(40);
  const authorizationId = 'protocol-run-github';
  const checkpointSha256 = 'b'.repeat(64);
  const expiresAtEpochSeconds = 4_102_444_800;
  const authorizationKey = sha(JSON.stringify({ authorizationId, sourceSha, checkpointSha256, expiresAtEpochSeconds }));
  const markerName = `authenticity-evaluation-consumed-${authorizationKey.slice(0, 32)}`;
  const approval = path.join(directory, 'approval.json');
  fs.writeFileSync(approval, JSON.stringify({ sourceSha, authorizationId, checkpointSha256, expiresAtEpochSeconds }));
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ artifacts: [{ name: markerName, expired: false, workflow_run: { id: 42 } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const baseEnv = { ...process.env, GITHUB_TOKEN: 'protocol-token', GITHUB_REPOSITORY: 'AsoraKK/Lythaus', GITHUB_API_URL: `http://127.0.0.1:${port}` };
    const verify = await runAsync(process.execPath, [script('consume-evaluation-authorization.mjs'), '--approval', approval, '--source-sha', sourceSha, '--verify'], { cwd: root, env: { ...baseEnv, GITHUB_RUN_ID: '42' }, encoding: 'utf8' });
    assert.match(verify.stdout, /EVALUATION_AUTHORIZATION_VERIFIED/);
    await assert.rejects(() => runAsync(process.execPath, [script('consume-evaluation-authorization.mjs'), '--approval', approval, '--source-sha', sourceSha], { cwd: root, env: { ...baseEnv, GITHUB_RUN_ID: '43' }, encoding: 'utf8' }), error => /AUTHORIZATION_ALREADY_CONSUMED/.test(error.stdout));
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('model staging copies only reviewed files without world access', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-model-stage-'));
  try {
    fs.mkdirSync(path.join(directory, 'models'));
    const source = Buffer.from('protocol source');
    const checkpoint = Buffer.from('protocol checkpoint');
    fs.writeFileSync(path.join(directory, 'models/resnet.py'), source);
    fs.writeFileSync(path.join(directory, 'checkpoint.pth'), checkpoint);
    const output = path.join(directory, 'staged');
    execFileSync(python, [script('stage-private-models.py'), '--root', directory, '--output', output, '--expected-source-sha', sha(source), '--expected-checkpoint-sha', sha(checkpoint)], { cwd: root });
    assert.deepEqual(fs.readdirSync(output).sort(), ['checkpoint.pth', 'models']);
    if (process.platform !== 'win32') for (const file of [path.join(output, 'checkpoint.pth'), path.join(output, 'models/resnet.py')]) assert.equal(fs.statSync(file).mode & 0o007, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('private archive and expired approval fail with sanitized errors before startup', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-preflight-'));
  try {
    const archive = path.join(directory, 'private.tgz');
    fs.writeFileSync(archive, 'not a tar archive');
    const rejected = run(python, [script('validate-private-evaluation-bundle.py'), '--archive', archive]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stdout, /PRIVATE_BUNDLE_REJECTED/);
    assert.doesNotMatch(rejected.stdout, new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const approval = path.join(directory, 'approval.json');
    fs.writeFileSync(approval, JSON.stringify({ sourceSha: 'a'.repeat(40), authorizationId: 'protocol-run-1', expiresAtEpochSeconds: 1, attendedRuntimeAuthorized: true, computePolicySatisfied: true, checkpointUseAuthorized: true, fixtureUseAuthorized: true, rightsEvidenceSha256: 'a'.repeat(64), runtimeEvidenceSha256: 'b'.repeat(64), preprocessingHash: 'c'.repeat(64), runtimeDigest: 'sha256:' + 'd'.repeat(64), checkpointSha256: 'b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e', checkpointUpstreamCommit: '4e998724651b227def64f5be0cd60c0aa1552c35', preprocessing: 'SAFE_OFFICIAL_RGB_CENTER_CROP_256_DWT_CLASS1_V1', maxSafeAttempts: 16, maxActiveMinutes: 30, maxFileBytes: 10485760, maxDecodedPixels: 16777216, automaticRetries: false, publicInferenceEndpoint: false, fixtures: {} }));
    const expired = run(process.execPath, [script('validate-private-evaluation-approval.mjs'), '--approval', approval, '--root', directory, '--source-sha', 'a'.repeat(40)]);
    assert.notEqual(expired.status, 0);
    assert.match(expired.stdout, /PRIVATE_APPROVAL_REJECTED:APPROVAL_EXPIRED/);
    assert.doesNotMatch(expired.stdout, new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('artifact identity mismatch and post-response measurement are fail-closed', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-identity-'));
  try {
    const inspect = path.join(directory, 'inspect.json');
    fs.writeFileSync(inspect, JSON.stringify([{ Id: 'sha256:' + 'a'.repeat(64), Size: 10, RepoDigests: [], Config: { User: '65532:65532', Labels: { 'org.opencontainers.image.revision': 'b'.repeat(40) } } }]));
    const mismatch = run(process.execPath, [script('verify-evaluation-image.mjs'), '--inspect', inspect, '--source-sha', 'a'.repeat(40)]);
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stdout, /IMAGE_SOURCE_MISMATCH/);
    const cgroup = path.join(directory, 'memory.peak');
    fs.writeFileSync(cgroup, '12345\n');
    const measurement = path.join(directory, 'measurement.json');
    execFileSync(python, [script('measure-container-memory.py'), '--cgroup-file', cgroup, '--output', measurement], { cwd: root });
    const receipt = path.join(directory, 'receipt.json');
    const sanitized = path.join(directory, 'sanitized.json');
    fs.writeFileSync(receipt, JSON.stringify({ sourceSha: 'a'.repeat(40), runtimeDigest: 'sha256:' + 'c'.repeat(64), approvalSha256: 'd'.repeat(64), state: 'CPU_SMOKE_COMPLETE_NOT_APP_ACCEPTANCE', attempts: [] }));
    execFileSync(process.execPath, [script('sanitize-beta-cpu-receipt.mjs'), '--input', receipt, '--external-measurement', measurement, '--output', sanitized], { cwd: root });
    const output = JSON.parse(fs.readFileSync(sanitized, 'utf8'));
    assert.equal(output.measurements.wholeContainerPeakBytes, 12345);
    assert.equal(output.measurements.memoryMeasurementScope, 'WHOLE_CONTAINER_POST_RESPONSE');
    assert.equal(output.measurements.serverReportedMaxCgroupPeakBytes, null);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('supervisor startup, timeout, cancellation and cleanup protocol remains executable', { skip: process.platform !== 'linux' }, () => {
  const result = run(python, [path.join(root, 'apps/lythaus-authenticity-runtime/container/test_supervisor.py')]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
