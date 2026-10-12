import { mkdir, writeFile, rename, unlink, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectFixture, evaluateCorpus, validateCorpus, hash } from './harness.ts';
import { fixtures, FIXTURE_VERSION, FIXTURE_PROVENANCE, safeProtocolCases } from './fixtures.mjs';
import { BETA_VERSION, SAFE_CHECKPOINT, SAFE_PREPROCESSING, SAFE_THRESHOLD, assertSafeResult, compileBetaResult } from '../../src/beta.ts';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const baseSha = '49cca9caa34b34c7ded7f4842792f698be9bd41f';
const assertRunning = signal => { if (signal?.aborted) throw new Error('evaluation_interrupted'); };

export function evaluateSafeProtocols() {
  return safeProtocolCases.map(fixture => {
    const binding = { caseId: fixtures[0].id, runId: fixtures[1].id, revision: 1, inputHash: 'a'.repeat(64),
      preprocessingHash: 'b'.repeat(64), runtimeDigest: `sha256:${'c'.repeat(64)}` };
    const output = { ...binding, schemaVersion: BETA_VERSION, checkpoint: SAFE_CHECKPOINT, preprocessing: SAFE_PREPROCESSING,
      status: fixture.status, score: fixture.score,
      facts: fixture.status === 'OK' ? { mime: fixture.mime, width: 256, height: 256, frames: 1, mode: 'RGB', sourceHistory: fixture.sourceHistory } : null,
      timings: { decodeMs: 1, inferenceMs: 1, peakRssBytes: 1 }, forensics: null };
    assertSafeResult(output, binding);
    const result = compileBetaResult(output, { provider: 'synthetic-safety', result: 'ALLOW', reasonCodes: [],
      modelVersion: 'synthetic-v1', executionMs: 0, costEstimateUsd: 0 });
    return { name: fixture.name, score: output.score, finding: result.finding, support: result.support,
      rawThresholdCrossing: result.rawThresholdCrossing, publicationEligible: result.publicationEligible,
      checkpoint: SAFE_CHECKPOINT, preprocessing: SAFE_PREPROCESSING, existingThreshold: SAFE_THRESHOLD,
      provenance: 'SCRIPTED_PROTOCOL_NO_IMAGE_DECODE_NO_CHECKPOINT_INFERENCE', humanAuthorshipEstablished: false };
  });
}

export async function runSyntheticEvaluation({ signal, corpus = fixtures } = {}) {
  assertRunning(signal);
  await validateCorpus(corpus);
  const observations = [];
  for (const fixture of corpus) {
    assertRunning(signal);
    observations.push(await collectFixture(fixture));
    assertRunning(signal);
  }
  const report = await evaluateCorpus(corpus, observations);
  assertRunning(signal);
  const sourcePaths = ['harness.ts', 'metrics.ts', 'fixtures.mjs', 'run.mjs'];
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
    [path, await hash(await readFile(new URL(path, import.meta.url), 'utf8'))])));
  return { ...report, fixtureVersion: FIXTURE_VERSION, fixtureProvenance: FIXTURE_PROVENANCE,
    reviewedBaseSha: baseSha,
    checkoutHeadSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    checkoutDirty: execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim().length > 0,
    sourceFileSha256: sourceHashes, nodeVersion: process.version,
    safeProtocolCases: evaluateSafeProtocols(),
    measurementLimits: ['All responses are scripted, including simulated errors and timings.',
      'Human scenario labels are not verified human-written ground truth.',
      'Source-family IDs and NFC duplicate checks cannot discover unrecorded semantic relationships.',
      'A mutable provider alias is not an immutable model snapshot.',
      'No live-provider accuracy, latency, calibration, detection certification or production-auth certification.'] };
}

export async function writeReportAtomically(report, destination, { signal } = {}) {
  assertRunning(signal);
  const path = resolve(destination);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    assertRunning(signal);
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  return path;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--output')) {
    process.stderr.write('Usage: node --experimental-strip-types run.mjs [--output local-report.json]\n');
    process.exitCode = 2;
  } else {
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    process.once('SIGTERM', () => controller.abort());
    try {
      const report = await runSyntheticEvaluation({ signal: controller.signal });
      const output = args[1] ? await writeReportAtomically(report, args[1], { signal: controller.signal }) : null;
      process.stdout.write(`${JSON.stringify({ evidenceClass: report.evidenceClass, reviewedBaseSha: baseSha,
        checkoutHeadSha: report.checkoutHeadSha, corpusHash: report.corpusHash, reportHash: await hash(JSON.stringify(report)),
        fixtures: report.observations.length, output, externalRequests: 0, publicPosting: 'WITHHELD',
        thresholdStatus: report.thresholdRecommendation.status, bySplit: report.bySplit }, null, 2)}\n`);
    } catch {
      process.stderr.write(controller.signal.aborted ? 'evaluation_interrupted; no completed report published\n' : 'evaluation_failed; no completed report published\n');
      process.exitCode = controller.signal.aborted ? 130 : 1;
    }
  }
}
