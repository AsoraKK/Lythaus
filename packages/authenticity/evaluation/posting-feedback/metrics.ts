export type Band = 'ALLOW_EVIDENCE' | 'REVIEW' | 'BLOCK_EVIDENCE' | 'ABSTAIN';
export interface LabelledOutcome { familyId: string; truthViolation: boolean | null; band: Band }

export function rate(numerator: number, denominator: number) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator < 0 || denominator < numerator)
    throw new Error('evaluation_invalid_rate_counts');
  if (denominator === 0) return { numerator, denominator, value: null, wilson95: null };
  const value = numerator / denominator;
  const z = 1.959963984540054;
  const divisor = 1 + z * z / denominator;
  const centre = (value + z * z / (2 * denominator)) / divisor;
  const radius = z * Math.sqrt(value * (1 - value) / denominator + z * z / (4 * denominator * denominator)) / divisor;
  return { numerator, denominator, value, wilson95: [numerator === 0 ? 0 : Math.max(0, centre - radius),
    numerator === denominator ? 1 : Math.min(1, centre + radius)] };
}

export function summarize(rows: readonly LabelledOutcome[]) {
  const matrix = {
    safe: { ALLOW_EVIDENCE: 0, REVIEW: 0, BLOCK_EVIDENCE: 0, ABSTAIN: 0 },
    violation: { ALLOW_EVIDENCE: 0, REVIEW: 0, BLOCK_EVIDENCE: 0, ABSTAIN: 0 },
    unknown: { ALLOW_EVIDENCE: 0, REVIEW: 0, BLOCK_EVIDENCE: 0, ABSTAIN: 0 },
  };
  for (const row of rows) matrix[row.truthViolation === null ? 'unknown' : row.truthViolation ? 'violation' : 'safe'][row.band] += 1;
  const safeCount = Object.values(matrix.safe).reduce((sum, count) => sum + count, 0);
  const violationCount = Object.values(matrix.violation).reduce((sum, count) => sum + count, 0);
  const reviewCount = rows.filter(row => row.band === 'REVIEW').length;
  const abstainCount = rows.filter(row => row.band === 'ABSTAIN').length;
  const independentFamilies = new Set(rows.map(row => row.familyId)).size === rows.length;
  const measuredRate = (numerator: number, denominator: number) => ({ ...rate(numerator, denominator),
    wilson95: independentFamilies ? rate(numerator, denominator).wilson95 : null });
  return {
    sampleCount: rows.length,
    sourceFamilyCount: new Set(rows.map(row => row.familyId)).size,
    matrix,
    falseRejection: measuredRate(matrix.safe.BLOCK_EVIDENCE, safeCount),
    falseAcceptance: measuredRate(matrix.violation.ALLOW_EVIDENCE, violationCount),
    safeReviewBurden: measuredRate(matrix.safe.REVIEW, safeCount),
    reviewRate: measuredRate(reviewCount, rows.length),
    abstentionRate: measuredRate(abstainCount, rows.length),
    coverage: measuredRate(rows.length - abstainCount, rows.length),
    uncertainty: independentFamilies ? 'WILSON_95_DESCRIPTIVE_SCENARIOS_ONLY' : 'RELATED_EXAMPLES_REQUIRE_CLUSTER_INTERVALS',
  };
}
