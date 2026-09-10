import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertEvidencePacket,
  assertRuntimeResearchManifest,
  createMockJudge,
  createMockModerationProvider,
  createMockVisionObserver,
  createOpenAIModerationProvider,
  runResearchTrial,
} from '../../packages/authenticity/src/wp004a.ts';

function parseArgs(argv) {
  const options = { mode: 'MOCK_ONLY', dataRoot: process.env.LYTHAUS_WP004A_DATA_ROOT, manifest: null, packet: null, output: null, maxSamples: undefined, allowNetwork: false, safetyMode: 'observe' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--mode') options.mode = String(argv[++index] ?? '').toUpperCase().replaceAll('-', '_');
    else if (argument === '--mock-only') options.mode = 'MOCK_ONLY';
    else if (argument === '--data-root') options.dataRoot = argv[++index];
    else if (argument === '--manifest') options.manifest = argv[++index];
    else if (argument === '--packet') options.packet = argv[++index];
    else if (argument === '--output') options.output = argv[++index];
    else if (argument === '--max-samples') options.maxSamples = Number(argv[++index]);
    else if (argument === '--allow-network') options.allowNetwork = true;
    else if (argument === '--safety-mode') options.safetyMode = argv[++index];
    else throw new Error(`unknown_argument:${argument}`);
  }
  if (!['MOCK_ONLY', 'MODERATION_ONLY', 'OBSERVER_ONLY', 'JUDGE_ONLY', 'FULL'].includes(options.mode)) throw new Error('research_mode_invalid');
  if (!['observe', 'gate'].includes(options.safetyMode)) throw new Error('safety_mode_invalid');
  if (options.maxSamples !== undefined && (!Number.isInteger(options.maxSamples) || options.maxSamples <= 0)) throw new Error('max_samples_invalid');
  return options;
}

async function readJson(file) {
  return JSON.parse(await readFile(path.resolve(file), 'utf8'));
}

function safeError(error) {
  const message = error instanceof Error ? error.message : 'research_failed';
  return message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]').replace(/OPENAI_API_KEY[^\s]*/gi, 'OPENAI_API_KEY_REDACTED').slice(0, 180);
}

async function readInside(root, entry) {
  const rootReal = await realpath(root);
  const candidate = path.resolve(rootReal, entry.path);
  const candidateReal = await realpath(candidate);
  const relative = path.relative(rootReal, candidateReal);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('runtime_sample_path_outside_data_root');
  return { bytes: new Uint8Array(await readFile(candidateReal)), mime: undefined };
}

const options = parseArgs(process.argv.slice(2));
try {
  let runtimeManifest;
  let packets;
  if (options.mode === 'JUDGE_ONLY') {
    if (!options.packet) throw new Error('judge_only_packet_required');
    const loaded = await readJson(options.packet);
    packets = Array.isArray(loaded) ? loaded : loaded.packets ?? (loaded.packet ? [loaded.packet] : []);
    if (!packets.length) throw new Error('judge_only_packets_empty');
    for (const packet of packets) assertEvidencePacket(packet);
  } else {
    if (!options.manifest) throw new Error('runtime_manifest_required:use --manifest');
    if (!options.dataRoot) throw new Error('data_root_required:use --data-root or LYTHAUS_WP004A_DATA_ROOT');
    runtimeManifest = await readJson(options.manifest);
    assertRuntimeResearchManifest(runtimeManifest);
  }

  const isMock = !options.allowNetwork || options.mode === 'MOCK_ONLY';
  if (!isMock && options.mode !== 'MODERATION_ONLY') throw new Error('cloudflare_workers_ai_binding_required_for_live_observer_or_judge');
  const moderation = isMock ? createMockModerationProvider() : createOpenAIModerationProvider({ apiKey: process.env.OPENAI_API_KEY });
  const observer = createMockVisionObserver();
  const judge = createMockJudge();
  const result = await runResearchTrial({ mode: options.mode, runtimeManifest, packets, maxSamples: options.maxSamples, allowNetwork: options.allowNetwork, safetyMode: options.safetyMode }, {
    readSample: (entry) => readInside(options.dataRoot, entry),
    moderation,
    observer,
    judge,
  });
  const outputPath = options.output ? path.resolve(options.output) : null;
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify({
    schemaVersion: result.schemaVersion,
    runId: result.runId,
    mode: result.mode,
    safetyMode: result.safetyMode,
    groundTruthLoaded: result.groundTruthLoaded,
    caseCount: result.cases.length,
    completedCount: result.cases.filter((item) => item.status === 'COMPLETED').length,
    stoppedCount: result.cases.filter((item) => item.status === 'STOPPED').length,
    failedCount: result.cases.filter((item) => item.status === 'FAILED').length,
    invocationAccounting: result.invocationAccounting,
    enforcementAuthority: result.enforcementAuthority,
    outputPath,
  }));
} catch (error) {
  console.error(JSON.stringify({ schemaVersion: 'lythaus-wp004a-research-run-v1', status: 'FAILED', errorCategory: safeError(error) }));
  process.exitCode = 1;
}
