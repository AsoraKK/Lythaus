import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export async function postModerationFixture(connectionString, bindings) {
  const target = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
  assert.ok(target.pathname.startsWith('/lythaus_auth_test_post_'));
  const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const clients = new Map(), deliveries = [], statements = [];
  let sequence = 0, modelCalls = 0, failModel = false, failQueue = false;
  let duringModel, duringSql, failSql, modelResponse = { riskScore: 0.1,
    signals: [{ category: 'synthetic_evidence', confidence: 0.5, rationale: 'Local fixture only' }] };
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'node', target: 'es2022', external: ['cloudflare:workers'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('file:///fixture.mjs');" },
    plugins: [{ name: 'local-postgres', setup(builder) {
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
      import jobs from './apps/lythaus-jobs/src/index.ts';
      export default { async fetch(request, env, ctx) {
        const path = new URL(request.url).pathname;
        env.AI = { async run() {
          const response = await env.FIXTURE_MODEL.fetch('https://fixture.invalid/model');
          if (!response.ok) throw new Error('synthetic_provider_unavailable');
          return response.json();
        }};
        if (path === '/fixture/queue') {
          const body = await request.json();
          let ack = 0, retry = 0;
          await jobs.queue({ queue: 'lythaus-moderation-dev', messages: [{ id: body.eventId,
            body, ack() { ack++; }, retry() { retry++; } }] }, env);
          return Response.json({ ack, retry });
        }
        if (path === '/fixture/relay') {
          for (const name of ['MODERATION_QUEUE', 'AUDIT_QUEUE', 'FEED_QUEUE', 'NOTIFICATIONS_QUEUE'])
            env[name] = { async send(body) {
              const response = await env.FIXTURE_QUEUE.fetch('https://fixture.invalid/queue', {
                method: 'POST', body: JSON.stringify({ queue: name, body }),
              });
              if (!response.ok) throw new Error('synthetic_queue_unavailable');
            }};
          await jobs.scheduled({}, env);
          return Response.json({ completed: true });
        }
        return api.fetch(request, env, ctx);
      }};
    ` },
  });
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'post-incident-local', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    bindings: { ...bindings, DB_APP_FRESH: { role: 'lythaus_runtime' },
      DB_JOBS_FRESH: { role: 'lythaus_jobs' }, DB_PRIVACY_FRESH: { role: 'lythaus_privacy' },
      AUTHENTICITY_AI_ENABLED: 'true', AUTHENTICITY_ALPHA_ENABLED: 'false',
      AUTHENTICITY_BETA_ENABLED: 'false', MEDIA_UPLOADS_ENABLED: 'false',
      AUTHENTICITY_TEXT_MODEL: '@cf/openai/gpt-oss-20b', AI_GATEWAY_ID: 'lythaus-ai',
      COST_BUDGET_ENABLED: 'true', COST_BUDGET_PERIOD_PREFIX: 'synthetic-post-test',
    },
    outboundService: () => { throw new Error('Local fixture refuses external requests'); },
    serviceBindings: {
      FIXTURE_MODEL: async () => {
        modelCalls++;
        if (duringModel) await duringModel();
        if (failModel) return new Response(null, { status: 503 });
        return Response.json({ response: JSON.stringify(modelResponse) });
      },
      FIXTURE_QUEUE: async request => {
        const delivery = await request.json();
        deliveries.push(delivery);
        return new Response(null, { status: failQueue === delivery.body.eventId ? 503 : 204 });
      },
      DISPOSABLE_POSTGRES: async request => {
        const input = await request.json();
        const temporary = !input.transactionId;
        let client = clients.get(input.transactionId);
        try {
          if (temporary) {
            assert.ok(['lythaus_runtime', 'lythaus_jobs', 'lythaus_privacy'].includes(input.role));
            client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
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
            statements.push({ text: input.text, role: input.role, transactionId: input.transactionId });
            if (duringSql) await duringSql(input);
            if (failSql && input.text.includes(failSql.match) && failSql.remaining > 0) {
              failSql.remaining--;
              throw new Error('synthetic_interrupted_database_write');
            }
            const result = await client.query(input.text, input.values);
            return Response.json({ rows: result.rows, rowCount: result.rowCount });
          }
          assert.ok(['commit', 'rollback'].includes(input.action));
          await client.query(input.action === 'commit' ? 'COMMIT' : 'ROLLBACK');
          return Response.json({ completed: true });
        } catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
        finally {
          if ((temporary && input.action !== 'begin') || ['commit', 'rollback'].includes(input.action)) {
            clients.delete(input.transactionId);
            await client?.end();
          }
        }
      },
    },
  }] }));
  return { deliveries, statements, get modelCalls() { return modelCalls; },
    set failModel(value) { failModel = value; }, set failQueue(value) { failQueue = value; },
    set duringModel(value) { duringModel = value; }, set failSql(value) { failSql = value; },
    set duringSql(value) { duringSql = value; },
    set modelResponse(value) { modelResponse = value; },
    dispatchFetch: (...args) => runtime.dispatchFetch(...args),
    async dispose() {
      await runtime.dispose();
      await Promise.all([...clients.values()].map(client => client.end()));
      clients.clear();
    },
  };
}
