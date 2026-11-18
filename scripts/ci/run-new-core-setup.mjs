import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { authorizeSetup } from './new-core-setup-control.mjs';
import { inspectSetupInputs, runIsolatedSetup } from './lythaus-new-core-isolated-setup.mjs';

const env = process.env;
const authorize = () => authorizeSetup({ env, afterReview: true });
const sourceDir = resolve('worker-source');

function record(entry) {
  // Only fixed operation labels and provider resource IDs belong in the public summary.
  if (!/^[a-z][a-z_]{1,64}$/.test(entry?.operation ?? '')) throw new Error('setup_journal_invalid');
  const row = { operation: entry.operation };
  for (const key of ['id', 'applicationId', 'policyId', 'workerId', 'versionId', 'deploymentId', 'routeId', 'dnsId', 'certificateId']) {
    if (entry[key] === undefined) continue;
    if (!/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(entry[key])) {
      throw new Error('setup_journal_id_invalid');
    }
    row[key] = entry[key];
  }
  const line = JSON.stringify(row);
  console.log(line);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, '- `' + line + '`\n');
}

try {
  await authorize();
  if (env.REQUESTED_OPERATION === 'inspect') {
    const result = await inspectSetupInputs({ env, sourceDir, authorize });
    console.log(JSON.stringify(result));
    if (!result.ready) process.exitCode = 1;
  } else {
    const result = await runIsolatedSetup({
      env, sourceDir, artifactDir: join(env.RUNNER_TEMP, 'new-core-artifacts'), authorize, record,
    });
    console.log(JSON.stringify(result));
    if (result.status === 'ISOLATED_SETUP_BLOCKED') process.exitCode = 1;
  }
} catch (error) {
  // Errors thrown by drivers and providers can contain credentials or private selectors.
  const code = /^(?:setup_[a-z0-9_]{1,135}|[A-Z][A-Z_]{3,90})$/.test(error?.message ?? '')
    ? error.message : 'isolated_setup_stopped';
  console.error(JSON.stringify({ status: 'STOPPED', code }));
  process.exitCode = 1;
}
