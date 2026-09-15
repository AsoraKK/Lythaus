import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  requestBody,
  requestCloudflare,
} from './wp007ah-cloudflare-holdouts.mjs';
import { WP007AH_MODEL_SPECS } from '../../packages/authenticity/src/wp007ah.ts';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROMPT_BANK_PATH = path.join(REPOSITORY_ROOT, 'research', 'wp007a', 'prompt-bank.json');
const MODEL_ID = '@cf/black-forest-labs/flux-1-schnell';
const PROMPT_ID = 'PROMPT_001';

if (!process.argv.slice(2).includes('--allow-network')) throw new Error('wp007ahr4_diagnostic_network_confirmation_required');

const promptBank = JSON.parse(await readFile(PROMPT_BANK_PATH, 'utf8'));
const prompt = promptBank.prompts.find((candidate) => candidate.promptId === PROMPT_ID);
if (!prompt) throw new Error('wp007ahr4_diagnostic_prompt_missing');
const model = WP007AH_MODEL_SPECS.find((candidate) => candidate.modelId === MODEL_ID);
if (!model) throw new Error('wp007ahr4_diagnostic_model_missing');
const request = requestBody(model, prompt);

try {
  await requestCloudflare(MODEL_ID, request.body);
  console.log(JSON.stringify({
    status: 'PROVIDER_OUTPUT_RECEIVED',
    diagnosticCallCount: 1,
    modelId: MODEL_ID,
    promptId: PROMPT_ID,
    recordedSeed: request.recordedSeed,
    providerHttpStatus: 200,
    providerErrorCode: null,
    providerErrorMessage: null,
    failureCategory: null,
    requestContentTypeClassification: 'APPLICATION_JSON',
  }));
} catch (error) {
  console.log(JSON.stringify({
    status: 'PROVIDER_FAILURE',
    diagnosticCallCount: 1,
    modelId: MODEL_ID,
    promptId: PROMPT_ID,
    recordedSeed: request.recordedSeed,
    providerHttpStatus: error?.providerHttpStatus ?? null,
    providerErrorCode: error?.providerErrorCode ?? null,
    providerErrorMessage: error?.providerErrorMessage ?? null,
    failureCategory: error?.failureCategory ?? null,
    requestContentTypeClassification: error?.requestContentTypeClassification ?? 'APPLICATION_JSON',
    retryable: error?.retryable === true,
  }));
  process.exitCode = 1;
}
