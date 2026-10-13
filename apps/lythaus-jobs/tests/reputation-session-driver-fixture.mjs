import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { rows } from './reputation-session-fixture.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const cloudflarePackage = require.resolve('pg-cloudflare/package.json');
assert.equal(require(cloudflarePackage).version, '1.4.0');
const { CloudflareSocket } = require(path.join(path.dirname(cloudflarePackage), 'dist/index.js'));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function pinnedDriverFixture(mode = 'normal') {
  const stream = new CloudflareSocket(false);
  const oldClosed = deferred(), closed = deferred(), read = deferred();
  const state = { nativeClosed: false, closeCalls: 0, destroyCalls: 0, reads: 0, closeEvents: 0, endEvents: 0 };
  stream.on('close', () => { state.closeEvents++; });
  stream._cfSocket = { closed: oldClosed.promise };
  stream._addClosedHandler();
  const native = { closed: closed.promise, close() {
    state.closeCalls++; state.nativeClosed = true; closed.resolve();
  } };
  stream._cfSocket = native;
  stream._addClosedHandler();
  let startup = false;
  stream._cfWriter = { write() {
    if (!startup) {
      startup = true;
      queueMicrotask(() => stream.emit('data', Buffer.from([82,0,0,0,8,0,0,0,0,90,0,0,0,5,73])));
    }
    return Promise.resolve();
  } };
  stream._cfReader = { read() { state.reads++; return read.promise; } };
  stream.connect = () => { stream.writable = true; queueMicrotask(() => stream.emit('connect')); return stream; };
  const destroy = stream.destroy.bind(stream);
  stream.destroy = (...args) => { state.destroyCalls++; return destroy(...args); };
  const client = new Client({ connectionString: 'postgres://synthetic:synthetic@fixture.invalid/postgres?sslmode=disable', stream });
  client.connection.on('end', () => { state.endEvents++; });
  const connect = client.connect.bind(client);
  client.connect = async () => {
    await connect();
    void stream._listen().catch(error => stream.emit('error', error));
  };
  let index = 0;
  client.query = async sql => {
    if (sql === 'BEGIN READ ONLY' || sql === 'ROLLBACK') return { command: sql.split(' ')[0], rows: [] };
    return { command: 'SELECT', rows: [rows[index++]] };
  };
  const end = client.end.bind(client);
  if (mode === 'hang') client.end = () => undefined;
  if (mode === 'reject') client.end = () => Promise.reject(new Error('SYNTHETIC_CREDENTIAL rejected end'));
  if (mode === 'write-throw') client.end = callback => { stream._cfWriter = null; return end(callback); };
  if (mode === 'destroy-throw') client.end = callback => {
    stream._cfWriter = null; stream._cfSocket = null; return end(callback);
  };
  return { client, stream, state, read, oldClosed,
    dependencies: { createClient: () => client, timeoutMs: 5_000, cleanupMs: 25 },
    async delayedErrors() {
      read.reject(new Error('SYNTHETIC_CREDENTIAL delayed read'));
      oldClosed.reject(new Error('SYNTHETIC_CREDENTIAL delayed closed'));
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}
