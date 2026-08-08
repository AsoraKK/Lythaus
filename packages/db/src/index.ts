import { Client, type QueryResult, type QueryResultRow } from 'pg';

export interface HyperdriveBinding {
  connectionString: string;
}

export interface DatabaseEnv {
  connection: HyperdriveBinding;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  binding: HyperdriveBinding,
  text: string,
  values: readonly unknown[] = []
): Promise<QueryResult<T>> {
  const connectionString = verifyFullConnectionString(binding.connectionString);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await client.query<T>(text, values as unknown[]);
  } finally {
    await client.end();
  }
}

export async function transaction<T>(
  binding: HyperdriveBinding,
  work: (client: Client) => Promise<T>
): Promise<T> {
  const connectionString = verifyFullConnectionString(binding.connectionString);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

export function assertVerifyFull(connectionString: string): void {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get('sslmode');
  // Cloudflare injects a local Hyperdrive connection string into a Worker.
  // The Worker-to-Hyperdrive hop is represented as `sslmode=disable`; TLS
  // verification happens on Hyperdrive's origin connection, which is
  // configured independently with `verify-full`.
  const isPlatformLocalBinding =
    url.hostname === 'hyperdrive.local' || url.hostname.endsWith('.hyperdrive.local');
  if (isPlatformLocalBinding && sslmode === 'disable') {
    return;
  }
  if (sslmode !== 'verify-full') {
    throw new Error('hyperdrive_requires_sslmode_verify_full');
  }
}

/**
 * Hyperdrive's account-level TLS setting is authoritative, but some generated
 * binding connection strings omit the equivalent query parameter. Preserve the
 * fail-closed check for an explicitly weaker mode while making the client
 * connection reflect the configured `verify-full` policy.
 */
export function verifyFullConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  const configuredMode = url.searchParams.get('sslmode');
  const isPlatformLocalBinding =
    url.hostname === 'hyperdrive.local' || url.hostname.endsWith('.hyperdrive.local');
  const isPlanetScaleOrigin = url.hostname.endsWith('.psdb.cloud');
  const isPlatformGeneratedRequire = configuredMode === 'require' && isPlanetScaleOrigin;

  if (isPlatformLocalBinding) {
    if (configuredMode !== 'disable') {
      throw new Error('hyperdrive_requires_platform_local_sslmode_disable');
    }
    return url.toString();
  }

  if (configuredMode && configuredMode !== 'verify-full' && !isPlatformGeneratedRequire) {
    throw new Error('hyperdrive_requires_sslmode_verify_full');
  }
  if (!configuredMode || isPlatformGeneratedRequire) url.searchParams.set('sslmode', 'verify-full');
  const verifiedConnectionString = url.toString();
  assertVerifyFull(verifiedConnectionString);
  return verifiedConnectionString;
}

export { buildSchemaFingerprint, classifyRole, databaseExpectationsFromEnv, databaseReadinessResponse, inspectDatabaseIdentity, isDatabaseIdentityReady, type DatabaseIdentityExpectations, type DatabaseIdentityReport, type DatabaseReadinessResponse } from './identity.ts';
export {
  BUDGET_RESERVATION_STATUSES,
  expireBudgetReservations,
  reconcileBudgetReservation,
  releaseBudgetReservation,
  reserveBudget,
  settleBudgetReservation,
  type BudgetConfig,
  type BudgetOperationClass,
  type BudgetReservation,
  type BudgetReservationStatus,
  type ReconcileBudgetInput,
  type ReserveBudgetInput,
  type SettleBudgetInput,
} from './budget.ts';
