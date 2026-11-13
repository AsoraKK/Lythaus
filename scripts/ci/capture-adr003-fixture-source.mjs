import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { assertMainDispatchAccountContext, captureServingPublicWorker } from './capture-app-only-worker-state.mjs';

const env = process.env;
assertMainDispatchAccountContext(env);
const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
if (env.GITHUB_WORKFLOW_REF !== 'AsoraKK/Lythaus/.github/workflows/production-release.yml@refs/heads/main'
  || env.GITHUB_REF_PROTECTED !== 'true' || event?.inputs?.release_mode !== 'app_only'
  || event?.inputs?.release_sha !== env.RELEASE_SHA || ![true, 'true'].includes(event?.inputs?.confirm_production)
  || !/^[0-9a-f]{40}$/.test(env.RELEASE_SHA ?? '') || !env.GITHUB_OUTPUT
  || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== env.RELEASE_SHA) {
  throw new Error('fixture capture requires the confirmed app-only release');
}
const worker = captureServingPublicWorker();
appendFileSync(env.GITHUB_OUTPUT, `source_sha=${worker.sourceSha}\nversion_id=${worker.versionId}\n`);
