import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('private evaluation materialization resolves only relative bundle fixtures and exact source', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-private-eval-'));
  fs.mkdirSync(path.join(directory, 'fixtures'));
  fs.writeFileSync(path.join(directory, 'fixtures', 'one.png'), 'fixture');
  const approval = { sourceSha: 'a'.repeat(40), fixtures: { one: { path: 'fixtures/one.png' } } };
  const approvalPath = path.join(directory, 'approval.json');
  const outputPath = path.join(directory, 'resolved.json');
  fs.writeFileSync(approvalPath, JSON.stringify(approval));
  execFileSync(process.execPath, ['scripts/authenticity/materialize-private-evaluation.mjs', '--approval', approvalPath, '--root', directory, '--output', outputPath, '--source-sha', approval.sourceSha], { cwd: root });
  const resolved = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(path.resolve(resolved.fixtures.one.path), path.join(directory, 'fixtures', 'one.png'));
  assert.throws(() => execFileSync(process.execPath, ['scripts/authenticity/materialize-private-evaluation.mjs', '--approval', approvalPath, '--root', directory, '--output', outputPath, '--source-sha', 'b'.repeat(40)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }), /SOURCE_IDENTITY_MISMATCH/);
});

test('sanitized receipt excludes sample IDs, raw scores and fixture paths', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-private-receipt-'));
  const input = path.join(directory, 'private.json');
  const output = path.join(directory, 'sanitized.json');
  fs.writeFileSync(input, JSON.stringify({ sourceSha: 'a'.repeat(40), runtimeDigest: 'sha256:' + 'b'.repeat(64), approvalSha256: 'c'.repeat(64), state: 'CPU_SMOKE_COMPLETE_NOT_APP_ACCEPTANCE', appAcceptance: false, attempts: [{ sampleId: 'private', rawScore: 0.99, state: 'COMPLETED', parity: true, endToEndMs: 4, measurements: { cgroupPeakBytes: 32 }}] }));
  execFileSync(process.execPath, ['scripts/authenticity/sanitize-beta-cpu-receipt.mjs', '--input', input, '--output', output], { cwd: root });
  const sanitized = fs.readFileSync(output, 'utf8');
  assert.equal(sanitized.includes('private'), false);
  assert.equal(sanitized.includes('0.99'), false);
  assert.equal(JSON.parse(sanitized).attempts.parityPassed, 1);
});
