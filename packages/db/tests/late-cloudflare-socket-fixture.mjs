import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));

export async function lateCloudflareSocketFixture(connectionString, gates) {
  const target = new URL(connectionString);
  assert.equal(target.protocol, 'postgresql:');
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'late transport fixtures require loopback');
  assert.equal(target.pathname, '/postgres');
  assert.equal(target.username, 'posting_feedback_writer_test');
  assert.ok(target.password === 'synthetic-fixture-only', 'late transport fixtures accept synthetic credentials only');
  assert.equal(target.search, ''); assert.equal(target.hash, '');
  assert.equal(gates.length, 3);
  const metadata = JSON.parse(await readFile(new URL('../../../node_modules/pg-cloudflare/package.json', import.meta.url), 'utf8'));
  assert.equal(metadata.version, '1.4.0');
  const implementation = await readFile(new URL('../../../node_modules/pg-cloudflare/dist/index.js', import.meta.url));
  const implementationSha256 = createHash('sha256').update(implementation).digest('hex');
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'node', target: 'es2022', conditions: ['workerd'],
    external: ['node:*', 'pg-native'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('file:///late-socket-fixture.mjs');" },
    plugins: [{ name: 'late-native-socket-notifications', setup(builder) {
      builder.onResolve({ filter: /^cloudflare:sockets$/ }, args => args.namespace === 'late-socket-fixture'
        ? { path: 'cloudflare:sockets', external: true } : { path: 'socket-api', namespace: 'late-socket-fixture' });
      builder.onLoad({ filter: /.*/, namespace: 'late-socket-fixture' }, () => ({ loader: 'js', contents: `
        import { connect as nativeConnect } from 'cloudflare:sockets';
        export const state = { mode: null, activeSockets: 0, nativeClosed: 0, closeRequests: 0,
          faultSignals: 0, closeNotifications: 0, destroyFailures: 0 };
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        export function connect(address, options) {
          const socket = nativeConnect(address, options);
          const mode = state.mode;
          state.activeSockets += 1;
          socket.closed.then(() => { state.activeSockets -= 1; state.nativeClosed += 1; },
            () => { state.activeSockets -= 1; state.nativeClosed += 1; });
          const closed = socket.closed.then(async () => {
            await delay(2100); state.closeNotifications += 1;
            if (mode !== 'read_error') { state.faultSignals += 1; throw new Error('synthetic_delayed_closed_error'); }
          });
          return { opened: socket.opened, closed, writable: socket.writable,
            readable: { getReader() {
              const reader = socket.readable.getReader();
              return { async read() {
                let value;
                try { value = await reader.read(); }
                catch {
                  await delay(2000); state.faultSignals += 1;
                  throw new Error('synthetic_delayed_read_error');
                }
                if (value.done) {
                  await delay(2000); state.faultSignals += 1;
                  throw new Error('synthetic_delayed_read_error');
                }
                return value;
              }, releaseLock: () => reader.releaseLock(), cancel: reason => reader.cancel(reason) };
            } },
            close() {
              state.closeRequests += 1;
              return socket.close();
            },
            startTls: options => socket.startTls(options),
          };
        }
      ` }));
    } }],
    stdin: { resolveDir: root, contents: `
      import { Client } from 'pg';
      import { CloudflareSocket } from 'pg-cloudflare';
      import { state } from 'cloudflare:sockets';
      import { createInactivePostingFeedbackCollector } from './apps/lythaus-jobs/src/posting-feedback-runtime.ts';
      import { fixtures } from './packages/authenticity/evaluation/posting-feedback/fixtures.mjs';
      export default { async fetch(request, env) {
        const { mode, gate } = await request.json();
        Object.assign(state, { mode, activeSockets: 0, nativeClosed: 0, closeRequests: 0,
          faultSignals: 0, closeNotifications: 0, destroyFailures: 0 });
        const clients = [], timers = new Map();
        const originalConnect = Client.prototype.connect;
        const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
        let unhandledRejections = 0, lateSourceErrors = 0;
        const onUnhandled = event => { unhandledRejections += 1; event.preventDefault(); };
        addEventListener('unhandledrejection', onUnhandled);
        Client.prototype.connect = function(...args) {
          clients.push(this);
          const pending = originalConnect.apply(this, args);
          if (mode === 'destroy_throws') this.connection.stream.destroy = () => {
            state.destroyFailures += 1; throw new Error('synthetic_destroy_failure');
          };
          return pending;
        };
        globalThis.setTimeout = (callback, ms, ...args) => {
          let id; id = originalSet(() => { timers.delete(id); callback(...args); }, ms);
          timers.set(id, ms); return id;
        };
        globalThis.clearTimeout = id => { timers.delete(id); return originalClear(id); };
        try {
          let outcome, failure;
          const started = performance.now();
          try {
            await createInactivePostingFeedbackCollector(env.DB_JOBS_FRESH).simulate({
              fixtures: fixtures.slice(0, 20), gate, apiKey: 'synthetic-test-only',
              fetchImpl: (input, init) => env.PROVIDER_FIXTURE.fetch(input, init),
            });
          } catch (error) { outcome = error.outcome; failure = error.message; }
          const elapsedMs = performance.now() - started;
          const atReturn = { activeSockets: state.activeSockets, nativeClosed: state.nativeClosed,
            faultSignals: state.faultSignals, closeNotifications: state.closeNotifications,
            clientErrorSinks: clients.map(client => client.listenerCount('error')),
            nativeCloseTypes: clients.map(client => typeof client.connection.stream._cfSocket?.close),
            pendingBoundTimers: [...timers.values()].filter(ms => [250, 1000, 15000, 16000].includes(ms)).length };
          const usesInstalledCloudflareSocket = clients.length === 1 && clients[0].connection.stream instanceof CloudflareSocket;
          for (const client of clients) {
            const stream = client.connection.stream;
            let implementation = stream.emit;
            Object.defineProperty(stream, 'emit', { configurable: true,
              get() { return function(event, ...args) {
                if (event === 'error') lateSourceErrors += 1;
                return implementation.call(this, event, ...args);
              }; },
              set(value) { implementation = value; },
            });
          }
          await new Promise(resolve => setTimeout(resolve, 2500));
          const listeners = clients.map(client => ({ client: client.eventNames().reduce((n, name) => n + client.listenerCount(name), 0),
            connection: client.connection.eventNames().reduce((n, name) => n + client.connection.listenerCount(name), 0),
            stream: client.connection.stream.eventNames().reduce((n, name) => n + client.connection.stream.listenerCount(name), 0) }));
          return Response.json({ mode, outcome, failure, elapsedMs, atReturn, usesInstalledCloudflareSocket,
            activeSockets: state.activeSockets, closeRequests: state.closeRequests, faultSignals: state.faultSignals,
            closeNotifications: state.closeNotifications, lateSourceErrors, unhandledRejections,
            destroyFailures: state.destroyFailures, pendingTimers: timers.size, listeners });
        } finally {
          Client.prototype.connect = originalConnect;
          globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear;
          removeEventListener('unhandledrejection', onUnhandled); clients.length = 0;
        }
      }};
    ` },
  });
  let providerCalls = 0, outboundCalls = 0;
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'late-cloudflare-socket-fixture', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    hyperdrives: { DB_JOBS_FRESH: connectionString },
    outboundService: () => { outboundCalls += 1; throw new Error('OUTBOUND_DENIED'); },
    serviceBindings: { PROVIDER_FIXTURE: async () => { providerCalls += 1; return new Response(null, { status: 503 }); } },
  }] }));
  try {
    const cases = [];
    for (const [index, mode] of ['read_error', 'closed_error', 'destroy_throws'].entries()) {
      const response = await runtime.dispatchFetch('https://late-socket-fixture.test/', {
        method: 'POST', body: JSON.stringify({ mode, gate: gates[index] }),
      });
      assert.equal(response.status, 200);
      cases.push(await response.json());
    }
    return { version: metadata.version, implementationSha256, providerCalls, outboundCalls, cases };
  } finally { await runtime.dispose(); }
}
