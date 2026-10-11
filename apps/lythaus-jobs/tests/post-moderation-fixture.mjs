import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export async function postReviewTestOptions(connectionString) {
  const target = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
  assert.match(target.pathname, /^\/lythaus_auth_test_post_[a-z0-9_]+$/);
  const client = new pg.Client({ connectionString, ssl: false }); await client.connect();
  try {
    await client.query('SET ROLE lythaus_jobs');
    const { available } = (await client.query("SELECT has_table_privilege(current_user,'identity.users','SELECT') AND has_any_column_privilege(current_user,'identity.users','UPDATE') AS available")).rows[0];
    return { skip: available ? false : 'Jobs identity row-lock capability unavailable; no grant changes authorized' };
  } finally { await client.end(); }
}

export async function postModerationFixture(connectionString, bindings) {
  const target = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
  assert.ok(target.pathname.startsWith('/lythaus_auth_test_post_'));
  const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const clients = new Map(), deliveries = [], statements = [], sqlErrors = [];
  let sequence = 0, modelCalls = 0, failModel = false, failQueue = false;
  let duringModel, duringSql, afterSql, failSql, modelResponse = { riskScore: 0.1,
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
            const client = { query: (text, values = []) => fixtureSql({ action: 'query', transactionId, text, values }) };
            try {
              return await executeTransaction(client, work);
            } finally { await fixtureSql({ action: 'close', transactionId }); }
          }
        ` + original.slice(end) };
      });
    } }],
    stdin: { resolveDir: root, contents: `
      import api from './apps/lythaus-public-api/src/index.ts';
      import jobs from './apps/lythaus-jobs/src/index.ts';
      import admin from './apps/lythaus-admin-api/src/index.ts';
      import { transaction, lockActiveAccount } from './packages/db/src/index.ts';
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
        if (path === '/fixture/account-transaction') {
          const body = await request.json();
          try {
            const result = await transaction(env.DB_ADMIN_FRESH, async client => {
              const state = await lockActiveAccount(client, body.authorId);
              if (state !== 'locked') return { state };
              await client.query('SELECT id FROM content.posts WHERE id=$1 FOR UPDATE', [body.postId]);
              await client.query("INSERT INTO moderation.detector_runs(id,content_type,content_id,provider,model_version,signal,source_event_id) VALUES($1,'post',$2,'synthetic-account-fence','synthetic-v1','{}',$3)",
                [body.detectorId, body.postId, body.eventId]);
              return { state: 'applied' };
            });
            return Response.json(result);
          } catch { return Response.json({ state: 'interrupted' }, { status: 503 }); }
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
        return path.startsWith('/api/admin/') ? admin.fetch(request, env, ctx) : api.fetch(request, env, ctx);
      }};
    ` },
  });
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'post-incident-local', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    bindings: { ...bindings, DB_APP_FRESH: { role: 'lythaus_runtime' },
      DB_ADMIN_FRESH: { role: 'lythaus_admin' },
      DB_JOBS_FRESH: { role: 'lythaus_jobs' }, DB_PRIVACY_FRESH: { role: 'lythaus_privacy' },
      AUTHENTICITY_AI_ENABLED: 'true', AUTHENTICITY_ALPHA_ENABLED: 'false',
      AUTHENTICITY_BETA_ENABLED: 'false', MEDIA_UPLOADS_ENABLED: 'false',
      AUTHENTICITY_TEXT_MODEL: '@cf/openai/gpt-oss-20b', AI_GATEWAY_ID: 'lythaus-ai',
      COST_BUDGET_ENABLED: 'true', COST_BUDGET_PERIOD_PREFIX: 'synthetic-post-test',
    },
    outboundService: request => {
      if (request.url === 'https://access.synthetic.invalid/certs' && bindings.FIXTURE_ACCESS_JWKS) {
        return Response.json(JSON.parse(bindings.FIXTURE_ACCESS_JWKS));
      }
      throw new Error('Local fixture refuses external requests');
    },
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
            assert.ok(['lythaus_runtime', 'lythaus_jobs', 'lythaus_privacy', 'lythaus_admin'].includes(input.role));
            client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
            client.on('error', error => sqlErrors.push({ role: input.role, code: error.code }));
            client.fixtureRole = input.role;
            await client.connect();
            await client.query("SET statement_timeout='5s'");
            await client.query('SET ROLE ' + input.role);
          }
          assert.ok(client);
          if (input.action === 'begin') {
            const transactionId = String(++sequence);
            clients.set(transactionId, client);
            return Response.json({ transactionId });
          }
          if (input.action === 'query') {
            const diagnostic = { ...input, role: client.fixtureRole, backendPid: client.processID };
            statements.push({ text: input.text, role: client.fixtureRole, transactionId: input.transactionId });
            if (duringSql) await duringSql(diagnostic);
            if (failSql && input.text.includes(failSql.match) && failSql.remaining > 0) {
              failSql.remaining--;
              throw new Error('synthetic_interrupted_database_write');
            }
            const result = await client.query(input.text, input.values);
            if (afterSql) await afterSql({ ...diagnostic, command: result.command });
            return Response.json({ rows: result.rows, rowCount: result.rowCount, command: result.command });
          }
          assert.equal(input.action, 'close');
          return Response.json({ completed: true });
        } catch (error) { sqlErrors.push({ role: client?.fixtureRole, code: error.code }); return Response.json({ error: error.message }, { status: 500 }); }
        finally {
          if ((temporary && input.action !== 'begin') || input.action === 'close') {
            clients.delete(input.transactionId);
            await client?.end();
          }
        }
      },
    },
  }] }));
  return { deliveries, statements, sqlErrors, get modelCalls() { return modelCalls; },
    set failModel(value) { failModel = value; }, set failQueue(value) { failQueue = value; },
    set duringModel(value) { duringModel = value; }, set failSql(value) { failSql = value; },
    set duringSql(value) { duringSql = value; },
    set afterSql(value) { afterSql = value; },
    set modelResponse(value) { modelResponse = value; },
    async disconnectPrivacyTransactions() {
      const control = new pg.Client({ connectionString, ssl: false });
      await control.connect();
      try {
        const selected = [...clients.values()].filter(client => client.fixtureRole === 'lythaus_privacy');
        assert.equal(selected.length, 1, 'exactly one account-lock connection is expected');
        await control.query('SELECT pg_terminate_backend($1)', [selected[0].processID]);
      } finally { await control.end(); }
    },
    async abortPrivacyTransactions() {
      const selected = [...clients.values()].filter(client => client.fixtureRole === 'lythaus_privacy');
      assert.equal(selected.length, 1);
      await assert.rejects(selected[0].query('SELECT 1/0'), error => error.code === '22012');
    },
    async interruptTransaction(role, abort = false) {
      const selected = [...clients.values()].filter(client => client.fixtureRole === role);
      assert.equal(selected.length, 1);
      if (abort) return assert.rejects(selected[0].query('SELECT 1/0'), error => error.code === '22012');
      const control = new pg.Client({ connectionString, ssl: false }); await control.connect();
      try { await control.query('SELECT pg_terminate_backend($1)', [selected[0].processID]); }
      finally { await control.end(); }
    },
    dispatchFetch: (...args) => runtime.dispatchFetch(...args),
    async dispose() {
      await runtime.dispose();
      await Promise.all([...clients.values()].map(client => client.end()));
      clients.clear();
    },
  };
}
