#!/usr/bin/env node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertAdminCandidateStagedAtZero } from '../release/owner-testing-activation-handoff.mjs';

const HUMAN_ACCEPTANCE_REQUIRED = 'HUMAN_ACCEPTANCE_REQUIRED';
const MINIMUM_RUN_REMAINING_MS = 30_000;
const POLL_INTERVAL_MS = 30_000;

export async function waitForAuthAcceptanceEvidence({
  expiresAt,
  collect,
  guard = async () => {},
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  pollIntervalMs = POLL_INTERVAL_MS,
  minimumRunRemainingMs = MINIMUM_RUN_REMAINING_MS,
} = {}) {
  const expiresAtMs = typeof expiresAt === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(expiresAt)
    ? Date.parse(expiresAt)
    : NaN;
  if (!Number.isFinite(expiresAtMs) || typeof collect !== 'function'
    || !Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1
    || !Number.isSafeInteger(minimumRunRemainingMs) || minimumRunRemainingMs < 1) {
    throw new Error('auth_acceptance_wait_configuration_invalid');
  }

  let observations = 0;
  while (true) {
    await guard();
    observations += 1;
    const observation = await collect();
    if (observation?.exitCode === 0 && observation.status === 'PASSED') {
      if (now() >= expiresAtMs) {
        return { status: 'BLOCKED', reason: 'auth_acceptance_run_expired_before_observation', observations };
      }
      return { status: 'PASSED', observations };
    }
    if (observation?.exitCode !== 2 || observation.status !== HUMAN_ACCEPTANCE_REQUIRED) {
      throw new Error('auth_acceptance_observer_failed_closed');
    }

    const remainingMs = expiresAtMs - now();
    if (remainingMs <= minimumRunRemainingMs) {
      return { status: 'BLOCKED', reason: 'auth_acceptance_run_expiring_before_completion', observations };
    }
    await sleep(Math.min(pollIntervalMs, remainingMs - minimumRunRemainingMs));
  }
}

async function main() {
  const expiresAt = process.env.AUTH_ACCEPTANCE_EXPIRES_AT ?? '';
  const evidencePath = process.env.ADR003_AUTH_ACCEPTANCE_EVIDENCE_PATH ?? '';
  const collectorPath = fileURLToPath(new URL('./collect-auth-acceptance-evidence.mjs', import.meta.url));
  if (!evidencePath) throw new Error('ADR003_AUTH_ACCEPTANCE_EVIDENCE_PATH is required');

  try {
    const outcome = await waitForAuthAcceptanceEvidence({
      expiresAt,
      guard: async () => {
        if (process.env.OWNER_TESTING_SUBJECT_DIAGNOSTIC !== 'true') return;
        const candidateVersion = process.env.ADMIN_WORKER_VERSION_ID ?? '';
        const result = spawnSync('npx', ['--yes', 'wrangler@4.123.0', 'deployments', 'status',
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
        if (result.error || result.signal || result.status !== 0) throw new Error('owner_testing_admin_zero_traffic_guard_unavailable');
        let deployment;
        try { deployment = JSON.parse(result.stdout); } catch { throw new Error('owner_testing_admin_zero_traffic_guard_invalid'); }
        try { assertAdminCandidateStagedAtZero(deployment, candidateVersion); } catch {
          throw new Error('owner_testing_admin_candidate_received_traffic_during_acceptance_wait');
        }
      },
      collect: async () => {
        const collected = spawnSync(process.execPath, [collectorPath], {
          env: process.env,
          stdio: 'inherit',
          timeout: 60_000,
        });
        if (collected.error || collected.signal || collected.status === null) {
          throw new Error('auth_acceptance_collector_process_failed');
        }
        let evidence;
        try { evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')); } catch {
          throw new Error('auth_acceptance_observer_evidence_missing');
        }
        return { exitCode: collected.status, status: evidence?.status };
      },
    });
    if (outcome.status === 'BLOCKED') {
      let evidence;
      try { evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')); } catch {
        throw new Error('auth_acceptance_observer_evidence_missing');
      }
      evidence.status = 'BLOCKED';
      evidence.reason = outcome.reason;
      fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
      console.error('Owner-testing Keeper window ended without authenticated acceptance; the one-run candidate will roll back.');
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({ status: outcome.status, observations: outcome.observations }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'auth_acceptance_wait_failed');
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
