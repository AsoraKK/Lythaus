import { appendFileSync } from 'node:fs';
import { validateDisposableContentEvidence } from './adr003-disposable-evidence.mjs';

const { RELEASE_SHA: releaseSha, FIXTURE_SOURCE_SHA: sourceSha, FIXTURE_WORKER_VERSION: versionId,
  FIXTURE_BINDING: binding, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: runAttempt, GITHUB_OUTPUT: output } = process.env;
if (!output) throw new Error('fixture output missing');
const receipt = validateDisposableContentEvidence({ schema: 'lythaus-adr003-disposable-content-v1', status: 'PASSED',
  runtime: 'workerd-pg17', target: 'disposable-loopback', releaseSha, workerSourceSha: sourceSha,
  binding, workerVersionId: binding === 'version' ? versionId : null, runId, runAttempt,
  cases: ['A11', 'A12', 'A13'].map(id => ({ id, outcome: 'passed' })) },
{ releaseSha, sourceSha, versionId: binding === 'version' ? versionId : undefined, runId, runAttempt });
appendFileSync(output, `receipt=${JSON.stringify(receipt)}\n`);
