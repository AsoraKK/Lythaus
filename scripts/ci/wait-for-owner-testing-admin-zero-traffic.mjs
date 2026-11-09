#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { waitForAdminCandidateStagedAtZero } from '../release/owner-testing-activation-handoff.mjs';

export async function waitForAdminCandidateWithCloudflare({
  candidateVersionId = process.env.ADMIN_WORKER_VERSION_ID ?? '',
  spawn = spawnSync,
} = {}) {
  return waitForAdminCandidateStagedAtZero({
    candidateVersionId,
    readDeployment: async () => {
      const result = spawn('npx', ['--yes', 'wrangler@4.123.0', 'deployments', 'status',
        '--name', 'lythaus-admin-api-development', '--json'], {
        env: {
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
          CI: 'true',
          WRANGLER_SEND_METRICS: 'false',
          CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN ?? '',
          CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      });
      if (result.error || result.signal || result.status !== 0) {
        throw new Error('owner_testing_admin_zero_traffic_guard_unavailable');
      }
      try { return JSON.parse(result.stdout); } catch {
        throw new Error('owner_testing_admin_zero_traffic_guard_invalid');
      }
    },
  });
}

async function main() {
  try {
    const result = await waitForAdminCandidateWithCloudflare();
    console.log(`Verified exact Admin candidate at zero traffic after ${result.attempts} status reads.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'owner_testing_admin_zero_traffic_wait_failed');
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
