import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createCloudflareJudgeRest,
  createCloudflareRestTransport,
  createCloudflareVisionObserverRest,
  createMockJudge,
  createMockModerationProvider,
  createOpenAIModerationProvider,
  researchRunExitCode,
  runResearchTrial,
} from '../../packages/authenticity/src/wp004a.ts';

const TRIAL_MODES = {
  '0C': 'OBSERVER_ONLY',
  '0C-R': 'OBSERVER_REASONED',
  '0C-AB': 'OBSERVER_AB',
  '0D': 'FULL',
  '0D-R': 'FULL_RECHECK',
};

function parseArgs(argv) {
  const options = { trial: '0C', image: null, output: null, allowNetwork: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--trial') options.trial = String(argv[++index] ?? '').toUpperCase();
    else if (argument === '--image') options.image = argv[++index];
    else if (argument === '--output') options.output = argv[++index];
    else if (argument === '--allow-network') options.allowNetwork = true;
    else throw new Error(`unknown_argument:${argument}`);
  }
  if (!Object.prototype.hasOwnProperty.call(TRIAL_MODES, options.trial)) throw new Error('cloudflare_trial_invalid');
  if (!options.image) throw new Error('cloudflare_trial_image_required');
  if (!options.allowNetwork) throw new Error('cloudflare_trial_network_opt_in_required');
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('cloudflare_rest_credentials_required');
  return options;
}

function safeError(error) {
  const message = error instanceof Error ? error.message : 'cloudflare_trial_failed';
  return message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]').replace(/CLOUDFLARE_API_TOKEN[^\s]*/gi, 'CLOUDFLARE_API_TOKEN_REDACTED').slice(0, 180);
}

function safeObservation(observation) {
  return {
    observationId: observation.observationId,
    queryId: observation.queryId,
    protocolVersion: observation.protocolVersion,
    category: observation.category,
    task: observation.task,
    reasoningMode: observation.reasoningMode,
    applicable: observation.applicable,
    status: observation.status,
    observation: observation.observation,
    regions: observation.regions,
    measurementConfidence: observation.measurementConfidence,
    limitations: observation.limitations,
    provider: observation.provider,
    model: observation.model,
    executionMs: observation.executionMs,
  };
}

function safeObserverResult(observer) {
  if (!observer) return null;
  return {
    schemaVersion: observer.schemaVersion,
    protocolVersion: observer.protocolVersion,
    promptVersion: observer.promptVersion,
    provider: observer.provider,
    model: observer.model,
    queryId: observer.queryId,
    task: observer.task,
    reasoningMode: observer.reasoningMode,
    status: observer.status,
    observations: observer.observations.map(safeObservation),
    escalationRecommendation: observer.escalationRecommendation,
    escalationReasons: observer.escalationReasons,
    executionMs: observer.executionMs,
    errorCategory: observer.errorCategory ?? null,
    transportErrorCategory: observer.transportErrorCategory ?? null,
    httpStatus: observer.httpStatus ?? null,
    providerErrorCode: observer.providerErrorCode ?? null,
    providerErrorMessageCode: observer.providerErrorMessageCode ?? null,
  };
}

function safeComparison(comparison) {
  if (!comparison) return null;
  return {
    schemaVersion: comparison.schemaVersion,
    sampleId: comparison.sampleId,
    inputHash: comparison.inputHash,
    queryId: comparison.queryId,
    category: comparison.category,
    protocolVersion: comparison.protocolVersion,
    direct: {
      status: comparison.direct.status,
      observations: comparison.direct.observations.map(safeObservation),
      provider: comparison.direct.provider,
      model: comparison.direct.model,
      task: comparison.direct.task,
      reasoningMode: comparison.direct.reasoningMode,
      executionMs: comparison.direct.executionMs,
      escalationRecommendation: comparison.direct.escalationRecommendation,
      escalationReasons: comparison.direct.escalationReasons,
      transportErrorCategory: comparison.direct.transportErrorCategory ?? null,
      httpStatus: comparison.direct.httpStatus ?? null,
      providerErrorCode: comparison.direct.providerErrorCode ?? null,
      providerErrorMessageCode: comparison.direct.providerErrorMessageCode ?? null,
    },
    reasoned: {
      status: comparison.reasoned.status,
      observations: comparison.reasoned.observations.map(safeObservation),
      provider: comparison.reasoned.provider,
      model: comparison.reasoned.model,
      task: comparison.reasoned.task,
      reasoningMode: comparison.reasoned.reasoningMode,
      executionMs: comparison.reasoned.executionMs,
      escalationRecommendation: comparison.reasoned.escalationRecommendation,
      escalationReasons: comparison.reasoned.escalationReasons,
      transportErrorCategory: comparison.reasoned.transportErrorCategory ?? null,
      httpStatus: comparison.reasoned.httpStatus ?? null,
      providerErrorCode: comparison.reasoned.providerErrorCode ?? null,
      providerErrorMessageCode: comparison.reasoned.providerErrorMessageCode ?? null,
    },
    contradictory: comparison.contradictory,
  };
}

const options = parseArgs(process.argv.slice(2));
try {
  const bytes = new Uint8Array(await readFile(path.resolve(options.image)));
  const mode = TRIAL_MODES[options.trial];
  const observerRequests = options.trial === '0C-AB' || options.trial === '0D-R' ? 2 : 1;
  const judgeRequests = options.trial === '0D-R' ? 2 : 1;
  const observerTransport = createCloudflareRestTransport({ apiToken: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, allowNetwork: true, maxRequests: observerRequests });
  const judgeTransport = createCloudflareRestTransport({ apiToken: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, allowNetwork: true, maxRequests: judgeRequests });
  const runtimeManifest = {
    schemaVersion: 'lythaus-wp004a-runtime-manifest-v1',
    manifestType: 'RUNTIME',
    entries: [{ sampleId: 'WP004A_NEUTRAL', sourceFamilyId: 'WP004A_NEUTRAL', path: 'neutral.png', rightsClass: 'C', evaluationAllowed: false }],
  };
  const result = await runResearchTrial({
    mode,
    runtimeManifest,
    maxSamples: 1,
    allowNetwork: true,
    enableRecheck: mode === 'FULL_RECHECK',
    observerRequest: { queryId: 'SCENE_INVENTORY_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the visible scene elements without making an origin or authenticity judgment.' },
    caps: { maxSamples: 1, maxModerationCalls: mode === 'FULL' || mode === 'FULL_RECHECK' ? 1 : 0, maxObserverCalls: observerRequests, maxObserverDirectCalls: mode === 'OBSERVER_AB' || mode === 'FULL_RECHECK' ? 1 : 1, maxObserverReasonedCalls: observerRequests > 1 ? 1 : 1, maxJudgeCalls: judgeRequests, maxTotalCalls: mode === 'FULL_RECHECK' ? 5 : mode === 'FULL' ? 3 : observerRequests },
  }, {
    readSample: async () => ({ bytes, mime: 'image/png' }),
    moderation: mode === 'FULL' || mode === 'FULL_RECHECK' ? createOpenAIModerationProvider({ apiKey: process.env.OPENAI_API_KEY }) : createMockModerationProvider(),
    observer: createCloudflareVisionObserverRest({ transport: observerTransport }),
    judge: mode === 'FULL' || mode === 'FULL_RECHECK' ? createCloudflareJudgeRest({ transport: judgeTransport }) : createMockJudge(),
  });
  const summary = {
    schemaVersion: result.schemaVersion,
    trial: options.trial,
    mode: result.mode,
    caseCount: result.cases.length,
    cases: result.cases.map((item) => ({
      sampleId: item.sampleId,
      inputHash: item.inputHash,
      status: item.status,
      observer: safeObserverResult(item.observer),
      observerComparison: safeComparison(item.observerComparison),
      recheckRounds: item.recheckRounds,
    })),
    invocationAccounting: result.invocationAccounting,
    enforcementAuthority: result.enforcementAuthority,
  };
  if (options.output) {
    const outputPath = path.resolve(options.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(summary));
  if (researchRunExitCode(result) !== 0) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ schemaVersion: 'lythaus-wp004a-research-run-v1', status: 'FAILED', errorCategory: safeError(error) }));
  process.exitCode = 1;
}
