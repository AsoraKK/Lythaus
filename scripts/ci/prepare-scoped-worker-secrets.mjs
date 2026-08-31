import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Client } = pg;

export const TRANSACTIONAL_EMAIL_KEY = 'TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1';
export const ACCEPTANCE_STATE_KEY = 'AUTH_ACCEPTANCE_STATE_ENCRYPTION_KEY_V1';

// purpose and created_at are NOT NULL in both ledgers. Counting those
// columns keeps the bootstrap precondition compatible with the verifier's
// aggregate-only column grants; SELECT * or COUNT(*) would require access to
// every protected delivery/acceptance column.
export const BOOTSTRAP_LEDGER_COUNT_SQL = `SELECT
      (SELECT count(purpose)::integer FROM system.transactional_email_outbox) AS transactional_email_outbox_rows,
      (SELECT count(created_at)::integer FROM system.production_auth_acceptance_runs) AS acceptance_run_rows`;

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function secretNames(inventory) {
  if (!Array.isArray(inventory)) throw new Error('Cloudflare secret inventory must be an array');
  return new Set(inventory
    .filter((binding) => binding && typeof binding === 'object' && binding.type === 'secret_text' && typeof binding.name === 'string')
    .map((binding) => binding.name));
}

export function classifyScopedKeyBindings({ publicNames, jobsNames, coordinatorNames }) {
  const publicHasTransactionalKey = publicNames.has(TRANSACTIONAL_EMAIL_KEY);
  const jobsHasTransactionalKey = jobsNames.has(TRANSACTIONAL_EMAIL_KEY);
  const coordinatorHasStateKey = coordinatorNames.has(ACCEPTANCE_STATE_KEY);
  if (publicHasTransactionalKey !== jobsHasTransactionalKey) {
    throw new Error('scoped-key state divergence: transactional email key exists on exactly one Worker');
  }
  return Object.freeze({
    transactionalEmail: Object.freeze({
      publicWorker: publicHasTransactionalKey ? 'present' : 'absent',
      jobsWorker: jobsHasTransactionalKey ? 'present' : 'absent',
      action: publicHasTransactionalKey ? 'preserve' : 'bootstrap',
      compatibilityProbeRequired: true,
    }),
    acceptanceState: Object.freeze({
      coordinator: coordinatorHasStateKey ? 'present' : 'absent',
      action: coordinatorHasStateKey ? 'preserve' : 'bootstrap',
    }),
  });
}

export function assertBootstrapLedgerPreconditions(counts, lifecycle) {
  if (!Number.isInteger(counts.transactionalEmailOutboxRows) || !Number.isInteger(counts.acceptanceRunRows)) {
    throw new Error('scoped-key bootstrap ledger evidence is invalid');
  }
  if (lifecycle.transactionalEmail.action === 'bootstrap' && counts.transactionalEmailOutboxRows !== 0) {
    throw new Error('transactional email key bootstrap requires an empty transactional email outbox');
  }
  if (lifecycle.acceptanceState.action === 'bootstrap' && counts.acceptanceRunRows !== 0) {
    throw new Error('acceptance state key bootstrap requires zero acceptance runs');
  }
}

async function readBootstrapLedgerCounts() {
  const databaseUrl = process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '';
  if (!databaseUrl) throw new Error('PLANETSCALE_SCHEMA_READ_DATABASE_URL is required for scoped-key bootstrap');
  const connection = new URL(databaseUrl);
  if (connection.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error('scoped-key bootstrap requires PlanetScale sslmode=verify-full');
  }
  if (connection.searchParams.get('sslrootcert') === 'system') connection.searchParams.delete('sslrootcert');
  const client = new Client({ connectionString: connection.toString(), ssl: { rejectUnauthorized: true } });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const mode = await client.query('SHOW transaction_read_only');
    if (mode.rows[0]?.transaction_read_only !== 'on') throw new Error('scoped-key bootstrap requires a read-only database transaction');
    const result = await client.query(BOOTSTRAP_LEDGER_COUNT_SQL);
    await client.query('ROLLBACK');
    return {
      transactionalEmailOutboxRows: Number(result.rows[0]?.transactional_email_outbox_rows),
      acceptanceRunRows: Number(result.rows[0]?.acceptance_run_rows),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function writeSecretFile(path, value) {
  fs.writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function requiredEnvironment(name) {
  const value = process.env[name] ?? '';
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  if (process.env.SCOPED_KEY_ROTATION_REQUESTED === 'true') {
    throw new Error('intentional scoped-key rotation requires a dedicated reviewed rotation workflow');
  }
  const publicNames = secretNames(readJson(requiredEnvironment('PUBLIC_SECRET_INVENTORY_FILE')));
  const jobsNames = secretNames(readJson(requiredEnvironment('JOBS_SECRET_INVENTORY_FILE')));
  const coordinatorNames = secretNames(readJson(requiredEnvironment('COORDINATOR_SECRET_INVENTORY_FILE')));
  const lifecycle = classifyScopedKeyBindings({ publicNames, jobsNames, coordinatorNames });
  const requiresBootstrap = lifecycle.transactionalEmail.action === 'bootstrap' || lifecycle.acceptanceState.action === 'bootstrap';
  const counts = requiresBootstrap ? await readBootstrapLedgerCounts() : undefined;
  if (counts) assertBootstrapLedgerPreconditions(counts, lifecycle);

  const base = readJson(requiredEnvironment('BASE_SECRETS_FILE'));
  const turnstile = readJson(requiredEnvironment('TURNSTILE_SECRET_FILE'));
  const publicSecrets = { ...base, ...turnstile };
  const jobsSecrets = { ...base };
  const coordinatorSecrets = {
    ...base,
    AUTH_ACCEPTANCE_EMAIL_BASE: requiredEnvironment('AUTH_ACCEPTANCE_EMAIL_BASE'),
  };

  if (lifecycle.transactionalEmail.action === 'bootstrap') {
    const transactionalEmailKey = randomBytes(32).toString('base64');
    publicSecrets[TRANSACTIONAL_EMAIL_KEY] = transactionalEmailKey;
    jobsSecrets[TRANSACTIONAL_EMAIL_KEY] = transactionalEmailKey;
  }
  if (lifecycle.acceptanceState.action === 'bootstrap') {
    coordinatorSecrets[ACCEPTANCE_STATE_KEY] = randomBytes(32).toString('base64');
  }

  writeSecretFile(requiredEnvironment('PUBLIC_SECRETS_FILE'), publicSecrets);
  writeSecretFile(requiredEnvironment('JOBS_SECRETS_FILE'), jobsSecrets);
  writeSecretFile(requiredEnvironment('COORDINATOR_SECRETS_FILE'), coordinatorSecrets);
  writeSecretFile(requiredEnvironment('SCOPED_KEY_LIFECYCLE_EVIDENCE_PATH'), {
    status: 'VERIFIED',
    source: 'cloudflare_secret_binding_names_and_read_only_ledger_counts',
    transactionalEmail: lifecycle.transactionalEmail,
    acceptanceState: lifecycle.acceptanceState,
    ...(counts ? { bootstrapLedgerCounts: counts } : {}),
    secretValuesIncluded: false,
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
