import { readFile } from 'node:fs/promises';
import { createOpenAIModerationProvider, assertModerationProviderEvidence } from '../../packages/authenticity/src/openai-moderation.ts';

const imagePath = process.argv[2];
if (!imagePath) throw new Error('image_path_required');
const bytes = new Uint8Array(await readFile(imagePath));
const provider = createOpenAIModerationProvider({ apiKey: process.env.OPENAI_API_KEY });
const result = await provider.analyseImage({ caseId: '0198a5d3-4a00-7000-8000-000000000123', mime: 'image/png', bytes });
const evidence = result.providerEvidence;
if (evidence) assertModerationProviderEvidence(evidence);
const output = {
  schemaVersion: evidence?.schemaVersion ?? 'lythaus-moderation-provider-evidence-v1',
  provider: result.provider,
  model: result.modelVersion,
  providerSuccess: evidence?.status === 'SUCCESS',
  flagged: evidence?.flagged ?? null,
  executionMs: result.executionMs,
  categoryFieldCount: evidence ? Object.keys(evidence.categories).length : 0,
  categoryScoreFieldCount: evidence ? Object.keys(evidence.categoryScores).length : 0,
  appliedInputTypeFieldCount: evidence ? Object.keys(evidence.categoryAppliedInputTypes).length : 0,
  evidenceSchemaValid: Boolean(evidence),
  errorCategory: evidence?.errorCategory ?? null,
};
console.log(JSON.stringify(output));
if (!output.providerSuccess) process.exitCode = 1;
