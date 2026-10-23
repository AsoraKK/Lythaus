import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { privacyPostgresTarget } from './privacy-postgres-target.mjs';
import { integratePublicApiComments, integrateJobsCommentNotifications } from './comment-integration-hooks.mjs';

export async function commentRuntimeFixture(connectionString, bindings) {
  connectionString = privacyPostgresTarget(connectionString).toString();
  const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const clients = new Map(), statements = [];
  let sequence = 0, failNotification = false;
  const requireAppliedHooks = process.env.COMMENT_REQUIRE_APPLIED_HOOKS === 'true';
  const sourceFor = (path, marker, integrate) => {
    const source = readFileSync(path, 'utf8');
    if (!requireAppliedHooks) return integrate(source);
    assert.ok(source.includes(marker), 'Actual applied comment hooks are required');
    return source;
  };
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'node', target: 'es2022', external: ['cloudflare:workers'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('file:///fixture.mjs');" },
    plugins: [{ name: 'comment-integration-local', setup(builder) {
      builder.onLoad({ filter: /apps\/lythaus-public-api\/src\/index\.ts$/ }, args => ({ loader: 'ts', contents: sourceFor(args.path, 'const body = await readCommentThread(', integratePublicApiComments) }));
      builder.onLoad({ filter: /apps\/lythaus-jobs\/src\/index\.ts$/ }, args => ({ loader: 'ts', contents: sourceFor(args.path, 'await client.query(commentNotificationRevisionLockQuery, [eventId]);', integrateJobsCommentNotifications) + '\nexport { processNotificationSource as fixtureNotification };' }));
      builder.onResolve({ filter: /^@lythaus\/db$/ }, () => ({ path: 'database', namespace: 'comment-postgres' }));
      builder.onLoad({ filter: /.*/, namespace: 'comment-postgres' }, () => ({ resolveDir: root, contents: `
        export * from './packages/db/src/index.ts';
        import { env } from 'cloudflare:workers';
        async function sql(input) {
          const response = await env.COMMENT_POSTGRES.fetch('https://fixture.invalid/sql', { method: 'POST', body: JSON.stringify(input) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          return result;
        }
        export async function query(binding, text, values = []) { return sql({ action: 'query', role: binding.role, text, values }); }
        export async function transaction(binding, work) {
          const { id } = await sql({ action: 'begin', role: binding.role });
          try {
            const result = await work({ query: (text, values = []) => sql({ action: 'query', id, text, values }) });
            await sql({ action: 'commit', id }); return result;
          } catch (error) { await sql({ action: 'rollback', id }); throw error; }
        }
      ` }));
    } }],
    stdin: { resolveDir: root, contents: `
      import api from './apps/lythaus-public-api/src/index.ts';
      import { fixtureNotification } from './apps/lythaus-jobs/src/index.ts';
      export default { async fetch(request, env, ctx) {
        if (new URL(request.url).pathname === '/fixture/notification') {
          const event = await request.json();
          try {
            await fixtureNotification({ id: event.eventId, body: event }, env, event.eventId, 'content.comment.published');
            return Response.json({ completed: true });
          } catch (error) { return Response.json({ error: error.message }, { status: 503 }); }
        }
        return api.fetch(request, env, ctx);
      }};
    ` },
  });
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'comment-propagation-local', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    bindings: { ...bindings, DB_APP_FRESH: { role: 'lythaus_runtime' }, DB_JOBS_FRESH: { role: 'lythaus_jobs' } },
    outboundService: () => { throw new Error('Comment fixture refuses external requests'); },
    serviceBindings: { COMMENT_POSTGRES: async request => {
      const input = await request.json();
      let entry = clients.get(input.id);
      const temporary = !entry;
      try {
        if (temporary) {
          assert.ok(['lythaus_runtime', 'lythaus_jobs'].includes(input.role));
          const client = new pg.Client({ connectionString, ssl: false }); await client.connect();
          await client.query("SET statement_timeout='5s'"); await client.query('SET ROLE ' + input.role);
          entry = { client, role: input.role };
        }
        if (input.action === 'begin') {
          await entry.client.query('BEGIN'); const id = String(++sequence); clients.set(id, entry);
          return Response.json({ id });
        }
        if (input.action === 'query') {
          statements.push({ role: entry.role, text: input.text });
          if (failNotification && input.text.includes('INSERT INTO feed.notifications')) {
            failNotification = false; throw new Error('synthetic_notification_write_interrupted');
          }
          const result = await entry.client.query(input.text, input.values);
          return Response.json({ rows: result.rows, rowCount: result.rowCount });
        }
        assert.ok(['commit', 'rollback'].includes(input.action));
        await entry.client.query(input.action === 'commit' ? 'COMMIT' : 'ROLLBACK');
        return Response.json({ completed: true });
      } catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
      finally {
        if ((temporary && input.action !== 'begin') || ['commit', 'rollback'].includes(input.action)) {
          clients.delete(input.id); await entry?.client.end();
        }
      }
    } },
  }] }));
  return { statements, failNextNotification() { failNotification = true; },
    dispatchFetch: (...args) => runtime.dispatchFetch(...args), async dispose() {
      await runtime.dispose(); await Promise.all([...clients.values()].map(entry => entry.client.end()));
    } };
}
