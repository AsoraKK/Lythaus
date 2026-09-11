import { readFile } from 'node:fs/promises';
import { assertResearchImageInput, createOpenAIModerationProvider, assertModerationProviderEvidence, decodeResearchImage } from '../../packages/authenticity/src/wp004a.ts';
import { validateNeutralPng } from './neutral-png.mjs';

const imagePath = process.argv[2];
if (!imagePath) throw new Error('image_path_required');
const bytes = new Uint8Array(await readFile(imagePath));
const fixture = await validateNeutralPng(bytes);
if (!fixture.valid) throw new Error(`neutral_fixture_invalid:${fixture.reason}`);
assertResearchImageInput({ bytes, mime: 'image/png' });
const decoded = await decodeResearchImage({ bytes, mime: 'image/png' });
if (!decoded || decoded.width !== fixture.width || decoded.height !== fixture.height || decoded.channels !== fixture.channels || decoded.pixels.byteLength !== fixture.pixelBytes) {
  throw new Error('neutral_fixture_research_decode_invalid');
}
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
  httpStatus: evidence?.httpStatus ?? null,
  providerErrorType: evidence?.errorType ?? null,
  providerErrorCode: evidence?.errorCode ?? null,
  providerErrorParam: evidence?.errorParam ?? null,
  categoryFieldCount: evidence ? Object.keys(evidence.categories).length : 0,
  categoryScoreFieldCount: evidence ? Object.keys(evidence.categoryScores).length : 0,
  appliedInputTypeFieldCount: evidence ? Object.keys(evidence.categoryAppliedInputTypes).length : 0,
  evidenceSchemaValid: Boolean(evidence),
  errorCategory: evidence?.errorCategory ?? null,
};
console.log(JSON.stringify(output));
if (!output.providerSuccess) process.exitCode = 1;
