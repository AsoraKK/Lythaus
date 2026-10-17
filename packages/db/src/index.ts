import { Client, type QueryResult, type QueryResultRow } from 'pg';

export type DatabaseClient = Client;

export interface HyperdriveBinding {
  connectionString: string;
}

export interface DatabaseEnv {
  connection: HyperdriveBinding;
}

export class DatabaseCommitUncertainError extends Error {
  readonly outcome = 'unknown';

  constructor() {
    super('database_transaction_commit_outcome_unknown');
    this.name = 'DatabaseCommitUncertainError';
  }
}

const VERIFIED_FAILURE_CLEANUP = Symbol('verified_failure_cleanup');
const verifiedFailureCauses = new WeakMap<Error, Readonly<{ cause: unknown }>>();

export class DatabaseTransactionCleanupUncertainError extends Error {
  readonly outcome = 'unknown';

  constructor() {
    super('database_transaction_cleanup_outcome_unknown');
    this.name = 'DatabaseTransactionCleanupUncertainError';
  }
}

export function verifiedTransactionFailureCause(error: unknown): Readonly<{ cause: unknown }> | undefined {
  return error instanceof Error ? verifiedFailureCauses.get(error) : undefined;
}

export function transactionWithVerifiedFailureCleanup<T>(
  binding: HyperdriveBinding,
  work: (client: Client) => Promise<T>,
): Promise<T> {
  return transaction(binding, work, VERIFIED_FAILURE_CLEANUP);
}

export async function checkTransactionHealth(client: DatabaseClient): Promise<void> {
  try { await client.query('SELECT 1'); }
  catch { throw new Error('database_transaction_unavailable'); }
}

export { enqueueTransactionalEmailIntent, lockAuthDelivery, type TransactionalEmailOutboxInput, type TransactionalEmailPurpose } from './transactional-email.ts';
export { supportFeedbackSchemaReady, createSupportFeedbackRuntime } from './support-feedback-runtime.ts';
export { applyApprovedSupportCompletionLimits } from './support-feedback-approved-limits.ts';
export { supportFeedbackPrivacyIsReady, supportFeedbackPrivacySchemaState, type SupportFeedbackPrivacySchemaState } from './support-feedback-privacy-runtime.ts';
export { supportAuthentication, type SupportAuthentication } from './support-feedback-auth.ts';
export { handleSupportFeedbackRequest, isSupportFeedbackPath } from './support-feedback-http.ts';
export {
  exportSupportForPrivacy,
  exportSupportMessagesForPrivacy,
  purgeSupportForPrivacy,
  retainSupportBatch,
  loadSupportNotificationCandidate,
} from './support-feedback-privacy.ts';
export { parseSupportServicePolicy, type SupportServicePolicy } from './support-feedback-policy.ts';

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
  work: (client: Client) => Promise<T>,
  verification?: typeof VERIFIED_FAILURE_CLEANUP,
): Promise<T> {
  const connectionString = verifyFullConnectionString(binding.connectionString);
  const client = new Client({ connectionString });
  const verifyFailureCleanup = verification === VERIFIED_FAILURE_CLEANUP;
  let connectionFailed = false;
  let beginVerified = false, commitAttempted = false, rollbackVerified = false, closeVerified = false;
  let failed = false, failure: unknown, verifiedResult: T | undefined;
  const onConnectionError = () => { connectionFailed = true; };
  client.on('error', onConnectionError);
  let begun = false;
  try {
    await client.connect();
    const started = await client.query('BEGIN');
    begun = true;
    beginVerified = verifyFailureCleanup && !Array.isArray(started) && started?.command === 'BEGIN';
    if (verifyFailureCleanup && !beginVerified) {
      throw new Error('database_transaction_begin_unverified');
    }
    const result = await work(client);
    if (connectionFailed) throw new Error('database_transaction_connection_failed');
    commitAttempted = true;
    const committed = await client.query('COMMIT').catch(() => { throw new DatabaseCommitUncertainError(); });
    if (committed.command === 'ROLLBACK') throw new Error('database_transaction_rolled_back');
    if (committed.command !== 'COMMIT') throw new DatabaseCommitUncertainError();
    if (!verifyFailureCleanup) return result;
    verifiedResult = result;
  } catch (error) {
    if (!verifyFailureCleanup) {
      if (begun) await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
    failed = true;
    failure = error;
    if (begun) {
      try {
        const rolledBack = await client.query('ROLLBACK');
        rollbackVerified = !commitAttempted && !Array.isArray(rolledBack) && rolledBack?.command === 'ROLLBACK';
      } catch {
        rollbackVerified = false;
      }
    }
  } finally {
    try {
      await client.end();
      closeVerified = true;
    }
    catch (error) {
      if (!verifyFailureCleanup) throw error;
      failed = true;
      closeVerified = false;
    }
    finally { client.removeListener('error', onConnectionError); }
  }
  if (!failed) {
    if (connectionFailed || !closeVerified) throw new DatabaseTransactionCleanupUncertainError();
    return verifiedResult as T;
  }
  // A later rollback cannot establish whether an attempted COMMIT took effect.
  if (failure instanceof DatabaseCommitUncertainError) throw failure;
  if (beginVerified && begun && rollbackVerified && closeVerified && !connectionFailed && !commitAttempted) {
    const receipt = new Error('database_transaction_verified_rollback');
    receipt.name = 'DatabaseVerifiedTransactionRollbackError';
    verifiedFailureCauses.set(receipt, Object.freeze({ cause: failure }));
    throw receipt;
  }
  throw new DatabaseTransactionCleanupUncertainError();
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

export { buildSchemaFingerprint, classifyDatabaseIdentityError, classifyRole, databaseExpectationsFromEnv, databaseReadinessResponse, inspectDatabaseIdentity, isDatabaseIdentityReady, type DatabaseIdentityDiagnosticCode, type DatabaseIdentityExpectations, type DatabaseIdentityReport, type DatabaseReadinessResponse, type DatabaseSchemaIdentityAllowlist, type DatabaseSchemaIdentityTuple } from './identity.ts';
export {
  BUDGET_RESERVATION_STATUSES,
  expireBudgetReservations,
  reconcileBudgetReservation,
  releaseBudgetReservation,
  reserveBudget,
  reserveBudgetInTransaction,
  settleBudgetReservation,
  type BudgetConfig,
  type BudgetOperationClass,
  type BudgetScope,
  type BudgetReservation,
  type BudgetReservationStatus,
  type ReconcileBudgetInput,
  type ReserveBudgetInput,
  type SettleBudgetInput,
} from './budget.ts';
export {
  purgeAlphaMedia,
  scheduleAlphaPurge,
  type AlphaPurgeBucket,
  type AlphaPurgeState,
  type AlphaTerminalState,
} from './authenticity-alpha.ts';
export {
  listUserActivity,
  recordUserActivity,
  type ActivityCursor,
  type ActivityPage,
} from './activity.ts';
export {
  ReputationSubjectDeletedError,
  isReputationSubjectDeletedError,
  refreshReputationProfile,
  recordReputationSignal,
  type ReputationEventRecord,
  type ReputationMutationResult,
  type ReputationProfileSnapshot,
  type ReputationSignalInput,
} from './reputation.ts';
