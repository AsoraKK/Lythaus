import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export async function publicationAdmissionFixture(connectionString, bindings) {
  const target = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
  assert.match(target.pathname, /^\/lythaus_auth_test_post_[a-z0-9_]+$/);
  const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const clients = new Map(), statements = [], outbound = [];
  let sequence = 0, failure, pause, pausedQueryRelease;
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'node', target: 'es2022', external: ['cloudflare:workers'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('file:///fixture.mjs');" },
    plugins: [{ name: 'admission-disposable-pg-transport', setup(builder) {
      builder.onLoad({ filter: /packages\/db\/src\/index\.ts$/ }, args => {
        const original = readFileSync(args.path, 'utf8');
        const start = original.indexOf('export async function query<');
        const end = original.indexOf('export function assertVerifyFull(');
        assert.ok(start > 0 && end > start);
        return { loader: 'ts', contents: original.slice(0, start) + `
          import { env as fixtureEnv } from 'cloudflare:workers';
          async function fixtureSql(input) {
            const response = await fixtureEnv.DISPOSABLE_POSTGRES.fetch('https://fixture.invalid/sql', {
              method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' },
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            return result;
          }
          export async function query(binding, text, values = []) {
            return fixtureSql({ action: 'query', role: binding.role, text, values });
          }
          export async function transaction(binding, work) {
            const { transactionId } = await fixtureSql({ action: 'begin', role: binding.role });
            try {
              const result = await work({ query: (text, values = []) => fixtureSql({ action: 'query', transactionId, text, values }) });
              await fixtureSql({ action: 'commit', transactionId });
              return result;
            } catch (error) { await fixtureSql({ action: 'rollback', transactionId }); throw error; }
          }
        ` + original.slice(end) };
      });
    } }],
    stdin: { resolveDir: root, contents: `
      import api from './apps/lythaus-public-api/src/index.ts';
      import admin from './apps/lythaus-admin-api/src/index.ts';
      import jobs from './apps/lythaus-jobs/src/index.ts';
      import { transaction, refreshReputationProfile } from './packages/db/src/index.ts';
      import { countUserPerceivedCharacters, enforceContentDeclaration } from './packages/contracts/src/content-policy.ts';
      export default { async fetch(request, env, ctx) {
        const path = new URL(request.url).pathname;
        const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
        const unavailable = request.headers.get('x-fixture-segmenter') === 'unavailable';
        if (unavailable) Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
        try {
          if (path === '/fixture/queue') {
            const body = await request.json();
            let ack = 0, retry = 0;
            await jobs.queue({ queue: 'lythaus-audit-dev', messages: [{ id: body.eventId,
              body, ack() { ack++; }, retry() { retry++; } }] }, env);
            return Response.json({ ack, retry });
          }
          if (path === '/fixture/reputation') {
            const input = await request.json();
            return Response.json(await transaction(env.DB_JOBS_FRESH,
              client => refreshReputationProfile(client, input.userId)));
          }
          if (path === '/fixture/graphemes') {
            const input = await request.json();
            try { return Response.json({ available: typeof Intl.Segmenter === 'function',
              count: countUserPerceivedCharacters(input.body), decision: enforceContentDeclaration(input) }); }
            catch (error) { return Response.json({ available: typeof Intl.Segmenter === 'function', error: error.message }); }
          }
          return await (path.startsWith('/api/admin/') ? admin : api).fetch(request, env, ctx);
        } finally {
          if (unavailable) {
            if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor);
            else delete Intl.Segmenter;
          }
        }
      }};
    ` },
  });
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'publication-admission-local', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    bindings: { ...bindings, DB_APP_FRESH: { role: 'lythaus_runtime' }, DB_ADMIN_FRESH: { role: 'lythaus_admin' },
      DB_JOBS_FRESH: { role: 'lythaus_jobs' },
      DB_PRIVACY_FRESH: { role: 'lythaus_privacy' }, AUTHENTICITY_AI_ENABLED: 'false',
      AUTHENTICITY_ALPHA_ENABLED: 'false', AUTHENTICITY_BETA_ENABLED: 'false', MEDIA_UPLOADS_ENABLED: 'false' },
    outboundService: request => {
      outbound.push(request.url);
      assert.equal(request.url, 'https://synthetic-access.invalid/jwks', 'fixture refuses every other outbound request');
      return Response.json(JSON.parse(bindings.JWT_PUBLIC_JWKS));
    },
    serviceBindings: { DISPOSABLE_POSTGRES: async request => {
      const input = await request.json();
      const temporary = !input.transactionId;
      let entry = clients.get(input.transactionId);
      try {
        if (temporary) {
          assert.ok(['lythaus_runtime', 'lythaus_admin', 'lythaus_privacy', 'lythaus_jobs'].includes(input.role));
          const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
          await client.connect();
          await client.query("SET statement_timeout='5s'");
          await client.query('SET ROLE ' + input.role);
          entry = { client, role: input.role };
        }
        assert.ok(entry);
        if (input.action === 'begin') {
          await entry.client.query('BEGIN');
          const transactionId = String(++sequence);
          clients.set(transactionId, entry);
          return Response.json({ transactionId });
        }
        if (input.action === 'query') {
          const statement = { role: entry.role, text: input.text };
          statements.push(statement);
          const result = await entry.client.query(input.text, input.values);
          statement.rowCount = result.rowCount;
          if (failure?.test(input.text)) {
            failure = undefined;
            statement.interruptedAfterSuccess = true;
            throw new Error('synthetic_transaction_interrupted');
          }
          if (pause?.pattern.test(input.text)) {
            const gate = pause;
            pause = undefined;
            pausedQueryRelease = gate.release;
            gate.reached({ role: entry.role, rowCount: result.rowCount });
            try { await gate.released; } finally { pausedQueryRelease = undefined; }
          }
          return Response.json({ rows: result.rows, rowCount: result.rowCount });
        }
        assert.ok(['commit', 'rollback'].includes(input.action));
        await entry.client.query(input.action === 'commit' ? 'COMMIT' : 'ROLLBACK');
        return Response.json({ completed: true });
      } catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
      finally {
        if ((temporary && input.action !== 'begin') || ['commit', 'rollback'].includes(input.action)) {
          clients.delete(input.transactionId);
          await entry?.client.end();
        }
      }
    } },
  }] }));
  return { statements, outbound, set interruptAfterSql(value) { failure = value; },
    pauseAfterSql(pattern) {
      assert.ok(!pause && !pausedQueryRelease, 'only one query pause is permitted');
      let reached, resume;
      const signal = new Promise(resolve => { reached = resolve; });
      const released = new Promise(resolve => { resume = resolve; });
      const gate = { pattern, reached, released, release() {
        if (pause === gate) pause = undefined;
        resume();
      } };
      pause = gate;
      return { reached: signal, release: gate.release };
    },
    dispatchFetch: (...args) => runtime.dispatchFetch(...args),
    async dispose() {
      pause?.release();
      pausedQueryRelease?.();
      await runtime.dispose();
      await Promise.all([...clients.values()].map(({ client }) => client.end()));
      clients.clear();
    },
  };
}
