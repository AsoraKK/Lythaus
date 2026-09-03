#!/usr/bin/env node

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import { classifyScopedKeyBindings } from './prepare-scoped-worker-secrets.mjs';
import { namesFromSecretList, verifyScopedWorkerSecretBindings } from './verify-scoped-worker-secret-bindings.mjs';

function required(name) {
  const value = process.env[name] ?? '';
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readInventory(name) {
  return namesFromSecretList(JSON.parse(fs.readFileSync(required(name), 'utf8')));
}

function main() {
  const coordinatorManaged = process.env.SKIP_ACCEPTANCE_COORDINATOR !== 'true';
  const publicNames = readInventory('PUBLIC_SECRET_INVENTORY_FILE');
  const adminNames = readInventory('ADMIN_SECRET_INVENTORY_FILE');
  const jobsNames = readInventory('JOBS_SECRET_INVENTORY_FILE');
  const coordinatorNames = coordinatorManaged ? readInventory('COORDINATOR_SECRET_INVENTORY_FILE') : new Set();
  const lifecycle = classifyScopedKeyBindings({ publicNames, jobsNames, coordinatorNames, coordinatorManaged });
  const bindingEvidence = verifyScopedWorkerSecretBindings({ publicNames, adminNames, jobsNames, coordinatorNames, coordinatorManaged });

  if (lifecycle.transactionalEmail.action !== 'preserve') {
    throw new Error('acceptance resume requires the existing transactional email key to be preserved');
  }
  if (coordinatorManaged && lifecycle.acceptanceState.action !== 'preserve') {
    throw new Error('acceptance resume requires the existing acceptance state key to be preserved');
  }

  const lifecycleEvidence = {
    status: 'VERIFIED',
    source: 'cloudflare_secret_binding_names_resume_reverification',
    transactionalEmail: lifecycle.transactionalEmail,
    acceptanceState: lifecycle.acceptanceState,
    secretValuesIncluded: false,
  };
  fs.writeFileSync(required('SCOPED_WORKER_SECRET_BINDING_EVIDENCE_PATH'), `${JSON.stringify(bindingEvidence)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(required('SCOPED_KEY_LIFECYCLE_EVIDENCE_PATH'), `${JSON.stringify(lifecycleEvidence)}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(JSON.stringify({ status: 'VERIFIED', mode: 'acceptance_resume', lifecycle: lifecycleEvidence }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
