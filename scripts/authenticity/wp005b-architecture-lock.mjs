import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createCloudflareRestTransport } from '../../packages/authenticity/src/cloudflare-rest.ts';
import {
  classifyVisionAdapterFailure,
  createCloudflareVisionObserverRest,
} from '../../packages/authenticity/src/vision-observer.ts';
import {
  WP005B_CLOUDFLARE_VERIFICATION,
  WP005B_HOLDOUT_CASE_IDS,
  WP005B_JUDGE_CANDIDATE_IDS,
  WP005B_JUDGE_MAX_OUTPUT_TOKENS,
  WP005B_JUDGE_TIMEOUT_MS,
  WP005B_LEDGER_CASE_IDS,
  WP005B_MAX_ESTIMATED_COST_USD,
  WP005B_MAX_ESTIMATED_NEURONS,
  WP005B_MAX_LIVE_REQUESTS,
  WP005B_OBSERVER_CANDIDATE_IDS,
  WP005B_OBSERVER_TIMEOUT_MS,
  WP005B_RESEARCH_DATE,
  WP005B_SCHEMA_VERSION,
  WP005B_SCREENING_CASE_IDS,
  Wp005bBudget,
  buildWp005bNativeMultimodalPayload,
  compileWp005bEvidenceLedger,
  createWp005bJudgeCases,
  evaluateWp005bRouting,
  getWp005bJudgeCandidates,
  getWp005bObserverCandidates,
  runWp005bJudgeAttempt,
  selectWp005bCases,
} from '../../packages/authenticity/src/wp005b.ts';
import {
  scoreWp005aJudgeCase,
  summarizeWp005aJudgeBenchmark,
} from '../../packages/authenticity/src/wp005a.ts';

const WP005A_HISTORICAL_ADAPTER_DIAGNOSIS = {
  sourceRun: 34723558073,
  sourceSha: '6e55aab997ae9081e30806b5140caef353fa2c81',
  exactFailureCodesPersisted: false,
  records: [
    {
      candidate: 'gpt-oss-20b',
      httpClass: '2xx',
      observedEnvelope: 'CHAT_COMPLETION',
      classification: 'UNKNOWN',
      diagnosis: 'WP005A persisted the recognized chat envelope but not the normalization code. WP005B explicitly handles text content blocks, finish reasons, tool calls, JSON extraction, and canonical validation.',
    },
    {
      candidate: 'qwen3-30b-a3b-fp8',
      httpClass: '2xx',
      observedEnvelope: 'RESPONSE_OBJECT',
      classification: 'PROVIDER_ENVELOPE_UNSUPPORTED',
      diagnosis: 'The historical adapter recognized the outer response object but did not safely unwrap an explicitly nested chat-completion object before canonical parsing.',
    },
    {
      candidate: 'llama-3.3-70b-instruct-fp8-fast',
      httpClass: '2xx',
      observedEnvelope: 'RESPONSE_OBJECT',
      classification: 'PROVIDER_ENVELOPE_UNSUPPORTED',
      diagnosis: 'The historical adapter recognized the outer response object but did not safely unwrap an explicitly nested chat-completion object before canonical parsing.',
    },
  ],
  unresolvedHistoricalDetail: 'The protected WP005A artifact intentionally retained only safe envelope metadata and omitted exact normalization codes. Any remaining WP005A failure is therefore classified UNKNOWN until a bounded WP005B response produces a specific safe code.',
};

const args = new Set(process.argv.slice(2));
const allowNetwork = args.has('--allow-network');
const outputArg = process.argv.find((value) => value.startsWith('--output-dir='));
const outputDirectory = path.resolve(outputArg?.slice('--output-dir='.length) ?? '.artifacts/wp005b');
const ARTIFACT_ALLOWLIST = new Set([
  'wp005b-final-result.json',
  'wp005b-call-accounting.json',
  'wp005b-budget-finalizer.json',
  'wp005b-model-ranking.json',
]);

const FALLBACK_PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
let sharpModule;

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function normalized(value) { return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function hasAny(value, terms) { const text = normalized(value); return terms.some((term) => text.includes(term)); }
function httpClass(status) { return status === null || status === undefined ? null : `${Math.floor(status / 100)}xx`; }
function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
function rate(rows, field) { return rows.length === 0 ? null : rows.filter((row) => row.score?.[field] === true).length / rows.length; }
function safeWriteJson(fileName, value) {
  if (!ARTIFACT_ALLOWLIST.has(fileName)) throw new Error(`wp005b_artifact_not_allowlisted:${fileName}`);
  return writeFile(path.join(outputDirectory, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function loadSharp() {
  if (sharpModule !== undefined) return sharpModule;
  try { sharpModule = (await import('sharp')).default; } catch { sharpModule = null; }
  return sharpModule;
}

async function svgPng(svg) {
  const sharp = await loadSharp();
  if (!sharp) return FALLBACK_PNG.slice();
  return new Uint8Array(await sharp(Buffer.from(svg, 'utf8'), { failOn: 'error' }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer());
}

async function observerFixtures() {
  return [
    {
      fixtureId: 'WP005B_COUNT_01', category: 'SCENE_INVENTORY', task: 'query',
      question: 'Count the three visible green circles. Report the count only as a visual observation. Do not infer image origin.',
      scoring: 'COUNT_3', truth: { objectCount: 3 },
      bytes: await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="320"><rect width="512" height="320" fill="#f1efe8"/><circle cx="130" cy="160" r="55" fill="#2e9e58"/><circle cx="256" cy="160" r="55" fill="#2e9e58"/><circle cx="382" cy="160" r="55" fill="#2e9e58"/></svg>'),
    },
    {
      fixtureId: 'WP005B_TEXT_01', category: 'TEXT', task: 'query',
      question: 'Read the exact visible text. Report the text as an observation and do not infer image origin.',
      scoring: 'OCR_LYTHAUS', truth: { text: 'LYTHAUS AUTHENTICITY' },
      bytes: await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240"><rect width="640" height="240" fill="white"/><text x="32" y="132" font-family="Arial" font-size="48" font-weight="700" fill="#161616">LYTHAUS AUTHENTICITY</text></svg>'),
    },
    {
      fixtureId: 'WP005B_GEOMETRY_01', category: 'GEOMETRY_OCCLUSION', task: 'query',
      question: 'Inspect the visible overlap. Report which coloured rectangle appears in front and whether the relationship is visibly consistent. Do not infer image origin.',
      scoring: 'BLUE_FRONT', truth: { front: 'blue', back: 'red' },
      bytes: await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#eeeeea"/><rect x="96" y="176" width="248" height="144" fill="#d92d3f"/><rect x="248" y="232" width="192" height="144" fill="#2f6fdb"/><circle cx="426" cy="104" r="42" fill="#2e9e58"/></svg>'),
    },
    {
      fixtureId: 'WP005B_SCREEN_01', category: 'SCREEN_DISPLAY_RELATIONSHIP', task: 'query',
      question: 'Describe only whether a display-like rectangular frame is visibly present. Do not infer image origin.',
      scoring: 'DISPLAY_PRESENT', truth: { display: true },
      bytes: await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="320"><rect width="512" height="320" fill="#dedbd4"/><rect x="70" y="35" width="372" height="250" rx="12" fill="#20242b"/><rect x="90" y="55" width="332" height="205" fill="#8fc7ed"/><circle cx="256" cy="276" r="4" fill="#777"/></svg>'),
    },
    {
      fixtureId: 'WP005B_REPETITION_01', category: 'REPETITION', task: 'query',
      question: 'Describe the repeated visible arrangement of the four identical squares. Do not infer image origin.',
      scoring: 'REPEATED_SQUARES', truth: { repeated: true, count: 4 },
      bytes: await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="320"><rect width="512" height="320" fill="#f6f5f2"/><g fill="#496fd1"><rect x="70" y="100" width="72" height="72"/><rect x="182" y="100" width="72" height="72"/><rect x="294" y="100" width="72" height="72"/><rect x="406" y="100" width="72" height="72"/></g></svg>'),
    },
  ];
}

function observerScore(fixture, result) {
  const text = result?.observations?.map((item) => item.observation).join(' ') ?? '';
  const canonicalOutputSuccess = result?.status === 'SUCCESS';
  let taskCorrect = false;
  if (fixture.scoring === 'COUNT_3') taskCorrect = /(?:^|\D)(?:3|three)(?:\D|$)/i.test(text);
  if (fixture.scoring === 'OCR_LYTHAUS') taskCorrect = normalized(text).includes('lythaus authenticity');
  if (fixture.scoring === 'BLUE_FRONT') taskCorrect = hasAny(text, ['blue in front', 'blue appears in front', 'blue rectangle is in front', 'blue occludes red']) && hasAny(text, ['consistent', 'overlap', 'occlud']);
  if (fixture.scoring === 'DISPLAY_PRESENT') taskCorrect = hasAny(text, ['display', 'screen', 'monitor', 'rectangular frame']);
  if (fixture.scoring === 'REPEATED_SQUARES') taskCorrect = hasAny(text, ['repeated', 'pattern', 'four squares', 'four identical']);
  const speculativeOriginClaim = hasAny(text, ['ai-generated', 'synthetic probability', 'camera-native', 'authenticity verdict']);
  const indeterminate = result?.observations?.some((item) => item.status === 'INDETERMINATE') ?? false;
  return {
    fixtureId: fixture.fixtureId,
    category: fixture.category,
    status: result?.status ?? 'NOT_RUN',
    taskCorrect,
    countCorrect: fixture.scoring === 'COUNT_3' ? taskCorrect : fixture.scoring === 'REPEATED_SQUARES' ? taskCorrect && /(?:^|\D)4(?:\D|$)|four/i.test(text) : null,
    ocrExact: fixture.scoring === 'OCR_LYTHAUS' ? normalized(text).includes('lythaus authenticity') : null,
    ocrNormalizedError: fixture.scoring === 'OCR_LYTHAUS' ? (taskCorrect ? 0 : 1) : null,
    spatialRelationCorrect: fixture.scoring === 'BLUE_FRONT' ? taskCorrect : null,
    displayDetected: fixture.scoring === 'DISPLAY_PRESENT' ? taskCorrect : null,
    falseAnomaly: speculativeOriginClaim,
    indeterminate,
    structuredOutputReliability: canonicalOutputSuccess,
    repeatabilityKey: normalized(text),
    latencyMs: result?.executionMs ?? null,
  };
}

function safeObserverResult(result) {
  if (!result) return null;
  return result.status === 'SUCCESS'
    ? { status: result.status, queryId: result.queryId, task: result.task, category: result.observations[0]?.category ?? null, reasoningMode: result.reasoningMode, observations: result.observations, escalationRecommendation: result.escalationRecommendation, escalationReasons: result.escalationReasons, executionMs: result.executionMs, responseDiagnostics: result.responseDiagnostics ?? null }
    : { status: result.status, queryId: result.queryId, task: result.task, reasoningMode: result.reasoningMode, executionMs: result.executionMs, errorCategory: result.errorCategory ?? null, httpStatus: result.httpStatus ?? null, responseDiagnostics: result.responseDiagnostics ?? null };
}

function candidateRows(rows, candidate, stage) {
  return rows.filter((row) => row.candidate === candidate && (!stage || row.stage === stage));
}

function judgeCandidateSummary(rows, candidate) {
  const screening = candidateRows(rows, candidate, 'J2_SCREENING');
  const holdout = candidateRows(rows, candidate, 'J3_HOLDOUT');
  const all = [...screening, ...holdout];
  const hardViolations = all.reduce((sum, row) => sum + ['safetyContamination', 'originAxisCollapse', 'falseDirectionalSupport', 'unknownEvidenceReference'].filter((field) => row.score?.[field] === true).length, 0);
  return {
    candidate,
    screeningCases: screening.length,
    holdoutCases: holdout.length,
    canonicalSuccess: `${all.filter((row) => row.record.canonicalSuccess).length}/${all.length}`,
    canonicalSuccessRate: all.length === 0 ? null : all.filter((row) => row.record.canonicalSuccess).length / all.length,
    screenCorrectness: `${screening.filter((row) => row.score?.expectationCorrect).length}/${screening.length}`,
    holdoutCorrectness: `${holdout.filter((row) => row.score?.expectationCorrect).length}/${holdout.length}`,
    epistemicViolations: all.reduce((sum, row) => sum + (row.score?.epistemicPass === false ? 1 : 0), 0),
    hardEpistemicViolations: hardViolations,
    calibratedEvidenceUse: all.filter((row) => row.score?.positiveCalibratedEvidenceUsed).length,
    timeouts: all.filter((row) => row.record.transportErrorCategory === 'TIMEOUT').length,
    providerFailures: all.filter((row) => !row.record.transportCompleted || !row.record.canonicalSuccess).length,
    p50LatencyMs: median(all.map((row) => row.record.latencyMs)),
    maxLatencyMs: all.length === 0 ? null : Math.max(...all.map((row) => row.record.latencyMs)),
    estimatedCostUsd: all.reduce((sum, row) => sum + row.record.estimatedCostUsd, 0),
    screeningSummary: screening.length ? summarizeWp005aJudgeBenchmark(screening.map((row) => row.score)) : null,
    holdoutSummary: holdout.length ? summarizeWp005aJudgeBenchmark(holdout.map((row) => row.score)) : null,
  };
}

function judgeRank(summary) {
  return [
    summary.hardEpistemicViolations,
    summary.epistemicViolations,
    1 - (summary.canonicalSuccessRate ?? 0),
    -(Number(summary.holdoutCorrectness?.split('/')[0] ?? 0)),
    -(summary.calibratedEvidenceUse ?? 0),
    summary.timeouts,
    summary.p50LatencyMs ?? Number.POSITIVE_INFINITY,
    summary.estimatedCostUsd,
  ];
}

function compareRank(a, b) {
  const ar = judgeRank(a);
  const br = judgeRank(b);
  for (let index = 0; index < ar.length; index += 1) if (ar[index] !== br[index]) return ar[index] - br[index];
  return a.candidate.localeCompare(b.candidate);
}

function gateForCase(routing, caseId) {
  return routing.results.find((item) => item.caseId === caseId) ?? null;
}

function llmValueForCandidate(rows, candidate, routing) {
  const relevant = rows.filter((row) => row.candidate === candidate && ['J2_SCREENING', 'J3_HOLDOUT'].includes(row.stage) && row.representation === 'FULL_EVIDENCE_PACKET' && gateForCase(routing, row.caseId)?.route === 'ESCALATE');
  const deterministicCorrect = relevant.filter((row) => row.score.expectedPrimary === 'INSUFFICIENT_EVIDENCE').length;
  const judgeCorrect = relevant.filter((row) => row.score.expectationCorrect).length;
  const fixed = relevant.filter((row) => row.score.expectationCorrect && row.score.expectedPrimary !== 'INSUFFICIENT_EVIDENCE').length;
  const broken = relevant.filter((row) => !row.score.expectationCorrect && row.score.expectedPrimary === 'INSUFFICIENT_EVIDENCE').length;
  return {
    candidate,
    escalatedCases: relevant.length,
    deterministicCorrectOnEscalated: deterministicCorrect,
    judgeCorrectResolutions: judgeCorrect,
    incrementalCorrectCasesVsDeterministic: fixed,
    incrementalErrorsVsDeterministic: broken,
    judgeInducedEpistemicViolations: relevant.reduce((sum, row) => sum + (row.score.epistemicPass ? 0 : 1), 0),
    appropriateAbstentions: relevant.filter((row) => row.score.appropriateAbstention).length,
    additionalLatencyMs: median(relevant.map((row) => row.record.latencyMs)),
    additionalCostUsd: relevant.reduce((sum, row) => sum + row.record.estimatedCostUsd, 0),
  };
}

function representationSummary(rows, candidate, representation) {
  const selected = rows.filter((row) => row.candidate === candidate && row.stage === representationToStage(representation));
  return {
    candidate,
    representation,
    cases: selected.length,
    canonicalSuccess: selected.filter((row) => row.record.canonicalSuccess).length,
    expectationCorrect: selected.filter((row) => row.score.expectationCorrect).length,
    epistemicViolations: selected.filter((row) => row.score.epistemicPass === false).length,
    abstentions: selected.filter((row) => row.score.appropriateAbstention).length,
    inputTokens: selected.length ? Math.round(selected.reduce((sum, row) => sum + row.record.estimatedInputTokens, 0) / selected.length) : null,
    p50LatencyMs: median(selected.map((row) => row.record.latencyMs)),
    estimatedCostUsd: selected.reduce((sum, row) => sum + row.record.estimatedCostUsd, 0),
  };
}

function representationToStage(representation) {
  return representation === 'FULL_EVIDENCE_PACKET' ? 'LEDGER_FULL' : 'LEDGER_COMPACT';
}

function chooseRepresentation(rows, finalists) {
  if (finalists.length === 0) return { decision: 'REPRESENTATION_REMAINS_UNRESOLVED', comparisons: [] };
  const comparisons = finalists.flatMap((candidate) => [representationSummary(rows, candidate.candidate, 'FULL_EVIDENCE_PACKET'), representationSummary(rows, candidate.candidate, 'COMPACT_EVIDENCE_LEDGER')]);
  const compactSafe = finalists.every((candidate) => {
    const full = representationSummary(rows, candidate.candidate, 'FULL_EVIDENCE_PACKET');
    const compact = representationSummary(rows, candidate.candidate, 'COMPACT_EVIDENCE_LEDGER');
    return compact.cases === full.cases
      && compact.canonicalSuccess === full.canonicalSuccess
      && compact.expectationCorrect === full.expectationCorrect
      && compact.epistemicViolations === full.epistemicViolations
      && (compact.inputTokens ?? Number.POSITIVE_INFINITY) < (full.inputTokens ?? Number.POSITIVE_INFINITY);
  });
  return { decision: compactSafe ? 'LOCK_COMPACT_EVIDENCE_LEDGER_TO_JUDGE' : 'LOCK_FULL_EVIDENCE_PACKET_TO_JUDGE', comparisons };
}

function observerSummary(rows, candidate) {
  const selected = rows.filter((row) => row.candidate === candidate);
  return {
    candidate,
    cases: selected.length,
    canonicalSuccess: `${selected.filter((row) => row.record.canonicalSuccess).length}/${selected.length}`,
    canonicalSuccessRate: selected.length ? selected.filter((row) => row.record.canonicalSuccess).length / selected.length : null,
    fixtureCorrectness: `${selected.filter((row) => row.score.taskCorrect).length}/${selected.length}`,
    countCorrect: selected.filter((row) => row.score.countCorrect === true).length,
    ocrExact: selected.filter((row) => row.score.ocrExact === true).length,
    geometryCorrect: selected.filter((row) => row.score.spatialRelationCorrect === true).length,
    displayCorrect: selected.filter((row) => row.score.displayDetected === true).length,
    falseAnomalies: selected.filter((row) => row.score.falseAnomaly).length,
    indeterminate: selected.filter((row) => row.score.indeterminate).length,
    p50LatencyMs: median(selected.map((row) => row.record.latencyMs)),
    maxLatencyMs: selected.length ? Math.max(...selected.map((row) => row.record.latencyMs)) : null,
    estimatedCostUsd: selected.reduce((sum, row) => sum + row.record.estimatedCostUsd, 0),
  };
}

function chooseObserver(rows) {
  const summaries = getWp005bObserverCandidates().map((candidate) => observerSummary(rows, candidate.candidate));
  const valid = summaries.filter((summary) => summary.cases > 0 && summary.canonicalSuccessRate === 1);
  valid.sort((a, b) => (b.fixtureCorrectness.split('/')[0] - a.fixtureCorrectness.split('/')[0]) || (a.falseAnomalies - b.falseAnomalies) || ((a.p50LatencyMs ?? Number.POSITIVE_INFINITY) - (b.p50LatencyMs ?? Number.POSITIVE_INFINITY)) || a.candidate.localeCompare(b.candidate));
  if (valid.length === 0) return { decision: 'OBSERVER_SLOT_REMAINS_UNRESOLVED', summaries };
  const winner = valid[0].candidate === 'moondream3.1-9B-A2B' ? 'LOCK_MOONDREAM_PRIMARY_OBSERVER' : 'LOCK_LLAMA4_SCOUT_PRIMARY_OBSERVER';
  return { decision: winner, summaries };
}

function chooseJudge(rows, finalists) {
  const summaries = finalists.map((candidate) => judgeCandidateSummary(rows, candidate.candidate)).sort(compareRank);
  const lockable = summaries.filter((summary) => summary.screeningCases === 6 && summary.holdoutCases === 6 && summary.canonicalSuccessRate === 1 && summary.hardEpistemicViolations === 0 && summary.epistemicViolations === 0 && summary.holdoutCorrectness === '6/6');
  if (lockable.length === 0) return { decision: 'JUDGE_SLOT_REMAINS_UNRESOLVED', summaries };
  const winner = lockable[0].candidate;
  return {
    decision: winner === 'gpt-oss-20b' ? 'LOCK_GPT_OSS_ESCALATION' : winner === 'qwen3-30b-a3b-fp8' ? 'LOCK_QWEN3_ESCALATION' : 'LOCK_LLAMA33_FAST_ESCALATION',
    summaries,
  };
}

function architectureDecision({ selectiveGateContractConfirmed, judgeDecision, observerDecision, representationDecision, judgeProviderBlocked }) {
  if (!selectiveGateContractConfirmed) return { architectureDecision: 'ARCHITECTURE_REJECTED', classification: 'WP005B_MORE_EVIDENCE_REQUIRED' };
  if (judgeProviderBlocked || judgeDecision === 'JUDGE_SLOT_REMAINS_UNRESOLVED' || observerDecision === 'OBSERVER_SLOT_REMAINS_UNRESOLVED' || representationDecision === 'REPRESENTATION_REMAINS_UNRESOLVED') return { architectureDecision: 'LOCK_LYTHAUS_VNEXT_ARCHITECTURE', classification: 'WP005B_ARCHITECTURE_LOCKED_MODEL_SLOT_UNRESOLVED' };
  return { architectureDecision: 'LOCK_LYTHAUS_VNEXT_ARCHITECTURE', classification: 'WP005B_ARCHITECTURE_AND_MODELS_LOCKED' };
}

function judgeValueDecision(valueRows) {
  const fixed = valueRows.reduce((sum, row) => sum + row.incrementalCorrectCasesVsDeterministic, 0);
  const broken = valueRows.reduce((sum, row) => sum + row.incrementalErrorsVsDeterministic, 0);
  const violations = valueRows.reduce((sum, row) => sum + row.judgeInducedEpistemicViolations, 0);
  if (violations > 0 || broken > fixed) return 'ESCALATION_LLM_HARMFUL_OR_UNRELIABLE';
  if (fixed > 0) return 'ESCALATION_LLM_ADDS_MEASURABLE_VALUE';
  return 'ESCALATION_LLM_VALUE_NOT_DEMONSTRATED';
}

function candidateCallCost(candidate, kind, inputTokens = 3000) {
  const imageTokens = kind === 'OBSERVER' ? 512 : inputTokens;
  const outputTokens = kind === 'OBSERVER' ? 1200 : WP005B_JUDGE_MAX_OUTPUT_TOKENS;
  const estimatedCostUsd = (imageTokens * (candidate.inputPricePerMillionUsd ?? 0.3) + outputTokens * (candidate.outputPricePerMillionUsd ?? 1)) / 1_000_000;
  const estimatedNeurons = Math.ceil((imageTokens * (candidate.inputNeuronsPerMillion ?? 30000) + outputTokens * (candidate.outputNeuronsPerMillion ?? 90000)) / 1_000_000);
  return { estimatedCostUsd, estimatedNeurons };
}

function economics(observerCandidate, judgeCandidate, observerRows, judgeRows) {
  const observedObserverCost = median(observerRows.filter((row) => row.candidate === observerCandidate?.candidate).map((row) => row.record.estimatedCostUsd)) ?? candidateCallCost(observerCandidate, 'OBSERVER').estimatedCostUsd;
  const observedJudgeCost = median(judgeRows.filter((row) => row.candidate === judgeCandidate?.candidate && row.stage === 'J3_HOLDOUT').map((row) => row.record.estimatedCostUsd)) ?? candidateCallCost(judgeCandidate, 'JUDGE').estimatedCostUsd;
  const observerNeurons = median(observerRows.filter((row) => row.candidate === observerCandidate?.candidate).map((row) => row.record.estimatedNeurons)) ?? candidateCallCost(observerCandidate, 'OBSERVER').estimatedNeurons;
  const judgeNeurons = median(judgeRows.filter((row) => row.candidate === judgeCandidate?.candidate && row.stage === 'J3_HOLDOUT').map((row) => row.record.estimatedNeurons)) ?? candidateCallCost(judgeCandidate, 'JUDGE').estimatedNeurons;
  const scenarios = [0.05, 0.10, 0.20].map((escalationRate) => ({
    escalationRate,
    costPerAnalysisUsd: observedObserverCost + (escalationRate * observedJudgeCost),
    costPer1000Usd: (observedObserverCost + (escalationRate * observedJudgeCost)) * 1000,
    costPer100000Usd: (observedObserverCost + (escalationRate * observedJudgeCost)) * 100000,
    neuronsPerAnalysis: observerNeurons + (escalationRate * judgeNeurons),
    approximateFreeAnalysesPerDay: Math.floor(10000 / Math.max(1, observerNeurons + (escalationRate * judgeNeurons))),
  }));
  return { observerCandidate: observerCandidate?.candidate ?? null, judgeCandidate: judgeCandidate?.candidate ?? null, observedOrBudgetEstimatedObserverCostUsd: observedObserverCost, observedOrBudgetEstimatedJudgeCostUsd: observedJudgeCost, freeAllocationNeuronsPerDay: 10000, scenarios };
}

function latency(offline, observerRows, judgeRows, observerCandidate, judgeCandidate) {
  const observer = observerRows.filter((row) => row.candidate === observerCandidate?.candidate);
  const judge = judgeRows.filter((row) => row.candidate === judgeCandidate?.candidate && row.stage === 'J3_HOLDOUT');
  const compiler = offline.compilerLatenciesMs;
  const gate = offline.gateLatenciesMs;
  const fastP50 = (median(compiler) ?? 0) + (median(gate) ?? 0) + (median(observer.map((row) => row.record.latencyMs)) ?? 0);
  const fastMax = (compiler.length ? Math.max(...compiler) : 0) + (gate.length ? Math.max(...gate) : 0) + (observer.length ? Math.max(...observer.map((row) => row.record.latencyMs)) : 0);
  const escalationP50 = fastP50 + (median(judge.map((row) => row.record.latencyMs)) ?? 0);
  const escalationMax = fastMax + (judge.length ? Math.max(...judge.map((row) => row.record.latencyMs)) : 0);
  return { compilerP50Ms: median(compiler), compilerMaxMs: compiler.length ? Math.max(...compiler) : null, gateP50Ms: median(gate), gateMaxMs: gate.length ? Math.max(...gate) : null, observerP50Ms: median(observer.map((row) => row.record.latencyMs)), observerMaxMs: observer.length ? Math.max(...observer.map((row) => row.record.latencyMs)) : null, judgeEscalationP50Ms: median(judge.map((row) => row.record.latencyMs)), judgeEscalationMaxMs: judge.length ? Math.max(...judge.map((row) => row.record.latencyMs)) : null, fastPathP50Ms: fastP50, fastPathMaxMs: fastMax, escalationPathP50Ms: escalationP50, escalationPathMaxMs: escalationMax, timeouts: [...observerRows, ...judgeRows].filter((row) => row.record.transportErrorCategory === 'TIMEOUT').length };
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const cases = createWp005bJudgeCases();
  const screeningCases = selectWp005bCases(cases, WP005B_SCREENING_CASE_IDS);
  const holdoutCases = selectWp005bCases(cases, WP005B_HOLDOUT_CASE_IDS);
  const ledgerCases = selectWp005bCases(cases, WP005B_LEDGER_CASE_IDS);
  const compilerLatenciesMs = [];
  const gateLatenciesMs = [];
  const ledgers = [];
  for (const testCase of cases) {
    const compilerStarted = performance.now();
    const ledger = compileWp005bEvidenceLedger(testCase.packet);
    compilerLatenciesMs.push(performance.now() - compilerStarted);
    ledgers.push({ caseId: testCase.caseId, schemaVersion: ledger.schemaVersion, packetId: ledger.packetId, evidenceCount: ledger.evidence.length, observationCount: ledger.observations.length, missingEvidenceCount: ledger.missingEvidence.length, safetyRole: ledger.safetyContext.role, axesRelationship: ledger.independentOriginAxes.relationship, enforcementAuthority: ledger.enforcementAuthority });
    const gateStarted = performance.now();
    evaluateWp005bRouting([testCase], 'SELECTIVE_RESOLUTION_GATE');
    gateLatenciesMs.push(performance.now() - gateStarted);
  }
  const selectiveRouting = evaluateWp005bRouting(cases, 'SELECTIVE_RESOLUTION_GATE');
  const conservativeRouting = evaluateWp005bRouting(cases, 'CONSERVATIVE_GATE');
  const selectiveGateContractConfirmed = selectiveRouting.resolvedWithoutLlm === 13
    && selectiveRouting.incorrectDeterministicResolutions === 0
    && selectiveRouting.results.filter((item) => item.route === 'ESCALATE').length === 3
    && cases.every((testCase) => compileWp005bEvidenceLedger(testCase.packet).independentOriginAxes.relationship === 'INDEPENDENT_AXES')
    && cases.every((testCase) => testCase.packet.safetyContext.role === 'SAFETY_CONTEXT_ONLY')
    && cases.every((testCase) => testCase.packet.evidence.every((item) => {
      if (!['EF2_PHYSICAL_ACQUISITION', 'EF4_SPECTRAL_STABILITY'].includes(item.family)) return true;
      const ledger = compileWp005bEvidenceLedger(testCase.packet);
      const entry = ledger.evidence.find((candidate) => candidate.evidenceId === item.evidenceId);
      return !entry || entry.validationStatus === 'CALIBRATED_DIRECTIONAL'
        || (entry.directionalRole !== 'SUPPORTS' && entry.directionalRole !== 'CONTRADICTS');
    }))
    && selectiveRouting.results
      .filter((item) => item.reasonCodes.includes('MULTIPLE_OR_CONFLICTING_HYPOTHESES') || item.reasonCodes.includes('VALIDATED_DIRECTIONAL_EVIDENCE_REQUIRES_ESCALATION'))
      .every((item) => item.route === 'ESCALATE')
    && cases.filter((testCase) => ['safety-block', 'safety-allow'].includes(testCase.caseId))
      .every((testCase) => gateForCase(selectiveRouting, testCase.caseId)?.route === 'DETERMINISTIC'
        && gateForCase(selectiveRouting, testCase.caseId)?.primaryHypothesis === 'INSUFFICIENT_EVIDENCE');

  const credentialsPresent = Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim() && process.env.CLOUDFLARE_ACCOUNT_ID?.trim());
  const transport = allowNetwork && credentialsPresent
    ? createCloudflareRestTransport({ apiToken: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, allowNetwork: true, maxRequests: WP005B_MAX_LIVE_REQUESTS, timeoutMs: WP005B_JUDGE_TIMEOUT_MS })
    : null;
  const budget = new Wp005bBudget();
  let budgetStopReason = null;
  const judgeRows = [];
  const judgeCallRecords = [];
  const observerRows = [];
  const observerCallRecords = [];
  const smokeRows = [];

  async function judgeAttempt(candidate, stage, testCase, representation = 'FULL_EVIDENCE_PACKET') {
    if (!transport || budgetStopReason) return null;
    try {
      const attempt = await runWp005bJudgeAttempt({ candidate, stage, caseId: testCase.caseId, packet: testCase.packet, representation, transport, budget });
      judgeCallRecords.push(attempt.record);
      const score = scoreWp005aJudgeCase(testCase, attempt.recommendation);
      const row = { candidate: candidate.candidate, model: candidate.model, stage, representation, caseId: testCase.caseId, recommendation: attempt.recommendation, score, record: attempt.record };
      judgeRows.push(row);
      return row;
    } catch (error) {
      if (String(error?.message ?? '').startsWith('wp005a_budget_')) { budgetStopReason = String(error.message); return null; }
      throw error;
    }
  }

  const judgeCandidates = getWp005bJudgeCandidates();
  const smokeQualified = [];
  if (transport) {
    for (const candidate of judgeCandidates) {
      const row = await judgeAttempt(candidate, 'J1_CAPABILITY_SMOKE', cases[0]);
      smokeRows.push({ candidate: candidate.candidate, canonicalSuccess: Boolean(row?.record.canonicalSuccess), transportCompleted: Boolean(row?.record.transportCompleted), adapterFailureClass: row?.record.adapterFailureClass ?? null, normalizationFailureCode: row?.record.normalizationFailureCode ?? null });
      if (row?.record.canonicalSuccess) smokeQualified.push(candidate);
    }
  }
  const judgeProviderBlocked = Boolean(transport && smokeQualified.length === 0 && smokeRows.length === judgeCandidates.length && smokeRows.every((row) => row.adapterFailureClass || !row.transportCompleted));
  if (transport && smokeQualified.length > 0 && !budgetStopReason) {
    for (const testCase of screeningCases) for (const candidate of smokeQualified) await judgeAttempt(candidate, 'J2_SCREENING', testCase);
  }
  const screeningSummaries = smokeQualified.map((candidate) => judgeCandidateSummary(judgeRows, candidate.candidate)).sort(compareRank);
  const finalists = screeningSummaries.slice(0, 2).map((summary) => judgeCandidates.find((candidate) => candidate.candidate === summary.candidate)).filter(Boolean);
  if (transport && finalists.length > 0 && !budgetStopReason) {
    for (const testCase of holdoutCases) for (const candidate of finalists) await judgeAttempt(candidate, 'J3_HOLDOUT', testCase);
    for (const testCase of ledgerCases) for (const candidate of finalists) {
      await judgeAttempt(candidate, 'LEDGER_FULL', testCase, 'FULL_EVIDENCE_PACKET');
      await judgeAttempt(candidate, 'LEDGER_COMPACT', testCase, 'COMPACT_EVIDENCE_LEDGER');
    }
  }

  const fixtures = await observerFixtures();
  const observerCandidates = getWp005bObserverCandidates();
  if (transport && !budgetStopReason) {
    for (const candidate of observerCandidates) {
      let structuralFailures = 0;
      for (const fixture of fixtures) {
        if (budgetStopReason) break;
        let reservation;
        try {
          reservation = budget.reserve(candidate, { kind: 'OBSERVER', imageBytes: fixture.bytes.byteLength, maxOutputTokens: 1200 });
        } catch (error) {
          if (String(error?.message ?? '').startsWith('wp005a_budget_')) { budgetStopReason = String(error.message); break; }
          throw error;
        }
        const observer = createCloudflareVisionObserverRest({
          transport,
          model: candidate.model,
          timeoutMs: WP005B_OBSERVER_TIMEOUT_MS,
          payloadBuilder: candidate.candidate === 'moondream3.1-9B-A2B' ? undefined : buildWp005bNativeMultimodalPayload,
        });
        const startedAt = Date.now();
        const result = await observer.observe({ sampleId: fixture.fixtureId, inputHash: sha256(fixture.bytes), mime: 'image/png', bytes: fixture.bytes, request: { queryId: `${fixture.fixtureId}_DIRECT`, category: fixture.category, task: fixture.task, question: fixture.question, reasoningMode: 'DIRECT', regionPolicy: 'CANONICAL' } });
        const canonicalSuccess = result.status === 'SUCCESS';
        const normalizationCode = result.responseDiagnostics?.normalizationFailureCode ?? null;
        const record = {
          candidate: candidate.candidate,
          stage: 'OBSERVER_SCREENING',
          caseId: fixture.fixtureId,
          sequence: reservation.sequence,
          model: candidate.model,
          attempted: true,
          transportCompleted: result.httpStatus !== undefined && result.httpStatus !== null,
          httpClass: httpClass(result.httpStatus),
          latencyMs: Date.now() - startedAt,
          envelopeClass: result.responseDiagnostics?.responseEnvelopeClassification ?? result.responseDiagnostics?.providerResultType ?? null,
          canonicalSuccess,
          failureStage: canonicalSuccess ? null : (result.errorCategory === 'UNEXPECTED_SCHEMA' || result.errorCategory === 'MALFORMED_RESPONSE' ? 'NORMALIZATION' : 'TRANSPORT'),
          usage: null,
          reasoningMode: 'DISABLED',
          retryCount: 0,
          estimatedNeurons: reservation.estimatedNeurons,
          estimatedCostUsd: reservation.estimatedCostUsd,
          normalizationFailureCode: normalizationCode,
          adapterFailureClass: classifyVisionAdapterFailure(normalizationCode),
          transportErrorCategory: result.transportErrorCategory ?? null,
          responseDiagnostics: result.responseDiagnostics ?? null,
        };
        observerCallRecords.push(record);
        observerRows.push({ candidate: candidate.candidate, model: candidate.model, fixtureId: fixture.fixtureId, result: safeObserverResult(result), score: observerScore(fixture, result), record });
        if (!canonicalSuccess && result.errorCategory === 'UNEXPECTED_SCHEMA') structuralFailures += 1;
        else structuralFailures = 0;
        if (structuralFailures >= 2) break;
      }
    }
  }

  const judgeDecision = chooseJudge(judgeRows, finalists);
  const representation = chooseRepresentation(judgeRows, finalists);
  const observerDecision = chooseObserver(observerRows);
  const valueRows = finalists.map((candidate) => llmValueForCandidate(judgeRows, candidate.candidate, selectiveRouting));
  const llmValueDecision = judgeValueDecision(valueRows);
  const architecture = architectureDecision({ selectiveGateContractConfirmed, judgeDecision: judgeDecision.decision, observerDecision: observerDecision.decision, representationDecision: representation.decision, judgeProviderBlocked });
  const selectedObserver = observerDecision.summaries.find((summary) => summary.candidate === 'moondream3.1-9B-A2B' && observerDecision.decision === 'LOCK_MOONDREAM_PRIMARY_OBSERVER') ?? observerDecision.summaries.find((summary) => summary.candidate === 'llama-4-scout-17b-16e-instruct' && observerDecision.decision === 'LOCK_LLAMA4_SCOUT_PRIMARY_OBSERVER') ?? observerDecision.summaries.find((summary) => summary.cases > 0) ?? null;
  const selectedJudge = judgeDecision.summaries.find((summary) => summary.candidate === (judgeDecision.summaries[0]?.candidate ?? null)) ?? null;
  const selectedObserverCandidate = observerCandidates.find((candidate) => candidate.candidate === selectedObserver?.candidate) ?? observerCandidates[0];
  const selectedJudgeCandidate = judgeCandidates.find((candidate) => candidate.candidate === selectedJudge?.candidate) ?? judgeCandidates[0];
  const latencySummary = latency({ compilerLatenciesMs, gateLatenciesMs }, observerCallRecords.map((record) => ({ ...record, candidate: record.candidate })), judgeCallRecords.map((record) => ({ ...record, stage: record.stage })), selectedObserverCandidate, selectedJudgeCandidate);
  const economicsSummary = economics(selectedObserverCandidate, selectedJudgeCandidate, observerCallRecords, judgeCallRecords);
  const calls = [...judgeCallRecords, ...observerCallRecords].sort((a, b) => a.sequence - b.sequence);
  const budgetSnapshot = budget.snapshot();
  const liveStatus = !allowNetwork ? 'NOT_RUN_NETWORK_FLAG_ABSENT' : !credentialsPresent ? 'BLOCKED_MISSING_CREDENTIAL' : budgetStopReason ? 'STOPPED_AT_HARD_CAP' : 'COMPLETED_BOUNDED_LIVE_RUN';
  const judgeRanking = judgeDecision.summaries;
  const observerRanking = observerDecision.summaries;
  const finalResult = {
    schemaVersion: WP005B_SCHEMA_VERSION,
    researchDate: WP005B_RESEARCH_DATE,
    startingMainSha: '58f84ab15cd27334b636fae45163db488418f563',
    liveStatus,
    architecture: {
      architecture: architecture.architectureDecision,
      classification: architecture.classification,
      selectiveGateContractConfirmed,
      flow: ['Safety', 'Deterministic EF1/EF2/EF4', 'Vision Observer', 'Evidence Packet v1', 'Epistemic Compiler / Evidence Ledger v1', 'Selective Resolution Gate', 'Deterministic bounded result OR optional Adjudicator', 'Canonical validation', 'Epistemic evaluator', 'Deterministic product policy'],
      productionChanged: false,
      enforcementEnabled: false,
    },
    forcedDecisions: {
      architectureDecision: architecture.architectureDecision,
      judgeDecision: judgeDecision.decision,
      observerDecision: observerDecision.decision,
      representationDecision: representation.decision,
      llmValueDecision,
    },
    routing: {
      cases: 16,
      selective: selectiveRouting,
      conservative: conservativeRouting,
      compilerLatenciesMs,
      gateLatenciesMs,
      routingFixtureCoverageNote: 'Routing-fixture coverage is not production traffic coverage.',
    },
    ledger: { schemaVersion: 'lythaus-evidence-ledger-v1', cases: ledgers, noOracleFields: true, packetVersionPreserved: true },
    historicalAdapterDiagnosis: WP005A_HISTORICAL_ADAPTER_DIAGNOSIS,
    judge: {
      finalists: WP005B_JUDGE_CANDIDATE_IDS,
      screeningCaseIds: WP005B_SCREENING_CASE_IDS,
      holdoutCaseIds: WP005B_HOLDOUT_CASE_IDS,
      ledgerCaseIds: WP005B_LEDGER_CASE_IDS,
      smoke: smokeRows,
      screeningCandidates: smokeQualified.map((candidate) => candidate.candidate),
      finalistsAdvanced: finalists.map((candidate) => candidate.candidate),
      ranking: judgeRanking,
      llmValue: valueRows,
      llmValueDecision,
      providerBlocked: judgeProviderBlocked,
    },
    observer: {
      finalists: WP005B_OBSERVER_CANDIDATE_IDS,
      fixtureIds: fixtures.map((fixture) => fixture.fixtureId),
      ranking: observerRanking,
    },
    representation,
    latency: latencySummary,
    economics: economicsSummary,
    hardCaps: { requests: WP005B_MAX_LIVE_REQUESTS, estimatedNeurons: WP005B_MAX_ESTIMATED_NEURONS, estimatedCostUsd: WP005B_MAX_ESTIMATED_COST_USD, retries: 0, judgeTimeoutMs: WP005B_JUDGE_TIMEOUT_MS, observerTimeoutMs: WP005B_OBSERVER_TIMEOUT_MS },
    budget: budgetSnapshot,
    providerSnapshot: transport?.snapshot() ?? null,
    validity: { judgeBenchmark: judgeRows.length > 0 ? (judgeDecision.decision === 'JUDGE_SLOT_REMAINS_UNRESOLVED' ? 'JUDGE_BENCHMARK_VALID_WITHOUT_LOCK' : 'JUDGE_BENCHMARK_VALID') : 'JUDGE_BENCHMARK_NOT_RUN', observerBenchmark: observerRows.length > 0 ? 'OBSERVER_BENCHMARK_VALID' : 'OBSERVER_BENCHMARK_NOT_RUN', endToEnd: 'END_TO_END_ACCURACY_UNRESOLVED' },
    researchDebt: ['No rights-cleared natural-image end-to-end truth set was introduced in WP005B.', 'The Judge sample is bounded to 6 screening and 6 holdout fixtures per finalist.', 'The Observer controlled fixtures measure protocol/task fit, not natural-image authenticity performance.', 'EF2, EF3, and EF5 detector calibration remain unresolved.', 'A current Cloudflare page documents Llama 4 Scout Vision but not a dedicated image-field REST example; its explicit adapter remains research-scoped.'],
  };
  const rankingArtifact = { schemaVersion: WP005B_SCHEMA_VERSION, researchDate: WP005B_RESEARCH_DATE, cloudflareVerification: WP005B_CLOUDFLARE_VERIFICATION, judgeRanking, observerRanking, decisions: finalResult.forcedDecisions };
  const accountingArtifact = { schemaVersion: WP005B_SCHEMA_VERSION, researchDate: WP005B_RESEARCH_DATE, calls, totalCalls: calls.length, retryCount: 0, rawProviderBodiesPersisted: false, rawReasoningPersisted: false, imageBase64Persisted: false, budgetStopReason, judgeProviderBlocked };
  const budgetArtifact = { schemaVersion: WP005B_SCHEMA_VERSION, researchDate: WP005B_RESEARCH_DATE, hardCaps: finalResult.hardCaps, budget: budgetSnapshot, budgetStopReason, transportCalls: transport?.snapshot().calls ?? 0, capRespected: budgetSnapshot.reservedRequests <= WP005B_MAX_LIVE_REQUESTS && budgetSnapshot.reservedEstimatedNeurons <= WP005B_MAX_ESTIMATED_NEURONS && budgetSnapshot.reservedEstimatedCostUsd <= WP005B_MAX_ESTIMATED_COST_USD };
  await safeWriteJson('wp005b-final-result.json', finalResult);
  await safeWriteJson('wp005b-call-accounting.json', accountingArtifact);
  await safeWriteJson('wp005b-budget-finalizer.json', budgetArtifact);
  await safeWriteJson('wp005b-model-ranking.json', rankingArtifact);
  console.log(JSON.stringify({ schemaVersion: WP005B_SCHEMA_VERSION, researchDate: WP005B_RESEARCH_DATE, liveStatus, calls: calls.length, budget: budgetSnapshot, judgeDecision: finalResult.forcedDecisions.judgeDecision, observerDecision: finalResult.forcedDecisions.observerDecision, representationDecision: finalResult.forcedDecisions.representationDecision, llmValueDecision: finalResult.forcedDecisions.llmValueDecision, classification: architecture.classification }, null, 2));
}

await main();
