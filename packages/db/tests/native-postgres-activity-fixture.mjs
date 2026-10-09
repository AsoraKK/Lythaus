import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Actual dispatchers and auth execute in workerd. Only database transport is
// replaced by disposable PG17 connections under the real restricted roles.
export async function nativePostgresActivityFixture(connectionString, kind, bindings) {
  const target = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
  assert.match(target.pathname, /^\/lythaus_auth_test_activity_integration_[a-f0-9]+$/);
  assert.ok(['public', 'admin', 'jobs'].includes(kind));
  const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const clients = new Map(), statements = [];
  let sequence = 0;
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
    external: ['cloudflare:workers'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('file:///fixture.mjs');" },
    plugins: [{ name: 'activity-disposable-pg-transport', setup(builder) {
      builder.onLoad({ filter: /packages\/db\/src\/index\.ts$/ }, args => {
        const original = readFileSync(args.path, 'utf8');
        const start = original.indexOf('export async function query<'), end = original.indexOf('export function assertVerifyFull(');
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
          export async function query(binding, text, values = []) { return fixtureSql({ action: 'query', role: binding.role, text, values }); }
          export async function transaction(binding, work) {
            const { transactionId } = await fixtureSql({ action: 'begin', role: binding.role });
            try {
              const result = await work({ query: (text, values = []) => fixtureSql({ action: 'query', transactionId, text, values }) });
              await fixtureSql({ action: 'commit', transactionId }); return result;
            } catch (error) { await fixtureSql({ action: 'rollback', transactionId }); throw error; }
          }
        ` + original.slice(end) };
      });
    } }],
    stdin: { resolveDir: root, contents: `export { default } from './apps/lythaus-${kind}${kind === 'jobs' ? '' : '-api'}/src/index.ts';` },
  });
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: `activity-${kind}-local`, modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    bindings: { ...bindings, DB_APP_FRESH: { role: 'lythaus_runtime' }, DB_ADMIN_FRESH: { role: 'lythaus_admin' },
      DB_PRIVACY_FRESH: { role: 'lythaus_privacy' }, DB_JOBS_FRESH: { role: 'lythaus_jobs' } },
    ...(kind === 'jobs' ? { queueProducers: { AUDIT_QUEUE: 'activity-synthetic-audit' } } : {}),
    serviceBindings: { DISPOSABLE_POSTGRES: async request => {
      const input = await request.json();
      const temporary = !input.transactionId;
      let entry = clients.get(input.transactionId);
      try {
        if (temporary) {
          assert.ok(['lythaus_runtime', 'lythaus_admin', 'lythaus_privacy', 'lythaus_jobs'].includes(input.role));
          const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
          await client.connect(); await client.query("SET statement_timeout='5s'"); await client.query('SET ROLE ' + input.role);
          entry = { client, role: input.role };
        }
        assert.ok(entry);
        if (input.action === 'begin') {
          await entry.client.query('BEGIN'); const transactionId = String(++sequence);
          clients.set(transactionId, entry); return Response.json({ transactionId });
        }
        if (input.action === 'query') {
          statements.push({ role: entry.role, text: input.text, values: input.values });
          const result = await entry.client.query(input.text, input.values);
          return Response.json({ rows: result.rows, rowCount: result.rowCount });
        }
        assert.ok(['commit', 'rollback'].includes(input.action));
        await entry.client.query(input.action === 'commit' ? 'COMMIT' : 'ROLLBACK');
        return Response.json({ completed: true });
      } catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
      finally {
        if ((temporary && input.action !== 'begin') || ['commit', 'rollback'].includes(input.action)) {
          clients.delete(input.transactionId); await entry?.client.end();
        }
      }
    } },
  }] }));
  return { statements, dispatchFetch: (...args) => runtime.dispatchFetch(...args),
    async scheduled() { return (await runtime.getWorker()).scheduled({ cron: '*/15 * * * *' }); },
    async dispose() {
    await runtime.dispose(); await Promise.all([...clients.values()].map(({ client }) => client.end())); clients.clear();
  } };
}
