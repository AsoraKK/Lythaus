import { Client, DatabaseError, type QueryResult, type QueryResultRow } from 'pg';
import { verifyFullConnectionString, type HyperdriveBinding } from './index.ts';

const AUTOCOMMIT_TIMEOUTS: Readonly<Record<string, number>> = Object.freeze({
  statement_timeout: 15_000, query_timeout: 16_000,
});

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

interface CloudflareTransportSocket {
  closed: Promise<unknown>;
  close(): void | Promise<unknown>;
}

function retiredClientErrorSink(): void {}
function retiredTransportEventSink(): boolean { return false; }

async function closeDedicatedClient(client: Client, socket?: CloudflareTransportSocket): Promise<void> {
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveClose!: () => void, rejectClose!: (error: Error) => void;
  const closing = new Promise<void>((resolve, reject) => { resolveClose = resolve; rejectClose = reject; });
  const onEnd = (error?: Error) => { if (error) rejectClose(error); else resolveClose(); };
  try {
    client.end(onEnd);
    const closed = await Promise.race([closing.then(() => true), new Promise<false>(resolve => {
      closeTimer = setTimeout(() => resolve(false), 1_000);
    })]);
    if (!closed) throw new Error('database_autocommit_close_deadline');
  } catch (error) {
    // Destroy does not wait for the peer's FIN or a graceful protocol response.
    try { client.connection.stream.destroy(); } catch {}
    // pg-cloudflare 1.4 may throw in destroy/end before closing its native socket.
    if (socket) {
      try { void Promise.resolve(socket.close()).catch(retiredClientErrorSink); } catch {}
    }
    await Promise.race([closing.catch(() => {}), new Promise<void>(resolve => {
      forceTimer = setTimeout(resolve, 250);
    })]);
    throw error;
  } finally {
    clearTimeout(closeTimer); clearTimeout(forceTimer);
    client.connection.removeListener('end', onEnd);
  }
}

/** Own every connection; never accept or expose a caller's transaction client. */
export function createDedicatedAutocommitClient(binding: HyperdriveBinding): DedicatedAutocommitClient {
  if (!binding || typeof binding.connectionString !== 'string' || !binding.connectionString)
    throw new Error('database_autocommit_binding_required');
  const connectionString = verifyFullConnectionString(binding.connectionString);
  const parameters = new URL(connectionString).searchParams;
  parameters.forEach((value, key) => {
    const name = key.toLowerCase();
    if ((Object.hasOwn(AUTOCOMMIT_TIMEOUTS, name) && value !== String(AUTOCOMMIT_TIMEOUTS[name]))
      || (name === 'options' && /statement_timeout|query_timeout/i.test(value.replace(/\\/g, '').replace(/-/g, '_'))))
      throw new Error('database_autocommit_timeout_override_forbidden');
  });

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
        ...AUTOCOMMIT_TIMEOUTS });
      let connectionFailed = false, submitted = false, acknowledged = false, failed = false;
      let terminal = false, cleanupFinished = false, retired = false;
      let primaryError: unknown;
      let result: QueryResult<T> | undefined;
      const onConnectionError = () => { connectionFailed = true; };
      const retire = () => {
        if (!terminal || !cleanupFinished || retired) return;
        retired = true;
        // Delayed pg-cloudflare read/closed tasks can emit after terminal closure.
        // This dedicated emitter has no further consumer; retain no event listeners.
        client.connection.stream.emit = retiredTransportEventSink;
        client.connection.stream.removeAllListeners();
        client.connection.removeAllListeners();
        client.removeAllListeners();
      };
      const onTerminal = () => { terminal = true; retire(); };
      client.on('error', onConnectionError);
      client.connection.once('end', onTerminal);
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
        const socket = (client.connection.stream as unknown as { _cfSocket?: CloudflareTransportSocket | null })._cfSocket;
        if (socket) void Promise.resolve(socket.closed).then(onTerminal, onTerminal).catch(retiredClientErrorSink);
        try { await closeDedicatedClient(client, socket ?? undefined); }
        catch {
          if (!failed) {
            failed = true;
            primaryError = acknowledged ? new DatabaseAutocommitCleanupError() : new DatabaseAutocommitUncertainError();
          }
        } finally {
          cleanupFinished = true;
          if (!terminal) {
            client.on('error', retiredClientErrorSink);
            client.removeListener('error', onConnectionError);
          }
          retire();
        }
      }
      if (failed) throw primaryError;
      if (connectionFailed) throw new DatabaseAutocommitCleanupError();
      return result!;
    },
  });
}
