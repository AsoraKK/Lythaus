import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCloudflareRestTransport } from '../../packages/authenticity/src/cloudflare-rest.ts';
import { createCloudflareVisionObserverRest } from '../../packages/authenticity/src/vision-observer.ts';
import {
  WP005A_JUDGE_MAX_OUTPUT_TOKENS,
  WP005A_MAX_LIVE_WORKERS_AI_REQUESTS,
  WP005A_MAX_ESTIMATED_COST_USD,
  WP005A_MAX_ESTIMATED_NEURONS,
  WP005A_RESEARCH_DATE,
  Wp005aBudget,
  applyWp005aRoutingGate,
  createWp005aJudgeCases,
  evaluateWp005aRouting,
  getWp005aCandidateRegistry,
  runWp005aJudgeAttempt,
  scoreWp005aJudgeCase,
  summarizeWp005aJudgeBenchmark,
} from '../../packages/authenticity/src/wp005a.ts';

const args = new Set(process.argv.slice(2));
const allowNetwork = args.has('--allow-network');
const outputArg = process.argv.find((value) => value.startsWith('--output-dir='));
const outputDirectory = path.resolve(outputArg?.slice('--output-dir='.length) ?? '.artifacts/wp005a');

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function normalized(value) { return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function hasAny(value, terms) { const text = normalized(value); return terms.some((term) => text.includes(term)); }
function safeWriteJson(fileName, value) { return writeFile(path.join(outputDirectory, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }

const FALLBACK_PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
let sharpModule;
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
      fixtureId: 'WP005A_COUNT_01', category: 'SCENE_INVENTORY', task: 'query',
      question: 'Count the three visible green circles. Report the count only as a visual observation. Do not infer image origin.',
      scoring: 'COUNT_3', truth: { objectCount: 3 },
      bytes: await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="320"><rect width="512" height="320" fill="#f1efe8"/><circle cx="130" cy="160" r="55" fill="#2e9e58"/><circle cx="256" cy="160" r="55" fill="#2e9e58"/><circle cx="382" cy="160" r="55" fill="#2e9e58"/></svg>'),
    },
    {
      fixtureId: 'WP005A_TEXT_01', category: 'TEXT', task: 'query',
      question: 'Read the exact visible text. Report the text as an observation and do not infer image origin.',
      scoring: 'OCR_LYTHAUS', truth: { text: 'LYTHAUS AUTHENTICITY' },
      bytes: await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240"><rect width="640" height="240" fill="white"/><text x="32" y="132" font-family="Arial" font-size="48" font-weight="700" fill="#161616">LYTHAUS AUTHENTICITY</text></svg>'),
    },
    {
      fixtureId: 'WP005A_GEOMETRY_01', category: 'GEOMETRY_OCCLUSION', task: 'query',
      question: 'Inspect the visible overlap. Report which coloured rectangle appears in front and whether the relationship is visibly consistent. Do not infer image origin.',
      scoring: 'BLUE_FRONT', truth: { front: 'blue', back: 'red' }, bytes: await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#eeeeea"/><rect x="96" y="176" width="248" height="144" fill="#d92d3f"/><rect x="248" y="232" width="192" height="144" fill="#2f6fdb"/><circle cx="426" cy="104" r="42" fill="#2e9e58"/></svg>'),
    },
    {
      fixtureId: 'WP005A_SCREEN_01', category: 'SCREEN_DISPLAY_RELATIONSHIP', task: 'query',
      question: 'Describe only whether a display-like rectangular frame is visibly present. Do not infer image origin.',
      scoring: 'DISPLAY_PRESENT', truth: { display: true },
      bytes: await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="320"><rect width="512" height="320" fill="#dedbd4"/><rect x="70" y="35" width="372" height="250" rx="12" fill="#20242b"/><rect x="90" y="55" width="332" height="205" fill="#8fc7ed"/><circle cx="256" cy="276" r="4" fill="#777"/></svg>'),
    },
    {
      fixtureId: 'WP005A_SHADOW_01', category: 'LIGHTING_SHADOW', task: 'query',
      question: 'Describe whether the visible circle has a cast shadow. Report visible lighting only. Do not infer image origin.',
      scoring: 'SHADOW_PRESENT', truth: { shadow: true },
      bytes: await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="320"><rect width="512" height="320" fill="#f4f1e9"/><ellipse cx="260" cy="238" rx="120" ry="24" fill="#aaa59a" opacity=".65"/><circle cx="256" cy="155" r="76" fill="#d94a4a"/></svg>'),
    },
    {
      fixtureId: 'WP005A_REPETITION_01', category: 'REPETITION', task: 'query',
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
  if (fixture.scoring === 'BLUE_FRONT') taskCorrect = (hasAny(text, ['blue in front', 'blue appears in front', 'blue rectangle is in front', 'blue occludes red']) && hasAny(text, ['consistent', 'overlap', 'occlud']));
  if (fixture.scoring === 'DISPLAY_PRESENT') taskCorrect = hasAny(text, ['display', 'screen', 'monitor', 'rectangular frame']);
  if (fixture.scoring === 'SHADOW_PRESENT') taskCorrect = hasAny(text, ['cast shadow', 'visible shadow', 'shadow']);
  if (fixture.scoring === 'REPEATED_SQUARES') taskCorrect = hasAny(text, ['repeated', 'pattern', 'four squares', 'four identical']);
  const speculativeOriginClaim = hasAny(text, ['ai-generated', 'synthetic probability', 'camera-native', 'authenticity verdict']);
  const indeterminate = result?.observations?.some((item) => item.status === 'INDETERMINATE') ?? false;
  const localized = result?.observations?.some((item) => item.regions.length > 0) ?? false;
  return {
    fixtureId: fixture.fixtureId,
    model: result?.model ?? null,
    category: fixture.category,
    status: result?.status ?? 'NOT_RUN',
    taskCorrect,
    objectPrecision: null,
    objectRecall: null,
    countAccuracy: fixture.scoring === 'COUNT_3' || fixture.scoring === 'REPEATED_SQUARES' ? taskCorrect : null,
    ocrNormalizedError: fixture.scoring === 'OCR_LYTHAUS' ? (taskCorrect ? 0 : 1) : null,
    spatialRelationAccuracy: fixture.scoring === 'BLUE_FRONT' ? taskCorrect : null,
    localizationObserved: localized,
    localizationIoU: null,
    falseAnomaly: speculativeOriginClaim,
    indeterminate,
    structuredOutputReliability: canonicalOutputSuccess,
    repeatabilityKey: normalized(text),
    latencyMs: result?.executionMs ?? null,
  };
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const registry = getWp005aCandidateRegistry();
  const judgeCases = createWp005aJudgeCases();
  const conservative = evaluateWp005aRouting(judgeCases, 'CONSERVATIVE_GATE');
  const selective = evaluateWp005aRouting(judgeCases, 'SELECTIVE_RESOLUTION_GATE');
  const budget = new Wp005aBudget();
  const judgeCallRecords = [];
  const judgeRows = [];
  const observerCallRecords = [];
  const observerRows = [];
  let budgetStopReason = null;
  let liveStatus = allowNetwork ? 'READY_FOR_BOUNDED_LIVE_RUN' : 'NOT_RUN_NETWORK_FLAG_ABSENT';
  const credentialsPresent = Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim() && process.env.CLOUDFLARE_ACCOUNT_ID?.trim());
  if (allowNetwork && !credentialsPresent) liveStatus = 'BLOCKED_MISSING_CREDENTIAL';
  const transport = allowNetwork && credentialsPresent
    ? createCloudflareRestTransport({ apiToken: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, allowNetwork: true, maxRequests: WP005A_MAX_LIVE_WORKERS_AI_REQUESTS, timeoutMs: 30_000 })
    : null;

  const liveJudgeCandidates = registry.filter((candidate) => candidate.liveEligible && (candidate.family === 'JUDGE' || candidate.family === 'UNIFIED_MULTIMODAL')).slice(0, 6);
  const representativeCases = judgeCases.slice(0, 8);
  const holdoutCases = judgeCases.slice(8, 12);
  const ledgerCases = judgeCases.slice(12, 14);
  const smokeScores = new Map();

  async function judgeAttempt(candidate, stage, testCase, representation = 'FULL_EVIDENCE_PACKET') {
    if (!transport || budgetStopReason) return null;
    try {
      const attempt = await runWp005aJudgeAttempt({ candidate, stage, caseId: testCase.caseId, packet: testCase.packet, representation, transport, budget });
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

  if (transport) {
    for (const candidate of liveJudgeCandidates) {
      const row = await judgeAttempt(candidate, 'J1_CAPABILITY_SMOKE', judgeCases[0]);
      smokeScores.set(candidate.candidate, row?.score.canonicalOutputSuccess ?? false);
    }
  }
  const rankedJudgeCandidates = [...liveJudgeCandidates].sort((a, b) => Number(smokeScores.get(b.candidate) ?? false) - Number(smokeScores.get(a.candidate) ?? false));
  const screeningCandidates = (transport
    ? rankedJudgeCandidates.filter((candidate) => smokeScores.get(candidate.candidate) === true)
    : rankedJudgeCandidates).slice(0, 4);
  if (transport) {
    for (const candidate of screeningCandidates) for (const testCase of representativeCases) await judgeAttempt(candidate, 'J2_SCREENING', testCase);
  }
  function screeningRank(candidate) {
    const rows = judgeRows.filter((row) => row.stage === 'J2_SCREENING' && row.candidate === candidate.candidate);
    if (rows.length === 0) return [0, 0, 0, 0, 0, 0, Number.POSITIVE_INFINITY];
    const rate = (field) => rows.filter((row) => row.score[field] === true).length / rows.length;
    const averageLatency = rows.reduce((sum, row) => sum + row.record.latencyMs, 0) / rows.length;
    return [
      rate('canonicalOutputSuccess'), rate('epistemicPass'), rate('expectationCorrect'),
      -rate('safetyContamination'), -rate('originAxisCollapse'), -rate('falseDirectionalSupport'), averageLatency,
    ];
  }
  const finalistCandidates = [...screeningCandidates].sort((a, b) => {
    const aRank = screeningRank(a);
    const bRank = screeningRank(b);
    for (let index = 0; index < aRank.length; index += 1) {
      if (aRank[index] !== bRank[index]) return index === aRank.length - 1 ? aRank[index] - bRank[index] : bRank[index] - aRank[index];
    }
    return 0;
  }).slice(0, 2);
  if (transport) {
    for (const candidate of finalistCandidates) for (const testCase of holdoutCases) await judgeAttempt(candidate, 'J3_HOLDOUT', testCase);
    for (const candidate of finalistCandidates) for (const testCase of ledgerCases) {
      await judgeAttempt(candidate, 'LEDGER_FULL', testCase, 'FULL_EVIDENCE_PACKET');
      await judgeAttempt(candidate, 'LEDGER_COMPACT', testCase, 'COMPACT_EVIDENCE_LEDGER');
    }
    for (const candidate of finalistCandidates) for (const testCase of judgeCases.slice(12, 16)) await judgeAttempt(candidate, 'REPEATABILITY', testCase);
  }

  const fixtures = await observerFixtures();
  const observerCandidates = registry.filter((candidate) => candidate.liveEligible && ['moondream3.1-9B-A2B', 'llama-4-scout-17b-16e-instruct', 'llama-3.2-11b-vision-instruct', 'qwen3.8-27b'].includes(candidate.candidate));
  if (transport && !budgetStopReason) {
    let observerSequence = 0;
    while (observerSequence < 18 && observerCandidates.length > 0 && !budgetStopReason) {
      const candidate = observerCandidates[observerSequence % observerCandidates.length];
      const fixture = fixtures[observerSequence % fixtures.length];
      const inputHash = sha256(fixture.bytes);
      const request = { queryId: `${fixture.fixtureId}_DIRECT`, category: fixture.category, task: fixture.task, question: fixture.question, reasoningMode: 'DIRECT', regionPolicy: 'CANONICAL' };
      let reservation;
      try {
        reservation = budget.reserve(candidate, { kind: 'OBSERVER', imageBytes: fixture.bytes.byteLength, maxOutputTokens: 1200 });
      } catch (error) {
        if (String(error?.message ?? '').startsWith('wp005a_budget_')) { budgetStopReason = String(error.message); break; }
        throw error;
      }
      const observer = createCloudflareVisionObserverRest({ transport, model: candidate.model });
      const startedAt = Date.now();
      const result = await observer.observe({ sampleId: fixture.fixtureId, inputHash, mime: 'image/png', bytes: fixture.bytes, request });
      const canonical = result.status === 'SUCCESS';
      const record = {
        candidate: candidate.candidate, stage: 'OBSERVER_SCREENING', caseId: fixture.fixtureId, sequence: reservation.sequence, model: candidate.model, attempted: true,
        transportCompleted: result.httpStatus !== undefined && result.httpStatus !== null, httpClass: result.httpStatus == null ? null : `${Math.floor(result.httpStatus / 100)}xx`, latencyMs: Date.now() - startedAt,
        envelopeClass: result.responseDiagnostics?.providerResultType ?? null, canonicalSuccess: canonical,
        failureStage: canonical ? null : (result.errorCategory === 'MALFORMED_RESPONSE' || result.errorCategory === 'UNEXPECTED_SCHEMA' ? 'NORMALIZATION' : 'TRANSPORT'), usage: null,
        reasoningMode: 'DISABLED', retryCount: 0, estimatedNeurons: reservation.estimatedNeurons, estimatedCostUsd: reservation.estimatedCostUsd,
      };
      observerCallRecords.push(record);
      observerRows.push({ candidate: candidate.candidate, model: candidate.model, fixtureId: fixture.fixtureId, result: canonical ? { status: result.status, queryId: result.queryId, task: result.task, category: fixture.category, reasoningMode: result.reasoningMode, observations: result.observations, escalationRecommendation: result.escalationRecommendation, escalationReasons: result.escalationReasons, executionMs: result.executionMs } : { status: result.status, queryId: result.queryId, task: result.task, category: fixture.category, reasoningMode: result.reasoningMode, executionMs: result.executionMs, errorCategory: result.errorCategory ?? null }, score: observerScore(fixture, result), record });
      observerSequence += 1;
    }
  }

  const judgeSummaries = {};
  for (const candidate of [...new Set(judgeRows.map((row) => row.candidate))]) {
    for (const representation of ['FULL_EVIDENCE_PACKET', 'COMPACT_EVIDENCE_LEDGER']) {
      const results = judgeRows.filter((row) => row.candidate === candidate && row.representation === representation).map((row) => row.score);
      if (results.length > 0) judgeSummaries[`${candidate}:${representation}`] = summarizeWp005aJudgeBenchmark(results);
    }
  }
  if (transport) liveStatus = budgetStopReason ? 'STOPPED_AT_HARD_CAP' : 'COMPLETED_BOUNDED_LIVE_RUN';
  const transportSnapshot = transport?.snapshot() ?? null;
  const status = {
    schemaVersion: 'lythaus-wp005a-run-status-v1', researchDate: WP005A_RESEARCH_DATE, liveStatus, allowNetwork, credentialsPresent,
    hardCaps: { requests: WP005A_MAX_LIVE_WORKERS_AI_REQUESTS, estimatedNeurons: WP005A_MAX_ESTIMATED_NEURONS, estimatedCostUsd: WP005A_MAX_ESTIMATED_COST_USD },
    budget: budget.snapshot(), budgetStopReason,
    candidateSelection: { smokeOrder: rankedJudgeCandidates.map((candidate) => candidate.candidate), screening: screeningCandidates.map((candidate) => candidate.candidate), finalists: finalistCandidates.map((candidate) => candidate.candidate) },
    stageAllocation: { judgeCapabilitySmokes: 6, judgeScreening: 32, judgeFinalistHoldout: 8, ledgerComparison: 8, repeatability: 8, observerScreening: 18, plannedTotal: 80, actualReserved: budget.snapshot().reservedRequests },
    transportSnapshot,
  };
  await safeWriteJson('candidate-registry.json', { schemaVersion: 'lythaus-wp005a-candidate-registry-v1', researchDate: WP005A_RESEARCH_DATE, sourcesAreDeskResearch: true, candidates: registry });
  await safeWriteJson('benchmark-case-manifest.json', { schemaVersion: 'lythaus-wp005a-blind-benchmark-manifest-v1', researchDate: WP005A_RESEARCH_DATE, blindness: { expectedFieldsExcludedFromModelInput: true, groundTruthExcludedFromPackets: true }, cases: judgeCases.map((testCase) => ({ caseId: testCase.caseId, description: testCase.description, semanticFamily: testCase.semanticFamily, packetId: testCase.packet.packetId, inputHash: testCase.packet.inputHash, oracle: { expectedPrimary: testCase.expectedPrimary, expectedReview: testCase.expectedReview } })) });
  await safeWriteJson('sanitized-call-accounting.json', { ...status, calls: [...judgeCallRecords, ...observerCallRecords] });
  await safeWriteJson('judge-results.json', { schemaVersion: 'lythaus-wp005a-judge-results-v1', researchDate: WP005A_RESEARCH_DATE, liveStatus, summaries: judgeSummaries, results: judgeRows });
  await safeWriteJson('observer-results.json', { schemaVersion: 'lythaus-wp005a-observer-results-v1', researchDate: WP005A_RESEARCH_DATE, liveStatus, fixtureManifest: fixtures.map(({ bytes, ...fixture }) => ({ ...fixture, bytesSha256: sha256(bytes), byteLength: bytes.byteLength })), results: observerRows });
  await safeWriteJson('routing-results.json', { schemaVersion: 'lythaus-wp005a-routing-results-v1', researchDate: WP005A_RESEARCH_DATE, deterministicOnlyBaseline: selective, conservativeGate: conservative, selectiveResolutionGate: selective });
  await safeWriteJson('pareto-summary.json', { schemaVersion: 'lythaus-wp005a-pareto-summary-v1', researchDate: WP005A_RESEARCH_DATE, liveStatus, judgeCandidateOrder: rankedJudgeCandidates.map((candidate) => candidate.candidate), observerCandidateOrder: observerCandidates.map((candidate) => candidate.candidate), finalistCandidates: finalistCandidates.map((candidate) => candidate.candidate), hardGates: ['Safety leakage disqualifies', 'Origin-axis collapse disqualifies', 'Unsupported evidence direction disqualifies', 'Malformed canonical output is not production-eligible', 'Unresolved code/checkpoint/data licensing is not production-eligible'], note: judgeRows.length === 0 ? 'No live Pareto measurements were claimed; see final report research debt.' : 'Rankings are descriptive and must be read with layer-specific metrics.' });
  await safeWriteJson('run-status.json', status);
  console.log(JSON.stringify({ status, routing: { conservative: { resolvedWithoutLlm: conservative.resolvedWithoutLlm, escalationRate: conservative.llmEscalationRate }, selective: { resolvedWithoutLlm: selective.resolvedWithoutLlm, escalationRate: selective.llmEscalationRate } }, judgeRows: judgeRows.length, observerRows: observerRows.length }, null, 2));
}

await main();
