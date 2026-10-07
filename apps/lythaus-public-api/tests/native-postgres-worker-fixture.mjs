import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export async function nativePostgresProfileFixture(connectionString, bindings) {
  const target = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
  assert.ok(target.pathname.startsWith('/lythaus_auth_test')
    || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'));
  const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const clients = new Map();
  let sequence = 0;
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'node', target: 'es2022', external: ['cloudflare:workers'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('file:///fixture.mjs');" },
    plugins: [{ name: 'disposable-postgres-transport', setup(builder) {
      builder.onResolve({ filter: /^@lythaus\/db$/ }, () => ({ path: 'database', namespace: 'disposable-postgres' }));
      builder.onLoad({ filter: /.*/, namespace: 'disposable-postgres' }, () => ({ resolveDir: root, contents: `
        export * from './packages/db/src/index.ts';
        import { env } from 'cloudflare:workers';
        async function sql(input) {
          const response = await env.DISPOSABLE_POSTGRES.fetch('https://fixture.invalid/sql', {
            method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' },
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          return result;
        }
        export async function query(binding, text, values = []) {
          return sql({ action: 'query', role: binding.role, text, values });
        }
        export async function transaction(binding, work) {
          const { transactionId } = await sql({ action: 'begin', role: binding.role });
          try {
            const result = await work({ query: (text, values = []) => sql({ action: 'query', transactionId, text, values }) });
            await sql({ action: 'commit', transactionId });
            return result;
          } catch (error) {
            await sql({ action: 'rollback', transactionId });
            throw error;
          }
        }
      ` }));
    } }],
    stdin: { resolveDir: root, contents: `
      import api from './apps/lythaus-public-api/src/index.ts';
      import { query } from '@lythaus/db';
      import { presentationPreferencesIdentityExportQuery, presentationPreferencesResetQuery } from './apps/lythaus-jobs/src/runtime-policy.ts';
      export default { async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/fixture/export') {
          const result = await query(env.DB_PRIVACY_FRESH, presentationPreferencesIdentityExportQuery, [url.searchParams.get('subject')]);
          return Response.json(result.rows[0]);
        }
        if (url.pathname === '/fixture/reset-preferences') {
          await query(env.DB_PRIVACY_FRESH, presentationPreferencesResetQuery, [url.searchParams.get('subject')]);
          return Response.json({ reset: true });
        }
        return api.fetch(request, env, ctx);
      }};
    ` },
  });
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'profile-preferences-local', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    bindings: { ...bindings, DB_APP_FRESH: { role: 'lythaus_runtime' },
      DB_PRIVACY_FRESH: { role: 'lythaus_privacy' }, DB_JOBS_FRESH: { role: 'lythaus_jobs' } },
    serviceBindings: { DISPOSABLE_POSTGRES: async request => {
      const input = await request.json();
      const temporary = !input.transactionId;
      let client = clients.get(input.transactionId);
      try {
        if (temporary) {
          assert.ok(['lythaus_runtime', 'lythaus_privacy', 'lythaus_jobs'].includes(input.role));
          client = new pg.Client({ connectionString, ssl: false });
          await client.connect();
          await client.query("SET statement_timeout='5s'");
          await client.query('SET ROLE ' + input.role);
        }
        assert.ok(client);
        if (input.action === 'begin') {
          await client.query('BEGIN');
          const transactionId = String(++sequence);
          clients.set(transactionId, client);
          return Response.json({ transactionId });
        }
        if (input.action === 'query') {
          const result = await client.query(input.text, input.values);
          return Response.json({ rows: result.rows, rowCount: result.rowCount });
        }
        assert.ok(['commit', 'rollback'].includes(input.action));
        await client.query(input.action === 'commit' ? 'COMMIT' : 'ROLLBACK');
        return Response.json({ completed: true });
      } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
      } finally {
        if ((temporary && input.action !== 'begin') || ['commit', 'rollback'].includes(input.action)) {
          clients.delete(input.transactionId);
          await client?.end();
        }
      }
    } },
  }] }));
  return { dispatchFetch: (...args) => runtime.dispatchFetch(...args), async dispose() {
    await runtime.dispose();
    await Promise.all([...clients.values()].map(client => client.end()));
    clients.clear();
  } };
}
