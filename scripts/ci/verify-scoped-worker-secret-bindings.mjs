import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import { ACCEPTANCE_STATE_KEY, TRANSACTIONAL_EMAIL_KEY } from './prepare-scoped-worker-secrets.mjs';

const PUBLIC_REQUIRED = Object.freeze([
  'AUTH_PASSWORD_PEPPER_V1',
  'JWT_PRIVATE_KEY',
  'JWT_KEY_ID',
  'JWT_PUBLIC_JWKS',
  'PII_ENCRYPTION_KEY_V1',
  'PII_HMAC_KEY_V1',
  TRANSACTIONAL_EMAIL_KEY,
]);
const ADMIN_REQUIRED = Object.freeze(['ACCESS_SUBJECT_HMAC_KEY']);
const JOBS_FORBIDDEN = Object.freeze(['PII_ENCRYPTION_KEY_V1', 'PII_HMAC_KEY_V1']);
const COORDINATOR_FORBIDDEN = Object.freeze(['PII_ENCRYPTION_KEY_V1', 'PII_HMAC_KEY_V1', 'ACCESS_SUBJECT_HMAC_KEY']);

function required(name) {
  const value = process.env[name] ?? '';
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function namesFromSecretList(input) {
  if (!Array.isArray(input)) throw new Error('Cloudflare secret inventory must be an array');
  return new Set(input
    .filter((binding) => binding && typeof binding === 'object' && binding.type === 'secret_text' && typeof binding.name === 'string')
    .map((binding) => binding.name));
}

function requirePresent(names, requiredNames, worker) {
  const missing = requiredNames.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`${worker} is missing required secret bindings: ${missing.join(', ')}`);
}

function requireAbsent(names, forbiddenNames, worker) {
  const present = forbiddenNames.filter((name) => names.has(name));
  if (present.length) throw new Error(`${worker} must not have product cryptographic bindings: ${present.join(', ')}`);
}

export function verifyScopedWorkerSecretBindings({ publicNames, adminNames, jobsNames, coordinatorNames = new Set(), coordinatorManaged = true }) {
  requirePresent(publicNames, PUBLIC_REQUIRED, 'public API');
  requirePresent(adminNames, ADMIN_REQUIRED, 'admin API');
  requirePresent(jobsNames, [TRANSACTIONAL_EMAIL_KEY], 'Jobs');
  if (coordinatorManaged) requirePresent(coordinatorNames, [ACCEPTANCE_STATE_KEY], 'acceptance coordinator');
  requireAbsent(jobsNames, JOBS_FORBIDDEN, 'Jobs');
  requireAbsent(coordinatorNames, COORDINATOR_FORBIDDEN, 'acceptance coordinator');
  return Object.freeze({
    status: 'VERIFIED',
    source: 'cloudflare_secret_binding_names',
    publicApi: { requiredBindingsPresent: PUBLIC_REQUIRED },
    adminApi: { requiredBindingsPresent: ADMIN_REQUIRED },
    jobs: { requiredBindingsPresent: [TRANSACTIONAL_EMAIL_KEY], forbiddenProductBindingsAbsent: JOBS_FORBIDDEN },
    acceptanceCoordinator: { requiredBindingsPresent: coordinatorManaged ? [ACCEPTANCE_STATE_KEY] : [], forbiddenProductBindingsAbsent: COORDINATOR_FORBIDDEN, managed: coordinatorManaged },
    secretValuesIncluded: false,
  });
}

function readInventory(environmentName) {
  return namesFromSecretList(JSON.parse(fs.readFileSync(required(environmentName), 'utf8')));
}

function main() {
  const evidence = verifyScopedWorkerSecretBindings({
    publicNames: readInventory('PUBLIC_SECRET_INVENTORY_FILE'),
    adminNames: readInventory('ADMIN_SECRET_INVENTORY_FILE'),
    jobsNames: readInventory('JOBS_SECRET_INVENTORY_FILE'),
    coordinatorNames: process.env.SKIP_ACCEPTANCE_COORDINATOR === 'true' ? new Set() : readInventory('COORDINATOR_SECRET_INVENTORY_FILE'),
    coordinatorManaged: process.env.SKIP_ACCEPTANCE_COORDINATOR !== 'true',
  });
  fs.writeFileSync(required('SCOPED_WORKER_SECRET_BINDING_EVIDENCE_PATH'), `${JSON.stringify(evidence)}\n`, { encoding: 'utf8', mode: 0o600 });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
