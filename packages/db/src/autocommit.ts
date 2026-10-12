import { Client, DatabaseError, type QueryResult, type QueryResultRow } from 'pg';
import { verifyFullConnectionString, type HyperdriveBinding } from './index.ts';

export class DatabaseAutocommitUncertainError extends Error {
  readonly outcome = 'unknown';

  constructor() {
    super('database_autocommit_outcome_unknown');
    this.name = 'DatabaseAutocommitUncertainError';
  }
}

export class DatabaseAutocommitCleanupError extends Error {
  readonly outcome = 'acknowledged';

  constructor() {
    super('database_autocommit_connection_cleanup_failed');
    this.name = 'DatabaseAutocommitCleanupError';
  }
}

export interface DedicatedAutocommitClient {
  queryAutocommit<T extends QueryResultRow = QueryResultRow>(
    text: string, values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

/** Own every connection; never accept or expose a caller's transaction client. */
export function createDedicatedAutocommitClient(binding: HyperdriveBinding): DedicatedAutocommitClient {
  if (!binding || typeof binding.connectionString !== 'string' || !binding.connectionString)
    throw new Error('database_autocommit_binding_required');
  const connectionString = verifyFullConnectionString(binding.connectionString);

  return Object.freeze({
    async queryAutocommit<T extends QueryResultRow = QueryResultRow>(
      text: string, values: readonly unknown[] = [],
    ): Promise<QueryResult<T>> {
      if (typeof text !== 'string' || !/^\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(text))
        throw new Error('database_autocommit_data_statement_required');
      if (!Array.isArray(values)) throw new Error('database_autocommit_scalar_parameters_required');
      const parameters = [...values];
      if (parameters.some(value => value !== null
        && typeof value !== 'string' && typeof value !== 'boolean'
        && !(typeof value === 'number' && Number.isFinite(value))))
        throw new Error('database_autocommit_scalar_parameters_required');
      const client = new Client({ connectionString, connectionTimeoutMillis: 15_000,
        statement_timeout: 15_000, query_timeout: 16_000 });
      let connectionFailed = false, submitted = false, acknowledged = false, failed = false;
      let primaryError: unknown;
      let result: QueryResult<T> | undefined;
      const onConnectionError = () => { connectionFailed = true; };
      client.on('error', onConnectionError);
      try {
        await client.connect();
        if (client.getTransactionStatus() !== 'I') throw new Error('database_autocommit_session_not_idle');
        submitted = true;
        // A named query forces extended protocol even without parameters. PostgreSQL
        // rejects multiple statements; pg settles success only at ReadyForQuery.
        result = await client.query<T>({ name: 'lythaus-autocommit-statement-v1', text, values: parameters });
        if (client.getTransactionStatus() !== 'I') throw new DatabaseAutocommitUncertainError();
        acknowledged = true;
      } catch (error) {
        failed = true;
        primaryError = submitted && !(error instanceof DatabaseError && error.severity === 'ERROR')
          ? new DatabaseAutocommitUncertainError() : error;
      } finally {
        try { await client.end(); }
        catch {
          if (!failed) {
            failed = true;
            primaryError = acknowledged ? new DatabaseAutocommitCleanupError() : new DatabaseAutocommitUncertainError();
          }
        } finally { client.removeListener('error', onConnectionError); }
      }
      if (failed) throw primaryError;
      if (connectionFailed) throw new DatabaseAutocommitCleanupError();
      return result!;
    },
  });
}
