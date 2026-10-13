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

export interface CloudflareTransportSocket {
  closed: Promise<unknown>;
  close(): void | Promise<unknown>;
}

function retiredClientErrorSink(): void {}
function retiredTransportEventSink(): boolean { return false; }

export type DedicatedClientCleanupTarget = Pick<Client, 'connection' | 'end' | 'on' | 'removeListener' | 'removeAllListeners'>;

export class DatabaseClientCloseDeadlineError extends Error {
  constructor() { super('database_autocommit_close_deadline'); }
}

export function beginDedicatedClientRetirement(client: DedicatedClientCleanupTarget, onConnectionError: () => void) {
  let terminal = false, cleanupFinished = false, retired = false;
  let socket: CloudflareTransportSocket | undefined;
  const retire = () => {
    if (!cleanupFinished || retired) return;
    retired = true;
    client.connection.stream.emit = retiredTransportEventSink;
    client.connection.stream.removeAllListeners();
    client.connection.removeAllListeners();
    client.removeAllListeners();
    client.on('error', retiredClientErrorSink);
  };
  const onTerminal = () => { terminal = true; if (cleanupFinished) retire(); };
  client.connection.once('end', onTerminal);
  return {
    captureSocket(): CloudflareTransportSocket | undefined {
      const current = (client.connection.stream as unknown as { _cfSocket?: CloudflareTransportSocket | null })._cfSocket;
      if (!socket && current) {
        socket = current;
        void Promise.resolve(socket.closed).then(onTerminal, onTerminal).catch(retiredClientErrorSink);
      }
      return socket;
    },
    finishCleanup(): void {
      cleanupFinished = true;
      client.on('error', retiredClientErrorSink);
      client.removeListener('error', onConnectionError);
      // Cleanup has either confirmed terminal close or exhausted bounded force-close.
      // Pending transport tasks never regain a consumer after this dedicated use.
      retire();
    },
    get terminal(): boolean { return terminal; },
  };
}

export async function closeDedicatedClient(
  client: DedicatedClientCleanupTarget, socket?: CloudflareTransportSocket,
  bounds: { closeMs: number; forceMs: number } = { closeMs: 1_000, forceMs: 250 },
): Promise<void> {
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveClose!: () => void, rejectClose!: (error: Error) => void;
  const closing = new Promise<void>((resolve, reject) => { resolveClose = resolve; rejectClose = reject; });
  const onEnd = (error?: Error) => { if (error) rejectClose(error); else resolveClose(); };
  try {
    const ending = client.end(onEnd) as unknown;
    if (ending && typeof (ending as Promise<unknown>).then === 'function') {
      void Promise.resolve(ending).then(() => resolveClose(), error => rejectClose(error)).catch(retiredClientErrorSink);
    }
    // pg's two-argument write callback is not honored by pg-cloudflare 1.4.
    // This dedicated connection has completed its work; close its native socket.
    if (socket) void Promise.resolve(socket.close()).catch(error => rejectClose(error));
    const terminalClose = Promise.all([closing,
      socket ? Promise.resolve(socket.closed).then(() => undefined, () => undefined) : Promise.resolve()]);
    const closed = await Promise.race([terminalClose.then(() => true), new Promise<false>(resolve => {
      closeTimer = setTimeout(() => resolve(false), bounds.closeMs);
    })]);
    if (!closed) throw new DatabaseClientCloseDeadlineError();
  } catch (error) {
    // Destroy does not wait for the peer's FIN or a graceful protocol response.
    try { client.connection.stream.destroy(); } catch {}
    // pg-cloudflare 1.4 may throw in destroy/end before closing its native socket.
    if (socket) {
      try { void Promise.resolve(socket.close()).catch(retiredClientErrorSink); } catch {}
    }
    const forcedClose = socket ? Promise.resolve(socket.closed).then(() => undefined, () => undefined) : closing.catch(() => {});
    await Promise.race([forcedClose, new Promise<void>(resolve => {
      forceTimer = setTimeout(resolve, bounds.forceMs);
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
      let primaryError: unknown;
      let result: QueryResult<T> | undefined;
      const onConnectionError = () => { connectionFailed = true; };
      client.on('error', onConnectionError);
      const retirement = beginDedicatedClientRetirement(client, onConnectionError);
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
        const socket = retirement.captureSocket();
        try { await closeDedicatedClient(client, socket); }
        catch {
          if (!failed) {
            failed = true;
            primaryError = acknowledged ? new DatabaseAutocommitCleanupError() : new DatabaseAutocommitUncertainError();
          }
        } finally {
          retirement.finishCleanup();
        }
      }
      if (failed) throw primaryError;
      if (connectionFailed) throw new DatabaseAutocommitCleanupError();
      return result!;
    },
  });
}
