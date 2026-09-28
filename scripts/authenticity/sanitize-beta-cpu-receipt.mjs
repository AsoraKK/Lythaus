import fs from 'node:fs';

const args = process.argv.slice(2);
const input = args[args.indexOf('--input') + 1];
const output = args[args.indexOf('--output') + 1];
if (!input || !output) throw new Error('RECEIPT_ARGUMENT_REQUIRED');
const report = JSON.parse(fs.readFileSync(input, 'utf8'));
if (!report || typeof report !== 'object' || !Array.isArray(report.attempts)) throw new Error('RECEIPT_INVALID');
const counts = {};
let parityPassed = 0;
let parityFailed = 0;
let maxEndToEndMs = null;
let maxCgroupPeakBytes = null;
for (const attempt of report.attempts) {
  const state = typeof attempt.state === 'string' ? attempt.state : 'UNKNOWN';
  counts[state] = (counts[state] ?? 0) + 1;
  if (attempt.parity === true) parityPassed += 1;
  if (attempt.parity === false) parityFailed += 1;
  if (Number.isFinite(attempt.endToEndMs)) maxEndToEndMs = maxEndToEndMs === null ? attempt.endToEndMs : Math.max(maxEndToEndMs, attempt.endToEndMs);
  if (Number.isSafeInteger(attempt.measurements?.cgroupPeakBytes)) maxCgroupPeakBytes = maxCgroupPeakBytes === null ? attempt.measurements.cgroupPeakBytes : Math.max(maxCgroupPeakBytes, attempt.measurements.cgroupPeakBytes);
}
const sanitized = {
  schemaVersion: 'lythaus-beta-cpu-smoke-sanitized-v1',
  sourceSha: report.sourceSha,
  runtimeDigest: report.runtimeDigest,
  approvalSha256: report.approvalSha256,
  state: report.state,
  appAcceptance: report.appAcceptance === true,
  attempts: { total: report.attempts.length, states: counts, parityPassed, parityFailed },
  measurements: { maxEndToEndMs, maxCgroupPeakBytes },
};
fs.writeFileSync(output, JSON.stringify(sanitized, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
