import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_MODELS = Object.freeze([
  '@cf/black-forest-labs/flux-1-schnell',
  '@cf/black-forest-labs/flux-2-klein-4b',
  '@cf/stabilityai/stable-diffusion-xl-base-1.0',
  '@cf/bytedance/stable-diffusion-xl-lightning',
]);
const MODEL_COST_USD = Object.freeze({
  '@cf/black-forest-labs/flux-1-schnell': 0.0002112,
  '@cf/black-forest-labs/flux-2-klein-4b': 0.001148,
  '@cf/stabilityai/stable-diffusion-xl-base-1.0': 0,
  '@cf/bytedance/stable-diffusion-xl-lightning': 0,
});

function parseArgs(argv) {
  const options = {
    dryRun: true,
    model: null,
    promptStart: 1,
    promptCount: 2,
    maxCost: 1,
    outputCache: path.join(os.homedir(), 'OneDrive', 'Desktop', 'Lythaus_AI_Datasets', '90_RESEARCH_ONLY', 'wp007a-cloudflare-cache'),
    resume: false,
    verifyOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--execute') options.dryRun = false;
    else if (argument === '--model') options.model = argv[++index];
    else if (argument === '--prompt-start') options.promptStart = Number(argv[++index]);
    else if (argument === '--prompt-count') options.promptCount = Number(argv[++index]);
    else if (argument === '--max-cost') options.maxCost = Number(argv[++index]);
    else if (argument === '--output-cache') options.outputCache = path.resolve(argv[++index]);
    else if (argument === '--resume') options.resume = true;
    else if (argument === '--verify-only') options.verifyOnly = true;
    else throw new Error(`unknown_argument:${argument}`);
  }
  return options;
}

function assertExternalOutput(outputCache) {
  const relative = path.relative(path.resolve(process.cwd()), path.resolve(outputCache));
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) throw new Error('wp007a_cloudflare_output_inside_repository');
}

function modelCost(model, count) {
  return (MODEL_COST_USD[model] ?? Number.POSITIVE_INFINITY) * count;
}

async function loadRights() {
  const file = path.resolve('research/wp007a/cloudflare-model-rights.json');
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function planCloudflareGeneration(options = {}) {
  const merged = { ...parseArgs([]), ...options };
  assertExternalOutput(merged.outputCache);
  if (!Number.isInteger(merged.promptStart) || merged.promptStart < 1 || !Number.isInteger(merged.promptCount) || merged.promptCount < 1 || merged.promptCount > 80) throw new Error('wp007a_cloudflare_prompt_range_invalid');
  if (!Number.isFinite(merged.maxCost) || merged.maxCost < 0 || merged.maxCost > 1) throw new Error('wp007a_cloudflare_cost_cap_invalid');
  const rights = await loadRights();
  const models = merged.model ? [merged.model] : DEFAULT_MODELS;
  const rows = models.map((model) => {
    const row = rights.models.find((item) => item.modelId === model);
    if (!row) throw new Error(`wp007a_cloudflare_model_not_audited:${model}`);
    return {
      modelId: model,
      promptStart: merged.promptStart,
      promptCount: merged.promptCount,
      estimatedCostUsd: modelCost(model, merged.promptCount),
      evaluationEligibility: row.evaluationEligibility,
      trainingEligibility: row.trainingEligibility,
      generationAuthorized: row.generationAuthorized,
    };
  });
  const estimatedCostUsd = rows.reduce((sum, row) => sum + row.estimatedCostUsd, 0);
  if (estimatedCostUsd > merged.maxCost) throw new Error(`wp007a_cloudflare_estimated_cost_exceeds_cap:${estimatedCostUsd}`);
  if (!merged.dryRun) {
    if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('CLOUDFLARE_GENERATION_STATUS=AUTH_REQUIRED');
    if (rows.some((row) => row.evaluationEligibility !== true || row.generationAuthorized !== true)) throw new Error('CLOUDFLARE_GENERATION_STATUS=RIGHTS_UNRESOLVED');
    throw new Error('CLOUDFLARE_GENERATION_STATUS=EXECUTION_DISABLED_UNTIL_EXPLICIT_RUN_AUTHORIZATION');
  }
  return {
    schemaVersion: 'lythaus-wp007a-cloudflare-generation-plan-v1',
    dryRun: true,
    verifyOnly: Boolean(merged.verifyOnly),
    resume: Boolean(merged.resume),
    outputCacheId: 'wp007a-cloudflare-cache',
    rows,
    estimatedCostUsd,
    generatedCount: 0,
    credentialsPrinted: false,
  };
}

if (process.argv[1] && path.basename(process.argv[1]) === path.basename(new URL(import.meta.url).pathname)) {
  try {
    const result = await planCloudflareGeneration(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify({ status: 'dry_run', ...result }));
  } catch (error) {
    console.error(String(error.message ?? error));
    process.exitCode = 1;
  }
}
