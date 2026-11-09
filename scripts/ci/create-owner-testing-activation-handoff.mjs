#!/usr/bin/env node

import fs from 'node:fs';
import { createOwnerTestingActivationHandoff } from '../release/owner-testing-activation-handoff.mjs';

const outputPath = process.env.GITHUB_OUTPUT;
if (!outputPath) throw new Error('GITHUB_OUTPUT is required');
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the protected activation handoff`);
  return value;
};
const parse = (name) => {
  try { return JSON.parse(required(name)); } catch (error) {
    if (String(error?.message).includes('is required')) throw error;
    throw new Error(`${name} must contain valid JSON`);
  }
};
const snapshotPath = process.env.ACCEPTANCE_ROLLBACK_SNAPSHOT_PATH;
if (!snapshotPath || !fs.existsSync(snapshotPath)) throw new Error('acceptance rollback snapshot is required');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const workerVersions = Object.fromEntries(['PUBLIC', 'ADMIN', 'JOBS', 'COORDINATOR'].map(prefix => {
  const component = prefix.toLowerCase();
  return [component, {
    versionId: required(`${prefix}_WORKER_VERSION_ID`),
    sourceSha: required(`${prefix}_WORKER_SOURCE_SHA`),
    status: required(`${prefix}_WORKER_STATUS`),
    provenance: required(`${prefix}_WORKER_PROVENANCE`),
  }];
}));
const handoff = createOwnerTestingActivationHandoff({
  runId: required('GITHUB_RUN_ID'),
  runAttempt: Number(required('GITHUB_RUN_ATTEMPT')),
  releaseSha: required('RELEASE_SHA'),
  releaseClass: required('RELEASE_CLASS'),
  ownerTesting: process.env.OWNER_TESTING_DEPLOYMENT === 'true',
  recoveryException: process.env.OWNER_TESTING_RECOVERY_EXCEPTION === 'true',
  subjectDiagnostic: process.env.OWNER_TESTING_SUBJECT_DIAGNOSTIC === 'true',
  changedComponents: parse('CHANGED_COMPONENTS_JSON'),
  workerVersions,
  acceptanceStatus: required('AUTH_ACCEPTANCE_STATUS'),
  acceptanceRunId: required('AUTH_ACCEPTANCE_RUN_ID'),
  acceptanceExpiresAt: required('AUTH_ACCEPTANCE_EXPIRES_AT'),
  candidateDependencies: parse('AUTH_ACCEPTANCE_DEPENDENCIES_JSON'),
  diagnosticNotBefore: Number(required('SUBJECT_DIAGNOSTIC_NOT_BEFORE')),
  diagnosticExpiresAt: required('SUBJECT_DIAGNOSTIC_EXPIRES_AT'),
  rollbackSnapshot: snapshot,
  infrastructure: {
    hyperdriveVerifiedMain: process.env.HYPERDRIVE_VERIFIED_MAIN === 'true',
    databaseIdentityVerified: process.env.DATABASE_IDENTITY_VERIFIED === 'true',
    budgetEnforcementVerified: process.env.BUDGET_ENFORCEMENT_VERIFIED === 'true',
    planetscaleGrantsVerified: process.env.PLANETSCALE_GRANTS_VERIFIED === 'true',
  },
  releaseStateHistory: parse('RELEASE_STATE_HISTORY_JSON'),
});
fs.appendFileSync(outputPath, `handoff_json=${JSON.stringify(handoff)}\n`, { encoding: 'utf8', mode: 0o600 });
console.log(JSON.stringify({ schemaVersion: handoff.schemaVersion, status: 'VERIFIED', runAttempt: handoff.runAttempt }));
