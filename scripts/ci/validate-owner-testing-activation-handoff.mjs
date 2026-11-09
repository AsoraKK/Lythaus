#!/usr/bin/env node

import fs from 'node:fs';
import { validateOwnerTestingActivationHandoff } from '../release/owner-testing-activation-handoff.mjs';

const githubEnv = process.env.GITHUB_ENV;
if (!githubEnv) throw new Error('GITHUB_ENV is required');
let raw;
try { raw = JSON.parse(process.env.OWNER_TESTING_ACTIVATION_HANDOFF_JSON ?? ''); } catch {
  throw new Error('owner_testing_activation_handoff_json_invalid');
}
const handoff = validateOwnerTestingActivationHandoff(raw, {
  expectedRunId: process.env.GITHUB_RUN_ID,
  expectedRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  expectedReleaseSha: process.env.RELEASE_SHA,
});
function append(name, value) {
  const delimiter = `LYTHAUS_HANDOFF_${name}_${process.pid}_${Math.random().toString(16).slice(2)}`;
  fs.appendFileSync(githubEnv, `${name}<<${delimiter}\n${value}\n${delimiter}\n`, 'utf8');
}
append('RELEASE_CLASS', handoff.releaseClass);
append('CHANGED_COMPONENTS_JSON', JSON.stringify(handoff.changedComponents));
append('REUSED_COMPONENTS_JSON', JSON.stringify(['control-panel', 'flutter-web', 'jobs', 'marketing', 'public']));
append('AUTHENTICATED_ACCEPTANCE_PROVEN', 'true');
append('HYPERDRIVE_VERIFIED_MAIN', handoff.infrastructure.hyperdriveVerifiedMain ? 'true' : 'false');
append('DATABASE_IDENTITY_VERIFIED', handoff.infrastructure.databaseIdentityVerified ? 'true' : 'false');
append('BUDGET_ENFORCEMENT_VERIFIED', handoff.infrastructure.budgetEnforcementVerified ? 'true' : 'false');
append('PLANETSCALE_GRANTS_VERIFIED', handoff.infrastructure.planetscaleGrantsVerified ? 'true' : 'false');
append('AUTH_ACCEPTANCE_STATUS', handoff.acceptance.status);
append('AUTH_ACCEPTANCE_RUN_ID', handoff.acceptance.runId);
append('AUTH_ACCEPTANCE_EXPIRES_AT', handoff.acceptance.expiresAt);
append('AUTH_ACCEPTANCE_DEPENDENCIES_JSON', JSON.stringify(handoff.acceptance.candidateDependencies));
append('SUBJECT_DIAGNOSTIC_EXPIRES_AT', handoff.diagnostic.expiresAt);
append('ROLLBACK_SNAPSHOT_JSON', JSON.stringify(handoff.rollbackSnapshot));
append('RELEASE_STATE_HISTORY_JSON', JSON.stringify(handoff.releaseStateHistory));
for (const component of ['public', 'admin', 'jobs', 'coordinator']) {
  const data = handoff.workerVersions[component];
  const prefix = component === 'public' ? 'PUBLIC' : component === 'admin' ? 'ADMIN' : component === 'jobs' ? 'JOBS' : 'COORDINATOR';
  append(`${prefix}_WORKER_VERSION_ID`, data.versionId);
  append(`${prefix}_WORKER_SOURCE_SHA`, data.sourceSha);
  append(`${prefix}_WORKER_STATUS`, data.status);
  append(`${prefix}_WORKER_PROVENANCE`, data.provenance);
}
console.log(JSON.stringify({ status: 'VERIFIED', schemaVersion: handoff.schemaVersion, runAttempt: handoff.runAttempt }));
