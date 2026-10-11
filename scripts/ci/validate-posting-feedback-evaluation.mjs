import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runSyntheticEvaluation, writeReportAtomically } from '../../packages/authenticity/evaluation/posting-feedback/run.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = 'packages/authenticity/evaluation/posting-feedback';

export function assertEvaluationHead(actual, expected, ci = false) {
  if (!/^[a-f0-9]{40}$/.test(actual) || (ci && !expected)
    || (expected !== undefined && (!/^[a-f0-9]{40}$/.test(expected) || actual !== expected)))
    throw new Error('evaluation_ci_head_mismatch');
}

export async function validatePostingFeedbackEvaluation({ expectedHead, ci = false } = {}) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assertEvaluationHead(head, expectedHead, ci);
  const commands = [
    [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', `${directory}/tsconfig.json`, '--noEmit'],
    ['--experimental-strip-types', '--test', `${directory}/harness.test.mjs`, `${directory}/workerd.test.mjs`,
      `${directory}/ci.test.mjs`, `${directory}/collector.test.mjs`],
  ];
  for (const command of commands) {
    const result = spawnSync(process.execPath, command, { cwd: root, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('evaluation_ci_validation_failed');
  }
  const report = await runSyntheticEvaluation();
  assertEvaluationHead(report.checkoutHeadSha, head);
  if (report.externalRequests !== 0 || report.publicationEligible !== false
    || report.evidenceClass !== 'SYNTHETIC_SCHEMA_AND_MEASUREMENT_TEST_ONLY'
    || report.thresholdRecommendation.status !== 'UNEVALUATED' || report.thresholdRecommendation.activate !== false)
    throw new Error('evaluation_ci_evidence_boundary_violation');
  if (ci && report.checkoutDirty) throw new Error('evaluation_ci_dirty_checkout');
  const output = await writeReportAtomically(report, resolve(root, '.artifacts/posting-feedback/ci-synthetic-report.json'));
  process.stdout.write(`${JSON.stringify({ checkoutHeadSha: head, evidenceClass: report.evidenceClass,
    corpusHash: report.corpusHash, fixtures: report.observations.length, externalRequests: 0,
    publicPosting: 'WITHHELD', output })}\n`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    process.stderr.write('Usage: node --experimental-strip-types scripts/ci/validate-posting-feedback-evaluation.mjs\n');
    process.exitCode = 2;
  } else {
    try {
      await validatePostingFeedbackEvaluation({ expectedHead: process.env.EXPECTED_SOURCE_SHA,
        ci: process.env.GITHUB_ACTIONS === 'true' });
    } catch (error) {
      const known = ['evaluation_ci_head_mismatch', 'evaluation_ci_validation_failed',
        'evaluation_ci_evidence_boundary_violation', 'evaluation_ci_dirty_checkout'];
      process.stderr.write(`${known.includes(error?.message) ? error.message : 'evaluation_ci_failed'}\n`);
      process.exitCode = 1;
    }
  }
}
